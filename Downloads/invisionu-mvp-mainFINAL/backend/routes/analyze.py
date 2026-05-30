from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.ai_detector import detect_ai_text

router = APIRouter(prefix="/api/analyze", tags=["analysis"])


class EssayAnalyzeRequest(BaseModel):
    text: str
    candidate_name: Optional[str] = None


@router.post("/essay")
def analyze_essay(request: EssayAnalyzeRequest):
    """Analyze a text snippet for AI-generation indicators."""
    result = detect_ai_text(request.text)
    return {
        "candidate_name": request.candidate_name,
        "analysis": result,
        "interpretation": _interpret(result),
    }


def _interpret(result: dict) -> str:
    risk = result["risk_level"]
    score = result["score"]
    if risk == "low":
        return (
            f"Текст скорее всего написан кандидатом самостоятельно "
            f"(AI-вероятность: {score * 100:.0f}%). "
            f"Высокое разнообразие предложений и лексики."
        )
    elif risk == "medium":
        return (
            f"Текст содержит признаки редактирования AI-инструментами "
            f"(AI-вероятность: {score * 100:.0f}%). "
            f"Рекомендуется дополнительная проверка."
        )
    else:
        return (
            f"Высокая вероятность использования генеративного AI "
            f"(AI-вероятность: {score * 100:.0f}%). "
            f"Текст имеет равномерную структуру и ограниченную лексику."
        )
