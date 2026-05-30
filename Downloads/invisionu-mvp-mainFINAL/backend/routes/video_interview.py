"""
Live Video Interview API – Path 1
──────────────────────────────────
POST /api/interview/live-start     initialise session + first question + TTS
POST /api/interview/live-step      audio chunk → STT → next question → TTS
POST /api/interview/finalize-video upload full video, persist to DB, trigger scoring
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session

from database import get_db
from models.db_models import Candidate, InterviewMessage
from services.auth_service import get_user_by_token
from services.video_interview_service import (
    advance_session,
    close_session,
    create_session,
    get_session,
    start_session_question,
)

router = APIRouter(prefix="/api/interview", tags=["video-interview"])


# ── Shared auth dependency ────────────────────────────────────────────────────

def _auth(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Candidate:
    """Extract and validate Bearer token; return the Candidate ORM object."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = get_user_by_token(db, authorization.split(" ", 1)[1])
    if not user or user.role != "candidate":
        raise HTTPException(status_code=403, detail="Candidate access required")
    if not user.candidate:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
    return user.candidate


# ── Endpoint 1: Start session ─────────────────────────────────────────────────

@router.post("/live-start")
async def live_start(
    session_id: str = Form(...),
    lang: Optional[str] = Form(None),
    candidate: Candidate = Depends(_auth),
):
    """
    Initialise an in-memory video-interview session and return the first
    question + base64 TTS audio.
    """
    if not candidate.essay:
        raise HTTPException(status_code=400, detail="Essay not submitted yet")

    create_session(session_id, candidate.id, candidate.essay)

    try:
        return start_session_question(session_id, lang=lang)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Could not start video interview: {exc}",
        ) from exc


# ── Endpoint 2: Advance one step ──────────────────────────────────────────────

@router.post("/live-step")
async def live_step(
    session_id: str = Form(...),
    current_step: int = Form(...),
    lang: Optional[str] = Form(None),
    audio_chunk: UploadFile = File(...),
    candidate: Candidate = Depends(_auth),
):
    """
    Receive the candidate's audio answer, transcribe it (Whisper), generate
    the next question (Claude), synthesise TTS, and return everything.
    """
    if not get_session(session_id):
        raise HTTPException(
            status_code=404,
            detail="Session not found. Please reload and restart the interview.",
        )

    audio_bytes = await audio_chunk.read()

    try:
        return advance_session(session_id, audio_bytes, lang=lang)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Step processing failed: {exc}",
        ) from exc


# ── Endpoint 3: Finalise interview (upload full video) ────────────────────────

@router.post("/finalize-video")
async def finalize_video(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    full_video: UploadFile = File(...),
    behavior_metrics: Optional[str] = Form(None),  # JSON string from frontend tracker
    candidate: Candidate = Depends(_auth),
    db: Session = Depends(get_db),
):
    """
    1. Save the full video recording to disk.
    2. Flush the session's Q&A history to InterviewMessage rows in the DB.
    3. Mark the candidate as complete (step 4) and queue background scoring.
    """

    # ── 1. Persist video ────────────────────────────────────────────────────
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "uploads", "videos"
    )
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{candidate.anonymous_id}_{uuid.uuid4().hex[:8]}.webm"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as fh:
        fh.write(await full_video.read())

    video_url = f"/uploads/videos/{filename}"

    # ── 2. Flush session history to DB ──────────────────────────────────────
    session_data = close_session(session_id)
    if session_data:
        for msg in session_data["history"]:
            db.add(
                InterviewMessage(
                    candidate_id=candidate.id,
                    role=msg["role"],
                    content=msg["content"],
                )
            )

    # ── 3. Parse & enrich behavior metrics ──────────────────────────────────
    parsed_metrics = None
    if behavior_metrics:
        try:
            import json as _json
            parsed_metrics = _enrich_behavior_metrics(_json.loads(behavior_metrics))
        except Exception:
            pass

    # ── 4. Update candidate record ──────────────────────────────────────────
    candidate.video_url = video_url
    candidate.behavior_metrics = parsed_metrics
    candidate.application_step = 4
    candidate.ai_evaluation_started_at = datetime.now(timezone.utc)
    db.commit()

    # ── 4. Background scoring (same pipeline as text interview) ─────────────
    background_tasks.add_task(_score_background, candidate.id)

    return {"success": True, "video_url": video_url}


# ── Behavior metrics enrichment ──────────────────────────────────────────────

def _enrich_behavior_metrics(raw: dict) -> dict:
    """
    Convert the MediaPipe blendshape log into explainable behavioral scores.

    Metrics produced
    ─────────────────
    eye_contact_consistency  % samples where gaze is centred (all look* < 0.20)
    emotional_volatility     normalised std-dev of browInnerUp  [0-100]
    reading_probability      overall saccade density             [0-100]
    saccade_count            number of distinct saccade windows
    integrity_score          1 − (W_s·N + W_v·V)  per formula displayed to jury
    timeline                 2-second-interval series {t, stress, reading}
    explainable_ai           human-readable paragraph with timestamps
    """
    import math

    log: list[dict] = raw.get("behavioral_log", [])
    n = len(log)

    # ── Legacy format guard (old skin-tone tracker had no behavioral_log) ────────
    # If there is no log at all, derive a minimal placeholder from old fields so
    # the commission UI at least shows something meaningful.
    if n == 0 and raw.get("face_visible_pct") is not None:
        face_pct = int(raw.get("face_visible_pct", 100))
        look_away = int(raw.get("look_away_events", 0))
        old_eye = int(raw.get("eye_contact_score", face_pct))
        risk = "high" if look_away >= 6 or face_pct < 55 else "medium" if look_away >= 3 or face_pct < 75 else "low"
        return {
            **raw,
            "eye_contact_consistency": old_eye,
            "emotional_volatility": 0,
            "reading_probability": 0,
            "saccade_count": 0,
            "integrity_score": round(old_eye / 100, 3),
            "risk_level": risk,
            "signals_positive": raw.get("signals_positive", []),
            "signals_negative": raw.get("signals_negative", []),
            "timeline": [],
            "explainable_ai": f"Анализ выполнен по устаревшему формату (skin-tone heuristic). Лицо в кадре: {face_pct}%, событий отведения взгляда: {look_away}.",
        }

    # ── 1. Eye-contact consistency ───────────────────────────────────────────
    # "Looking forward" = all four lateral gaze weights below threshold
    GAZE_THRESH = 0.20
    centred = sum(
        1 for e in log
        if e.get("eyeLookInL", 0) < GAZE_THRESH
        and e.get("eyeLookInR", 0) < GAZE_THRESH
        and e.get("eyeLookOutL", 0) < GAZE_THRESH
        and e.get("eyeLookOutR", 0) < GAZE_THRESH
    )
    eye_consistency = round(centred / n * 100) if n else 100

    # ── 2. Emotional volatility (browInnerUp std-dev) ────────────────────────
    brows = [e.get("browInnerUp", 0.0) for e in log]
    if len(brows) > 1:
        mean_b = sum(brows) / len(brows)
        var_b  = sum((x - mean_b) ** 2 for x in brows) / len(brows)
        std_b  = math.sqrt(var_b)
    else:
        std_b = 0.0
    # Normalise: std of 0.15+ → 100 (very volatile), 0 → 0
    volatility = min(100, round(std_b / 0.15 * 100))

    # ── 3. Lateral gaze direction series & saccade detection ─────────────────
    # Positive value = looking right, negative = looking left.
    # A saccade pattern is ≥4 sign-crossings within a 6-sample (3 s) window.
    def _lateral(e: dict) -> float:
        right = (e.get("eyeLookOutL", 0) + e.get("eyeLookInR", 0)) / 2
        left  = (e.get("eyeLookInL",  0) + e.get("eyeLookOutR", 0)) / 2
        return right - left

    gaze_series = [_lateral(e) for e in log]
    timestamps  = [e.get("t", 0) / 1000.0 for e in log]  # → seconds

    saccade_timestamps: list[float] = []
    i = 0
    while i <= len(gaze_series) - 6:
        window = gaze_series[i : i + 6]
        crossings = sum(
            1 for j in range(1, len(window))
            if window[j - 1] * window[j] < -0.01
        )
        if crossings >= 4:
            saccade_timestamps.append(timestamps[i])
            i += 6  # skip window to avoid double-counting
        else:
            i += 1

    N_patterns = len(saccade_timestamps)
    reading_probability = min(100, round(N_patterns * 12))

    # ── 4. Integrity score formula ────────────────────────────────────────────
    # Score_integrity = 1.0 − (W_saccades · N_patterns + W_volatility · V)
    # W_saccades  = 0.08   (each reading pattern removes 8 %)
    # W_volatility = 0.003 (std-dev component)
    W_s = 0.08
    W_v = 0.003
    V   = std_b * 100  # volatility on 0-100 scale
    integrity_score = round(max(0.0, min(1.0, 1.0 - (W_s * N_patterns + W_v * V))), 3)

    # ── 5. Risk level ─────────────────────────────────────────────────────────
    if integrity_score < 0.55 or reading_probability >= 60:
        risk = "high"
    elif integrity_score < 0.75 or reading_probability >= 30:
        risk = "medium"
    else:
        risk = "low"

    # ── 6. Timeline (2-second intervals for the chart) ───────────────────────
    timeline: list[dict] = []
    if log:
        total_ms = log[-1].get("t", 0)
        interval = 2000  # ms
        for bucket in range(int(total_ms / interval) + 1):
            t0, t1 = bucket * interval, (bucket + 1) * interval
            win = [e for e in log if t0 <= e.get("t", 0) < t1]
            if not win:
                continue
            stress_val  = sum(e.get("browInnerUp", 0) for e in win) / len(win) * 100
            gaze_win    = [_lateral(e) for e in win]
            read_cross  = sum(
                1 for j in range(1, len(gaze_win))
                if gaze_win[j - 1] * gaze_win[j] < -0.01
            )
            read_val = min(100, read_cross * 34)
            timeline.append({
                "t":       round(bucket * 2.0, 1),
                "stress":  round(stress_val, 1),
                "reading": round(read_val, 1),
            })

    # ── 7. Signal strings ─────────────────────────────────────────────────────
    positive: list[str] = []
    negative: list[str] = []

    if eye_consistency >= 80:
        positive.append(f"Устойчивый зрительный контакт: {eye_consistency}% времени взгляд направлен в камеру")
    if N_patterns == 0:
        positive.append("Саккадических движений глаз не обнаружено — признаков чтения нет")
    if volatility <= 25:
        positive.append("Эмоциональный фон стабилен на протяжении интервью")
    if n >= 20:
        positive.append(f"Достаточный объём данных для анализа ({n} сэмплов)")

    if eye_consistency < 60:
        negative.append(f"Низкий контакт с камерой: только {eye_consistency}% сэмплов — взгляд в центре")
    if N_patterns >= 3:
        ts_str = ", ".join(
            f"{int(t // 60):02d}:{int(t % 60):02d}" for t in saccade_timestamps[:5]
        )
        negative.append(
            f"Зафиксировано {N_patterns} паттернов саккадических движений (возможно чтение) в моменты: {ts_str}"
        )
    if volatility >= 60:
        negative.append(f"Высокая эмоциональная волатильность (индекс {volatility}/100) — частые пики стресса")

    # ── 8. Explainable AI paragraph ──────────────────────────────────────────
    ts_mentions = ""
    if saccade_timestamps:
        ts_list = ", ".join(
            f"{int(t // 60):02d}:{int(t % 60):02d}" for t in saccade_timestamps[:5]
        )
        ts_mentions = (
            f" На {ts_list} зафиксировано {N_patterns} окна(-ов) с ≥4 саккадическими"
            f" переключениями взгляда за 3 с (типичная картина чтения с листа)."
        )

    formula_line = (
        f"Формула целостности: Score = 1.0 − (0.08 × {N_patterns} + 0.003 × {round(V, 1)}) = {integrity_score}"
    )

    xai = (
        f"Анализ {n} сэмплов (интервал 500 мс) через MediaPipe FaceLandmarker blendshapes. "
        f"Зрительный контакт с камерой: {eye_consistency}%. "
        f"Уровень стресса (browInnerUp): волатильность {volatility}/100.{ts_mentions} "
        f"Вероятность чтения с подсказок: {reading_probability}%. "
        f"{formula_line}."
    )

    return {
        **raw,
        "eye_contact_consistency": eye_consistency,
        "emotional_volatility":    volatility,
        "reading_probability":     reading_probability,
        "saccade_count":           N_patterns,
        "integrity_score":         integrity_score,
        "risk_level":              risk,
        "signals_positive":        positive,
        "signals_negative":        negative,
        "timeline":                timeline,
        "explainable_ai":          xai,
    }


# ── Background scoring task (standalone to avoid circular imports) ────────────

async def _score_background(candidate_id: int) -> None:
    """Run the full AI scoring pipeline after the video interview completes."""
    from database import SessionLocal
    from services.ai_scorer import score_and_detect_candidate
    from services.baseline_scorer import score_candidate_baseline
    from services.ai_detector import detect_ai_text

    db = SessionLocal()
    try:
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            return

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
        except Exception:
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

        # ── Delete video file after scoring to save disk space ───────────────
        # The full transcript is already stored in InterviewMessage rows, so
        # the video file is no longer needed once analysis is complete.
        if candidate.video_url:
            try:
                video_path = os.path.join(
                    os.path.dirname(os.path.dirname(__file__)),
                    candidate.video_url.lstrip("/"),
                )
                if os.path.isfile(video_path):
                    os.remove(video_path)
            except Exception:
                pass  # non-critical — scoring result is already saved
            candidate.video_url = None

        db.commit()
    finally:
        db.close()
