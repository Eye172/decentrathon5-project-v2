import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from database import engine, Base
from routes import candidates, score, analyze, auth, interview, commission, video_interview

_log = logging.getLogger("uvicorn.error")

Base.metadata.create_all(bind=engine)

# Demo commission accounts (same as seed_data.COMMISSION_MEMBERS) — DB often has no users until this runs.
try:
    from seed_data import ensure_commission_seeded

    ensure_commission_seeded(verbose=False)
except Exception as exc:
    _log.warning("Commission seed skipped: %s", exc)

# SQLite: add columns if missing (create_all does not migrate existing DBs)
_migrations = [
    "ALTER TABLE candidates ADD COLUMN ai_evaluation_started_at DATETIME",
    "ALTER TABLE candidates ADD COLUMN video_url VARCHAR(500)",
    "ALTER TABLE candidates ADD COLUMN behavior_metrics JSON",
    "ALTER TABLE candidates ADD COLUMN ielts_overall FLOAT",
    "ALTER TABLE candidates ADD COLUMN ent_score INTEGER",
    "ALTER TABLE candidates ADD COLUMN commission_comment TEXT",
]
for _sql in _migrations:
    try:
        with engine.begin() as conn:
            conn.execute(text(_sql))
    except Exception:
        pass

app = FastAPI(
    title="inVision U — Candidate Selection System",
    description="AI-powered candidate screening with anonymous commission review",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(candidates.router)
app.include_router(interview.router)
app.include_router(video_interview.router)
app.include_router(commission.router)
app.include_router(score.router)
app.include_router(analyze.router)


# Serve uploaded video recordings (for commission review playback)
_uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")


@app.get("/")
def root():
    return {"service": "inVision U API v2", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
