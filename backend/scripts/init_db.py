"""Create the SQLite database from schema.sql."""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "app" / "schema.sql"
DB_PATH = ROOT / "db" / "lego.db"


def init(db_path: Path = DB_PATH, schema_path: Path = SCHEMA_PATH) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    schema_sql = schema_path.read_text(encoding="utf-8")
    with sqlite3.connect(db_path) as conn:
        conn.executescript(schema_sql)
    print(f"Initialized {db_path} from {schema_path.name}")


if __name__ == "__main__":
    init()
    sys.exit(0)
