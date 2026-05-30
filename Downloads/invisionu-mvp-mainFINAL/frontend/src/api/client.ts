import axios from "axios";
import type {
  CandidateStep,
  InterviewNextResponse,
  CommissionRanking,
  CommissionDetail,
  LiveStartResponse,
  LiveStepResponse,
  LiveFinalizeResponse,
} from "../types";

/** Dev: empty baseURL + Vite proxy → API works from phone/tablet via LAN IP. Prod: VITE_API_BASE_URL or localhost. */
const apiBase =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "" : "http://localhost:8000");

const api = axios.create({
  baseURL: apiBase,
  headers: { "Content-Type": "application/json" },
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** API returns snake_case; map to AuthState in AuthContext.login */
export interface AuthApiResponse {
  token: string;
  role: string;
  candidate_id?: number | null;
}

export const authApi = {
  register: (email: string, password: string) =>
    api.post<AuthApiResponse>("/api/auth/register", { email, password }).then((r) => r.data),
  login: (email: string, password: string) =>
    api.post<AuthApiResponse>("/api/auth/login", { email, password }).then((r) => r.data),
};

// ─── Candidate ────────────────────────────────────────────────────────────────

export const candidateApi = {
  me: () => api.get<CandidateStep>("/api/candidates/me").then((r) => r.data),
  saveQuestionnaire: (data: Record<string, unknown>) =>
    api.put<CandidateStep>("/api/candidates/me/questionnaire", data).then((r) => r.data),
  saveEssay: (essay: string) =>
    api.put<CandidateStep>("/api/candidates/me/essay", { essay }).then((r) => r.data),
};

// ─── Interview ────────────────────────────────────────────────────────────────

const interviewTimeoutMs = 150_000;

export const interviewApi = {
  start: (lang?: string) =>
    api
      .post<InterviewNextResponse>("/api/interview/start", {}, { 
        timeout: interviewTimeoutMs,
        headers: lang ? { "X-Language": lang } : {}
      })
      .then((r) => r.data),
  answer: (answer: string, lang?: string) =>
    api
      .post<InterviewNextResponse>("/api/interview/answer", { answer, lang }, { timeout: interviewTimeoutMs })
      .then((r) => r.data),
  history: () =>
    api.get<InterviewNextResponse["messages"]>("/api/interview/history").then((r) => r.data),
  /** WebM/Opus blob from MediaRecorder; uses fetch so multipart boundary is set correctly. */
  transcribe: async (blob: Blob, lang?: string): Promise<{ text: string }> => {
    const form = new FormData();
    form.append("file", blob, "recording.webm");
    const headers: Record<string, string> = {};
    const auth = api.defaults.headers.common.Authorization;
    if (typeof auth === "string") headers.Authorization = auth;
    if (lang) headers["X-Language"] = lang;
    const res = await fetch(`${apiBase}/api/interview/transcribe`, {
      method: "POST",
      body: form,
      headers,
    });
    const data = (await res.json().catch(() => ({}))) as { detail?: string | { msg?: string }[] };
    if (!res.ok) {
      const detail = data.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg).filter(Boolean).join("; ")
            : "Transcription failed";
      throw new Error(msg);
    }
    return data as { text: string };
  },
};

// ─── Live Video Interview (Path 1) ────────────────────────────────────────────

export const liveInterviewApi = {
  /**
   * Create a session and get the first question + TTS audio.
   * Returns base64-encoded MP3 audio so no extra fetch is needed.
   */
  start: (sessionId: string, lang?: string) => {
    const form = new FormData();
    form.append("session_id", sessionId);
    if (lang) form.append("lang", lang);
    return api
      .post<LiveStartResponse>("/api/interview/live-start", form, {
        timeout: 60_000,
        headers: { "Content-Type": undefined as unknown as string },
      })
      .then((r) => r.data);
  },

  /**
   * Submit the candidate's audio answer for one question step.
   * Returns transcript + next question + TTS audio (or is_final: true).
   */
  step: (sessionId: string, currentStep: number, audioBlob: Blob, lang?: string) => {
    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("current_step", String(currentStep));
    form.append("audio_chunk", audioBlob, "audio.webm");
    if (lang) form.append("lang", lang);
    return api
      .post<LiveStepResponse>("/api/interview/live-step", form, {
        timeout: 90_000,
        headers: { "Content-Type": undefined as unknown as string },
      })
      .then((r) => r.data);
  },

  /**
   * Upload the full video recording and trigger background scoring.
   * behaviorReport is the canvas-tracked behavioral metrics object.
   */
  finalize: (sessionId: string, videoBlob: Blob, behaviorReport?: object) => {
    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("full_video", videoBlob, "interview.webm");
    if (behaviorReport) {
      form.append("behavior_metrics", JSON.stringify(behaviorReport));
    }
    return api
      .post<LiveFinalizeResponse>("/api/interview/finalize-video", form, {
        timeout: 300_000,
        headers: { "Content-Type": undefined as unknown as string },
      })
      .then((r) => r.data);
  },
};

// ─── Commission ───────────────────────────────────────────────────────────────

export const commissionApi = {
  list: () =>
    api.get<CommissionRanking>("/api/commission/candidates").then((r) => r.data),
  get: (anonymousId: string) =>
    api.get<CommissionDetail>(`/api/commission/candidates/${anonymousId}`).then((r) => r.data),
  rescore: (anonymousId: string) =>
    api.post(`/api/score/${anonymousId}/full`).then((r) => r.data),
  saveComment: (anonymousId: string, commission_comment: string) =>
    api
      .patch<CommissionDetail>(`/api/commission/candidates/${anonymousId}/comment`, {
        commission_comment,
      })
      .then((r) => r.data),
};
