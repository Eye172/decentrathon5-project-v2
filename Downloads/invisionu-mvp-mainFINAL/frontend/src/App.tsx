import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CommissionProvider } from "./context/CommissionContext";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { setAuthToken } from "./api/client";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Landing } from "./pages/Landing";
import { Register } from "./pages/candidate/Register";
import { CandidateLogin } from "./pages/candidate/Login";
import { Apply } from "./pages/candidate/Apply";
import { Interview } from "./pages/candidate/Interview";
import { Done } from "./pages/candidate/Done";

import { CommissionLogin } from "./pages/commission/Login";
import { CommissionDashboard } from "./pages/commission/Dashboard";
import { CommissionCandidateView } from "./pages/commission/CandidateView";
import { CommissionSearch } from "./pages/commission/Search";
import { CommissionHistory } from "./pages/commission/History";
import { CommissionSettings } from "./pages/commission/Settings";

function TokenSyncer() {
  const { auth } = useAuth();
  useEffect(() => {
    setAuthToken(auth?.token ?? null);
  }, [auth?.token]);
  return null;
}

function I18nHead() {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.title = t("meta.title");
    document.documentElement.lang = i18n.language === "kz" ? "kk" : i18n.language;
  }, [t, i18n.language]);
  return null;
}

function RequireAuth({ role, children }: { role: "candidate" | "commission"; children: React.ReactNode }) {
  const { auth, isLoading } = useAuth();
  if (isLoading) return null;
  if (!auth || auth.role !== role) {
    return <Navigate to={role === "commission" ? "/commission/login" : "/login"} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <CommissionProvider>
        <BrowserRouter>
          <I18nHead />
          <TokenSyncer />
          <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<CandidateLogin />} />
              <Route path="/commission/login" element={<CommissionLogin />} />

              {/* Candidate */}
              <Route path="/apply" element={
                <RequireAuth role="candidate"><Apply /></RequireAuth>
              } />
              <Route path="/interview" element={
                <RequireAuth role="candidate"><Interview /></RequireAuth>
              } />
              <Route path="/done" element={
                <RequireAuth role="candidate"><Done /></RequireAuth>
              } />

              {/* Commission */}
              <Route path="/commission" element={
                <RequireAuth role="commission"><CommissionDashboard /></RequireAuth>
              } />
              <Route path="/commission/candidate/:anonymousId" element={
                <RequireAuth role="commission"><CommissionCandidateView /></RequireAuth>
              } />
              <Route path="/commission/search" element={
                <RequireAuth role="commission"><CommissionSearch /></RequireAuth>
              } />
              <Route path="/commission/history" element={
                <RequireAuth role="commission"><CommissionHistory /></RequireAuth>
              } />
              <Route path="/commission/settings" element={
                <RequireAuth role="commission"><CommissionSettings /></RequireAuth>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <LanguageSwitcher />
        </BrowserRouter>
      </CommissionProvider>
    </AuthProvider>
  );
}
