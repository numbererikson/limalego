"""Routes for browsing the master set catalog and tracking sets the user is building."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.database import get_db

router = APIRouter()

_VALID_STATUSES = {"catalog", "tracked", "building", "complete", "archived"}
_DEFAULT_MY_STATUSES = ("tracked", "building", "complete")


@router.get("")
def list_sets(
    status: Optional[str] = Query(None, description="Filter by status. Use 'all' to search master catalog."),
    q: Optional[str] = Query(None, description="Search by set_num or name (only used when status=all)."),
    limit: int = Query(50, le=500),
):
    """List "my" sets (default), or search the full Rebrickable catalog with status=all&q=..."""
    with get_db() as db:
        if status == "all":
            if q:
                like = f"%{q}%"
                rows = db.execute(
                    """SELECT set_num, name, year, theme, total_parts, status, img_url
                       FROM sets
                       WHERE set_num LIKE ? OR name LIKE ?
                       ORDER BY year DESC, total_parts DESC
                       LIMIT ?""",
                    (like, like, limit),
                ).fetchall()
            else:
                rows = db.execute(
                    """SELECT set_num, name, year, theme, total_parts, status, img_url
                       FROM sets
                       ORDER BY year DESC, total_parts DESC
                       LIMIT ?""",
                    (limit,),
                ).fetchall()
        else:
            if status is not None:
                if status not in _VALID_STATUSES:
                    raise HTTPException(400, f"invalid status; expected one of {sorted(_VALID_STATUSES)} or 'all'")
                statuses = (status,)
            else:
                statuses = _DEFAULT_MY_STATUSES
            placeholders = ",".join(["?"] * len(statuses))
            rows = db.execute(
                f"""SELECT set_num, name, year, theme, total_parts, status, img_url
                    FROM sets
                    WHERE status IN ({placeholders})
                    ORDER BY status, theme, year DESC, name
                    LIMIT ?""",
                (*statuses, limit),
            ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{set_num}")
def get_set(set_num: str):
    with get_db() as db:
        row = db.execute(
            "SELECT set_num, name, year, theme, total_parts, status, img_url FROM sets WHERE set_num = ?",
            (set_num,),
        ).fetchone()

    if row is None:
        raise HTTPException(404, f"set {set_num} not found")
    return dict(row)


@router.delete("/{set_num}")
def untrack_set(set_num: str, reset_progress: bool = Query(False)):
    """Remove a set from 'my sets' by flipping its status back to 'catalog'.

    Set + inventory rows are kept (we never lose Rebrickable master data).
    If reset_progress=true, also zero out confirmed_qty for every row of this set.
    """
    with get_db() as db:
        row = db.execute("SELECT status FROM sets WHERE set_num = ?", (set_num,)).fetchone()
        if row is None:
            raise HTTPException(404, f"set {set_num} not found")
        db.execute("UPDATE sets SET status = 'catalog' WHERE set_num = ?", (set_num,))
        if reset_progress:
            db.execute(
                """UPDATE set_inventory
                   SET confirmed_qty = 0,
                       missing_qty   = required_qty
                   WHERE set_num = ?""",
                (set_num,),
            )
        db.commit()
    return {"set_num": set_num, "status": "catalog", "progress_reset": reset_progress}


@router.post("/import/{set_num}")
def import_set(set_num: str, status: str = Query("tracked")):
    """Mark a catalog set as one the user owns / wants to build.

    The set row already exists (Rebrickable import) with status='catalog'; we only flip its status.
    """
    if status == "catalog" or status not in _VALID_STATUSES:
        raise HTTPException(400, f"invalid status; expected one of tracked|building|complete|archived")
    with get_db() as db:
        row = db.execute("SELECT set_num FROM sets WHERE set_num = ?", (set_num,)).fetchone()
        if row is None:
            raise HTTPException(404, f"set {set_num} not in catalog")
        db.execute("UPDATE sets SET status = ? WHERE set_num = ?", (status, set_num))
        db.commit()
    return {"set_num": set_num, "status": status}
