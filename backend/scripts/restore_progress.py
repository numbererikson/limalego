"""Restore a Limalego backup JSON into the current DB.

Usage:  restore_progress.py <backup.json>

Only touches sets.status and set_inventory.confirmed_qty (+ derived missing_qty).
Does NOT clear unmentioned sets — to roll back a single mistake you can hand-edit
the JSON.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "lego.db"


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: restore_progress.py <backup.json>", file=sys.stderr)
        return 2
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        print(f"unknown schema_version: {payload.get('schema_version')}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(DB_PATH)
    try:
        sets_restored = 0
        for s in payload["sets"]:
            cur = conn.execute(
                "UPDATE sets SET status = ? WHERE set_num = ?",
                (s["status"], s["set_num"]),
            )
            sets_restored += cur.rowcount

        inv_restored = 0
        for i in payload["inventory"]:
            cur = conn.execute(
                """UPDATE set_inventory
                   SET confirmed_qty = ?,
                       missing_qty   = MAX(0, required_qty - ?)
                   WHERE set_num = ? AND part_num = ? AND color_id = ? AND is_spare = ?""",
                (i["confirmed_qty"], i["confirmed_qty"],
                 i["set_num"], i["part_num"], i["color_id"], i["is_spare"]),
            )
            inv_restored += cur.rowcount
        conn.commit()
        print(f"Restored: {sets_restored} sets, {inv_restored} inventory rows.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
