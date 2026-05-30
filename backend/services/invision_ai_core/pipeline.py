"""
InVision U AI Core — 6-agent cascade pipeline.
Architecture:
  Agent01: Extraction & Anonymization
  Agent02: Path & Learning Agility Analyst
  Agent03: Resilience & Motivation Profiler
  Agent04: Authenticity & AI-Detector
  Agent05: Leadership Profiler (Full Range Leadership + EQ)
  Agent06: Master Orchestrator

Agents 02-05 run in PARALLEL via asyncio.gather().
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

import anthropic
from dotenv import load_dotenv

from . import prompts
from .json_utils import parse_json_object
from .linguistics import build_linguistic_matrix, burstiness_score, vocabulary_richness, avg_sentence_length_words

load_dotenv()

MODEL_ID = os.getenv("ANTHROPIC_SCORING_MODEL", "claude-sonnet-4-6")
DEFAULT_AI_THRESHOLD = 60


def _client() -> anthropic.Anthropic:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key or key == "your_claude_api_key_here":
        raise ValueError("ANTHROPIC_API_KEY not set. Please add it to your .env file.")
    return anthropic.Anthropic(api_key=key)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_json_array_field(raw: str | None) -> Any:
    if not raw or not raw.strip():
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _chat_transcript(messages: list[Any]) -> str:
    lines: list[str] = []
    for m in messages or []:
        role = getattr(m, "role", "") or m.get("role", "")
        content = (getattr(m, "content", None) or m.get("content") or "").strip()
        label = "Интервьюер" if role == "ai" else "Кандидат"
        if content:
            lines.append(f"{label}: {content}")
    return "\n".join(lines)


def _safe_dump(obj: Any, limit: int = 28000) -> str:
    s = json.dumps(obj, ensure_ascii=False, default=str)
    return s if len(s) <= limit else s[: limit - 3] + "..."


def _call_llm(
    client: anthropic.Anthropic,
    *,
    system: str,
    user: str,
    max_tokens: int,
) -> str:
    msg = client.messages.create(
        model=MODEL_ID,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text


async def _call_llm_async(
    client: anthropic.Anthropic,
    *,
    system: str,
    user: str,
    max_tokens: int,
) -> str:
    return await asyncio.to_thread(
        _call_llm, client, system=system, user=user, max_tokens=max_tokens
    )


def _merge_extraction_preflight(parsed: dict, preflight: dict) -> dict:
    out = dict(parsed) if parsed else {}
    lm = dict(out.get("linguistic_matrix") or {})
    pr = preflight.get("pronouns") or {}
    lf = dict(lm.get("lexical_features") or {})
    pf = preflight.get("lexical_features") or {}
    lm["pronouns"] = {
        "singular_count": int(pr.get("singular_count", lm.get("pronouns", {}).get("singular_count", 0))),
        "plural_count": int(pr.get("plural_count", lm.get("pronouns", {}).get("plural_count", 0))),
        "ratio_i_we": float(pr.get("ratio_i_we", lm.get("pronouns", {}).get("ratio_i_we", 0.0))),
    }
    lf["power_verbs"] = lf.get("power_verbs") or pf.get("power_verbs") or []
    lf["complexity_essay"] = float(lf.get("complexity_essay") or pf.get("complexity_essay") or 0.0)
    lf["complexity_chat"] = float(lf.get("complexity_chat") or pf.get("complexity_chat") or 0.0)
    lm["lexical_features"] = lf
    out["linguistic_matrix"] = lm
    return out


def _agent4_to_detection(agent04: dict, essay: str, chat_text: str) -> dict[str, Any]:
    root = agent04 if isinstance(agent04, dict) else {}
    report = root.get("authenticity_report")
    if not isinstance(report, dict):
        report = root
    if "overall_ai_probability" not in report:
        report = {}
    layers = report.get("detection_layers") or {}
    struct = layers.get("structural_predictability") or {}
    forensic = report.get("forensic_findings") or {}
    verdict = report.get("verdict") or {}

    prob = float(report.get("overall_ai_probability", 0))
    prob = max(0.0, min(100.0, prob))
    score_01 = prob / 100.0

    struct_score = float(struct.get("score", prob * 0.4))
    struct_score = max(0.0, min(100.0, struct_score))

    burst = burstiness_score(essay)
    burst_chat = burstiness_score(chat_text)
    blended_burst = (burst * 0.65 + burst_chat * 0.35) if chat_text.strip() else burst

    vocab = (vocabulary_richness(essay) + vocabulary_richness(chat_text)) / 2 if chat_text.strip() else vocabulary_richness(essay)
    asl = (avg_sentence_length_words(essay) + avg_sentence_length_words(chat_text)) / 2 if chat_text.strip() else avg_sentence_length_words(essay)

    if score_01 < 0.35:
        risk = "low"
    elif score_01 < 0.60:
        risk = "medium"
    else:
        risk = "high"

    return {
        "score": round(score_01, 4),
        "burstiness": round(blended_burst, 4),
        "vocabulary_richness": round(vocab, 4),
        "avg_sentence_length": round(asl, 2),
        "risk_level": risk,
        "reasoning": verdict.get("summary_for_commission") or struct.get("reasoning") or "",
        "human_signals": list(forensic.get("authentic_human_markers") or [])[:12],
        "ai_signals": list(forensic.get("synthetic_markers_found") or [])[:12],
        "method": "claude",
        "structural_predictability_0_100": round(struct_score, 1),
        "stylistic_layer": layers.get("stylistic_consistency"),
        "forensic_anomalies": list(forensic.get("anomalies") or [])[:8],
        "verdict_status": verdict.get("status"),
        "display_red_flag": bool(verdict.get("display_red_flag")),
    }


def _clamp_scores(d: dict[str, Any]) -> dict[str, Any]:
    scores = d.get("scores") or {}
    caps = {
        "leadership": 25,
        "motivation": 25,
        "growth_trajectory": 20,
        "skills_experience": 20,
        "authenticity": 10,
    }
    fixed: dict[str, int] = {}
    for k, cap in caps.items():
        v = int(round(float(scores.get(k, 0))))
        fixed[k] = max(0, min(cap, v))
    d["scores"] = fixed
    d["total"] = sum(fixed.values())
    return d


def _extract_criteria_explanation(
    positive: list[str],
    negative: list[str],
    synthesis: str,
) -> dict:
    """Build a structured criteria explanation object."""
    return {
        "positive_points": [str(p).strip() for p in (positive or []) if p and str(p).strip()][:4],
        "negative_points": [str(n).strip() for n in (negative or []) if n and str(n).strip()][:3],
        "synthesis": (synthesis or "").strip()[:1200],
    }


def _heuristic_dashboard(
    candidate: Any,
    agent01: dict,
    agent02: dict,
    agent03: dict,
    agent04: dict,
    agent05: dict,
) -> dict[str, Any]:
    """Fallback dashboard builder using agent outputs directly."""
    # ── Agent02: Path ─────────────────────────────────────────────────────────
    path_mod = (agent02 or {}).get("path_traveled_module") or {}
    math_base = path_mod.get("mathematical_baseline") or {}
    path_raw = float(math_base.get("final_calculated_score", 50))
    path_raw = max(0.0, min(100.0, path_raw))
    dial_arg = path_mod.get("dialectical_argumentation") or {}
    pro_arg = dial_arg.get("pro_growth_argument") or {}
    risk_arg = dial_arg.get("risk_and_stagnation_audit") or {}

    # ── Agent03: Psychology ───────────────────────────────────────────────────
    psych_mod = (agent03 or {}).get("resilience_and_motivation_module") or {}
    res_mountain = psych_mod.get("resilience_mountain") or {}
    mot_flame = psych_mod.get("motivation_flame") or {}

    grit_pct = float(res_mountain.get("grit_percentage") or res_mountain.get("alpinist_position_percent") or 55)
    intrinsic = float(mot_flame.get("intrinsic_logs_score", 50))
    extrinsic = float(mot_flame.get("extrinsic_wind_score", 30))
    denom = intrinsic + extrinsic + 1e-6
    mot_ratio = intrinsic / denom

    # ── Agent04: Authenticity ─────────────────────────────────────────────────
    auth_rep = (agent04 or {}).get("authenticity_report") or {}
    ai_prob = float(auth_rep.get("overall_ai_probability", 25))
    ai_prob = max(0.0, min(100.0, ai_prob))

    # ── Agent05: Leadership ───────────────────────────────────────────────────
    lead_assess = (agent05 or {}).get("leadership_assessment") or {}
    lead_metrics = lead_assess.get("score_metrics") or {}
    lead_potential = float(lead_metrics.get("total_leadership_potential", 50))
    lead_potential = max(0.0, min(200.0, lead_potential))  # scale is 0-200 from prompt
    lead_pct = lead_potential / 200.0

    # ── Score calculation ─────────────────────────────────────────────────────
    growth = int(round(path_raw / 100.0 * 20))
    leadership = int(round(lead_pct * 25))
    leadership = max(0, min(25, leadership))
    motivation = int(round(mot_ratio * 25))
    skills = int(round(grit_pct / 100.0 * 20))
    authenticity = int(round((100.0 - ai_prob) / 100.0 * 10))

    total = growth + leadership + motivation + skills + authenticity
    rec = "recommend" if total >= 72 else "review" if total >= 52 else "reject"

    # ── Criteria explanations ──────────────────────────────────────────────────
    lead_dial = lead_assess.get("dialectical_analysis") or {}
    lead_pro = lead_dial.get("pro_position") or {}
    lead_con = lead_dial.get("con_position") or {}
    res_arg = res_mountain.get("grit_argumentation") or {}
    mot_arg = mot_flame.get("sdt_argumentation") or {}
    agility_audit = path_mod.get("learning_agility_audit") or {}

    criteria = {
        "growth_trajectory": _extract_criteria_explanation(
            positive=list(pro_arg.get("supporting_evidence") or []) or [
                f"Балл Learning Agility: {path_raw:.0f}/100",
                "Кандидат демонстрирует способность извлекать уроки из опыта",
            ],
            negative=list(risk_arg.get("weakness_points") or []) or [
                "Требуется проверка глубины рефлексии",
            ],
            synthesis=dial_arg.get("final_verdict") or f"Траектория роста оценена в {growth}/20.",
        ),
        "leadership": _extract_criteria_explanation(
            positive=list(lead_pro.get("arguments") or []) or [
                lead_assess.get("profile_summary", "")[:150] or "Лидерский потенциал выявлен.",
            ],
            negative=list(lead_con.get("arguments") or []) or [
                "Недостаточно данных о трансформационном лидерстве.",
            ],
            synthesis=lead_dial.get("synthesis_verdict") or f"Лидерский потенциал оценён в {leadership}/25.",
        ),
        "motivation": _extract_criteria_explanation(
            positive=[
                mot_arg.get("authentic_drivers", "")[:200] or f"Внутренняя мотивация: {intrinsic:.0f}/100",
                f"Ценности: {', '.join((mot_flame.get('core_values_identified') or [])[:3])}".strip(" :") or "Автономная мотивация присутствует",
            ],
            negative=[
                mot_arg.get("burnout_red_flags", "")[:200] or "Риски выгорания требуют мониторинга.",
                f"Внешние факторы: {', '.join((mot_flame.get('external_pressures_identified') or [])[:2])}".strip(" :") or "",
            ],
            synthesis=psych_mod.get("synthesis_verdict") or f"Мотивационный профиль: {motivation}/25.",
        ),
        "skills_experience": _extract_criteria_explanation(
            positive=[
                res_arg.get("perseverance_evidence", "")[:250] or f"Показатель Grit: {grit_pct:.0f}%",
                res_mountain.get("temporal_depth_analysis", "")[:200] or "Признаки долгосрочной приверженности целям.",
            ],
            negative=[
                res_arg.get("quitting_risks", "")[:200] or "Ограниченная доказательная база долгосрочных проектов.",
            ],
            synthesis=psych_mod.get("synthesis_verdict") or f"Устойчивость и навыки оценены в {skills}/20.",
        ),
        "authenticity": _extract_criteria_explanation(
            positive=[
                f"Вероятность AI-генерации: {ai_prob:.1f}% (порог {DEFAULT_AI_THRESHOLD}%)",
                (auth_rep.get("verdict") or {}).get("summary_for_commission", "")[:200] or "Стилистика соответствует человеческому письму.",
            ],
            negative=[
                "Требуется перекрёстная проверка при высоком AI-риске." if ai_prob >= DEFAULT_AI_THRESHOLD else "Риски минимальны.",
            ],
            synthesis=f"Аутентичность: {authenticity}/10. " + ("Красный флаг превышения порога." if ai_prob >= DEFAULT_AI_THRESHOLD else "Профиль соответствует человеческому письму."),
        ),
    }

    # ── Strengths & concerns ──────────────────────────────────────────────────
    strengths = [
        s for s in [
            (lead_pro.get("summary") or "")[:120],
            (pro_arg.get("thesis") or "")[:120],
            (mot_arg.get("authentic_drivers") or "")[:120],
        ] if s
    ] or ["Потенциал к росту выявлен", "Внутренняя мотивация присутствует"]

    concerns = [
        c for c in [
            (lead_con.get("summary") or "")[:120],
            (risk_arg.get("thesis") or "")[:120],
            f"Вероятность AI-текста {ai_prob:.0f}%." if ai_prob >= 45 else "",
        ] if c
    ] or ["Проверить глубину рефлексии"]

    # ── Executive summary ─────────────────────────────────────────────────────
    executive_summary = {
        "one_liner_verdict": (auth_rep.get("verdict") or {}).get("summary_for_commission") or
                             dial_arg.get("final_verdict", "")[:120] or "Комплексная оценка завершена.",
        "deep_analysis": (
            (lead_assess.get("profile_summary") or "") + "\n\n" +
            (psych_mod.get("synthesis_verdict") or "") + "\n\n" +
            (dial_arg.get("final_verdict") or "")
        ).strip()[:1500] or "Детальный анализ завершён.",
        "key_strengths": strengths[:4],
        "critical_risks": concerns[:3],
    }

    # ── Commission AI Assistant ───────────────────────────────────────────────
    commission_hints = {
        "suggested_interview_questions": [
            f"Расскажите подробнее о ситуации, когда вы столкнулись с {(risk_arg.get('thesis') or 'серьёзным препятствием')[:60]}?",
            f"Как вы принимаете решения в условиях конфликта интересов в команде?",
            f"Опишите момент, когда ваша внутренняя мотивация столкнулась с внешним давлением.",
        ],
        "conflict_log": [],
    }

    return {
        "scores": {
            "leadership": leadership,
            "motivation": motivation,
            "growth_trajectory": growth,
            "skills_experience": skills,
            "authenticity": authenticity,
        },
        "total": total,
        "recommendation": rec,
        "summary": executive_summary["one_liner_verdict"],
        "strengths": strengths[:5],
        "concerns": concerns[:5],
        "criteria_explanations": criteria,
        "executive_summary": executive_summary,
        "commission_ai_assistant": commission_hints,
    }


async def evaluate_candidate_pipeline(candidate: Any, *, ai_threshold: int = DEFAULT_AI_THRESHOLD) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Returns (ai_score_breakdown, ai_detection_details) compatible with existing commission API.
    Agents 02-05 run in parallel via asyncio.gather().
    """
    client = _client()

    essay = candidate.essay or ""
    timeline_list = _parse_json_array_field(candidate.extra_activities)
    sjt_list = _parse_json_array_field(candidate.leadership_examples)
    messages = list(candidate.interview_messages or [])
    chat_text = _chat_transcript(messages)

    timeline_json = _safe_dump(timeline_list)
    sjt_json = _safe_dump(sjt_list)

    # ── AGENT 01: Extraction ─────────────────────────────────────────────────
    preflight = build_linguistic_matrix(essay, chat_text)
    preflight_json = json.dumps(preflight, ensure_ascii=False)

    user1 = prompts.AGENT01_USER.format(
        preflight_json=preflight_json,
        timeline_data=timeline_json,
        essay_data=essay[:12000],
        sjt_data=sjt_json[:8000],
        chat_data=chat_text[:12000],
    )
    raw1 = await _call_llm_async(client, system=prompts.AGENT01_SYSTEM, user=user1, max_tokens=4096)
    try:
        agent01 = parse_json_object(raw1)
    except (json.JSONDecodeError, ValueError):
        agent01 = {
            "extraction_meta": {"processing_timestamp": _now_iso(), "anonymization_log": []},
            "linguistic_matrix": preflight,
            "chronology": {"detected_intervals": [], "essay_linkage": {"target_node_id": "", "consistency_check": False}},
            "data_payloads": {
                "anonymized_essay": essay[:4000],
                "anonymized_chat_transcript": chat_text[:4000],
                "anonymized_sjt_logic": sjt_json[:2000],
            },
            "tone_map": {"timeline": "Analytical", "essay": "Analytical", "sjt": "Analytical", "chat": "Analytical"},
        }
    agent01 = _merge_extraction_preflight(agent01, preflight)

    payloads = agent01.get("data_payloads") or {}
    anon_essay = payloads.get("anonymized_essay") or essay
    anon_chat = payloads.get("anonymized_chat_transcript") or chat_text
    anon_sjt = payloads.get("anonymized_sjt_logic") or sjt_json
    linguistic_json = _safe_dump(agent01.get("linguistic_matrix") or {})
    chronology_json = _safe_dump(agent01.get("chronology") or {})

    # ── AGENTS 02-05 in PARALLEL ──────────────────────────────────────────────
    user2 = prompts.AGENT02_USER.format(
        agent01_json=_safe_dump(agent01),
        anonymized_essay=anon_essay[:10000],
        timeline_json=timeline_json,
    )
    user3 = prompts.AGENT03_USER.format(
        linguistic_json=linguistic_json,
        chronology_json=chronology_json,
        payloads_json=_safe_dump(payloads),
    )
    user4 = prompts.AGENT04_USER.format(
        linguistic_json=linguistic_json,
        anonymized_essay=anon_essay[:8000],
        anonymized_chat=anon_chat[:8000],
        anonymized_sjt=anon_sjt[:4000],
        ai_threshold=ai_threshold,
    )
    sys4 = prompts.AGENT04_SYSTEM.format(ai_threshold=ai_threshold)

    user5 = prompts.AGENT05_USER.format(
        anonymized_essay=anon_essay[:8000],
        anonymized_sjt=anon_sjt[:4000],
        timeline_json=timeline_json[:6000],
        linguistic_json=linguistic_json,
    )

    raw2, raw3, raw4, raw5 = await asyncio.gather(
        _call_llm_async(client, system=prompts.AGENT02_SYSTEM, user=user2, max_tokens=6144),
        _call_llm_async(client, system=prompts.AGENT03_SYSTEM, user=user3, max_tokens=8192),
        _call_llm_async(client, system=sys4, user=user4, max_tokens=2048),
        _call_llm_async(client, system=prompts.AGENT05_SYSTEM, user=user5, max_tokens=6144),
    )

    # ── Parse Agent02 ─────────────────────────────────────────────────────────
    try:
        agent02 = parse_json_object(raw2)
        if "path_traveled_module" not in agent02:
            # Try legacy structure
            if "path_analysis" in agent02:
                agent02 = {"path_traveled_module": {
                    "mathematical_baseline": agent02["path_analysis"].get("metrics", {}),
                    "dialectical_argumentation": {
                        "pro_growth_argument": agent02["path_analysis"].get("explainable_ai", {}).get("pro_position", {}),
                        "risk_and_stagnation_audit": agent02["path_analysis"].get("explainable_ai", {}).get("con_position", {}),
                        "final_verdict": agent02["path_analysis"].get("explainable_ai", {}).get("final_rationalization", ""),
                    },
                    "smart_timeline": agent02["path_analysis"].get("smart_timeline", []),
                    "learning_agility_audit": {},
                }}
            else:
                agent02 = {"path_traveled_module": {"mathematical_baseline": {"final_calculated_score": 50.0}, "dialectical_argumentation": {}, "smart_timeline": []}}
    except (json.JSONDecodeError, ValueError):
        agent02 = {"path_traveled_module": {"mathematical_baseline": {"final_calculated_score": 50.0}, "dialectical_argumentation": {}, "smart_timeline": []}}

    # ── Parse Agent03 ─────────────────────────────────────────────────────────
    try:
        agent03 = parse_json_object(raw3)
        if "resilience_and_motivation_module" not in agent03:
            # Try legacy structure
            if "resilience_module" in agent03:
                agent03 = {"resilience_and_motivation_module": {
                    "resilience_mountain": {
                        "grit_score_meters": agent03["resilience_module"].get("grit_score_meters", 4000),
                        "grit_percentage": agent03["resilience_module"].get("grit_percentage", 50.0),
                        "alpinist_position_percent": agent03["resilience_module"].get("alpinist_position_percent", 50.0),
                        "hardship_quotes": [{"quote": q.get("text", ""), "context": "", "font_style": q.get("font_style", "italic")} for q in (agent03["resilience_module"].get("hardship_quotes") or [])],
                        "grit_argumentation": {
                            "perseverance_evidence": " ".join(agent03["resilience_module"].get("argumentation", {}).get("resilience_evidence", [])),
                            "quitting_risks": " ".join(agent03["resilience_module"].get("argumentation", {}).get("risk_factors", [])),
                        },
                        "temporal_depth_analysis": "",
                    },
                    "motivation_flame": {
                        "intrinsic_logs_score": agent03.get("motivation_module", {}).get("intrinsic_score", 50),
                        "extrinsic_wind_score": agent03.get("motivation_module", {}).get("extrinsic_score", 30),
                        "flame_stability_index": agent03.get("motivation_module", {}).get("flame_stability_index", "medium"),
                        "core_values_identified": agent03.get("motivation_module", {}).get("logs_internal_values", []),
                        "external_pressures_identified": agent03.get("motivation_module", {}).get("wind_external_factors", []),
                        "psychological_deep_dive": agent03.get("motivation_module", {}).get("argumentation", {}).get("pro_internal", ""),
                        "sdt_argumentation": {
                            "authentic_drivers": agent03.get("motivation_module", {}).get("argumentation", {}).get("pro_internal", ""),
                            "burnout_red_flags": agent03.get("motivation_module", {}).get("argumentation", {}).get("con_external", ""),
                        },
                    },
                    "synthesis_verdict": "",
                }}
            else:
                agent03 = {"resilience_and_motivation_module": {"resilience_mountain": {"grit_percentage": 50.0, "grit_argumentation": {}, "hardship_quotes": []}, "motivation_flame": {"intrinsic_logs_score": 50, "extrinsic_wind_score": 40, "sdt_argumentation": {}}, "synthesis_verdict": ""}}
    except (json.JSONDecodeError, ValueError):
        agent03 = {"resilience_and_motivation_module": {"resilience_mountain": {"grit_percentage": 50.0, "grit_argumentation": {}, "hardship_quotes": []}, "motivation_flame": {"intrinsic_logs_score": 50, "extrinsic_wind_score": 40, "sdt_argumentation": {}}, "synthesis_verdict": ""}}

    # ── Parse Agent04 ─────────────────────────────────────────────────────────
    try:
        agent04 = parse_json_object(raw4)
        if "authenticity_report" not in agent04 and "overall_ai_probability" in agent04:
            agent04 = {"authenticity_report": agent04}
    except (json.JSONDecodeError, ValueError):
        agent04 = {"authenticity_report": {"overall_ai_probability": 30, "verdict": {"summary_for_commission": ""}, "forensic_findings": {}}}

    # ── Parse Agent05 (Leadership) ────────────────────────────────────────────
    try:
        agent05 = parse_json_object(raw5)
        if "leadership_assessment" not in agent05:
            agent05 = {"leadership_assessment": {"score_metrics": {"total_leadership_potential": 50}, "dialectical_analysis": {}, "profile_summary": "", "transformational_pillars": {}, "behavioral_markers": {}}}
    except (json.JSONDecodeError, ValueError):
        agent05 = {"leadership_assessment": {"score_metrics": {"total_leadership_potential": 50}, "dialectical_analysis": {}, "profile_summary": "", "transformational_pillars": {}, "behavioral_markers": {}}}

    # ── AGENT 06: Master Orchestrator ─────────────────────────────────────────
    bundle = {
        "agent01_extraction": agent01,
        "agent02_path": agent02,
        "agent03_psychology": agent03,
        "agent04_authenticity": agent04,
        "agent05_leadership": agent05,
    }
    user6 = prompts.AGENT06_USER.format(
        agent01_json=_safe_dump(agent01, 8000),
        agent02_json=_safe_dump(agent02, 12000),
        agent03_json=_safe_dump(agent03, 12000),
        agent04_json=_safe_dump(agent04, 4000),
        agent05_json=_safe_dump(agent05, 12000),
    )

    raw6 = await _call_llm_async(
        client, system=prompts.AGENT06_SYSTEM, user=user6, max_tokens=8192
    )

    try:
        agent06 = parse_json_object(raw6)
        dash_raw = agent06.get("dashboard")
        if isinstance(dash_raw, dict) and dash_raw.get("scores"):
            dashboard = _clamp_scores(dict(dash_raw))
        else:
            dashboard = _heuristic_dashboard(candidate, agent01, agent02, agent03, agent04, agent05)

        # Merge executive_summary and commission hints from Agent06 if available
        exec_summary = agent06.get("executive_summary")
        commission_hints = agent06.get("commission_ai_assistant")
        if isinstance(exec_summary, dict):
            dashboard["executive_summary"] = exec_summary
        if isinstance(commission_hints, dict):
            dashboard["commission_ai_assistant"] = commission_hints

    except (json.JSONDecodeError, ValueError, TypeError):
        dashboard = _heuristic_dashboard(candidate, agent01, agent02, agent03, agent04, agent05)
        agent06 = {}

    # Ensure executive_summary exists
    if "executive_summary" not in dashboard:
        dashboard["executive_summary"] = {
            "one_liner_verdict": dashboard.get("summary", "Анализ завершён."),
            "deep_analysis": dashboard.get("summary", ""),
            "key_strengths": dashboard.get("strengths", []),
            "critical_risks": dashboard.get("concerns", []),
        }
    if "commission_ai_assistant" not in dashboard:
        dashboard["commission_ai_assistant"] = {"suggested_interview_questions": [], "conflict_log": []}

    # Embed full agent outputs for rich frontend rendering
    dashboard["xai_pipeline"] = {
        "agent01": agent01,
        "agent02": agent02,
        "agent03": agent03,
        "agent04": agent04,
        "agent05": agent05,
    }

    breakdown = _clamp_scores(dashboard)
    detection = _agent4_to_detection(agent04, essay, chat_text)

    return breakdown, detection
