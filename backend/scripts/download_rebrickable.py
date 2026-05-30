"""Download the public Rebrickable CSV dumps into ./data/.

Files come gzipped from cdn.rebrickable.com. We keep them gzipped on disk —
import_csv.py reads .csv.gz directly.
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "data"
BASE_URL = "https://cdn.rebrickable.com/media/downloads"

FILES = [
    "themes.csv.gz",
    "colors.csv.gz",
    "part_categories.csv.gz",
    "parts.csv.gz",
    "sets.csv.gz",
    "elements.csv.gz",
    "inventories.csv.gz",
    "inventory_parts.csv.gz",
    "minifigs.csv.gz",
    "inventory_minifigs.csv.gz",
    "inventory_sets.csv.gz",
]


def download(name: str, force: bool = False) -> Path:
    dest = DATA_DIR / name
    if dest.exists() and not force:
        print(f"  skip  {name} ({dest.stat().st_size:,} bytes, already present)")
        return dest
    url = f"{BASE_URL}/{name}"
    print(f"  fetch {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "limalego/0.1"})
    with urllib.request.urlopen(req, timeout=120) as resp, dest.open("wb") as f:
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            f.write(chunk)
    print(f"  ok    {name} ({dest.stat().st_size:,} bytes)")
    return dest


def main() -> int:
    force = "--force" in sys.argv
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading Rebrickable dumps into {DATA_DIR}")
    for name in FILES:
        download(name, force=force)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
