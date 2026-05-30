from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.db_models import User, Candidate
from models.schemas import RegisterRequest, LoginRequest, AuthResponse
from services.auth_service import hash_password, verify_password, generate_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    token = generate_token()
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role="candidate",
        session_token=token,
    )
    db.add(user)
    db.flush()  # get user.id

    # Create empty candidate profile
    candidate = Candidate(user_id=user.id)
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    return AuthResponse(
        token=token,
        role="candidate",
        candidate_id=candidate.id,
    )


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = generate_token()
    user.session_token = token
    db.commit()

    candidate_id = None
    if user.role == "candidate" and user.candidate:
        candidate_id = user.candidate.id

    return AuthResponse(
        token=token,
        role=user.role,
        candidate_id=candidate_id,
    )


@router.post("/logout")
def logout(db: Session = Depends(get_db)):
    # Token handled on client side by clearing localStorage
    return {"status": "ok"}


@router.get("/me")
def me(db: Session = Depends(get_db)):
    # Used for token validation on page refresh
    return {"status": "ok"}
