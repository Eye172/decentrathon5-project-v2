from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models.db_models import User, Candidate
from models.schemas import QuestionnaireData, EssayData, CandidateStepResponse
from services.auth_service import get_user_by_token

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


def _get_candidate_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> tuple[User, Candidate]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    user = get_user_by_token(db, token)
    if not user or user.role != "candidate":
        raise HTTPException(status_code=403, detail="Candidate access required")
    if not user.candidate:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
    return user, user.candidate


@router.get("/me", response_model=CandidateStepResponse)
def get_my_profile(pair=Depends(_get_candidate_user)):
    _, candidate = pair
    return candidate


@router.put("/me/questionnaire", response_model=CandidateStepResponse)
def save_questionnaire(data: QuestionnaireData, pair=Depends(_get_candidate_user),
                       db: Session = Depends(get_db)):
    _, candidate = pair
    for field, value in data.model_dump().items():
        setattr(candidate, field, value)
    if candidate.application_step < 1:
        candidate.application_step = 1
    db.commit()
    db.refresh(candidate)
    return candidate


@router.put("/me/essay", response_model=CandidateStepResponse)
def save_essay(data: EssayData, pair=Depends(_get_candidate_user),
               db: Session = Depends(get_db)):
    _, candidate = pair
    candidate.essay = data.essay
    if candidate.application_step < 2:
        candidate.application_step = 2
    db.commit()
    db.refresh(candidate)
    return candidate
