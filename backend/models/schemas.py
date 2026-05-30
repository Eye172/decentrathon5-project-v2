from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime


# ─── Auth ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    role: str
    candidate_id: Optional[int] = None


# ─── Interview ────────────────────────────────────────────────────────────────

class InterviewMessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class InterviewAnswerRequest(BaseModel):
    answer: str
    lang: Optional[str] = "en"


class InterviewNextResponse(BaseModel):
    question: Optional[str]
    is_final: bool
    messages: list[InterviewMessageOut]


class InterviewTranscribeResponse(BaseModel):
    text: str


# ─── Candidate (candidate-facing) ────────────────────────────────────────────

class QuestionnaireData(BaseModel):
    name: str
    age: int = Field(ge=14, le=25)
    city: str
    school: str
    gpa: Optional[float] = Field(default=None, ge=0.0, le=5.0)
    ielts_overall: Optional[float] = Field(default=None, ge=0.0, le=9.0)
    ent_score: Optional[int] = Field(default=None, ge=0, le=150)
    achievements: str = ""
    extra_activities: str = ""
    leadership_examples: str = ""
    goals: str = ""


class EssayData(BaseModel):
    essay: str = Field(min_length=100)


class CandidateStepResponse(BaseModel):
    id: int
    application_step: int
    name: Optional[str] = None
    age: Optional[int] = None
    city: Optional[str] = None
    school: Optional[str] = None
    gpa: Optional[float] = None
    ielts_overall: Optional[float] = None
    ent_score: Optional[int] = None
    achievements: Optional[str] = None
    extra_activities: Optional[str] = None
    leadership_examples: Optional[str] = None
    goals: Optional[str] = None
    essay: Optional[str] = None
    ai_score: Optional[float] = None
    ai_recommendation: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Commission (anonymous view) ──────────────────────────────────────────────

class CommissionCandidateList(BaseModel):
    anonymous_id: str
    age: Optional[int] = None
    city: Optional[str] = None
    application_step: int
    ai_score: Optional[float] = None
    baseline_score: Optional[float] = None
    ai_recommendation: Optional[str] = None
    ai_detection_score: Optional[float] = None
    created_at: datetime
    scored_at: Optional[datetime] = None
    ai_evaluation_in_progress: bool = False

    class Config:
        from_attributes = True


class CommissionCommentUpdate(BaseModel):
    commission_comment: str = Field(default="", max_length=8000)


class CommissionCandidateDetail(BaseModel):
    anonymous_id: str
    age: Optional[int] = None
    city: Optional[str] = None
    gpa: Optional[float] = None
    ielts_overall: Optional[float] = None
    ent_score: Optional[int] = None
    achievements: Optional[str] = None
    leadership_examples: Optional[str] = None
    extra_activities: Optional[str] = None
    goals: Optional[str] = None
    essay: Optional[str] = None
    commission_comment: Optional[str] = None
    application_step: int

    ai_score: Optional[float] = None
    ai_score_breakdown: Optional[dict] = None
    ai_recommendation: Optional[str] = None
    ai_explanation: Optional[str] = None

    baseline_score: Optional[float] = None
    baseline_breakdown: Optional[dict] = None

    ai_detection_score: Optional[float] = None
    ai_detection_details: Optional[dict] = None

    # Video interview artifacts
    video_url: Optional[str] = None
    behavior_metrics: Optional[dict] = None

    interview_messages: list[InterviewMessageOut] = []

    created_at: datetime
    scored_at: Optional[datetime] = None
    ai_evaluation_in_progress: bool = False

    class Config:
        from_attributes = True


class CommissionRankingResponse(BaseModel):
    candidates: list[CommissionCandidateList]
    total: int
    completed: int
    scored: int
