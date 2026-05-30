import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useCommission } from "../../context/CommissionContext";
import { commissionApi } from "../../api/client";
import { MeshBackground } from "../../components/MeshBackground";
import { CommissionSidebar } from "../../components/CommissionSidebar";
import { useTranslation } from "react-i18next";
import type { CommissionListItem } from "../../types";

function StatusPill({ item, isConfirmed, t }: { item: CommissionListItem; isConfirmed: boolean; t: (key: string) => string }) {
  if (isConfirmed) return (
    <span style={{ background: "rgba(209,255,0,0.1)", border: "1px solid rgba(209,255,0,0.4)", color: "var(--acid)", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
      ✓ CONFIRMED
    </span>
  );
  if (item.ai_evaluation_in_progress) return (
    <span style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.35)", color: "#7dd3fc", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
      {t("dashboard.status_evaluating")}
    </span>
  );
  if ((item.ai_detection_score ?? 0) > 0.55) return (
    <span style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, animation: "pulse 2s infinite" }}>
      ⚠ AI SUSPICION
    </span>
  );
  if (item.scored_at) return (
    <span style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
      AI REVIEWED
    </span>
  );
  return (
    <span style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)", padding: "3px 10px", borderRadius: 8, fontSize: 11 }}>
      PENDING
    </span>
  );
}

export function CommissionSearch() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const { isConfirmed } = useCommission();
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [allCandidates, setAllCandidates] = useState<CommissionListItem[]>([]);
  const [results, setResults] = useState<CommissionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!auth?.token) { navigate("/commission/login"); return; }
    // Pre-fetch candidate list
    commissionApi.list().then(data => setAllCandidates(data.candidates)).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  function doSearch(q: string) {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setTimeout(() => {
      const found = allCandidates.filter(c =>
        c.anonymous_id.toLowerCase().includes(trimmed) ||
        (c.city ?? "").toLowerCase().includes(trimmed)
      );
      setResults(found);
      setSearched(true);
      setLoading(false);
    }, 300);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") doSearch(query);
    if (e.key === "Escape") { setQuery(""); setResults([]); setSearched(false); }
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--cosmic)" }}>
      <MeshBackground variant="minimal" />
      <CommissionSidebar onLogout={() => { logout(); navigate("/"); }} />

      <div className="flex-1 ml-14 relative" style={{ zIndex: 10 }}>
        {/* Header */}
        <header className="glass-dark sticky top-0 z-20" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-6 py-3.5 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">{t("search.title")}</h1>
              <div className="hud-label">{t("search.subtitle")}</div>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-6 py-10">
          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-8"
          >
            {/* Radar icon */}
            <div style={{
              position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.35)", fontSize: "18px", pointerEvents: "none",
            }}>◎</div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); if (e.target.value === "") { setResults([]); setSearched(false); } }}
              onKeyDown={handleKey}
              placeholder={t("search.placeholder")}
              className="input"
              style={{
                width: "100%", paddingLeft: "44px", paddingRight: "120px",
                height: "52px", fontSize: "15px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.04)",
              }}
            />
            {query && (
              <button
                onClick={() => { setQuery(""); setResults([]); setSearched(false); inputRef.current?.focus(); }}
                style={{ position: "absolute", right: "100px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", fontSize: "16px", cursor: "pointer", background: "none", border: "none" }}
              >✕</button>
            )}
            <button
              onClick={() => doSearch(query)}
              className="btn-primary"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: "6px 18px", fontSize: "13px" }}
            >
              {t("search.btn")}
            </button>
          </motion.div>

          {/* Hints */}
          {!searched && !loading && (
            <div className="text-center text-white/25 text-sm mt-16">
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>◎</div>
              <div>{t("search.hint1")}</div>
              <div className="mt-2 text-xs">{t("search.hint2")}</div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center text-white/40 mt-12">
              <div style={{ fontSize: 32, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</div>
              <div className="mt-3 text-sm">{t("search.scanning")}</div>
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {searched && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="hud-label mb-3">
                  {results.length > 0 ? t("search.results_found", { count: results.length }) : t("search.no_results")}
                </div>

                {results.length === 0 && (
                  <div className="glass-card rounded-2xl p-8 text-center">
                    <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 10 }}>∅</div>
                    <div className="text-white/40 text-sm">{t("search.no_match", { q: query })}</div>
                    <div className="text-white/25 text-xs mt-1">{t("search.try_different")}</div>
                  </div>
                )}

                <div className="space-y-2">
                  {results.map((c, i) => (
                    <motion.div
                      key={c.anonymous_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => navigate(`/commission/candidate/${c.anonymous_id}`)}
                      className="glass-card rounded-2xl p-4 cursor-pointer"
                      style={{ borderColor: "rgba(255,255,255,0.07)" }}
                      whileHover={{ borderColor: "rgba(255,255,255,0.18)", x: 2 }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div style={{
                            width: 40, height: 40, borderRadius: "50%",
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "15px", color: "rgba(255,255,255,0.4)",
                          }}>◈</div>
                          <div>
                            <div className="font-bold text-white text-sm">{c.anonymous_id}</div>
                            <div className="text-white/40 text-xs mt-0.5">
                              {[c.city, c.age ? `${c.age} ${t("search.age_suffix")}` : null].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {c.ai_score != null && (
                            <span className="hud-mono text-sm" style={{ color: "var(--acid)" }}>
                              {Math.round(c.ai_score)}
                            </span>
                          )}
                          <StatusPill item={c} isConfirmed={isConfirmed(c.anonymous_id)} t={t} />
                          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "18px" }}>›</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
