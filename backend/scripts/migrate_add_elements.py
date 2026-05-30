"""Create the elements table and import Rebrickable's elements.csv.gz.

Each (part_num, color_id) tuple maps to one or more element_ids (mould generations).
We store all of them, then resolve to MIN(element_id) at query time — any one is
enough to fetch a photo from cdn.rebrickable.com/media/parts/elements/{id}.jpg.
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
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS elements (
            element_id TEXT PRIMARY KEY,
            part_num   TEXT    NOT NULL,
            color_id   INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_elements_part_color ON elements(part_num, color_id);
        """
    )

    with gzip.open(DATA / "elements.csv.gz", "rt", encoding="utf-8") as f:
        rows = []
        for r in csv.DictReader(f):
            try:
                rows.append((r["element_id"], r["part_num"], int(r["color_id"])))
            except ValueError:
                continue

    print(f"Importing {len(rows):,} element rows...")
    conn.execute("DELETE FROM elements")
    for i in range(0, len(rows), 10_000):
        conn.executemany(
            "INSERT OR IGNORE INTO elements (element_id, part_num, color_id) VALUES (?, ?, ?)",
            rows[i : i + 10_000],
        )
    conn.commit()

    cnt = conn.execute("SELECT COUNT(*) FROM elements").fetchone()[0]
    print(f"elements table now has {cnt:,} rows.")
    conn.close()


if __name__ == "__main__":
    main()
