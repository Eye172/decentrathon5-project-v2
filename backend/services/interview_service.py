"""
AI Interview service using Claude.
Generates personalized, revealing questions based on the candidate's essay
and previous answers. Runs 4 rounds of Q&A.
"""
import os
import json
import re
import anthropic
import httpx
from dotenv import load_dotenv
from typing import Optional
from services.translation_service import translate_text, should_translate

load_dotenv()

MAX_QUESTIONS = 4

SYSTEM_PROMPT = """You are a skilled human interviewer for inVision U — an innovative university in Kazakhstan 
that selects future leaders and change-makers. Your goal is to reveal the authentic personality, 
leadership potential, and genuine motivation behind the candidate's essay.

Your questions should be:
- Specific (reference something the candidate actually wrote)
- Open-ended (no yes/no questions)
- Revealing (designed to uncover personality, resilience, values)
- Conversational (warm, not clinical)

Do NOT ask generic questions. Each question must relate to something specific from the essay or prior answers.

IMPORTANT: You must respond ONLY with valid JSON. No markdown, no extra text.

Examples of good questions:
- "You mentioned organizing [X]. What was the hardest moment during that, and what almost made you give up?"
- "When you wrote about [Y], it sounded very personal. Can you tell me more about what led to that experience?"
- "You said you want to [goal]. What's the biggest obstacle you've already faced toward that, even in a small way?"
"""


def _get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key == "your_claude_api_key_here":
        raise ValueError("ANTHROPIC_API_KEY not set in .env")
    # Avoid indefinite hangs if the model/API stalls (common symptom: UI spinner forever after Q3)
    timeout = httpx.Timeout(connect=15.0, read=120.0, write=15.0, pool=15.0)
    return anthropic.Anthropic(api_key=api_key, timeout=timeout)


def generate_first_question(essay: str, lang: Optional[str] = None) -> dict:
    """Generate the opening interview question based on the essay."""
    client = _get_client()

    prompt = f"""The candidate wrote this motivation essay:

---
{essay}
---

This is the FIRST question of the interview (question 1 of {MAX_QUESTIONS}).
Generate one specific, personalized opening question that references something concrete from their essay.

Return JSON:
{{"question": "<your question here>", "is_final": false}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    result = _parse_response(message.content[0].text)
    
    # Translate question if needed
    if should_translate(lang):
        result["question"] = translate_text(result["question"], lang)
    
    return result


def generate_next_question(essay: str, history: list[dict], question_number: int, lang: Optional[str] = None) -> dict:
    """
    Generate the next interview question based on essay + history.
    history: list of {"role": "ai"|"candidate", "content": "..."}
    question_number: 1-indexed number of the question we're about to ask
    lang: Target language for translation (ru, en, kz)
    """
    client = _get_client()

    history_text = "\n".join(
        f"{'Interviewer' if m['role'] == 'ai' else 'Candidate'}: {m['content']}"
        for m in history
    )

    is_last = question_number >= MAX_QUESTIONS

    if is_last:
        prompt = f"""Candidate's essay:
---
{essay}
---

Interview so far:
{history_text}

This is the FINAL question (question {question_number} of {MAX_QUESTIONS}).
Ask one last revealing question, or give a brief warm closing statement if you have enough info.

Return JSON:
{{"question": "<final question or closing statement>", "is_final": true}}"""
    else:
        prompt = f"""Candidate's essay:
---
{essay}
---

Interview so far:
{history_text}

This is question {question_number} of {MAX_QUESTIONS}.
Based on what you've learned, ask the next most revealing question. 
Reference something specific from their answer or essay.

Return JSON:
{{"question": "<your next question>", "is_final": false}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    result = _parse_response(message.content[0].text)
    
    # Translate question if needed
    if should_translate(lang):
        result["question"] = translate_text(result["question"], lang)
    
    return result


def _parse_response(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        chunk = raw.split("```", 2)[1] if "```" in raw else raw
        chunk = chunk.strip()
        if chunk.lower().startswith("json"):
            chunk = chunk[4:].lstrip()
        raw = chunk

    raw = raw.strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("Interview AI returned non-JSON; try again.") from None
        try:
            parsed = json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            m = re.search(r'"question"\s*:\s*"((?:[^"\\]|\\.)*)"', raw, re.DOTALL)
            if not m:
                raise ValueError("Interview AI returned invalid JSON; try again.") from None
            inner = json.loads(f'"{m.group(1)}"')
            parsed = {"question": inner, "is_final": False}

    q = (parsed.get("question") or "").strip()
    if not q:
        q = (
            "Thank you for sharing so openly. Before we wrap up — is there anything important "
            "about your motivation or experience that we have not touched on yet?"
        )
    return {"question": q, "is_final": bool(parsed.get("is_final", False))}
