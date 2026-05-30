import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { AuthState } from "../types";
import type { AuthApiResponse } from "../api/client";
import {
  clearApplyDraftForCandidate,
  clearLegacyApplyDraftKeys,
} from "../utils/applyDraftStorage";

interface AuthContextValue {
  auth: AuthState | null;
  login: (data: AuthApiResponse) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "invisionu_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const raw = JSON.parse(stored) as AuthState & { candidate_id?: number };
        setAuth({
          token: raw.token,
          role: raw.role,
          candidateId: raw.candidateId ?? raw.candidate_id,
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  function login(data: AuthApiResponse) {
    const normalized: AuthState = {
      token: data.token,
      role: data.role as AuthState["role"],
      candidateId: data.candidate_id ?? undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    setAuth(normalized);
  }

  function logout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { candidateId?: number };
        if (typeof parsed.candidateId === "number") {
          clearApplyDraftForCandidate(parsed.candidateId);
        }
      }
    } catch {
      /* ignore */
    }
    clearLegacyApplyDraftKeys();
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
