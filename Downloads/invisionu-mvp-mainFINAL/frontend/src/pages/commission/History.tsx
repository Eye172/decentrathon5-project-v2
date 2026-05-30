import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useCommission } from "../../context/CommissionContext";
import { MeshBackground } from "../../components/MeshBackground";
import { CommissionSidebar } from "../../components/CommissionSidebar";
import { useTranslation } from "react-i18next";

export function CommissionHistory() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const { history, clearHistory, isConfirmed } = useCommission();
  const { t } = useTranslation();

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return t("history.just_now");
    if (mins < 60) return t("history.mins_ago", { n: mins });
    if (hours < 24) return t("history.hours_ago", { n: hours });
    return t("history.days_ago", { n: days });
  }

  useEffect(() => {
    if (!auth?.token) navigate("/commission/login");
  }, []);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--cosmic)" }}>
      <MeshBackground variant="minimal" />
      <CommissionSidebar onLogout={() => { logout(); navigate("/"); }} />

      <div className="flex-1 ml-14 relative" style={{ zIndex: 10 }}>
        {/* Header */}
        <header className="glass-dark sticky top-0 z-20" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-6 py-3.5 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">{t("history.title")}</h1>
              <div className="hud-label">{t("history.subtitle")}</div>
            </div>
            {history.length > 0 && (
              <button onClick={clearHistory} className="btn-secondary text-xs py-1.5 px-3" style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}>
                {t("history.clear")}
              </button>
            )}
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-6 py-8">
          {history.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center mt-20"
            >
              <div style={{ fontSize: 52, opacity: 0.2, marginBottom: 12 }}>↺</div>
              <div className="text-white/40 text-sm">{t("history.empty_title")}</div>
              <div className="text-white/25 text-xs mt-1">{t("history.empty_desc")}</div>
            </motion.div>
          ) : (
            <div>
              <div className="hud-label mb-4">{t("history.count", { count: history.length })}</div>
              <AnimatePresence>
                <div className="space-y-2">
                  {history.map((entry, i) => {
                    const confirmed = isConfirmed(entry.anonymous_id);
                    return (
                      <motion.div
                        key={entry.anonymous_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        exit={{ opacity: 0, x: 10 }}
                        onClick={() => navigate(`/commission/candidate/${entry.anonymous_id}`)}
                        className="glass-card rounded-2xl p-4 cursor-pointer"
                        style={{ borderColor: "rgba(255,255,255,0.07)" }}
                        whileHover={{ borderColor: "rgba(255,255,255,0.18)", x: 2 }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Time icon */}
                            <div style={{
                              width: 38, height: 38, borderRadius: "50%",
                              background: confirmed ? "rgba(209,255,0,0.07)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${confirmed ? "rgba(209,255,0,0.25)" : "rgba(255,255,255,0.1)"}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "16px",
                              color: confirmed ? "var(--acid)" : "rgba(255,255,255,0.4)",
                              flexShrink: 0,
                            }}>
                              {confirmed ? "✓" : "◈"}
                            </div>
                            <div>
                              <div className="font-bold text-white text-sm">{entry.anonymous_id}</div>
                              <div className="text-white/35 text-xs mt-0.5">
                                {[entry.city, entry.age ? `${entry.age} ${t("history.age_suffix")}` : null].filter(Boolean).join(" · ")}
                                {entry.city || entry.age ? " · " : ""}{timeAgo(entry.viewed_at)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {entry.ai_score != null && (
                              <span className="hud-mono text-sm" style={{ color: "var(--acid)" }}>
                                {Math.round(entry.ai_score)}
                              </span>
                            )}
                            {confirmed ? (
                              <span style={{ background: "rgba(209,255,0,0.1)", border: "1px solid rgba(209,255,0,0.35)", color: "var(--acid)", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                              {t("history.confirmed")}
                            </span>
                            ) : (
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)", padding: "3px 10px", borderRadius: 8, fontSize: 11 }}>
                                {t("history.viewed")}
                              </span>
                            )}
                            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "18px" }}>›</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
