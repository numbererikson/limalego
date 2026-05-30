"""Aggregate stats across the user's tracked sets — header strip on Home."""
from __future__ import annotations

from fastapi import APIRouter

from app.database import get_db

router = APIRouter()

_MY_STATUSES = ("tracked", "building", "complete")


@router.get("")
def stats():
    with get_db() as db:
        sets_tracked = db.execute(
            f"""SELECT COUNT(*) FROM sets WHERE status IN ({','.join('?'*len(_MY_STATUSES))})""",
            _MY_STATUSES,
        ).fetchone()[0]

        progress = db.execute(
            f"""SELECT COALESCE(SUM(si.required_qty), 0)  AS required,
                       COALESCE(SUM(si.confirmed_qty), 0) AS confirmed,
                       COALESCE(SUM(si.missing_qty), 0)   AS missing
                FROM set_inventory si
                JOIN sets s ON s.set_num = si.set_num
                WHERE s.status IN ({','.join('?'*len(_MY_STATUSES))}) AND si.is_spare = 0""",
            _MY_STATUSES,
        ).fetchone()

        top_missing_colors = [
            dict(r) for r in db.execute(
                f"""SELECT c.color_id, c.name AS color_name, c.rgb AS color_rgb,
                           SUM(si.missing_qty) AS missing
                    FROM set_inventory si
                    JOIN sets   s ON s.set_num  = si.set_num
                    JOIN colors c ON c.color_id = si.color_id
                    WHERE s.status IN ({','.join('?'*len(_MY_STATUSES))})
                      AND si.is_spare = 0
                      AND si.missing_qty > 0
                    GROUP BY c.color_id, c.name, c.rgb
                    ORDER BY missing DESC
                    LIMIT 8""",
                _MY_STATUSES,
            ).fetchall()
        ]

        closest = [
            dict(r) for r in db.execute(
                f"""SELECT s.set_num, s.name, s.img_url, s.status,
                           COALESCE(SUM(si.required_qty), 0)  AS req,
                           COALESCE(SUM(si.confirmed_qty), 0) AS conf,
                           COALESCE(SUM(si.missing_qty), 0)   AS miss
                    FROM sets s
                    LEFT JOIN set_inventory si
                           ON si.set_num = s.set_num AND si.is_spare = 0
                    WHERE s.status IN ({','.join('?'*len(_MY_STATUSES))})
                    GROUP BY s.set_num
                    HAVING req > 0 AND miss > 0
                    ORDER BY (CAST(conf AS REAL) / req) DESC
                    LIMIT 3""",
                _MY_STATUSES,
            ).fetchall()
        ]

    return {
        "sets_tracked":       sets_tracked,
        "parts":              dict(progress),
        "top_missing_colors": top_missing_colors,
        "closest_to_done":    closest,
    }
