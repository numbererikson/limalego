"""Add sets.img_url column and backfill from sets.csv.gz.

Safe to run multiple times: ALTER errors when column exists are ignored;
UPDATE always re-syncs URLs against the latest CSV dump.
"""
from __future__ import annotations

import csv
import gzip
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "lego.db"
DATA = ROOT.parent / "data"


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("ALTER TABLE sets ADD COLUMN img_url TEXT")
        print("Added sets.img_url column.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("Column sets.img_url already exists.")
        else:
            raise

    with gzip.open(DATA / "sets.csv.gz", "rt", encoding="utf-8") as f:
        rows = [((r.get("img_url") or None), r["set_num"]) for r in csv.DictReader(f)]

    conn.executemany("UPDATE sets SET img_url = ? WHERE set_num = ?", rows)
    conn.commit()
    print(f"Updated {sum(1 for _, _ in rows):,} sets.")
    conn.close()


if __name__ == "__main__":
    main()
