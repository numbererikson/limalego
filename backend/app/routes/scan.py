"""Scan a photo → Brickognize → detections in DB, cross-referenced against tracked set."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.database import get_db
from app.services.brickognize import predict_parts

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_VALID_MODES = {"single", "grid", "sweep"}
TOP_K = 5


@router.post("")
async def scan(
    image: UploadFile = File(...),
    set_num: Optional[str] = Form(None),
    mode: str = Form("single"),
):
    if mode not in _VALID_MODES:
        raise HTTPException(400, f"invalid mode; expected one of {sorted(_VALID_MODES)}")
    ext = _ALLOWED_TYPES.get(image.content_type or "")
    if ext is None:
        raise HTTPException(400, f"unsupported content type: {image.content_type}")

    img_bytes = await image.read()
    if not img_bytes:
        raise HTTPException(400, "empty upload")

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    img_path = UPLOAD_DIR / f"{ts}{ext}"
    img_path.write_bytes(img_bytes)
    rel_path = str(img_path.relative_to(UPLOAD_DIR.parent))

    try:
        result = await predict_parts(
            img_bytes,
            filename=image.filename or img_path.name,
            content_type=image.content_type or "image/jpeg",
        )
    except Exception as e:
        raise HTTPException(502, f"brickognize error: {e}")

    items = result["items"]
    bbox = result.get("bounding_box") or {}
    # Normalise bbox to [0..1] of image size so the frontend can overlay it on any rendered size.
    img_w = float(bbox.get("image_width") or 0) or 1.0
    img_h = float(bbox.get("image_height") or 0) or 1.0
    bx = (float(bbox["left"])  / img_w) if "left"  in bbox else None
    by = (float(bbox["upper"]) / img_h) if "upper" in bbox else None
    bw = ((float(bbox["right"])  - float(bbox["left"]))  / img_w) if "right"  in bbox else None
    bh = ((float(bbox["lower"])  - float(bbox["upper"])) / img_h) if "lower"  in bbox else None

    with get_db() as db:
        cur = db.execute(
            "INSERT INTO scan_sessions (set_num, image_path, mode) VALUES (?, ?, ?)",
            (set_num, rel_path, mode),
        )
        session_id = cur.lastrowid

        # Cross-reference each Brickognize candidate against ALL of the user's tracked sets,
        # not just the one currently being browsed. The browsed set (set_num) is highlighted
        # but the user can still spend the brick on any other set that needs it.
        tracked_sets = {
            r["set_num"]: {"name": r["name"], "img_url": r["img_url"], "theme": r["theme"]}
            for r in db.execute(
                "SELECT set_num, name, img_url, theme FROM sets WHERE status IN ('tracked','building')"
            ).fetchall()
        }
        tracked_set_nums = list(tracked_sets.keys())

        detections: list[dict] = []
        for item in items[:TOP_K]:
            part_num = item.get("id") or item.get("part_num")
            if not part_num:
                continue
            confidence = float(item.get("score") or 0.0)
            cur = db.execute(
                """INSERT INTO detections
                       (session_id, part_num, color_id, confidence, bbox_x, bbox_y, bbox_w, bbox_h)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (session_id, part_num, -1, confidence, bx, by, bw, bh),
            )

            # All (set, color) rows that still need this part across every tracked set.
            needed_by_set: dict[str, list[dict]] = {}
            if tracked_set_nums:
                placeholders = ",".join(["?"] * len(tracked_set_nums))
                rows = db.execute(
                    f"""SELECT si.set_num, si.color_id,
                               c.name AS color_name, c.rgb AS color_rgb,
                               si.required_qty, si.confirmed_qty, si.missing_qty,
                               (SELECT MIN(element_id) FROM elements e
                                  WHERE e.part_num = si.part_num AND e.color_id = si.color_id) AS element_id
                        FROM set_inventory si
                        JOIN colors c ON c.color_id = si.color_id
                        WHERE si.set_num IN ({placeholders})
                          AND si.part_num = ?
                          AND si.is_spare = 0
                          AND si.missing_qty > 0""",
                    (*tracked_set_nums, part_num),
                ).fetchall()
                for r in rows:
                    needed_by_set.setdefault(r["set_num"], []).append({
                        "color_id":      r["color_id"],
                        "color_name":    r["color_name"],
                        "color_rgb":     r["color_rgb"],
                        "required_qty":  r["required_qty"],
                        "confirmed_qty": r["confirmed_qty"],
                        "missing_qty":   r["missing_qty"],
                        "element_id":    r["element_id"],
                    })

            needed_in_sets = []
            for sn, colors in needed_by_set.items():
                info = tracked_sets[sn]
                colors.sort(key=lambda c: -c["missing_qty"])
                needed_in_sets.append({
                    "set_num":       sn,
                    "set_name":      info["name"],
                    "set_theme":     info["theme"],
                    "set_img_url":   info["img_url"],
                    "is_active_set": sn == set_num,
                    "total_missing": sum(c["missing_qty"] for c in colors),
                    "colors":        colors,
                })
            # Active set first, then by qty desc.
            needed_in_sets.sort(key=lambda s: (-int(s["is_active_set"]), -s["total_missing"]))

            total_missing = sum(s["total_missing"] for s in needed_in_sets)

            detections.append({
                "detection_id":    cur.lastrowid,
                "part_num":        part_num,
                "name":            item.get("name"),
                "category":        item.get("category"),
                "img_url":         item.get("img_url"),
                "confidence":      confidence,
                "color_id":        -1,
                "needed_in_sets":  needed_in_sets,
                "total_missing":   total_missing,
                "is_match":        total_missing > 0,
            })

        # Re-rank: detections that fit ANY of the user's sets first, then by Brickognize confidence.
        detections.sort(key=lambda d: (-d["total_missing"], -d["confidence"]))

        db.commit()

    return {
        "session_id":   session_id,
        "set_num":      set_num,
        "mode":         mode,
        "image_path":   rel_path,
        "bounding_box": {"x": bx, "y": by, "w": bw, "h": bh, "score": bbox.get("score")} if bx is not None else None,
        "detections":   detections,
    }


@router.post("/feedback/{detection_id}")
def feedback(
    detection_id: int,
    action: str = Form(...),
    set_num: Optional[str] = Form(None),
    corrected_part_num: Optional[str] = Form(None),
    corrected_color_id: Optional[int] = Form(None),
):
    """Record what the user did with a detection.

    `taken` requires `set_num` + (corrected_color_id || color_id) so we know which
    (set, part, color) row to increment. The session-level set_num is only used as
    a fallback for backwards compatibility.
    """
    if action not in {"accept", "reject", "correct", "taken", "skip"}:
        raise HTTPException(400, "invalid action")

    with get_db() as db:
        det = db.execute(
            """SELECT d.id, d.session_id, d.part_num, d.color_id, s.set_num AS session_set_num
               FROM detections d
               JOIN scan_sessions s ON s.id = d.session_id
               WHERE d.id = ?""",
            (detection_id,),
        ).fetchone()
        if det is None:
            raise HTTPException(404, "detection not found")

        new_status = {
            "accept":  "accepted",
            "reject":  "rejected",
            "correct": "accepted",
            "taken":   "taken",
            "skip":    "rejected",
        }[action]
        db.execute("UPDATE detections SET status = ? WHERE id = ?", (new_status, detection_id))
        # Store the target set_num under corrected_part_num is wrong — repurpose
        # corrected_part_num for what it says, and stash target set_num inline in
        # corrected_part_num? No: instead we just record action; for undo we look up
        # the row by (set, part, color) using whatever the request supplied.
        cur = db.execute(
            """INSERT INTO user_feedback (detection_id, action, corrected_part_num, corrected_color_id)
               VALUES (?, ?, ?, ?)""",
            (detection_id, action, corrected_part_num, corrected_color_id),
        )
        feedback_id = cur.lastrowid

        inventory_delta = None
        target_set = set_num or det["session_set_num"]
        if action == "taken" and target_set:
            part_num = corrected_part_num or det["part_num"]
            color_id = corrected_color_id if corrected_color_id is not None else det["color_id"]
            if color_id is not None and color_id >= 0:
                row = db.execute(
                    """SELECT id, required_qty, confirmed_qty FROM set_inventory
                       WHERE set_num = ? AND part_num = ? AND color_id = ? AND is_spare = 0""",
                    (target_set, part_num, color_id),
                ).fetchone()
                if row is not None:
                    new_conf = min(row["required_qty"], row["confirmed_qty"] + 1)
                    new_miss = max(0, row["required_qty"] - new_conf)
                    db.execute(
                        "UPDATE set_inventory SET confirmed_qty = ?, missing_qty = ? WHERE id = ?",
                        (new_conf, new_miss, row["id"]),
                    )
                    inventory_delta = {
                        "set_num":  target_set,
                        "part_num": part_num,
                        "color_id": color_id,
                        "delta":    new_conf - row["confirmed_qty"],
                    }

        db.commit()

    return {
        "feedback_id":      feedback_id,
        "detection_id":     detection_id,
        "action":           action,
        "status":           new_status,
        "inventory_delta":  inventory_delta,
    }


@router.post("/feedback/{feedback_id}/undo")
def undo_feedback(feedback_id: int, set_num: Optional[str] = Form(None)):
    """Reverse a feedback: roll back inventory increment (if any) and delete the feedback row.

    `set_num` should be the same one that was used in the original /feedback call so
    we can find the right inventory row to decrement.
    """
    with get_db() as db:
        fb = db.execute(
            """SELECT uf.id, uf.detection_id, uf.action, uf.corrected_part_num, uf.corrected_color_id,
                      d.part_num AS det_part_num, d.color_id AS det_color_id, s.set_num AS session_set_num
               FROM user_feedback uf
               JOIN detections    d ON d.id = uf.detection_id
               JOIN scan_sessions s ON s.id = d.session_id
               WHERE uf.id = ?""",
            (feedback_id,),
        ).fetchone()
        if fb is None:
            raise HTTPException(404, "feedback not found")

        target_set = set_num or fb["session_set_num"]
        if fb["action"] == "taken" and target_set:
            part_num = fb["corrected_part_num"] or fb["det_part_num"]
            color_id = fb["corrected_color_id"] if fb["corrected_color_id"] is not None else fb["det_color_id"]
            if color_id is not None and color_id >= 0:
                row = db.execute(
                    """SELECT id, required_qty, confirmed_qty FROM set_inventory
                       WHERE set_num = ? AND part_num = ? AND color_id = ? AND is_spare = 0""",
                    (target_set, part_num, color_id),
                ).fetchone()
                if row is not None and row["confirmed_qty"] > 0:
                    new_conf = row["confirmed_qty"] - 1
                    new_miss = row["required_qty"] - new_conf
                    db.execute(
                        "UPDATE set_inventory SET confirmed_qty = ?, missing_qty = ? WHERE id = ?",
                        (new_conf, new_miss, row["id"]),
                    )

        db.execute("DELETE FROM user_feedback WHERE id = ?", (feedback_id,))
        db.execute("UPDATE detections SET status = 'pending' WHERE id = ?", (fb["detection_id"],))
        db.commit()

    return {"undone": True, "feedback_id": feedback_id}


@router.get("/session/{session_id}")
def get_session(session_id: int):
    with get_db() as db:
        sess = db.execute("SELECT * FROM scan_sessions WHERE id = ?", (session_id,)).fetchone()
        if sess is None:
            raise HTTPException(404, "session not found")
        dets = db.execute(
            "SELECT * FROM detections WHERE session_id = ? ORDER BY confidence DESC",
            (session_id,),
        ).fetchall()
    return {"session": dict(sess), "detections": [dict(d) for d in dets]}
