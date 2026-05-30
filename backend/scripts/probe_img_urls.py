"""Probe candidate image sources for a sample of difficult parts to see which patterns 404."""
from __future__ import annotations

import urllib.request

SAMPLES = [
    ("12622c03",        0,   "Vehicle Base (mould variant)"),
    ("3062b",           321, "Brick Round 1x1 Open Stud · Dark Azure"),
    ("3626cpr0389",     14,  "Minifig Head w/ decoration"),
    ("970c34",          25,  "Hips and Orange Legs"),
    ("973c34h12pr1182", 25,  "Torso Safety Jacket Print"),
    ("3001",            4,   "Brick 2x4 · Red (sanity check)"),
]

PATTERNS = [
    ("brickognize-thumb",       "https://storage.googleapis.com/brickognize-static/thumbnails/v2.22/part/{p}/0.webp"),
    ("rebrick-photo",           "https://cdn.rebrickable.com/media/parts/photos/{c}/{p}_{c}.jpg"),
    ("rebrick-ldraw",           "https://cdn.rebrickable.com/media/parts/ldraw/{c}/{p}.png"),
    ("rebrick-elements",        "https://cdn.rebrickable.com/media/parts/elements/{p}.jpg"),
    ("bricklink-PN",            "https://img.bricklink.com/ItemImage/PN/{c}/{p}.png"),
    ("bricklink-PL-no-color",   "https://www.bricklink.com/PL/{p}.jpg"),
]


def status(url: str) -> int:
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "limalego/0.1"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return -1


def main() -> None:
    print(f"{'name':<26}", " ".join(f"{n:<22}" for n, _ in PATTERNS))
    for part, color, label in SAMPLES:
        codes = []
        for _, pat in PATTERNS:
            codes.append(status(pat.format(p=part, c=color)))
        print(f"{label[:25]:<26}", " ".join(f"{c!s:<22}" for c in codes))


if __name__ == "__main__":
    main()
