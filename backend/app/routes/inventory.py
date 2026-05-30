"""Per-set inventory: which parts the set needs and how many we already confirmed."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.database import get_db

router = APIRouter()


@router.get("/{set_num}/inventory")
def get_inventory(
    set_num: str,
    include_spares: bool = Query(False),
    missing_only: bool = Query(False),
):
    with get_db() as db:
        set_row = db.execute(
            "SELECT set_num, name, year, theme, total_parts, status, img_url FROM sets WHERE set_num = ?",
            (set_num,),
        ).fetchone()
        if set_row is None:
            raise HTTPException(404, f"set {set_num} not found")

        where = ["si.set_num = ?"]
        args: list = [set_num]
        if not include_spares:
            where.append("si.is_spare = 0")
        if missing_only:
            where.append("si.missing_qty > 0")
        sql = f"""
            SELECT si.part_num,
                   p.name     AS part_name,
                   p.category AS part_category,
                   si.color_id,
                   c.name     AS color_name,
                   c.rgb      AS color_rgb,
                   si.required_qty,
                   si.confirmed_qty,
                   si.missing_qty,
                   si.is_spare,
                   r.set_count AS rarity_set_count,
                   r.weight    AS rarity_weight,
                   (SELECT MIN(element_id) FROM elements e
                      WHERE e.part_num = si.part_num AND e.color_id = si.color_id) AS element_id
            FROM set_inventory si
            JOIN parts  p ON p.part_num = si.part_num
            JOIN colors c ON c.color_id = si.color_id
            LEFT JOIN part_color_rarity r ON r.part_num = si.part_num AND r.color_id = si.color_id
            WHERE {' AND '.join(where)}
            ORDER BY si.missing_qty DESC, si.required_qty DESC
        """
        rows = db.execute(sql, args).fetchall()

        progress = db.execute(
            """SELECT
                   COALESCE(SUM(required_qty), 0)  AS required,
                   COALESCE(SUM(confirmed_qty), 0) AS confirmed,
                   COALESCE(SUM(missing_qty), 0)   AS missing
               FROM set_inventory
               WHERE set_num = ? AND is_spare = 0""",
            (set_num,),
        ).fetchone()

    return {
        "set": dict(set_row),
        "progress": dict(progress),
        "parts": [dict(r) for r in rows],
    }


@router.patch("/{set_num}/inventory")
def update_inventory_qty(
    set_num: str,
    part_num: str = Query(...),
    color_id: int = Query(...),
    confirmed_qty: int = Query(..., ge=0),
    is_spare: int = Query(0, ge=0, le=1),
):
    """Manually adjust how many of a (part, color) the user already has for a set."""
    with get_db() as db:
        row = db.execute(
            """SELECT id, required_qty FROM set_inventory
               WHERE set_num = ? AND part_num = ? AND color_id = ? AND is_spare = ?""",
            (set_num, part_num, color_id, is_spare),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "inventory row not found")
        missing = max(0, row["required_qty"] - confirmed_qty)
        db.execute(
            "UPDATE set_inventory SET confirmed_qty = ?, missing_qty = ? WHERE id = ?",
            (confirmed_qty, missing, row["id"]),
        )
        db.commit()
    return {"set_num": set_num, "part_num": part_num, "color_id": color_id, "confirmed_qty": confirmed_qty, "missing_qty": missing}
