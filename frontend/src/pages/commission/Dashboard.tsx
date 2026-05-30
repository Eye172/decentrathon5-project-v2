import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { commissionApi, setAuthToken } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useCommission } from "../../context/CommissionContext";
import type { CommissionListItem, CommissionRanking } from "../../types";
import { AiDetectionBadge } from "../../components/AiDetectionBadge";
import { motion } from "framer-motion";
import { MeshBackground } from "../../components/MeshBackground";
import { CommissionSidebar } from "../../components/CommissionSidebar";
import { useTranslation } from "react-i18next";

// ─── Filter types ─────────────────────────────────────────────
type FilterMode = "all" | "pending_review" | "ai_suspicion" | "confirmed" | "completed";

export function CommissionDashboard() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings, isConfirmed } = useCommission();

  const FILTER_OPTIONS: { id: FilterMode; label: string }[] = [
    { id: "all", label: t('dashboard.filter_all') },
    { id: "completed", label: t('dashboard.filter_completed') },
    { id: "pending_review", label: t('dashboard.filter_pending') },
    { id: "ai_suspicion", label: t('dashboard.filter_ai_suspicion') },
    { id: "confirmed", label: t('dashboard.filter_confirmed') },
  ];
  const [ranking, setRanking] = useState<CommissionRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortBy, setSortBy] = useState<"score" | "date" | "status">("score");
  const [search, setSearch] = useState("");

  const suspThreshold = settings.ai_threshold / 100; // convert % to 0-1

  useEffect(() => {
    if (!auth?.token) { navigate("/commission/login"); return; }
    setAuthToken(auth.token);
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, []);

  async function load() {
    try {
      const data = await commissionApi.list();
      setRanking(data);
    } finally {
      setLoading(false);
    }
  }

  const candidates = ranking?.candidates ?? [];

  const filtered = candidates
    .filter(c => {
      if (filter === "completed") return c.application_step >= 4;
      if (filter === "pending_review") return c.ai_score !== null && !isConfirmed(c.anonymous_id);
      if (filter === "ai_suspicion") return (c.ai_detection_score ?? 0) > suspThreshold;
      if (filter === "confirmed") return isConfirmed(c.anonymous_id);
      return true;
    })
    .filter(c => {
      if (!search) return true;
      return c.anonymous_id.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sortBy === "score") return (b.ai_score ?? -1) - (a.ai_score ?? -1);
      if (sortBy === "date") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return (b.application_step) - (a.application_step);
    });

  const aiSuspicion = candidates.filter(c => (c.ai_detection_score ?? 0) > suspThreshold).length;
  const aiReviewed = candidates.filter(c => c.ai_score !== null).length;
  const confirmedCount = candidates.filter(c => isConfirmed(c.anonymous_id)).length;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--cosmic)" }}>
      <MeshBackground variant="default" />

      {/* Left sidebar */}
      <CommissionSidebar onLogout={() => { logout(); navigate("/"); }} />

      {/* Main content */}
      <div className="flex-1 ml-14 relative" style={{ zIndex: 10 }}>
        {/* Top bar */}
        <header className="glass-dark sticky top-0 z-20" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                  style={{ color: "var(--acid)", opacity: 0.85 }}
                >
                  {t("dashboard.header_eyebrow")}
                </span>
                <span className="h-px w-8 shrink-0" style={{ background: "linear-gradient(90deg, var(--acid), transparent)" }} aria-hidden />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">{t('dashboard.leaderboard_title')}</h1>
              <p className="text-xs text-white/40 mt-0.5 max-w-xl leading-relaxed">{t('dashboard.leaderboard_subtitle')}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="status-dot" />
                <span className="hud-mono text-[10px] sm:text-[11px] tracking-widest">LIVE</span>
              </div>
              <button onClick={load} className="btn-secondary text-sm py-2 px-3">
                {t('dashboard.refresh')}
              </button>
            </div>
          </div>
        </header>

        <div className="px-6 py-6">
          {/* Stats grid */}
          {ranking && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
            >
              <StatCard label={t('dashboard.stat_applications')} value={ranking.total} color="var(--acid)" idx={0} icon={<StatIconApplications />} />
              <StatCard label={t('dashboard.stat_ai_reviewed')} value={aiReviewed} color="#60a5fa" idx={1} icon={<StatIconNeural />} />
              <StatCard label={t('dashboard.stat_human_confirmed')} value={confirmedCount} color="#34d399" idx={2} icon={<StatIconVerified />} />
              <StatCard label={t('dashboard.stat_ai_suspicion')} value={aiSuspicion} color="#f87171" idx={3} icon={<StatIconAlert />} />
            </motion.div>
          )}

          {/* Filter + Search bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12 }}
            className="flex flex-wrap items-center gap-3 mb-5"
          >
            {/* Filter chips */}
            <div className="flex gap-2 flex-wrap">
              {FILTER_OPTIONS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`text-xs px-4 py-2 rounded-xl font-medium transition-all ${
                    filter === f.id ? "text-black font-bold" : "glass text-white/55 hover:text-white"
                  }`}
                  style={filter === f.id ? { background: "var(--acid)" } : {}}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div style={{ flexGrow: 1 }} />

            {/* Sort */}
            <select
              className="input text-xs py-2 px-3 rounded-xl"
              style={{ width: "auto", resize: "none" }}
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="score">{t('dashboard.sort_score')}</option>
              <option value="date">{t('dashboard.sort_date')}</option>
              <option value="status">{t('dashboard.sort_status')}</option>
            </select>

            {/* Search */}
            <input
              className="input text-xs py-2 px-3 rounded-xl"
              style={{ width: "160px" }}
              placeholder={t('dashboard.search_id_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </motion.div>

          {/* Anonymity notice */}
          <div className="glass rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2.5"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" />
              <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-white/38">{t('dashboard.anon_notice_text')}</span>
          </div>

          {/* Table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="glass-card rounded-2xl overflow-hidden"
          >
            <div className="hud-corner hud-corner-tl" />
            <div className="hud-corner hud-corner-tr" />

            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <h2 className="font-semibold text-white">
                {t('dashboard.candidates_title')}
                <span className="text-white/28 font-normal text-sm ml-2">({filtered.length})</span>
              </h2>
              <span className="hud-mono">{t('dashboard.matrix_view')}</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="relative w-8 h-8 mr-3">
                  <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "var(--acid)" }} />
                </div>
                <span className="text-white/35">{t('dashboard.loading_candidates')}</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 px-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 mx-auto"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.2) inset",
                  }}
                >
                  <EmptyStateIcon className="text-white/25" />
                </div>
                <p className="text-sm font-medium text-white/45">{t('dashboard.no_candidates_filter')}</p>
                <p className="text-xs text-white/22 mt-2 max-w-xs mx-auto leading-relaxed">{t("dashboard.empty_state_hint")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto touch-pan-x" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full text-sm">
                  <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <tr>
                      {[t('dashboard.col_rank'), "ID", t('dashboard.col_progress'), t('dashboard.col_ai_score'), t('dashboard.col_baseline'), t('dashboard.col_ai_detection'), t('dashboard.col_status'), ""].map((h, i) => (
                        <th key={i} className={`px-${i === 0 ? "4" : "4"} py-3 text-left`}>
                          <span className="hud-label tracking-wider">{h}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => (
                      <CandidateRow
                        key={c.anonymous_id}
                        c={c}
                        rank={i + 1}
                        isConfirmed={isConfirmed(c.anonymous_id)}
                        suspThreshold={suspThreshold}
                        onClick={() => navigate(`/commission/candidate/${c.anonymous_id}`)}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>

          <p className="text-center text-xs text-white/18 mt-6">
            {t('dashboard.footer_note')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────
function CandidateRow({ c, rank, onClick, isConfirmed, suspThreshold, t }: {
  c: CommissionListItem;
  rank: number;
  onClick: () => void;
  isConfirmed: boolean;
  suspThreshold: number;
  t: (key: string) => string;
}) {
  const step = c.application_step;
  const stepLabels = [t('dashboard.step_0'), t('dashboard.step_1'), "Timeline", t('dashboard.step_3'), t('dashboard.step_4')];
  const stepLabel = stepLabels[Math.min(step, 4)];
  const stepColor = ["text-white/25", "text-orange-400/70", "text-yellow-400/70", "text-blue-400/70", ""][Math.min(step, 4)];
  const score = c.ai_score !== null && c.ai_score !== undefined ? Math.round(c.ai_score) : null;

  const aiSusp = (c.ai_detection_score ?? 0) > suspThreshold;

  const statusLabel = isConfirmed
    ? t('dashboard.status_confirmed')
    : c.ai_evaluation_in_progress
      ? t('dashboard.status_evaluating')
      : c.ai_score !== null
        ? (aiSusp ? t('dashboard.status_ai_suspicion') : t('dashboard.status_ai_reviewed'))
        : t('dashboard.status_pending');
  const statusColor = isConfirmed
    ? "var(--acid)"
    : c.ai_evaluation_in_progress
      ? "#7dd3fc"
      : c.ai_score !== null
        ? (aiSusp ? "#f87171" : "#facc15")
        : "rgba(255,255,255,0.3)";
  const statusBg = isConfirmed
    ? "rgba(209,255,0,0.08)"
    : c.ai_evaluation_in_progress
      ? "rgba(56,189,248,0.1)"
      : c.ai_score !== null
        ? (aiSusp ? "rgba(248,113,113,0.08)" : "rgba(250,204,21,0.06)")
        : "rgba(255,255,255,0.04)";

  return (
    <tr
      className="group cursor-pointer transition-colors"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <td className="px-4 py-4">
        <span className="hud-mono text-white/28">#{rank}</span>
      </td>
      <td className="px-4 py-4">
        <span className="font-mono font-bold text-base" style={{ color: "var(--acid)" }}>{c.anonymous_id}</span>
        <div className="hud-label mt-0.5">
          {c.age ? `${c.age} y.o.` : "—"} · {c.city ?? "—"}
        </div>
      </td>
      <td className="px-4 py-4">
        <span className={`text-xs font-medium ${stepColor}`}>{stepLabel}</span>
        <div className="mt-1 h-1 rounded-full w-24" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div style={{
            height: "100%", borderRadius: "2px",
            background: "var(--acid)",
            width: `${(Math.min(step, 4) / 4) * 100}%`,
          }} />
        </div>
      </td>
      <td className="px-4 py-4">
        {c.ai_evaluation_in_progress ? (
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-sky-400/35 bg-sky-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
            </span>
          </span>
        ) : score !== null ? (
          <ScoreCircle score={score} />
        ) : (
          <span className="text-white/22 text-xs font-mono">—</span>
        )}
      </td>
      <td className="px-4 py-4 text-white/40 text-sm font-mono">
        {c.baseline_score !== null && c.baseline_score !== undefined ? Math.round(c.baseline_score) : "—"}
      </td>
      <td className="px-4 py-4">
        <AiDetectionBadge score={c.ai_detection_score ?? null} />
      </td>
      <td className="px-4 py-4">
        <span style={{
          fontSize: "11px", fontWeight: "600",
          color: statusColor, background: statusBg,
          border: `1px solid ${statusColor}33`,
          padding: "3px 8px", borderRadius: "6px",
          fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.04em",
        }}>
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-4">
        <span className="text-xs font-semibold transition-all px-3 py-1.5 rounded-lg group-hover:opacity-75"
          style={{ color: "var(--acid)", background: "rgba(209,255,0,0.07)", border: "1px solid rgba(209,255,0,0.15)" }}>
          {t('dashboard.view_btn')}
        </span>
      </td>
    </tr>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const [c, bg, bd] =
    score >= 75 ? ["var(--acid)", "rgba(209,255,0,0.08)", "rgba(209,255,0,0.3)"]
    : score >= 55 ? ["#facc15", "rgba(250,204,21,0.08)", "rgba(250,204,21,0.3)"]
    : ["#f87171", "rgba(248,113,113,0.08)", "rgba(248,113,113,0.3)"];
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 font-bold text-sm font-mono"
      style={{ color: c, background: bg, borderColor: bd }}>
      {score}
    </span>
  );
}

function StatCard({ label, value, color, icon, idx }: { label: string; value: number; color: string; icon: ReactNode; idx: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: idx * 0.06 }}
      className="glass-card rounded-2xl p-5 relative overflow-hidden group"
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 32px 64px -36px rgba(0,0,0,0.65)",
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-[3px] opacity-90"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full opacity-[0.06] blur-2xl transition-opacity group-hover:opacity-[0.1]"
        style={{ background: color }}
        aria-hidden
      />
      <div className="hud-corner hud-corner-tl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pt-1">
          <div className="text-[2.25rem] sm:text-[2.5rem] font-black tabular-nums leading-none tracking-tight text-white">
            {value}
          </div>
          <div className="hud-label mt-2.5 opacity-80 max-w-[11rem]">{label}</div>
        </div>
        <div
          className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl transition-colors"
          style={{
            color,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: `0 0 20px -8px ${color}`,
          }}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

function StatIconApplications() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StatIconNeural() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 9h6M9 15h6M12 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="9" r="1.25" fill="currentColor" />
      <circle cx="15" cy="9" r="1.25" fill="currentColor" />
      <circle cx="12" cy="15" r="1.25" fill="currentColor" />
    </svg>
  );
}

function StatIconVerified() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 4v6c0 5-3.5 8.5-7 9.5-3.5-1-7-4.5-7-9.5V7l7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatIconAlert() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M10.3 3.9L2.6 18.1A2 2 0 0 0 4.3 21h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyStateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 13h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}
