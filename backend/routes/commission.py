from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models.db_models import User, Candidate, InterviewMessage
from models.schemas import (
    CommissionCandidateList,
    CommissionCandidateDetail,
    CommissionCommentUpdate,
    CommissionRankingResponse,
    InterviewMessageOut,
)
from services.auth_service import get_user_by_token

router = APIRouter(prefix="/api/commission", tags=["commission"])


def _require_commission(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    user = get_user_by_token(db, token)
    if not user or user.role != "commission":
        raise HTTPException(status_code=403, detail="Commission access required")
    return user


def _commission_detail(db: Session, candidate: Candidate) -> CommissionCandidateDetail:
    messages = (
        db.query(InterviewMessage)
        .filter(InterviewMessage.candidate_id == candidate.id)
        .order_by(InterviewMessage.id.asc())
        .all()
    )
    return CommissionCandidateDetail(
        anonymous_id=candidate.anonymous_id,
        age=candidate.age,
        city=candidate.city,
        gpa=candidate.gpa,
        ielts_overall=candidate.ielts_overall,
        ent_score=candidate.ent_score,
        achievements=candidate.achievements,
        leadership_examples=candidate.leadership_examples,
        extra_activities=candidate.extra_activities,
        goals=candidate.goals,
        essay=candidate.essay,
        commission_comment=candidate.commission_comment,
        application_step=candidate.application_step,
        ai_score=candidate.ai_score,
        ai_score_breakdown=candidate.ai_score_breakdown,
        ai_recommendation=candidate.ai_recommendation,
        ai_explanation=candidate.ai_explanation,
        baseline_score=candidate.baseline_score,
        baseline_breakdown=candidate.baseline_breakdown,
        ai_detection_score=candidate.ai_detection_score,
        ai_detection_details=candidate.ai_detection_details,
        video_url=candidate.video_url,
        behavior_metrics=candidate.behavior_metrics,
        interview_messages=[InterviewMessageOut.model_validate(m) for m in messages],
        created_at=candidate.created_at,
        scored_at=candidate.scored_at,
        ai_evaluation_in_progress=candidate.ai_evaluation_in_progress,
    )


@router.get("/candidates", response_model=CommissionRankingResponse)
def list_candidates(
    _=Depends(_require_commission),
    db: Session = Depends(get_db),
):
    all_candidates = db.query(Candidate).all()

    completed = [c for c in all_candidates if c.application_step >= 4]
    in_progress = [c for c in all_candidates if c.application_step < 4]

    # Sort completed: scored first (by score desc), then unscored
    scored = sorted(
        [c for c in completed if c.ai_score is not None],
        key=lambda c: c.ai_score,
        reverse=True,
    )
    unscored_complete = [c for c in completed if c.ai_score is None]

    ordered = scored + unscored_complete + in_progress

    return CommissionRankingResponse(
        candidates=ordered,
        total=len(all_candidates),
        completed=len(completed),
        scored=len(scored),
    )


@router.get("/candidates/{anonymous_id}", response_model=CommissionCandidateDetail)
def get_candidate(
    anonymous_id: str,
    _=Depends(_require_commission),
    db: Session = Depends(get_db),
):
    candidate = db.query(Candidate).filter(
        Candidate.anonymous_id == anonymous_id
    ).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return _commission_detail(db, candidate)


@router.patch("/candidates/{anonymous_id}/comment", response_model=CommissionCandidateDetail)
def update_commission_comment(
    anonymous_id: str,
    body: CommissionCommentUpdate,
    _=Depends(_require_commission),
    db: Session = Depends(get_db),
):
    candidate = db.query(Candidate).filter(Candidate.anonymous_id == anonymous_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate.commission_comment = body.commission_comment.strip() or None
    db.commit()
    db.refresh(candidate)
    return _commission_detail(db, candidate)
