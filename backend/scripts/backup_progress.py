"""Export user's tracked sets + confirmed quantities to a JSON snapshot.

We only back up *user-state* (statuses + confirmed_qty), not Rebrickable master data,
because the master is reproducible by re-running import_csv.py.

Keeps the last 30 daily snapshots in ./backups/.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "lego.db"
BACKUP_DIR = ROOT.parent / "backups"
KEEP = 30


def main() -> None:
    BACKUP_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    sets = [
        dict(r)
        for r in conn.execute(
            "SELECT set_num, status FROM sets WHERE status != 'catalog' ORDER BY set_num"
        ).fetchall()
    ]
    inv = [
        dict(r)
        for r in conn.execute(
            """SELECT si.set_num, si.part_num, si.color_id, si.is_spare, si.confirmed_qty
               FROM set_inventory si
               JOIN sets s ON s.set_num = si.set_num
               WHERE s.status != 'catalog' AND si.confirmed_qty > 0
               ORDER BY si.set_num, si.part_num, si.color_id"""
        ).fetchall()
    ]

    payload = {
        "schema_version":  1,
        "exported_at_utc": datetime.now(timezone.utc).isoformat(),
        "sets":            sets,
        "inventory":       inv,
    }

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = BACKUP_DIR / f"limalego-{ts}.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out} ({len(sets)} sets, {len(inv)} inventory rows)")

    # Prune
    snaps = sorted(BACKUP_DIR.glob("limalego-*.json"))
    for old in snaps[:-KEEP]:
        old.unlink()
    if len(snaps) > KEEP:
        print(f"Pruned {len(snaps) - KEEP} older backups")

    conn.close()


if __name__ == "__main__":
    main()
