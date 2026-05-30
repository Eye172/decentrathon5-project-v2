import secrets
import string
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


def _generate_anonymous_id() -> str:
    """Generate random ID like KZ-A3F7X2 (not sequential)."""
    chars = string.ascii_uppercase + string.digits
    part = "".join(secrets.choice(chars) for _ in range(6))
    return f"KZ-{part}"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    password_hash = Column(String(64), nullable=False)
    role = Column(String(20), nullable=False)  # "candidate" | "commission"
    session_token = Column(String(64), nullable=True, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    candidate = relationship("Candidate", back_populates="user", uselist=False)


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    anonymous_id = Column(String(20), unique=True, nullable=False, index=True,
                          default=_generate_anonymous_id)

    # Step 0 = registered, 1 = questionnaire, 2 = essay, 3 = interview, 4 = complete
    application_step = Column(Integer, default=0, nullable=False)

    # Step 1: Questionnaire
    name = Column(String(200), nullable=True)
    age = Column(Integer, nullable=True)
    city = Column(String(100), nullable=True)
    school = Column(String(200), nullable=True)
    gpa = Column(Float, nullable=True)
    ielts_overall = Column(Float, nullable=True)
    ent_score = Column(Integer, nullable=True)
    achievements = Column(Text, nullable=True)
    extra_activities = Column(Text, nullable=True)
    leadership_examples = Column(Text, nullable=True)
    goals = Column(Text, nullable=True)

    # Step 2: Essay
    essay = Column(Text, nullable=True)

    # Private note from commission (human-in-the-loop)
    commission_comment = Column(Text, nullable=True)

    # AI scoring (Claude) — populated after interview complete
    ai_score = Column(Float, nullable=True)
    ai_score_breakdown = Column(JSON, nullable=True)
    ai_recommendation = Column(String(50), nullable=True)
    ai_explanation = Column(Text, nullable=True)

    # Baseline (rule-based)
    baseline_score = Column(Float, nullable=True)
    baseline_breakdown = Column(JSON, nullable=True)

    # AI text detection
    ai_detection_score = Column(Float, nullable=True)
    ai_detection_details = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    scored_at = Column(DateTime(timezone=True), nullable=True)
    # Set when interview is submitted; cleared when a full scoring run finishes (scored_at set).
    ai_evaluation_started_at = Column(DateTime(timezone=True), nullable=True)

    # Path 1: video interview recording URL (local path or S3 key)
    video_url = Column(String(500), nullable=True)
    # Path 1: behavioral analysis metrics collected during video interview
    behavior_metrics = Column(JSON, nullable=True)

    user = relationship("User", back_populates="candidate")
    interview_messages = relationship("InterviewMessage", back_populates="candidate",
                                      order_by="InterviewMessage.id")

    @property
    def ai_evaluation_in_progress(self) -> bool:
        if self.application_step < 4 or self.scored_at is not None:
            return False
        return self.ai_evaluation_started_at is not None


class InterviewMessage(Base):
    __tablename__ = "interview_messages"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    role = Column(String(20), nullable=False)  # "ai" | "candidate"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    candidate = relationship("Candidate", back_populates="interview_messages")
