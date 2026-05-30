"""Import Rebrickable CSV dumps into the SQLite database.

Reads .csv.gz files from ./data/ and populates:
  - colors
  - parts (with category name resolved from part_categories.csv.gz)
  - sets (with theme name resolved from themes.csv.gz, parents flattened to root theme)
  - set_inventory (joined via inventories.csv.gz)
  - part_color_rarity (computed from set_inventory)

Idempotent: uses INSERT OR REPLACE so re-running with newer dumps updates rows.
Run after init_db.py.
"""
from __future__ import annotations

import csv
import gzip
import sqlite3
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT.parent / "data"
DB_PATH = ROOT / "db" / "lego.db"


def open_csv(name: str):
    path = DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run download_rebrickable.py first.")
    return gzip.open(path, mode="rt", encoding="utf-8", newline="")


def chunks(rows: Iterable[tuple], size: int = 5000):
    batch: list[tuple] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def import_colors(conn: sqlite3.Connection) -> int:
    with open_csv("colors.csv.gz") as f:
        reader = csv.DictReader(f)
        rows = (
            (int(r["id"]), r["name"], r.get("rgb") or None)
            for r in reader
        )
        total = 0
        for batch in chunks(rows):
            conn.executemany(
                "INSERT OR REPLACE INTO colors (color_id, name, rgb) VALUES (?, ?, ?)",
                batch,
            )
            total += len(batch)
        # Synthetic "unknown" color for detections we can't classify yet.
        conn.execute(
            "INSERT OR IGNORE INTO colors (color_id, name, rgb) VALUES (-1, 'Unknown', NULL)"
        )
    return total


def load_part_categories() -> dict[str, str]:
    with open_csv("part_categories.csv.gz") as f:
        reader = csv.DictReader(f)
        return {r["id"]: r["name"] for r in reader}


def import_parts(conn: sqlite3.Connection) -> int:
    categories = load_part_categories()
    with open_csv("parts.csv.gz") as f:
        reader = csv.DictReader(f)
        rows = (
            (r["part_num"], r["name"], categories.get(r.get("part_cat_id", "")))
            for r in reader
        )
        total = 0
        for batch in chunks(rows):
            conn.executemany(
                "INSERT OR REPLACE INTO parts (part_num, name, category) VALUES (?, ?, ?)",
                batch,
            )
            total += len(batch)
    return total


def load_themes() -> dict[str, str]:
    """Resolve every theme id to its root theme name (e.g. 'Star Wars / Episode I' -> 'Star Wars')."""
    with open_csv("themes.csv.gz") as f:
        rows = list(csv.DictReader(f))
    parent: dict[str, str | None] = {r["id"]: (r.get("parent_id") or None) for r in rows}
    name: dict[str, str] = {r["id"]: r["name"] for r in rows}
    resolved: dict[str, str] = {}
    for tid in name:
        cur = tid
        depth = 0
        while parent.get(cur) and depth < 16:
            cur = parent[cur]  # type: ignore[assignment]
            depth += 1
        resolved[tid] = name.get(cur, name[tid])
    return resolved


def import_sets(conn: sqlite3.Connection) -> int:
    themes = load_themes()
    with open_csv("sets.csv.gz") as f:
        reader = csv.DictReader(f)
        rows = []
        for r in reader:
            year = int(r["year"]) if r.get("year") else None
            total_parts = int(r["num_parts"]) if r.get("num_parts") else None
            theme = themes.get(r.get("theme_id", ""))
            img_url = r.get("img_url") or None
            rows.append((r["set_num"], r["name"], year, theme, total_parts, img_url))
        total = 0
        for batch in chunks(rows):
            # New rows default to status='catalog'. ON CONFLICT preserves whatever the user set.
            conn.executemany(
                """
                INSERT INTO sets (set_num, name, year, theme, total_parts, img_url)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(set_num) DO UPDATE SET
                    name        = excluded.name,
                    year        = excluded.year,
                    theme       = excluded.theme,
                    total_parts = excluded.total_parts,
                    img_url     = excluded.img_url
                """,
                batch,
            )
            total += len(batch)
    return total


def load_canonical_inventories() -> tuple[dict[str, str], dict[str, str]]:
    """Return (set_to_inv, fig_to_inv): each maps set_num/fig_num → canonical inventory_id.

    Rebrickable lists both sets and minifigs in inventories.csv. We discriminate by
    the 'fig-' prefix on set_num.
    """
    set_best: dict[str, tuple[int, str]] = {}
    fig_best: dict[str, tuple[int, str]] = {}
    with open_csv("inventories.csv.gz") as f:
        for r in csv.DictReader(f):
            sn = r["set_num"]
            version = int(r.get("version") or 1)
            inv_id = r["id"]
            target = fig_best if sn.startswith("fig-") else set_best
            existing = target.get(sn)
            if existing is None or version > existing[0]:
                target[sn] = (version, inv_id)
    set_to_inv = {sn: iid for sn, (_, iid) in set_best.items()}
    fig_to_inv = {fn: iid for fn, (_, iid) in fig_best.items()}
    return set_to_inv, fig_to_inv


def load_set_minifigs() -> dict[str, list[tuple[str, int]]]:
    """parent_inv_id → [(fig_num, quantity_of_that_fig), ...]"""
    try:
        with open_csv("inventory_minifigs.csv.gz") as f:
            result: dict[str, list[tuple[str, int]]] = {}
            for r in csv.DictReader(f):
                result.setdefault(r["inventory_id"], []).append(
                    (r["fig_num"], int(r["quantity"])),
                )
            return result
    except FileNotFoundError:
        return {}


def import_set_inventory(conn: sqlite3.Connection) -> tuple[int, int]:
    """Populate set_inventory from inventory_parts. Each set row aggregates direct parts
    + minifig parts (qty × number of figs in the set)."""
    set_to_inv, fig_to_inv = load_canonical_inventories()
    inv_to_set = {iid: sn for sn, iid in set_to_inv.items()}
    parent_inv_to_figs = load_set_minifigs()

    # For each fig-inventory: list of (parent_set_num, multiplier) it contributes to.
    fig_inv_to_parents: dict[str, list[tuple[str, int]]] = {}
    for parent_inv_id, figs in parent_inv_to_figs.items():
        parent_set = inv_to_set.get(parent_inv_id)
        if parent_set is None:
            continue
        for fig_num, fig_qty in figs:
            fig_inv = fig_to_inv.get(fig_num)
            if fig_inv:
                fig_inv_to_parents.setdefault(fig_inv, []).append((parent_set, fig_qty))

    known_sets   = {r[0] for r in conn.execute("SELECT set_num FROM sets")}
    known_parts  = {r[0] for r in conn.execute("SELECT part_num FROM parts")}
    known_colors = {r[0] for r in conn.execute("SELECT color_id FROM colors")}

    # Aggregate (set_num, part_num, color_id, is_spare) → quantity
    acc: dict[tuple[str, str, int, int], int] = {}
    direct_hits = fig_hits = skipped = 0

    with open_csv("inventory_parts.csv.gz") as f:
        for r in csv.DictReader(f):
            inv_id = r["inventory_id"]
            part_num = r["part_num"]
            try:
                color_id = int(r["color_id"])
            except ValueError:
                skipped += 1
                continue
            if part_num not in known_parts or color_id not in known_colors:
                skipped += 1
                continue
            qty = int(r["quantity"])
            is_spare = 1 if (r.get("is_spare") or "").strip().lower() in ("t", "true", "1") else 0

            # Direct set inventory row
            parent_direct = inv_to_set.get(inv_id)
            if parent_direct and parent_direct in known_sets:
                k = (parent_direct, part_num, color_id, is_spare)
                acc[k] = acc.get(k, 0) + qty
                direct_hits += 1

            # Minifig contribution to (possibly multiple) parent sets
            for parent_set, multiplier in fig_inv_to_parents.get(inv_id, []):
                if parent_set not in known_sets:
                    continue
                # Spare flags from fig inventories don't apply to the parent set.
                k = (parent_set, part_num, color_id, 0)
                acc[k] = acc.get(k, 0) + qty * multiplier
                fig_hits += 1

    conn.execute("DELETE FROM set_inventory")
    rows = [
        (sn, pn, cid, q, 0, q, sp)
        for (sn, pn, cid, sp), q in acc.items()
    ]
    total = 0
    for batch in chunks(rows):
        conn.executemany(
            """
            INSERT INTO set_inventory
                (set_num, part_num, color_id, required_qty, confirmed_qty, missing_qty, is_spare)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(set_num, part_num, color_id, is_spare) DO UPDATE SET
                required_qty = excluded.required_qty,
                missing_qty  = MAX(0, excluded.required_qty - set_inventory.confirmed_qty)
            """,
            batch,
        )
        total += len(batch)
    if skipped:
        print(f"  note: skipped {skipped:,} rows (unknown part/color)")
    print(f"  direct part rows: {direct_hits:,}  ·  minifig part rows: {fig_hits:,}")
    return total, fig_hits


def compute_rarity(conn: sqlite3.Connection) -> int:
    """For each (part_num, color_id), count how many DISTINCT sets request it (non-spare)."""
    conn.execute("DELETE FROM part_color_rarity")
    conn.execute(
        """
        INSERT INTO part_color_rarity (part_num, color_id, set_count, weight)
        SELECT part_num,
               color_id,
               COUNT(DISTINCT set_num) AS set_count,
               1.0 / (1.0 + LN(1.0 + COUNT(DISTINCT set_num))) AS weight
        FROM set_inventory
        WHERE is_spare = 0
        GROUP BY part_num, color_id
        """
    )
    return conn.execute("SELECT COUNT(*) FROM part_color_rarity").fetchone()[0]


def main() -> int:
    if not DB_PATH.exists():
        print(f"DB not found at {DB_PATH}. Run init_db.py first.", file=sys.stderr)
        return 1

    import math
    with sqlite3.connect(DB_PATH) as conn:
        # SQLite doesn't ship LN() by default — register it.
        conn.create_function("LN", 1, math.log)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")

        print("Importing colors...")
        n = import_colors(conn)
        print(f"  {n:,} colors")

        print("Importing parts...")
        n = import_parts(conn)
        print(f"  {n:,} parts")

        print("Importing sets...")
        n = import_sets(conn)
        print(f"  {n:,} sets")

        print("Importing set_inventory (this is the big one)...")
        n, fig_hits = import_set_inventory(conn)
        print(f"  {n:,} inventory rows (incl. {fig_hits:,} minifig contributions)")

        print("Computing part_color_rarity...")
        n = compute_rarity(conn)
        print(f"  {n:,} (part, color) pairs")

        conn.commit()

    print("Import complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
