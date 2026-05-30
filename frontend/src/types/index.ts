export type Role = "candidate" | "commission";
export type Recommendation = "recommend" | "review" | "reject";
export type RiskLevel = "low" | "medium" | "high";

export interface TimelineEvent {
  id: string;
  date: string; // "2022-09" format
  title: string; // max 50 chars
  description: string; // max 200 chars
  direction: "up" | "down" | "neutral";
}

export interface SJTAnswer {
  scenario_id: number;
  chosen_option: string;
  time_spent_ms: number;
}

export interface AuthState {
  token: string;
  role: Role;
  candidateId?: number;
}

export interface InterviewMessage {
  id: number;
  role: "ai" | "candidate";
  content: string;
  created_at: string;
}

export interface InterviewNextResponse {
  question: string | null;
  is_final: boolean;
  messages: InterviewMessage[];
}

export interface CandidateStep {
  id: number;
  application_step: number;
  name?: string;
  age?: number;
  city?: string;
  school?: string;
  gpa?: number;
  ielts_overall?: number;
  ent_score?: number;
  achievements?: string;
  extra_activities?: string;
  leadership_examples?: string;
  goals?: string;
  essay?: string;
  ai_score?: number;
  ai_recommendation?: Recommendation;
}

export interface CommissionListItem {
  anonymous_id: string;
  age?: number;
  city?: string;
  application_step: number;
  ai_score?: number;
  baseline_score?: number;
  ai_recommendation?: Recommendation;
  ai_detection_score?: number;
  created_at: string;
  scored_at?: string;
  ai_evaluation_in_progress?: boolean;
}

export interface CriteriaExplanation {
  positive_points?: string[];
  negative_points?: string[];
  synthesis?: string;
}

export interface ExecutiveSummary {
  one_liner_verdict?: string;
  deep_analysis?: string;
  key_strengths?: string[];
  critical_risks?: string[];
}

export interface CommissionAiAssistant {
  suggested_interview_questions?: string[];
  conflict_log?: string[];
}

export interface AiScoreBreakdown {
  scores: {
    leadership: number;
    motivation: number;
    growth_trajectory: number;
    skills_experience: number;
    authenticity: number;
  };
  total: number;
  recommendation: Recommendation;
  summary: string;
  strengths: string[];
  concerns: string[];
  criteria_explanations: Record<string, string | CriteriaExplanation>;
  // Rich XAI data from new multi-agent pipeline
  executive_summary?: ExecutiveSummary;
  commission_ai_assistant?: CommissionAiAssistant;
  xai_pipeline?: {
    agent01?: Record<string, unknown>;
    agent02?: Record<string, unknown>;
    agent03?: Record<string, unknown>;
    agent04?: Record<string, unknown>;
    agent05?: Record<string, unknown>;
  };
}

export interface BaselineBreakdown {
  academic: number;
  experience: number;
  leadership: number;
  motivation: number;
  activity: number;
  total: number;
}

export interface CommissionDetail {
  anonymous_id: string;
  age?: number;
  city?: string;
  gpa?: number;
  ielts_overall?: number;
  ent_score?: number;
  achievements?: string;
  leadership_examples?: string;
  extra_activities?: string;
  goals?: string;
  essay?: string;
  commission_comment?: string | null;
  application_step: number;

  ai_score?: number;
  ai_score_breakdown?: AiScoreBreakdown;
  ai_recommendation?: Recommendation;
  ai_explanation?: string;

  baseline_score?: number;
  baseline_breakdown?: BaselineBreakdown;

  ai_detection_score?: number;
  ai_detection_details?: {
    score: number;
    burstiness: number;
    vocabulary_richness: number;
    avg_sentence_length: number;
    risk_level: RiskLevel;
    reasoning?: string;
    human_signals?: string[];
    ai_signals?: string[];
    method?: "claude" | "statistical";
  };

  interview_messages: InterviewMessage[];
  video_url?: string;
  behavior_metrics?: BehaviorMetrics;
  created_at: string;
  scored_at?: string;
  ai_evaluation_in_progress?: boolean;
}

export interface CommissionRanking {
  candidates: CommissionListItem[];
  total: number;
  completed: number;
  scored: number;
}

// ─── Live Video Interview (Path 1) ────────────────────────────────────────────

export interface LiveStartResponse {
  question: string;
  audio_base64: string;
  question_number: number;
  total_questions: number;
  is_final: boolean;
}

export interface LiveStepResponse {
  transcript: string;
  next_question: string | null;
  audio_base64: string | null;
  question_number: number;
  total_questions: number;
  is_final: boolean;
}

export interface LiveFinalizeResponse {
  success: boolean;
  video_url: string;
}

// ─── Video Behavior Analysis ──────────────────────────────────────────────────

/** One 500 ms sample from MediaPipe FaceLandmarker blendshapes */
export interface BlendshapeEntry {
  t: number;           // ms since tracker.start()
  eyeLookInL: number;  // eyeLookInLeft   — gaze toward nose (right dir for left eye)
  eyeLookInR: number;  // eyeLookInRight
  eyeLookOutL: number; // eyeLookOutLeft  — gaze away from nose
  eyeLookOutR: number; // eyeLookOutRight
  browInnerUp: number; // stress / uncertainty marker
  jawOpen: number;     // speech-sync / deepfake check
}

/** One downsampled chart point */
export interface BehaviorTimelinePoint {
  t: number;       // seconds from start
  stress: number;  // 0-100  (browInnerUp signal)
  reading: number; // 0-100  (saccade density for this window)
}

/** Full behavior analysis object stored on the candidate record */
export interface BehaviorMetrics {
  // ── Raw (sent from frontend)
  samples_taken: number;
  behavioral_log: BlendshapeEntry[];
  // ── Backend-enriched
  eye_contact_consistency: number;   // 0-100 % of samples looking forward
  emotional_volatility: number;      // 0-100 normalised std-dev of browInnerUp
  reading_probability: number;       // 0-100 overall probability of reading from notes
  saccade_count: number;             // number of detected saccade pattern windows
  integrity_score: number;           // 0.0–1.0  Score_integrity formula
  risk_level: "low" | "medium" | "high";
  signals_positive: string[];
  signals_negative: string[];
  timeline: BehaviorTimelinePoint[]; // downsampled series for the chart
  explainable_ai: string;            // human-readable reasoning paragraph
}
