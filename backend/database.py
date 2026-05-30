import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Resolve .env and default SQLite path from this file's directory so the DB is always
# backend/invisionu.db no matter which folder you run uvicorn from (common Windows issue).
_BACKEND_ROOT = Path(__file__).resolve().parent
load_dotenv(_BACKEND_ROOT / ".env")

_default_sqlite = f"sqlite:///{(_BACKEND_ROOT / 'invisionu.db').as_posix()}"
_raw_url = (os.getenv("DATABASE_URL") or _default_sqlite).strip()
# .env often has sqlite:///./invisionu.db — that path is cwd-relative; anchor to backend/
if _raw_url.startswith("sqlite:///./"):
    _rel = _raw_url[len("sqlite:///./") :]
    _raw_url = f"sqlite:///{(_BACKEND_ROOT / _rel).resolve().as_posix()}"
DATABASE_URL = _raw_url

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
