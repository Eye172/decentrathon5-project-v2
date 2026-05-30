"""Internal scoring routes (used by background tasks and manual trigger)."""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional
from database import get_db
from models.db_models import User, Candidate
from services.auth_service import get_user_by_token
from services.ai_scorer import score_and_detect_candidate
from services.baseline_scorer import score_candidate_baseline

router = APIRouter(prefix="/api/score", tags=["scoring"])


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


@router.post("/{anonymous_id}/full")
async def rescore(
    anonymous_id: str,
    _=Depends(_require_commission),
    db: Session = Depends(get_db),
):
    """Commission can manually re-trigger scoring for a candidate."""
    candidate = db.query(Candidate).filter(Candidate.anonymous_id == anonymous_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    baseline = score_candidate_baseline(candidate)
    candidate.baseline_score = baseline["total"]
    candidate.baseline_breakdown = baseline

    try:
        ai_result, detection = await score_and_detect_candidate(candidate)
        candidate.ai_score = ai_result["total"]
        candidate.ai_score_breakdown = ai_result
        candidate.ai_recommendation = ai_result["recommendation"]
        candidate.ai_explanation = ai_result.get("summary", "")
        candidate.ai_detection_score = detection["score"]
        candidate.ai_detection_details = detection
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

    candidate.scored_at = datetime.now(timezone.utc)
    candidate.ai_evaluation_started_at = None
    db.commit()

    return {"status": "scored", "ai_score": candidate.ai_score}
