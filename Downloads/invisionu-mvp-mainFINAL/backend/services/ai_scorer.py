"""
InVision U — multi-agent AI scoring (InVision U AI Core).
Produces legacy `ai_score_breakdown` (+ embedded `xai_pipeline`) for the commission API.
"""
from __future__ import annotations

from services.invision_ai_core.pipeline import evaluate_candidate_pipeline


async def score_candidate_ai(candidate) -> dict:
    """
    Runs the 6-agent cascade; returns the dashboard breakdown (same shape as before + xai_pipeline).
    """
    breakdown, _detection = await evaluate_candidate_pipeline(candidate)
    return breakdown


async def score_and_detect_candidate(candidate) -> tuple[dict, dict]:
    """Returns (ai_score_breakdown, ai_detection_details) for a single pipeline pass."""
    return await evaluate_candidate_pipeline(candidate)
