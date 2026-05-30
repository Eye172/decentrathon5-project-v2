import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────
export interface CategoryWeights {
  path_traveled: number;
  leadership: number;
  motivation: number;
  resilience: number;
  authenticity: number;
}

export interface EyeCalibration {
  saccade_sensitivity: number;  // 0.1 – 3.0, multiplier for saccade detection
  gaze_boundary: number;        // 10 – 50, % distance from centre before penalty
  emotion_freeze_penalty: boolean; // penalise "stone face" (no browInnerUp movement)
}

export interface CommissionSettings {
  weights: CategoryWeights;
  ai_threshold: number; // 0-100, percentage
  notifications_enabled: boolean;
  eye_calibration: EyeCalibration;
}

export interface HistoryEntry {
  anonymous_id: string;
  city?: string;
  age?: number;
  ai_score?: number;
  viewed_at: string; // ISO
  confirmed: boolean;
}

export const DEFAULT_EYE_CALIBRATION: EyeCalibration = {
  saccade_sensitivity: 1.0,
  gaze_boundary: 20,
  emotion_freeze_penalty: true,
};

const DEFAULT_SETTINGS: CommissionSettings = {
  weights: {
    path_traveled: 25.0,
    leadership: 25.0,
    motivation: 25.0,
    resilience: 15.0,
    authenticity: 10.0,
  },
  ai_threshold: 60,
  notifications_enabled: true,
  eye_calibration: { ...DEFAULT_EYE_CALIBRATION },
};

const SETTINGS_KEY = "invisionu_commission_settings";
const CONFIRMED_KEY = "invisionu_confirmed_candidates";
const HISTORY_KEY = "invisionu_commission_history";

// ─── Context ──────────────────────────────────────────────────
interface CommissionCtx {
  settings: CommissionSettings;
  updateSettings: (s: Partial<CommissionSettings>) => void;
  updateWeights: (w: Partial<CategoryWeights>) => void;
  resetWeights: () => void;
  updateEyeCalibration: (c: Partial<EyeCalibration>) => void;

  confirmedIds: Set<string>;
  confirmCandidate: (id: string) => void;
  isConfirmed: (id: string) => boolean;

  history: HistoryEntry[];
  addToHistory: (entry: Omit<HistoryEntry, "viewed_at" | "confirmed">) => void;
  clearHistory: () => void;
}

const Ctx = createContext<CommissionCtx | null>(null);

export function CommissionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CommissionSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        eye_calibration: { ...DEFAULT_EYE_CALIBRATION, ...(parsed.eye_calibration ?? {}) },
      };
    } catch { return DEFAULT_SETTINGS; }
  });

  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(CONFIRMED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Persist confirmed
  useEffect(() => {
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...confirmedIds]));
  }, [confirmedIds]);

  // Persist history
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const updateSettings = useCallback((s: Partial<CommissionSettings>) => {
    setSettings(prev => ({ ...prev, ...s }));
  }, []);

  const updateWeights = useCallback((w: Partial<CategoryWeights>) => {
    setSettings(prev => ({ ...prev, weights: { ...prev.weights, ...w } }));
  }, []);

  const resetWeights = useCallback(() => {
    setSettings(prev => ({ ...prev, weights: { ...DEFAULT_SETTINGS.weights } }));
  }, []);

  const updateEyeCalibration = useCallback((c: Partial<EyeCalibration>) => {
    setSettings(prev => ({
      ...prev,
      eye_calibration: { ...(prev.eye_calibration ?? DEFAULT_EYE_CALIBRATION), ...c },
    }));
  }, []);

  const confirmCandidate = useCallback((id: string) => {
    setConfirmedIds(prev => new Set([...prev, id]));
    setHistory(prev => prev.map(h => h.anonymous_id === id ? { ...h, confirmed: true } : h));
  }, []);

  const isConfirmed = useCallback((id: string) => confirmedIds.has(id), [confirmedIds]);

  const addToHistory = useCallback((entry: Omit<HistoryEntry, "viewed_at" | "confirmed">) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.anonymous_id !== entry.anonymous_id);
      const newEntry: HistoryEntry = {
        ...entry,
        viewed_at: new Date().toISOString(),
        confirmed: confirmedIds.has(entry.anonymous_id),
      };
      return [newEntry, ...filtered].slice(0, 50); // keep last 50
    });
  }, [confirmedIds]);

  const clearHistory = useCallback(() => setHistory([]), []);

  return (
    <Ctx.Provider value={{
      settings, updateSettings, updateWeights, resetWeights, updateEyeCalibration,
      confirmedIds, confirmCandidate, isConfirmed,
      history, addToHistory, clearHistory,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCommission() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCommission must be inside CommissionProvider");
  return ctx;
}

export { DEFAULT_SETTINGS };
