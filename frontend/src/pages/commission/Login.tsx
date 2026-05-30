import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { authApi, setAuthToken } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { MeshBackground } from "../../components/MeshBackground";

export function CommissionLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const data = await authApi.login(email.trim(), password);
      if (data.role !== "commission") { setError(t("commission_login.wrong_role")); return; }
      setAuthToken(data.token);
      login(data);
      navigate("/commission");
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && !e.response) {
        setError(t("common.error_api_unreachable"));
      } else {
        setError(t("common.error_invalid_credentials"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-dark flex items-center justify-center px-4 min-h-screen">
      <MeshBackground variant="minimal" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
        style={{ zIndex: 10 }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 mb-6 transition-all group"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="group-hover:-translate-x-0.5 transition-transform">
            <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-sm hover:text-white/70 transition-colors">{t("common.back")}</span>
        </Link>

        <div className="glass-card rounded-2xl p-8">
          <div className="hud-corner hud-corner-tl" />
          <div className="hud-corner hud-corner-tr" />
          <div className="hud-corner hud-corner-bl" />
          <div className="hud-corner hud-corner-br" />

          {/* Secure access banner */}
          <div
            className="flex items-center gap-2 mb-6 px-3 py-2 rounded-xl"
            style={{ background: "rgba(100,120,255,0.07)", border: "1px solid rgba(100,120,255,0.15)" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="#6478FF" strokeWidth="1.4"/>
              <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="#6478FF" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span className="hud-label" style={{ color: "rgba(100,120,255,0.7)" }}>SECURE ACCESS // COMMISSION PANEL</span>
          </div>

          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl glass mb-4"
              style={{ border: "1px solid rgba(100,120,255,0.22)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="#6478FF" strokeWidth="1.5"/>
                <path d="M7 8h10M7 12h7M7 16h5" stroke="#6478FF" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-black text-white">{t("commission_login.title")}</h1>
            <p className="text-white/38 text-sm mt-1">inVision U Admissions</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">{t("commission_login.email_label")}</label>
              <input className="input" type="email" placeholder="commission1@invisionu.kz"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">{t("common.password")}</label>
              <input className="input" type="password" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {error && <div className="error-box">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  {t("common.logging_in")}
                </span>
              ) : t("common.login")}
            </button>
          </form>

          <div
            className="mt-5 rounded-xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="hud-label mb-1">{t("commission_login.test_data")}</p>
            <p className="font-mono text-xs text-white/45">commission1@invisionu.kz · commission123</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
