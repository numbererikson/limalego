"""Brickognize public API wrapper.

Endpoint: POST https://api.brickognize.com/predict/parts/
Form field: 'query_image' (multipart file).
Response shape:
    {
        "listing_id": "...",
        "bounding_box": {
            "left": 0.0, "upper": 23.8, "right": 191.7, "lower": 166.4,
            "image_width": 192.0, "image_height": 192.0,
            "score": 0.946     # object-localisation confidence
        },
        "items": [
            {"id": "3001", "name": "Brick 2 x 4", "score": 0.85,
             "category": "Brick", "type": "part", "img_url": "...",
             "external_sites": [...]},
            ...
        ]
    }

Brickognize localises ONE dominant part per image and returns top-K candidate IDs
for it (no multi-object detection). For multi-brick scenes we crop client-side
and call /predict/parts/ per crop.

No API key required; rate limit is per-IP.
"""
from __future__ import annotations

from typing import Any

import httpx

BRICKOGNIZE_URL = "https://api.brickognize.com/predict/parts/"
DEFAULT_TIMEOUT = 30.0


async def predict_parts(
    image_bytes: bytes,
    filename: str = "scan.jpg",
    content_type: str = "image/jpeg",
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """POST image to Brickognize. Returns {'bounding_box': {...}|None, 'items': [...]}.

    `bounding_box` is in absolute pixels of the uploaded image (with image_width/image_height
    so the caller can normalise). `items` are ranked best-first.
    """
    files = {"query_image": (filename, image_bytes, content_type)}
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(BRICKOGNIZE_URL, files=files)
        resp.raise_for_status()
        data = resp.json()
    return {
        "bounding_box": data.get("bounding_box"),
        "items": data.get("items", []) or [],
        "listing_id": data.get("listing_id"),
    }
