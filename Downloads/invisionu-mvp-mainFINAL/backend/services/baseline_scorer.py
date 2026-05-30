"""
Rule-based baseline scorer.
Simple weighted formula to score candidates without AI.
Used for comparison with the Claude AI scorer (Baseline & improvements criterion).
"""


def score_candidate_baseline(candidate) -> dict:
    """
    Returns dict with total (0-100) and per-category breakdown.
    
    Categories:
      - academic (0-20): based on GPA
      - experience (0-20): based on achievements text length and keywords
      - leadership (0-25): based on leadership_examples text and keywords
      - motivation (0-20): based on essay and goals text
      - activity (0-15): based on extra_activities
    """
    scores = {}

    # 1. Academic performance (0-20)
    if candidate.gpa is not None:
        gpa_norm = (candidate.gpa / 5.0) * 20
    else:
        gpa_norm = 0.0
    scores["academic"] = round(gpa_norm, 1)

    # 2. Experience & achievements (0-20)
    ach_text = (candidate.achievements or "").lower()
    ach_score = min(20, len(ach_text.split()) * 0.15)
    bonus_keywords = ["олимпиад", "конкурс", "победитель", "призёр", "проект",
                      "olympiad", "competition", "winner", "prize", "project",
                      "стартап", "startup", "award", "грант", "grant"]
    ach_bonus = sum(1.5 for kw in bonus_keywords if kw in ach_text)
    scores["experience"] = round(min(20, ach_score + ach_bonus), 1)

    # 3. Leadership potential (0-25)
    lead_text = (candidate.leadership_examples or "").lower()
    lead_score = min(15, len(lead_text.split()) * 0.12)
    lead_keywords = ["организовал", "возглавил", "команда", "инициатив", "лидер",
                     "organized", "led", "team", "initiative", "leader",
                     "основал", "created", "founded", "руководил", "managed"]
    lead_bonus = sum(2.0 for kw in lead_keywords if kw in lead_text)
    scores["leadership"] = round(min(25, lead_score + lead_bonus), 1)

    # 4. Motivation & vision (0-20)
    essay_text = (candidate.essay or "").lower()
    goals_text = (candidate.goals or "").lower()
    combined = essay_text + " " + goals_text
    motiv_score = min(12, len(combined.split()) * 0.04)
    motiv_keywords = ["изменить", "создать", "мечта", "цель", "вдохновл",
                      "change", "create", "dream", "goal", "inspire",
                      "миссия", "mission", "влияние", "impact", "будущее", "future"]
    motiv_bonus = sum(1.5 for kw in motiv_keywords if kw in combined)
    scores["motivation"] = round(min(20, motiv_score + motiv_bonus), 1)

    # 5. Extra activities (0-15)
    act_text = (candidate.extra_activities or "").lower()
    act_score = min(10, len(act_text.split()) * 0.2)
    act_keywords = ["волонтёр", "спорт", "музык", "театр", "клуб",
                    "volunteer", "sport", "music", "theater", "club",
                    "дебат", "debate", "art", "искусств", "наставник", "mentor"]
    act_bonus = sum(1.0 for kw in act_keywords if kw in act_text)
    scores["activity"] = round(min(15, act_score + act_bonus), 1)

    total = sum(scores.values())
    scores["total"] = round(total, 1)

    return scores
