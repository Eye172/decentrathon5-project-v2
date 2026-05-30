import hashlib
import secrets
from sqlalchemy.orm import Session
from models.db_models import User


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hashlib.sha256(password.encode()).hexdigest() == hashed


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def get_user_by_token(db: Session, token: str) -> User | None:
    return db.query(User).filter(User.session_token == token).first()
