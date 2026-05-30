from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks, File, UploadFile
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
from database import get_db
from models.db_models import User, Candidate, InterviewMessage
from models.schemas import (
    InterviewAnswerRequest,
    InterviewNextResponse,
    InterviewMessageOut,
    InterviewTranscribeResponse,
)
from services.auth_service import get_user_by_token
from services.interview_service import generate_first_question, generate_next_question
from services.ai_scorer import score_and_detect_candidate
from services.baseline_scorer import score_candidate_baseline
from services.whisper_service import transcribe_audio

router = APIRouter(prefix="/api/interview", tags=["interview"])

MAX_QUESTIONS = 4
MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024


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


@router.post("/start", response_model=InterviewNextResponse)
async def start_interview(
    lang: Optional[str] = Header(None, alias="X-Language"),
    pair=Depends(_get_candidate_user), 
    db: Session = Depends(get_db)
):
    _, candidate = pair

    if not candidate.essay:
        raise HTTPException(status_code=400, detail="Essay not submitted yet")

    # Resume existing interview if already started (don't reset on page reload)
    existing = (
        db.query(InterviewMessage)
        .filter(InterviewMessage.candidate_id == candidate.id)
        .order_by(InterviewMessage.id.asc())
        .all()
    )

    if existing:
        # Already started — return current state
        ai_questions = sum(1 for m in existing if m.role == "ai")
        answered = sum(1 for m in existing if m.role == "candidate")
        is_final = candidate.application_step >= 4

        # Last message determines current question
        last_ai = next((m for m in reversed(existing) if m.role == "ai"), None)
        current_q = last_ai.content if last_ai and answered < ai_questions else None

        return InterviewNextResponse(
            question=current_q if not is_final else None,
            is_final=is_final,
            messages=[InterviewMessageOut.model_validate(m) for m in existing],
        )

    # Fresh start
    if candidate.application_step < 3:
        candidate.application_step = 3
        db.commit()

    try:
        result = generate_first_question(candidate.essay, lang=lang)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="Could not start the interview. Please refresh and try again.",
        ) from e

    question = result["question"]
    msg = InterviewMessage(
        candidate_id=candidate.id,
        role="ai",
        content=question,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return InterviewNextResponse(
        question=question,
        is_final=False,
        messages=[InterviewMessageOut.model_validate(msg)],
    )


@router.post("/answer", response_model=InterviewNextResponse)
async def submit_answer(
    data: InterviewAnswerRequest,
    background_tasks: BackgroundTasks,
    pair=Depends(_get_candidate_user),
    db: Session = Depends(get_db),
):
    _, candidate = pair

    if not candidate.essay:
        raise HTTPException(status_code=400, detail="Essay not submitted")

    # Save candidate's answer
    answer_msg = InterviewMessage(
        candidate_id=candidate.id,
        role="candidate",
        content=data.answer.strip(),
    )
    db.add(answer_msg)
    db.commit()

    # Count AI questions asked so far
    ai_questions = db.query(InterviewMessage).filter(
        InterviewMessage.candidate_id == candidate.id,
        InterviewMessage.role == "ai",
    ).count()

    # If candidate has answered all MAX_QUESTIONS — end interview
    if ai_questions >= MAX_QUESTIONS:
        candidate.application_step = 4
        candidate.ai_evaluation_started_at = datetime.now(timezone.utc)
        db.commit()

        all_messages = db.query(InterviewMessage).filter(
            InterviewMessage.candidate_id == candidate.id
        ).order_by(InterviewMessage.created_at).all()

        background_tasks.add_task(_score_candidate_background, candidate.id)

        return InterviewNextResponse(
            question=None,
            is_final=True,
            messages=[InterviewMessageOut.model_validate(m) for m in all_messages],
        )

    # Full transcript (must come from DB — relationship cache can miss the answer we just committed)
    transcript = (
        db.query(InterviewMessage)
        .filter(InterviewMessage.candidate_id == candidate.id)
        .order_by(InterviewMessage.id.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in transcript]

    # Next AI turn: after this many AI messages already in DB, we are generating question (ai_questions + 1)
    next_question_number = ai_questions + 1

    try:
        result = generate_next_question(candidate.essay, history, next_question_number, lang=data.lang)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        # e.g. Anthropic timeouts, network errors, unexpected API failures (avoids stuck UI)
        raise HTTPException(
            status_code=503,
            detail="Could not generate the next question. Please try sending your answer again.",
        ) from e

    ai_msg = InterviewMessage(
        candidate_id=candidate.id,
        role="ai",
        content=result["question"],
    )
    db.add(ai_msg)
    db.commit()

    all_messages = db.query(InterviewMessage).filter(
        InterviewMessage.candidate_id == candidate.id
    ).order_by(InterviewMessage.created_at).all()

    # Always is_final=False here — candidate must answer this question first
    return InterviewNextResponse(
        question=result["question"],
        is_final=False,
        messages=[InterviewMessageOut.model_validate(m) for m in all_messages],
    )


@router.post("/transcribe", response_model=InterviewTranscribeResponse)
async def transcribe_interview_voice(
    file: UploadFile = File(...),
    lang: Optional[str] = Header(None, alias="X-Language"),
    pair=Depends(_get_candidate_user),
):
    """Transcribe candidate voice (WebM from browser) with OpenAI Whisper."""
    _user, _candidate = pair
    data = await file.read()
    if len(data) > MAX_TRANSCRIBE_BYTES:
        raise HTTPException(status_code=413, detail="Audio file is too large")
    if len(data) < 256:
        raise HTTPException(status_code=400, detail="Recording is too short")

    name = file.filename or "recording.webm"
    try:
        text = transcribe_audio(data, filename=name, language=lang)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Could not transcribe audio. Try again or type your answer.",
        ) from None

    return InterviewTranscribeResponse(text=text)


@router.get("/history", response_model=list[InterviewMessageOut])
def get_history(pair=Depends(_get_candidate_user), db: Session = Depends(get_db)):
    _, candidate = pair
    messages = db.query(InterviewMessage).filter(
        InterviewMessage.candidate_id == candidate.id
    ).order_by(InterviewMessage.created_at).all()
    return [InterviewMessageOut.model_validate(m) for m in messages]


async def _score_candidate_background(candidate_id: int):
    """Run full scoring after interview is complete."""
    from database import SessionLocal

    db = SessionLocal()
    try:
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            return

        # Baseline
        baseline = score_candidate_baseline(candidate)
        candidate.baseline_score = baseline["total"]
        candidate.baseline_breakdown = baseline

        # Multi-agent AI Core (extraction → path / psych / authenticity → skeptic → orchestrator)
        try:
            ai_result, detection = await score_and_detect_candidate(candidate)
            candidate.ai_score = ai_result["total"]
            candidate.ai_score_breakdown = ai_result
            candidate.ai_recommendation = ai_result["recommendation"]
            candidate.ai_explanation = ai_result.get("summary", "")
            candidate.ai_detection_score = detection["score"]
            candidate.ai_detection_details = detection
        except Exception:
            from services.ai_detector import detect_ai_text

            score = baseline["total"]
            candidate.ai_recommendation = (
                "recommend" if score >= 70 else "review" if score >= 50 else "reject"
            )
            if candidate.essay:
                det = detect_ai_text(candidate.essay)
                candidate.ai_detection_score = det["score"]
                candidate.ai_detection_details = det

        candidate.scored_at = datetime.now(timezone.utc)
        candidate.ai_evaluation_started_at = None
        db.commit()
    finally:
        db.close()
