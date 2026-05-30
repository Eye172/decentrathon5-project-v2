"""
Deterministic linguistic features (Agent-01 support + forensic baselines).
"""
from __future__ import annotations

import math
import re
from typing import Any


_RE_SENTENCE = re.compile(r"(?<=[.!?…])\s+|\n+")

# Russian + English first-person singular / plural (common forms)
_SINGULAR_PAT = re.compile(
    r"\b(я|меня|мне|мной|мною|мой|моя|моё|мое|мои|моего|моей|моим|моими)\b",
    re.IGNORECASE,
)
_PLURAL_PAT = re.compile(
    r"\b(мы|нас|нам|нами|наш|наша|наше|наши|нашего|нашей|наших|нашим)\b",
    re.IGNORECASE,
)

_EN_I = re.compile(
    r"\b(i|me|my|mine|myself)\b",
    re.IGNORECASE,
)
_EN_WE = re.compile(
    r"\b(we|us|our|ours|ourselves)\b",
    re.IGNORECASE,
)

_POWER_VERBS_RU = (
    "создал", "создала", "внедрил", "внедрила", "организовал", "организовала",
    "руководил", "руководила", "добился", "добилась", "решил", "решила",
    "убедил", "убедила", "запустил", "запустила", "построил", "построила",
    "изменил", "изменила", "достиг", "достигла", "преодолел", "преодолела",
    "основал", "основала", "возглавил", "возглавила", "координировал",
)
_POWER_VERBS_EN = (
    "built", "created", "led", "managed", "launched", "delivered", "drove",
    "achieved", "overcame", "founded", "organized", "implemented", "persuaded",
)


def _words(text: str) -> list[str]:
    return re.findall(r"\b\w+\b", text or "")


def split_sentences(text: str) -> list[str]:
    if not (text or "").strip():
        return []
    parts = _RE_SENTENCE.split(text.strip())
    return [s.strip() for s in parts if len(s.split()) >= 2]


def avg_sentence_length_words(text: str) -> float:
    sents = split_sentences(text)
    if not sents:
        return 0.0
    lengths = [len(_words(s)) for s in sents]
    return sum(lengths) / len(lengths)


def pronoun_analysis(text: str) -> dict[str, Any]:
    t = text or ""
    s1 = len(_SINGULAR_PAT.findall(t)) + len(_EN_I.findall(t))
    s2 = len(_PLURAL_PAT.findall(t)) + len(_EN_WE.findall(t))
    ratio = round(s1 / s2, 4) if s2 > 0 else (float(s1) if s1 else 0.0)
    return {"singular_count": s1, "plural_count": s2, "ratio_i_we": float(ratio)}


def extract_power_verbs(text: str, limit: int = 40) -> list[str]:
    low = (text or "").lower()
    found: list[str] = []
    seen: set[str] = set()
    for v in _POWER_VERBS_RU + _POWER_VERBS_EN:
        if v in low and v not in seen:
            seen.add(v)
            found.append(v)
        if len(found) >= limit:
            break
    return found


def burstiness_score(text: str) -> float:
    """0..1 higher = more human-like variance in sentence lengths."""
    lengths = [len(_words(s)) for s in split_sentences(text)]
    if len(lengths) < 3:
        return 0.45
    mean = sum(lengths) / len(lengths)
    var = sum((x - mean) ** 2 for x in lengths) / len(lengths)
    std = math.sqrt(var)
    cv = std / mean if mean > 0 else 0.0
    return round(min(cv / 1.0, 1.0), 4)


def vocabulary_richness(text: str) -> float:
    words = _words(text or "")
    if not words:
        return 0.0
    return round(len(set(w.lower() for w in words)) / len(words), 4)


def build_linguistic_matrix(essay: str, chat: str) -> dict[str, Any]:
    pe = pronoun_analysis(essay)
    pc = pronoun_analysis(chat)
    combined = pronoun_analysis(f"{essay}\n{chat}")
    return {
        "pronouns": {
            "singular_count": combined["singular_count"],
            "plural_count": combined["plural_count"],
            "ratio_i_we": combined["ratio_i_we"],
            "essay_singular": pe["singular_count"],
            "chat_singular": pc["singular_count"],
        },
        "lexical_features": {
            "power_verbs": extract_power_verbs(f"{essay}\n{chat}"),
            "complexity_essay": round(avg_sentence_length_words(essay), 2),
            "complexity_chat": round(avg_sentence_length_words(chat), 2),
            "burstiness_essay": burstiness_score(essay),
            "burstiness_chat": burstiness_score(chat),
            "vocab_richness_essay": vocabulary_richness(essay),
            "vocab_richness_chat": vocabulary_richness(chat),
        },
    }
