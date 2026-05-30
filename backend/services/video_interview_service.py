"""
Video Interview Service (Path 1)
─────────────────────────────────
STT  : OpenAI Whisper (`whisper-1`)
TTS  : OpenAI TTS    (`tts-1`, voice `nova`)
State: In-memory session dict (session_id → history + essay)

Requires OPENAI_API_KEY in .env
"""
import io
import os
import base64
from typing import Optional

from services.interview_service import generate_first_question, generate_next_question

MAX_VIDEO_QUESTIONS = 4  # same as text interview

# ── OpenAI client ─────────────────────────────────────────────────────────────

_openai_client = None


def _get_openai():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY not set. Add it to backend/.env."
            )
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


# ── In-memory session store ───────────────────────────────────────────────────
# session_id (UUID from frontend) → { candidate_id, essay, history, step }

_sessions: dict[str, dict] = {}


def create_session(session_id: str, candidate_id: int, essay: str) -> None:
    _sessions[session_id] = {
        "candidate_id": candidate_id,
        "essay": essay,
        "history": [],  # list of {"role": "ai"|"candidate", "content": "..."}
        "step": 0,
    }


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def close_session(session_id: str) -> Optional[dict]:
    """Remove session and return its data (for persisting to DB)."""
    return _sessions.pop(session_id, None)


# ── STT ───────────────────────────────────────────────────────────────────────

def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe candidate audio via OpenAI Whisper-1. Returns plain text."""
    if not audio_bytes:
        return ""
    client = _get_openai()
    buf = io.BytesIO(audio_bytes)
    buf.name = filename
    try:
        resp = client.audio.transcriptions.create(
            model="whisper-1",
            file=buf,
            response_format="text",
        )
        text = (resp if isinstance(resp, str) else getattr(resp, "text", "")).strip()
        if text.lower() in {"", "[blank_audio]", "[no speech detected]"}:
            return ""
        return text
    except Exception as exc:
        raise RuntimeError(f"Whisper transcription failed: {exc}") from exc


# ── TTS ───────────────────────────────────────────────────────────────────────

def synthesize_speech(text: str) -> str:
    """
    Convert AI question text to speech via OpenAI TTS-1 (voice: nova).
    Returns base64-encoded MP3 for direct playback in the browser.
    """
    client = _get_openai()
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text,
            response_format="mp3",
        )
        return base64.b64encode(response.read()).decode()
    except Exception as exc:
        raise RuntimeError(f"TTS synthesis failed: {exc}") from exc


# ── Session-driven question flow ──────────────────────────────────────────────

def start_session_question(session_id: str, lang: Optional[str] = None) -> dict:
    """
    Generate the FIRST question + TTS audio for a fresh session.
    Returns the payload to be sent to the frontend.
    """
    session = _sessions[session_id]
    result = generate_first_question(session["essay"], lang=lang)
    question = result["question"]

    session["history"].append({"role": "ai", "content": question})
    session["step"] = 1

    return {
        "question": question,
        "audio_base64": synthesize_speech(question),
        "question_number": 1,
        "total_questions": MAX_VIDEO_QUESTIONS,
        "is_final": False,
    }


def advance_session(
    session_id: str,
    audio_bytes: bytes,
    lang: Optional[str] = None,
) -> dict:
    """
    Process one live interview step:
    1. STT the candidate's audio answer
    2. Append to session history
    3. Generate next question (or mark as final)
    4. TTS the next question
    Returns the payload to be sent to the frontend.
    """
    session = _sessions[session_id]

    # ── 1. Transcribe ────────────────────────────────────────────────────────
    transcript = transcribe_audio(audio_bytes)
    if not transcript:
        transcript = "[Ответ не был распознан — кандидат молчал или говорил тихо]"

    session["history"].append({"role": "candidate", "content": transcript})

    # ── 2. Count AI turns already in history ────────────────────────────────
    ai_count = sum(1 for m in session["history"] if m["role"] == "ai")

    # ── 3. Check if all questions answered ──────────────────────────────────
    if ai_count >= MAX_VIDEO_QUESTIONS:
        return {
            "transcript": transcript,
            "next_question": None,
            "audio_base64": None,
            "question_number": ai_count,
            "total_questions": MAX_VIDEO_QUESTIONS,
            "is_final": True,
        }

    # ── 4. Generate next question ────────────────────────────────────────────
    next_number = ai_count + 1
    result = generate_next_question(
        session["essay"],
        session["history"],
        next_number,
        lang=lang,
    )
    question = result["question"]
    session["history"].append({"role": "ai", "content": question})
    session["step"] = next_number

    # ── 5. TTS ───────────────────────────────────────────────────────────────
    return {
        "transcript": transcript,
        "next_question": question,
        "audio_base64": synthesize_speech(question),
        "question_number": next_number,
        "total_questions": MAX_VIDEO_QUESTIONS,
        "is_final": False,  # next question exists — candidate must answer it first
    }
