"""Limalego FastAPI entrypoint.

Run from backend/ with:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import inventory, scan, sets, stats

app = FastAPI(title="Limalego — LEGO Known-Set Finder", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sets.router,      prefix="/sets",  tags=["sets"])
app.include_router(inventory.router, prefix="/sets",  tags=["inventory"])
app.include_router(scan.router,      prefix="/scan",  tags=["scan"])
app.include_router(stats.router,     prefix="/stats", tags=["stats"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
