"""Transcribe audio via OpenAI Whisper API."""

import io
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI

# Ensure backend/.env is loaded even if import order differs (Windows / uvicorn reload).
load_dotenv(Path(__file__).resolve().parent.parent / ".env", encoding="utf-8-sig")


def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "recording.webm",
    language: Optional[str] = None,
) -> str:
    """
    Send raw audio to Whisper. Expects webm/opus from the browser in typical setups.
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ValueError(
            "Voice input is not configured: set OPENAI_API_KEY on the server."
        )

    client = OpenAI(api_key=api_key)
    buf = io.BytesIO(audio_bytes)
    buf.name = filename or "audio.webm"

    kwargs: dict = {
        "model": "whisper-1",
        "file": buf,
    }
    if language:
        lang = language.lower().split("-")[0]
        if lang == "kz":
            lang = "kk"
        if len(lang) == 2:
            kwargs["language"] = lang

    result = client.audio.transcriptions.create(**kwargs)
    return (result.text or "").strip()
