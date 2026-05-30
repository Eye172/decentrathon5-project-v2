import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi, setAuthToken } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { MeshBackground } from "../../components/MeshBackground";

export function CandidateLogin() {
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
      const data = await authApi.login(email, password);
      if (data.role !== "candidate") { setError(t("candidate_login.wrong_role")); return; }
      setAuthToken(data.token);
      login(data);
      navigate("/apply");
    } catch {
      setError(t("common.error_invalid_credentials"));
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

          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl glass mb-4"
              style={{ border: "1px solid rgba(209,255,0,0.18)" }}
            >
              <span className="font-black text-xl" style={{ color: "var(--acid)", fontFamily: "'Space Grotesk', sans-serif" }}>iU</span>
            </div>
            <div className="hud-label mb-2 tracking-[0.18em]">// AUTH :: CANDIDATE</div>
            <h1 className="text-2xl font-black text-white">{t("candidate_login.title")}</h1>
            <p className="text-white/38 text-sm mt-1">{t("candidate_login.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">{t("common.email")}</label>
              <input className="input" type="email" placeholder="your@email.com"
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

          <p className="text-center text-sm text-white/30 mt-6">
            {t("candidate_login.no_account")}{" "}
            <Link to="/register" className="font-semibold transition-colors hover:opacity-80" style={{ color: "var(--acid)" }}>
              {t("candidate_login.register_link")}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
