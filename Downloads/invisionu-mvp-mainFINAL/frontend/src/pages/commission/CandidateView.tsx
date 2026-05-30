import { useEffect, useState, useRef, useMemo, useId } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { commissionApi, setAuthToken } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useCommission } from "../../context/CommissionContext";
import type { EyeCalibration } from "../../context/CommissionContext";
import type { CommissionDetail, InterviewMessage, TimelineEvent, BehaviorMetrics, BlendshapeEntry } from "../../types";
import { motion, AnimatePresence } from "framer-motion";
import { MeshBackground } from "../../components/MeshBackground";
import { CommissionSidebar } from "../../components/CommissionSidebar";
import { GritPeakMountain } from "../../components/GritPeakMountain";
import { useTranslation } from "react-i18next";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const TAB_IDS = ["overview", "path", "resilience", "leadership", "motivation", "detector", "transcript"];

export function CommissionCandidateView() {
  const { anonymousId } = useParams<{ anonymousId: string }>();
  const { auth } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings, isConfirmed, confirmCandidate, addToHistory } = useCommission();

  const TABS = [
    { id: "overview", label: t('candidate_view.tab_overview') },
    { id: "path", label: t('candidate_view.tab_path') },
    { id: "resilience", label: t('candidate_view.tab_resilience') },
    { id: "leadership", label: t('candidate_view.tab_leadership') },
    { id: "motivation", label: t('candidate_view.tab_motivation') },
    { id: "detector", label: t('candidate_view.tab_detector') },
    { id: "transcript", label: t('candidate_view.tab_transcript') },
  ];

  const [candidate, setCandidate] = useState<CommissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentErr, setCommentErr] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  // Confirmed state lives in context (persistent)
  const confirmed = anonymousId ? isConfirmed(anonymousId) : false;

  const suspThreshold = settings.ai_threshold; // percent 0-100

  useEffect(() => {
    if (!auth?.token) { navigate("/commission/login"); return; }
    setAuthToken(auth.token);
    if (anonymousId) load();
  }, [anonymousId]);

  useEffect(() => {
    if (!anonymousId || !auth?.token || !candidate?.ai_evaluation_in_progress) return;
    const id = window.setInterval(() => {
      commissionApi.get(anonymousId).then(setCandidate).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [anonymousId, auth?.token, candidate?.ai_evaluation_in_progress]);

  useEffect(() => {
    setEditMode(false);
  }, [anonymousId]);

  useEffect(() => {
    if (!candidate || editMode) return;
    setCommentDraft(candidate.commission_comment ?? "");
  }, [candidate, editMode]);

  async function load() {
    try {
      const data = await commissionApi.get(anonymousId!);
      setCandidate(data);
      // Add to history
      addToHistory({
        anonymous_id: data.anonymous_id,
        city: data.city,
        age: data.age,
        ai_score: data.ai_score ?? undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (anonymousId) confirmCandidate(anonymousId);
  }

  async function handleRescore() {
    setRescoring(true);
    try { await commissionApi.rescore(anonymousId!); await load(); }
    finally { setRescoring(false); }
  }

  async function handleSaveCommissionComment() {
    if (!anonymousId) return;
    setCommentSaving(true);
    setCommentErr(null);
    try {
      const data = await commissionApi.saveComment(anonymousId, commentDraft);
      setCandidate(data);
      setEditMode(false);
    } catch {
      setCommentErr(t("candidate_view.commission_comment_error"));
    } finally {
      setCommentSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cosmic)" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "var(--acid)" }} />
        </div>
        <span className="hud-label tracking-widest">{t('candidate_view.loading_profile')}</span>
      </div>
    </div>
  );

  if (!candidate) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cosmic)" }}>
      <div className="text-center">
        <p className="text-white/38 mb-4">{t('candidate_view.not_found')}</p>
        <button onClick={() => navigate("/commission")} className="btn-secondary text-sm">{t('candidate_view.back_leaderboard')}</button>
      </div>
    </div>
  );

  const bd = candidate.ai_score_breakdown;
  const det = candidate.ai_detection_details;
  const aiPct = Math.round((candidate.ai_detection_score ?? 0) * 100);
  const evaluating = candidate.ai_evaluation_in_progress === true;

  // Parse timeline from extra_activities
  let timelineEvents: TimelineEvent[] = [];
  try {
    if (candidate.extra_activities) {
      const parsed = JSON.parse(candidate.extra_activities);
      if (Array.isArray(parsed) && parsed[0]?.direction) timelineEvents = parsed;
    }
  } catch { /* ignore */ }

  // Parse SJT from leadership_examples
  let sjtAnswers: { scenario_id: number; chosen_option: string }[] = [];
  try {
    if (candidate.leadership_examples) {
      const parsed = JSON.parse(candidate.leadership_examples);
      if (Array.isArray(parsed) && parsed[0]?.scenario_id) sjtAnswers = parsed;
    }
  } catch { /* ignore */ }

  // Derived scores
  const pathScore = bd ? Math.round(bd.scores.growth_trajectory * (100 / 20)) : 0;
  const resScore = bd ? Math.round(bd.scores.skills_experience * (100 / 20)) : 0;
  const leaderScore = bd ? Math.round(bd.scores.leadership * (100 / 25)) : 0;
  const motivScore = bd ? Math.round(bd.scores.motivation * (100 / 25)) : 0;

  // XAI pipeline data for rich rendering
  const xai = (bd as any)?.xai_pipeline || {};
  const pathMod = xai?.agent02?.path_traveled_module || {};
  const psychMod = xai?.agent03?.resilience_and_motivation_module || {};
  const leadAssess = xai?.agent05?.leadership_assessment || {};
  const resMountain = psychMod?.resilience_mountain || {};
  const motFlame = psychMod?.motivation_flame || {};
  const dialArg = pathMod?.dialectical_argumentation || {};
  const leadDial = leadAssess?.dialectical_analysis || {};
  const execSummary = (bd as any)?.executive_summary || {};
  const commissionHints = (bd as any)?.commission_ai_assistant || {};

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden" style={{ background: "var(--cosmic)" }}>
      <MeshBackground variant="minimal" />
      <CommissionSidebar onLogout={() => navigate("/")} />

      <div className="flex-1 min-h-0 ml-14 flex flex-col relative" style={{ zIndex: 10 }}>
        {/* Top header */}
        <header className="glass-dark sticky top-0 z-20" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-6 py-3.5 flex items-center gap-4">
            <button
              onClick={() => navigate("/commission")}
              className="text-sm transition-colors hover:text-white/65"
              style={{ color: "rgba(255,255,255,0.32)" }}
            >
              {t('candidate_view.back_leaderboard')}
            </button>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
            <div className="font-mono font-bold text-base px-3 py-1 rounded-xl"
              style={{ color: "var(--acid)", background: "rgba(209,255,0,0.08)", border: "1px solid rgba(209,255,0,0.18)" }}>
              {candidate.anonymous_id}
            </div>
            <span className="text-white/38 text-sm">
              {candidate.age ? `${candidate.age} ${t('candidate_view.age_suffix')}` : "—"} · {candidate.city ?? "—"}
              {candidate.gpa ? ` · ${t('candidate_view.sidebar_gpa')} ${candidate.gpa.toFixed(1)}` : ""}
            </span>
            <div style={{ flexGrow: 1 }} />
            {evaluating && (
              <div style={{
                padding: "5px 12px", borderRadius: "10px",
                background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.35)",
                color: "#93c5fd", fontSize: "11px", fontFamily: "JetBrains Mono, monospace", fontWeight: "700",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
                </span>
                {t('candidate_view.header_eval_badge')}
              </div>
            )}
            {aiPct > suspThreshold && !evaluating && (
              <div style={{
                padding: "4px 10px", borderRadius: "8px",
                background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
                color: "#f87171", fontSize: "11px", fontFamily: "JetBrains Mono, monospace", fontWeight: "700",
                animation: "hudBlink 2s step-end infinite",
              }}>
                {t('candidate_view.ai_suspicion_badge')}
              </div>
            )}
            <button onClick={handleRescore} disabled={rescoring || evaluating} className="btn-secondary text-sm px-4 py-2">
              {rescoring ? t('candidate_view.rescoring') : t('candidate_view.rescore_btn')}
            </button>
          </div>
        </header>

        {/* Tab navigation */}
        <div ref={tabsRef} className="glass-dark sticky top-[57px] z-19" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-6 flex gap-1 py-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontFamily: "JetBrains Mono, monospace",
                  letterSpacing: "0.04em",
                  borderRadius: "8px",
                  border: "none",
                  background: activeTab === tab.id ? "rgba(209,255,0,0.1)" : "transparent",
                  color: activeTab === tab.id ? "var(--acid)" : "rgba(255,255,255,0.38)",
                  cursor: "pointer",
                  transition: "all 0.18s",
                  fontWeight: activeTab === tab.id ? "700" : "400",
                  borderBottom: activeTab === tab.id ? "2px solid var(--acid)" : "2px solid transparent",
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {evaluating && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 rounded-xl px-4 py-3 flex items-center gap-3"
                style={{
                  background: "linear-gradient(90deg, rgba(56,189,248,0.08), rgba(209,255,0,0.04))",
                  border: "1px solid rgba(56,189,248,0.22)",
                }}
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-50" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-400" />
                </span>
                <p className="text-sm text-white/70 leading-snug">
                  <span className="font-semibold text-sky-200/95">{t('candidate_view.evaluation_running_title')}</span>
                  {" — "}
                  <span className="text-white/45">{t('candidate_view.evaluation_running_hint')}</span>
                </p>
              </motion.div>
            )}
            <AnimatePresence mode="wait">

              {/* ── Tab 1: Overview ── */}
              {activeTab === "overview" && (
                <TabContent key="overview">
                  <div className="grid grid-cols-3 gap-6">
                    {/* Left: Profile info */}
                    <div className="space-y-4">
                      <GlassCard title={t('candidate_view.card_profile')}>
                        <dl className="space-y-3 text-sm mt-3">
                          <InfoRow label={t('candidate_view.label_id')} value={<span className="font-mono font-bold" style={{ color: "var(--acid)" }}>{candidate.anonymous_id}</span>} />
                          <InfoRow label={t('candidate_view.sidebar_age')} value={candidate.age ? `${candidate.age} ${t('candidate_view.age_suffix')}` : "—"} />
                          <InfoRow label={t('candidate_view.sidebar_city')} value={candidate.city ?? "—"} />
                          <InfoRow label={t('candidate_view.sidebar_gpa')} value={candidate.gpa ? `${candidate.gpa.toFixed(1)} / 5.0` : "—"} />
                          <InfoRow label={t('candidate_view.label_ielts')} value={candidate.ielts_overall != null ? String(candidate.ielts_overall) : "—"} />
                          <InfoRow label={t('candidate_view.label_ent')} value={candidate.ent_score != null ? String(candidate.ent_score) : "—"} />
                          <InfoRow label={t('candidate_view.sidebar_status')} value={
                            <span style={{ color: "var(--acid)", fontSize: "11px" }}>
                              {t('candidate_view.application_step_short', { n: candidate.application_step, max: 4 })}
                            </span>
                          } />
                        </dl>
                      </GlassCard>

                      {candidate.commission_comment?.trim() ? (
                        <GlassCard title={t("candidate_view.commission_comment_label")}>
                          <p className="text-sm text-white/65 whitespace-pre-wrap mt-2 leading-relaxed">
                            {candidate.commission_comment}
                          </p>
                        </GlassCard>
                      ) : null}

                      {/* Anti-AI widget */}
                      <GlassCard title={t('candidate_view.card_authenticity')}>
                        <div className="flex flex-col items-center py-4">
                          {evaluating && !bd ? (
                            <>
                              <div className="relative w-24 h-24 rounded-full border-2 border-dashed border-white/15 flex items-center justify-center mb-2">
                                <div className="absolute inset-2 rounded-full border border-sky-400/30 animate-pulse" />
                                <span className="text-white/25 text-xs font-mono text-center px-2">{t('candidate_view.header_eval_badge')}</span>
                              </div>
                              <p className="text-xs text-center text-white/38 px-2">{t('candidate_view.authenticity_while_scoring')}</p>
                            </>
                          ) : (
                            <>
                              <ArcGauge value={100 - aiPct} label={t('candidate_view.gauge_authentic')} />
                              <p className="text-xs text-center mt-3" style={{
                                color: aiPct > suspThreshold ? "#f87171" : "rgba(255,255,255,0.4)"
                              }}>
                                {aiPct > suspThreshold
                                  ? t('candidate_view.ai_prob_high')
                                  : aiPct > suspThreshold * 0.6
                                  ? t('candidate_view.ai_prob_moderate')
                                  : t('candidate_view.ai_prob_low')}
                              </p>
                            </>
                          )}
                        </div>
                      </GlassCard>

                      {/* Confirm button */}
                      <button
                        onClick={handleConfirm}
                        disabled={confirmed}
                        className={confirmed ? "btn-secondary w-full py-3" : "btn-primary w-full py-3"}
                        style={confirmed ? { color: "var(--acid)", borderColor: "rgba(209,255,0,0.3)", opacity: 1 } : {}}
                      >
                        {confirmed ? t('candidate_view.confirmed_btn') : t('candidate_view.confirm_btn')}
                      </button>
                    </div>

                    {/* Center: Radar + summary */}
                    <div className="col-span-2 space-y-5">
                      {bd ? (
                        <>
                          <GlassCard title={t('candidate_view.card_competency_radar')} right={
                            <span className="text-3xl font-black" style={{ color: "var(--acid)", fontFamily: "'Space Grotesk', sans-serif" }}>
                              {Math.round(bd.total)}<span className="text-base text-white/28 font-normal ml-1">{t('candidate_view.score_out_of')}</span>
                            </span>
                          }>
                            <div className="flex justify-center py-4">
                              <RadarChart axes={[
                                { label: t('candidate_view.radar_axis_path'), value: bd.scores.growth_trajectory / 20 * 100 },
                                { label: t('candidate_view.radar_axis_leadership'), value: bd.scores.leadership / 25 * 100 },
                                { label: t('candidate_view.radar_axis_motivation'), value: bd.scores.motivation / 25 * 100 },
                                { label: t('candidate_view.radar_axis_resilience'), value: bd.scores.skills_experience / 20 * 100 },
                                { label: t('candidate_view.radar_axis_authenticity'), value: bd.scores.authenticity / 10 * 100 },
                              ]} />
                            </div>
                          </GlassCard>

                          {(bd.summary || execSummary?.one_liner_verdict) && (
                            <GlassCard title={t('candidate_view.card_ai_summary_short')}>
                              {execSummary?.one_liner_verdict && (
                                <p className="text-white font-semibold text-sm mt-2 mb-3 px-3 py-2 rounded-lg"
                                  style={{ background: "rgba(209,255,0,0.06)", border: "1px solid rgba(209,255,0,0.15)" }}>
                                  {execSummary.one_liner_verdict}
                                </p>
                              )}
                              {execSummary?.deep_analysis ? (
                                <div>
                                  <div className="hud-label mb-2">{t('candidate_view.card_ai_summary_short')}</div>
                                  <p className="text-white/72 leading-relaxed text-sm whitespace-pre-wrap">{execSummary.deep_analysis}</p>
                                </div>
                              ) : (
                                <p className="text-white/72 leading-relaxed text-sm mt-2">{bd.summary}</p>
                              )}
                              {bd.strengths?.length > 0 && (
                                <div className="mt-4">
                                  <div className="hud-label mb-2" style={{ color: "rgba(209,255,0,0.5)" }}>{t('candidate_view.strengths_hud')}</div>
                                  <ul className="space-y-1">
                                    {(execSummary?.key_strengths?.length ? execSummary.key_strengths : bd.strengths).map((s: string, i: number) => (
                                      <li key={i} className="text-sm text-white/62 flex gap-2">
                                        <span style={{ color: "var(--acid)" }}>✓</span>{s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {bd.concerns?.length > 0 && (
                                <div className="mt-3">
                                  <div className="hud-label mb-2 text-amber-400/55">{t('candidate_view.concerns_hud')}</div>
                                  <ul className="space-y-1">
                                    {(execSummary?.critical_risks?.length ? execSummary.critical_risks : bd.concerns).map((c: string, i: number) => (
                                      <li key={i} className="text-sm text-white/62 flex gap-2">
                                        <span className="text-amber-400">!</span>{c}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {/* Commission AI Assistant: suggested questions */}
                              {commissionHints?.suggested_interview_questions?.length > 0 && (
                                <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                                  <div className="hud-label mb-2" style={{ color: "rgba(96,165,250,0.6)" }}>РЕКОМЕНДУЕМЫЕ ВОПРОСЫ ДЛЯ ИНТЕРВЬЮ</div>
                                  <ul className="space-y-2">
                                    {commissionHints.suggested_interview_questions.map((q: string, i: number) => (
                                      <li key={i} className="text-xs text-white/55 flex gap-2">
                                        <span className="text-sky-400 flex-shrink-0">{i + 1}.</span>{q}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </GlassCard>
                          )}
                        </>
                      ) : evaluating ? (
                        <GlassCard title={t('candidate_view.evaluation_running_title')} right={
                          <span className="flex items-center gap-2 text-sky-300/90 text-xs font-mono font-bold">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-55" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
                            </span>
                            LIVE
                          </span>
                        }>
                          <p className="text-white/55 text-sm mt-2 leading-relaxed">{t('candidate_view.evaluation_running_body')}</p>
                          <p className="text-white/32 text-xs mt-4">{t('candidate_view.evaluation_running_hint')}</p>
                          <ul className="mt-6 space-y-2.5 text-left max-w-md">
                            {[t('candidate_view.evaluation_pipeline_step_1'), t('candidate_view.evaluation_pipeline_step_2'), t('candidate_view.evaluation_pipeline_step_3')].map((label, i) => (
                              <li key={i} className="flex items-center gap-3 text-xs text-white/45">
                                <span className="font-mono w-5 text-sky-400/80">{String(i + 1).padStart(2, "0")}</span>
                                <span className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent max-w-[120px]" />
                                <span className="text-white/55">{label}</span>
                                {i < 2 && (
                                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-sky-400/50 animate-pulse" />
                                )}
                              </li>
                            ))}
                          </ul>
                        </GlassCard>
                      ) : (
                        <GlassCard title={t('candidate_view.card_ai_score_pending')}>
                          <p className="text-white/32 text-sm mt-2">{t('candidate_view.analysis_not_ready')}</p>
                          <button onClick={handleRescore} className="btn-primary text-sm mt-4 px-5 py-2">
                            {t('candidate_view.run_ai_analysis')}
                          </button>
                        </GlassCard>
                      )}
                    </div>
                  </div>
                </TabContent>
              )}

              {/* ── Tab 2: Path Traveled ── */}
              {activeTab === "path" && (
                <TabContent key="path">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="hud-label mb-1">{t('candidate_view.path_hud')}</div>
                      <h2 className="text-2xl font-black text-white">{t('candidate_view.trajectory_title')}</h2>
                    </div>
                    <ScorePill value={evaluating && !bd ? null : pathScore} label={t('candidate_view.path_score_label')} outOf={t('candidate_view.score_out_of')} />
                  </div>

                  {/* AI-optimized timeline */}
                  <GlassCard title={t('candidate_view.life_map_card')}>
                    {timelineEvents.length > 0 ? (
                      <div className="mt-4 overflow-x-auto">
                        <CommissionTimeline events={timelineEvents} />
                      </div>
                    ) : (
                      <div className="py-8 text-center text-white/28 text-sm">
                        <p>{t('candidate_view.no_timeline')}</p>
                        {candidate.extra_activities && <p className="mt-2 text-xs">{candidate.extra_activities.substring(0, 100)}...</p>}
                      </div>
                    )}
                  </GlassCard>

                  {/* Argumentation - use rich XAI data first */}
                  {bd && (
                    <div className="mt-6">
                      <ArgumentBlock
                        title={t('candidate_view.path_arg_title')}
                        formula={t('candidate_view.path_formula')}
                        formulaDesc={t('candidate_view.path_formula_desc')}
                        positive={
                          (dialArg?.pro_growth_argument?.supporting_evidence?.length
                            ? dialArg.pro_growth_argument.supporting_evidence
                            : extractPoints(bd.criteria_explanations?.growth_trajectory, 'positive_points')) ||
                          [t('candidate_view.path_pos_extra'), t('candidate_view.path_neg_1')]
                        }
                        negative={
                          (dialArg?.risk_and_stagnation_audit?.weakness_points?.length
                            ? dialArg.risk_and_stagnation_audit.weakness_points
                            : extractPoints(bd.criteria_explanations?.growth_trajectory, 'negative_points')) ||
                          [t('candidate_view.path_neg_1'), t('candidate_view.path_neg_2')]
                        }
                        synthesis={
                          dialArg?.final_verdict ||
                          extractSynthesis(bd.criteria_explanations?.growth_trajectory) ||
                          t('candidate_view.path_synth', {
                            agility: pathScore >= 70 ? t('candidate_view.agility_above') : t('candidate_view.agility_developing'),
                            capacity: pathScore >= 70 ? t('candidate_view.capacity_strong') : t('candidate_view.capacity_moderate'),
                          })
                        }
                      />
                    </div>
                  )}

                  {/* Learning Agility Audit */}
                  {pathMod?.learning_agility_audit && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      {(['mental_agility', 'change_agility', 'results_agility'] as const).map((key) => {
                        const dim = (pathMod.learning_agility_audit as any)?.[key];
                        if (!dim) return null;
                        const labels: Record<string, string> = {
                          mental_agility: 'Ментальная гибкость',
                          change_agility: 'Гибкость к переменам',
                          results_agility: 'Ориентация на результат',
                        };
                        return (
                          <div key={key} className="glass-panel p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                            <div className="hud-label mb-1">{labels[key]}</div>
                            <div className="text-2xl font-black" style={{ color: "var(--acid)" }}>{dim.score}<span className="text-sm font-normal text-white/40">/10</span></div>
                            <p className="text-xs text-white/55 mt-2 leading-relaxed">{dim.analysis}</p>
                            {dim.quotes?.length > 0 && (
                              <p className="text-xs text-white/35 mt-2 italic border-l-2 pl-2" style={{ borderColor: "rgba(209,255,0,0.2)" }}>
                                «{dim.quotes[0]}»
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabContent>
              )}

              {/* ── Tab 3: Resilience ── */}
              {activeTab === "resilience" && (
                <TabContent key="resilience">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="hud-label mb-1">{t('candidate_view.resilience_hud')}</div>
                      <h2 className="text-2xl font-black text-white">{t('candidate_view.grit_title')}</h2>
                    </div>
                    <ScorePill value={evaluating && !bd ? null : resScore} label={t('candidate_view.grit_score_label')} outOf={t('candidate_view.score_out_of')} />
                  </div>

                  <div className="grid grid-cols-5 gap-6">
                    {/* Mountain visualization */}
                    <div className="col-span-3">
                      <GlassCard title={t('candidate_view.grit_peak_card')}>
                        {evaluating && !bd ? (
                          <p className="text-white/35 text-sm py-16 text-center px-4">{t('candidate_view.evaluation_scores_tab_hint')}</p>
                        ) : (
                          <GritPeakMountain score={resScore} candidate={candidate} />
                        )}
                      </GlassCard>
                    </div>

                    {/* Argumentation */}
                    <div className="col-span-2">
                      {evaluating && !bd ? (
                        <p className="text-white/35 text-sm pt-4">{t('candidate_view.evaluation_scores_tab_hint')}</p>
                      ) : (
                        <ArgumentBlock
                          title={t('candidate_view.res_arg_title')}
                          formula={t('candidate_view.res_formula')}
                          formulaDesc={t('candidate_view.res_formula_desc')}
                          positive={(() => {
                            const persev = resMountain?.grit_argumentation?.perseverance_evidence;
                            if (persev && typeof persev === 'string' && persev.length > 20) {
                              const parts = persev.split(/[.!?]\s+/).filter(Boolean).slice(0, 3);
                              return parts.length ? parts : [persev.slice(0, 200)];
                            }
                            return extractPoints(bd?.criteria_explanations?.skills_experience, 'positive_points') ||
                              [t('candidate_view.res_pos_fallback'), t('candidate_view.res_pos_2'), t('candidate_view.res_pos_3')];
                          })()}
                          negative={(() => {
                            const quitRisks = resMountain?.grit_argumentation?.quitting_risks;
                            if (quitRisks && typeof quitRisks === 'string' && quitRisks.length > 20) {
                              const parts = quitRisks.split(/[.!?]\s+/).filter(Boolean).slice(0, 2);
                              return parts.length ? parts : [quitRisks.slice(0, 180)];
                            }
                            return extractPoints(bd?.criteria_explanations?.skills_experience, 'negative_points') ||
                              [t('candidate_view.res_neg_1'), t('candidate_view.res_neg_2')];
                          })()}
                          synthesis={
                            psychMod?.synthesis_verdict ||
                            resMountain?.temporal_depth_analysis ||
                            extractSynthesis(bd?.criteria_explanations?.skills_experience) ||
                            (resScore >= 65 ? t('candidate_view.res_synth_strong', { score: resScore }) : t('candidate_view.res_synth_weak', { score: resScore }))
                          }
                        />
                      )}
                    </div>
                  </div>

                  {/* Hardship Quotes */}
                  {resMountain?.hardship_quotes?.length > 0 && (
                    <div className="mt-6">
                      <div className="hud-label mb-3">ЦИТАТЫ О ПРЕОДОЛЕНИИ</div>
                      <div className="grid grid-cols-2 gap-3">
                        {(resMountain.hardship_quotes as Array<{quote: string; context: string; font_style?: string}>).slice(0, 4).map((item, i) => (
                          <div key={i} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <p className="text-sm text-white/72 italic leading-relaxed">«{item.quote}»</p>
                            {item.context && <p className="text-xs text-white/35 mt-2">{item.context}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabContent>
              )}

              {/* ── Tab 4: Leadership ── */}
              {activeTab === "leadership" && (
                <TabContent key="leadership">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="hud-label mb-1">{t('candidate_view.leadership_hud')}</div>
                      <h2 className="text-2xl font-black text-white">{t('candidate_view.leadership_potential_title')}</h2>
                    </div>
                    <ScorePill value={evaluating && !bd ? null : leaderScore} label={t('candidate_view.leadership_score_short')} outOf={t('candidate_view.score_out_of')} />
                  </div>

                  {evaluating && !bd ? (
                    <GlassCard title={t('candidate_view.leadership_scales_card')}>
                      <p className="text-white/35 text-sm py-12 text-center px-4">{t('candidate_view.evaluation_scores_tab_hint')}</p>
                    </GlassCard>
                  ) : (
                    <div className="grid grid-cols-5 gap-6">
                      <div className="col-span-2">
                        <GlassCard>
                          <LeadershipChart
                            transformational={Math.min(leaderScore, 100)}
                            responsibility={Math.min(Math.round(leaderScore * 0.85), 100)}
                            sjtVerbs={sjtAnswers}
                            essayText={candidate.essay || ""}
                          />
                        </GlassCard>
                      </div>

                      <div className="col-span-3">
                        <ArgumentBlock
                          title={t('candidate_view.lead_arg_title')}
                          formula={t('candidate_view.lead_formula')}
                          formulaDesc={t('candidate_view.lead_formula_desc')}
                          positive={
                            (leadDial?.pro_position?.arguments?.length
                              ? leadDial.pro_position.arguments
                              : extractPoints(bd?.criteria_explanations?.leadership, 'positive_points')) ||
                            [t('candidate_view.lead_pos_fallback'), t('candidate_view.lead_pos_2'), t('candidate_view.lead_pos_3')]
                          }
                          negative={
                            (leadDial?.con_position?.arguments?.length
                              ? leadDial.con_position.arguments
                              : extractPoints(bd?.criteria_explanations?.leadership, 'negative_points')) ||
                            [t('candidate_view.lead_neg_1'), t('candidate_view.lead_neg_2')]
                          }
                          synthesis={
                            leadDial?.synthesis_verdict ||
                            extractSynthesis(bd?.criteria_explanations?.leadership) ||
                            (leaderScore >= 65 ? t('candidate_view.lead_synth_strong', { score: leaderScore }) : t('candidate_view.lead_synth_weak', { score: leaderScore }))
                          }
                        />
                      </div>
                    </div>
                  )}

                  {/* Leadership Profile Summary */}
                  {leadAssess?.profile_summary && (
                    <div className="mt-6">
                      <GlassCard title="ПСИХОЛОГИЧЕСКИЙ ПОРТРЕТ ЛИДЕРА">
                        <p className="text-white/72 leading-relaxed text-sm mt-2 whitespace-pre-wrap">{leadAssess.profile_summary}</p>
                        {leadAssess?.transformational_pillars && (
                          <div className="mt-4 grid grid-cols-3 gap-3">
                            {(['intellectual_stimulation', 'individualized_consideration', 'idealized_influence'] as const).map((key) => {
                              const pillar = (leadAssess.transformational_pillars as any)?.[key];
                              if (!pillar) return null;
                              const labels: Record<string, string> = {
                                intellectual_stimulation: 'Интеллектуальная стимуляция',
                                individualized_consideration: 'Индивид. подход',
                                idealized_influence: 'Идеализированное влияние',
                              };
                              return (
                                <div key={key} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                                  <div className="hud-label mb-1" style={{ fontSize: "9px" }}>{labels[key]}</div>
                                  <p className="text-xs text-white/55 leading-relaxed">{pillar.analysis}</p>
                                  {pillar.evidence_quotes?.[0] && (
                                    <p className="text-xs text-white/30 mt-2 italic">«{pillar.evidence_quotes[0]}»</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </GlassCard>
                    </div>
                  )}
                </TabContent>
              )}

              {/* ── Tab 5: Motivation ── */}
              {activeTab === "motivation" && (
                <TabContent key="motivation">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="hud-label mb-1">{t('candidate_view.motivation_hud')}</div>
                      <h2 className="text-2xl font-black text-white">{t('candidate_view.motivation_profile_title')}</h2>
                    </div>
                    <ScorePill value={evaluating && !bd ? null : motivScore} label={t('candidate_view.motivation_score_short')} outOf={t('candidate_view.score_out_of')} />
                  </div>

                  {evaluating && !bd ? (
                    <GlassCard title={t('candidate_view.fire_wind_card')}>
                      <p className="text-white/35 text-sm py-12 text-center px-4">{t('candidate_view.evaluation_scores_tab_hint')}</p>
                    </GlassCard>
                  ) : (
                    <div className="grid grid-cols-5 gap-6">
                      <div className="col-span-2">
                        <GlassCard title={t('candidate_view.fire_wind_card')}>
                          <MotivationChart
                            innerScore={motFlame?.intrinsic_logs_score ?? motivScore}
                            outerScore={motFlame?.extrinsic_wind_score ?? (100 - motivScore)}
                            innerFactors={
                              (motFlame?.core_values_identified?.length
                                ? motFlame.core_values_identified
                                : null) ?? extractInnerMotivation(candidate)
                            }
                            outerFactors={
                              (motFlame?.external_pressures_identified?.length
                                ? motFlame.external_pressures_identified
                                : null) ?? extractOuterMotivation(candidate)
                            }
                          />
                        </GlassCard>
                      </div>

                      <div className="col-span-3">
                        <ArgumentBlock
                          title={t('candidate_view.mot_arg_title')}
                          formula={t('candidate_view.mot_formula')}
                          formulaDesc={t('candidate_view.mot_formula_desc')}
                          positive={(() => {
                            const drivers = motFlame?.sdt_argumentation?.authentic_drivers;
                            if (drivers && typeof drivers === 'string' && drivers.length > 20) {
                              const parts = drivers.split(/[.!?]\s+/).filter(Boolean).slice(0, 3);
                              return parts.length ? parts : [drivers.slice(0, 250)];
                            }
                            return extractPoints(bd?.criteria_explanations?.motivation, 'positive_points') ||
                              [t('candidate_view.mot_pos_fallback'), t('candidate_view.mot_pos_2'), t('candidate_view.mot_pos_3')];
                          })()}
                          negative={(() => {
                            const burnout = motFlame?.sdt_argumentation?.burnout_red_flags;
                            if (burnout && typeof burnout === 'string' && burnout.length > 20) {
                              const parts = burnout.split(/[.!?]\s+/).filter(Boolean).slice(0, 2);
                              return parts.length ? parts : [burnout.slice(0, 200)];
                            }
                            return extractPoints(bd?.criteria_explanations?.motivation, 'negative_points') ||
                              [t('candidate_view.mot_neg_1'), t('candidate_view.mot_neg_2')];
                          })()}
                          synthesis={
                            psychMod?.synthesis_verdict ||
                            motFlame?.psychological_deep_dive?.slice(0, 350) ||
                            extractSynthesis(bd?.criteria_explanations?.motivation) ||
                            (motivScore >= 65 ? t('candidate_view.mot_synth_strong', { score: motivScore }) : t('candidate_view.mot_synth_weak', { score: motivScore }))
                          }
                        />
                      </div>
                    </div>
                  )}

                  {/* Psychological Deep Dive */}
                  {motFlame?.psychological_deep_dive && (
                    <div className="mt-6">
                      <GlassCard title="ПСИХОЛОГИЧЕСКИЙ АНАЛИЗ МОТИВАЦИИ (SDT)">
                        <p className="text-white/72 leading-relaxed text-sm mt-2 whitespace-pre-wrap">{motFlame.psychological_deep_dive}</p>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          {motFlame?.core_values_identified?.length > 0 && (
                            <div>
                              <div className="hud-label mb-2" style={{ color: "rgba(209,255,0,0.5)" }}>ВНУТРЕННИЕ ЦЕННОСТИ (ДРОВА)</div>
                              <ul className="space-y-1">
                                {(motFlame.core_values_identified as string[]).map((v, i) => (
                                  <li key={i} className="text-sm text-white/62 flex gap-2">
                                    <span style={{ color: "var(--acid)" }}>✦</span>{v}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {motFlame?.external_pressures_identified?.length > 0 && (
                            <div>
                              <div className="hud-label mb-2 text-amber-400/55">ВНЕШНЕЕ ДАВЛЕНИЕ (ВЕТЕР)</div>
                              <ul className="space-y-1">
                                {(motFlame.external_pressures_identified as string[]).map((p, i) => (
                                  <li key={i} className="text-sm text-white/62 flex gap-2">
                                    <span className="text-amber-400">↗</span>{p}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </GlassCard>
                    </div>
                  )}
                </TabContent>
              )}

              {/* ── Tab 6: AI Detector ── */}
              {activeTab === "detector" && (
                <TabContent key="detector">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="hud-label mb-1">{t('candidate_view.detector_hud')}</div>
                      <h2 className="text-2xl font-black text-white">{t('candidate_view.detector_title')}</h2>
                    </div>
                    {aiPct > suspThreshold && !evaluating && (
                      <div style={{
                        padding: "8px 16px", borderRadius: "10px",
                        background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.35)",
                        color: "#f87171", fontFamily: "JetBrains Mono, monospace", fontSize: "12px", fontWeight: "700",
                      }}>
                        {t('candidate_view.suspicion_threshold', { val: suspThreshold })}
                      </div>
                    )}
                  </div>

                  {evaluating && !det ? (
                    <GlassCard title={t('candidate_view.detector_title')}>
                      <p className="text-white/45 text-sm mt-2 leading-relaxed">{t('candidate_view.detector_while_scoring')}</p>
                      <p className="text-white/28 text-xs mt-4">{t('candidate_view.evaluation_running_hint')}</p>
                    </GlassCard>
                  ) : (
                    <>
                  <div className="flex flex-wrap items-start gap-6 mb-8">
                    <div className="flex flex-col items-center">
                      <ArcGauge value={aiPct} label={t('candidate_view.gauge_ai_probability')} size={160} inverted />
                      <p className="text-xs text-white/40 mt-2 text-center">{t('candidate_view.overall_score')}</p>
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <ArcGauge value={Math.round(aiPct * 0.35)} label={t('candidate_view.perplexity_gauge')} size={90} inverted />
                        <div>
                          <div className="hud-label mb-1">{t('candidate_view.perplexity_block_title')}</div>
                          <p className="text-xs text-white/50 max-w-xs">
                            {t('candidate_view.perplexity_block_desc')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <ArcGauge value={Math.round(aiPct * 0.65)} label={t('candidate_view.style_gauge')} size={90} inverted />
                        <div>
                          <div className="hud-label mb-1">{t('candidate_view.style_block_title')}</div>
                          <p className="text-xs text-white/50 max-w-xs">
                            {t('candidate_view.style_block_desc')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Evidence blocks */}
                  {det ? (
                    <div className="grid grid-cols-2 gap-4">
                      {(det.human_signals ?? []).length > 0 && (
                        <GlassCard title={t('candidate_view.human_signals')}>
                          <ul className="space-y-2 mt-3">
                            {(det.human_signals ?? []).map((s: string, i: number) => (
                              <li key={i} className="text-xs text-white/55 flex gap-2">
                                <span style={{ color: "var(--acid)" }}>✓</span>{s}
                              </li>
                            ))}
                          </ul>
                        </GlassCard>
                      )}
                      {(det.ai_signals ?? []).length > 0 && (
                        <GlassCard title={t('candidate_view.ai_signals')}>
                          <ul className="space-y-2 mt-3">
                            {(det.ai_signals ?? []).map((s: string, i: number) => (
                              <li key={i} className="text-xs text-white/55 flex gap-2">
                                <span className="text-red-400">!</span>{s}
                              </li>
                            ))}
                          </ul>
                        </GlassCard>
                      )}
                      {det.reasoning && (
                        <div className="col-span-2 p-4 rounded-xl text-sm text-white/62"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="hud-label mb-2">{t('candidate_view.ai_analysis_conclusion')}</div>
                          {det.reasoning}
                        </div>
                      )}
                    </div>
                  ) : (
                    <GlassCard title={t('candidate_view.detection_details')}>
                      <p className="text-white/32 text-sm mt-2">
                        {t('candidate_view.detection_run_scoring')}
                      </p>
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <MetricBox label={t('candidate_view.metric_vocab_richness')} value="—%" />
                        <MetricBox label={t('candidate_view.metric_avg_sentence_short')} value={`— ${t('candidate_view.words_abbr')}`} />
                        <MetricBox label={t('candidate_view.metric_risk_level')} value="—" />
                      </div>
                    </GlassCard>
                  )}

                  {/* ── Video Behavior Analysis ─────────────────────────────── */}
                  <VideoBehaviorPanel metrics={candidate.behavior_metrics} />
                    </>
                  )}
                </TabContent>
              )}

              {/* ── Tab 7: Transcript ── */}
              {activeTab === "transcript" && (
                <TabContent key="transcript">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="hud-label mb-1">{t('candidate_view.transcript_hud')}</div>
                      <h2 className="text-2xl font-black text-white">{t('candidate_view.transcript_main_title')}</h2>
                    </div>
                  </div>

                  {/* Essay */}
                  {candidate.essay && (
                    <div className="mb-6">
                      <GlassCard title={t('candidate_view.micro_essay_card')}>
                        {candidate.achievements && (
                          <div className="mt-2 mb-3 px-3 py-2 rounded-lg text-xs text-white/45"
                            style={{ background: "rgba(209,255,0,0.04)", border: "1px solid rgba(209,255,0,0.12)" }}>
                            <span className="hud-label mr-2">{t('candidate_view.prompt_label')}</span>
                            {candidate.achievements}
                          </div>
                        )}
                        <p className="text-white/65 leading-relaxed text-sm whitespace-pre-wrap mt-2">
                          {candidate.essay}
                        </p>
                      </GlassCard>
                    </div>
                  )}

                  {/* Interview transcript */}
                  {candidate.interview_messages.length > 0 ? (
                    <GlassCard title={t('candidate_view.interview_messages_title', { count: candidate.interview_messages.length })}>
                      <div className="mt-4 space-y-3 font-mono text-xs"
                        style={{ maxHeight: "600px", overflowY: "auto" }}>
                        {candidate.interview_messages.map((msg, i) => (
                          <TranscriptLine key={msg.id} msg={msg} idx={i} />
                        ))}
                      </div>
                    </GlassCard>
                  ) : (
                    <GlassCard title={t('interview.title')}>
                      <p className="text-white/32 text-sm mt-2">{t('candidate_view.no_interview_transcript')}</p>
                    </GlassCard>
                  )}
                </TabContent>
              )}

            </AnimatePresence>
          </div>
        </div>

        {/* Commission note + bottom bar */}
        {editMode && (
          <div
            className="flex-shrink-0 px-6 py-3 z-20"
            style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,8,10,0.92)" }}
          >
            <label className="hud-label text-xs block mb-2">{t("candidate_view.commission_comment_label")}</label>
            <textarea
              className="input w-full text-sm"
              style={{ minHeight: "88px", resize: "vertical" }}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder={t("candidate_view.commission_comment_placeholder")}
            />
            {commentErr && <p className="text-red-400/90 text-xs mt-2">{commentErr}</p>}
          </div>
        )}
        <div className="glass-dark flex-shrink-0 sticky bottom-0 z-20"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", minHeight: "44px" }}>
          <div className="h-full px-6 py-2 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="status-dot flex-shrink-0" style={{ width: 5, height: 5 }} />
              <span className="hud-label truncate">{t('candidate_view.bottom_bar_candidate', { id: candidate.anonymous_id })}</span>
              {confirmed && <span className="hud-mono ml-3 flex-shrink-0" style={{ color: "var(--acid)" }}>{t('candidate_view.confirmed_badge')}</span>}
            </div>
            <div className="flex items-center gap-3">
              {editMode && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCommentDraft(candidate.commission_comment ?? "");
                      setCommentErr(null);
                      setEditMode(false);
                    }}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {t('candidate_view.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={commentSaving}
                    onClick={() => void handleSaveCommissionComment()}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    {commentSaving ? t("common.saving") : t('candidate_view.save_changes')}
                  </button>
                </>
              )}
              {!editMode && (
                <button
                  type="button"
                  onClick={() => {
                    setCommentDraft(candidate.commission_comment ?? "");
                    setCommentErr(null);
                    setEditMode(true);
                  }}
                  style={{
                    fontSize: "12px", fontWeight: "600",
                    padding: "6px 14px", borderRadius: "8px",
                    background: "rgba(209,255,0,0.1)",
                    border: "1px solid rgba(209,255,0,0.25)",
                    color: "var(--acid)",
                    cursor: "pointer",
                    fontFamily: "JetBrains Mono, monospace",
                    transition: "all 0.2s",
                  }}
                >
                  {t('candidate_view.edit_mode')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Side nav arrows */}
      {TAB_IDS.indexOf(activeTab) > 0 && (
        <SideArrow
          side="left"
          onClick={() => {
            const i = TAB_IDS.indexOf(activeTab);
            setActiveTab(TAB_IDS[i - 1]);
          }}
        />
      )}
      {TAB_IDS.indexOf(activeTab) < TAB_IDS.length - 1 && (
        <SideArrow
          side="right"
          onClick={() => {
            const i = TAB_IDS.indexOf(activeTab);
            setActiveTab(TAB_IDS[i + 1]);
          }}
        />
      )}
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────

function TabContent({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function GlassCard({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const showHead = (title != null && title !== "") || right != null;
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="hud-corner hud-corner-tl" />
      {showHead && (
        <div className="flex items-center justify-between mb-1">
          {title ? <h3 className="font-bold text-white text-sm">{title}</h3> : <div />}
          {right ?? null}
        </div>
      )}
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-white/32 flex-shrink-0 text-xs">{label}</dt>
      <dd className="font-medium text-white/72 text-right text-xs">{value}</dd>
    </div>
  );
}

function ScorePill({ value, label, outOf }: { value: number | null; label: string; outOf: string }) {
  if (value === null) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="text-4xl font-black text-white/22 font-mono tracking-tight">—</div>
        <div className="hud-label">{label}</div>
      </div>
    );
  }
  const color = value >= 70 ? "var(--acid)" : value >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="text-4xl font-black" style={{ color, fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}<span className="text-lg text-white/28 font-normal ml-1">{outOf}</span>
      </div>
      <div className="hud-label">{label}</div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <div className="hud-label mb-1">{label}</div>
      <div className="font-bold text-white/78 font-mono text-sm">{value}</div>
    </div>
  );
}

function SideArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      style={{
        position: "fixed",
        [side]: "70px",
        top: "50%", transform: "translateY(-50%)",
        width: 40, height: 40, borderRadius: "50%",
        backdropFilter: "blur(20px)",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.5)",
        cursor: "pointer",
        zIndex: 20,
        transition: "all 0.2s",
        fontSize: "18px",
      }}
    >
      {side === "left" ? "‹" : "›"}
    </motion.button>
  );
}

function ArgumentBlock({ title, formula, formulaDesc, positive, negative, synthesis }: {
  title: string; formula: string; formulaDesc: string;
  positive: string[]; negative: string[]; synthesis: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="hud-corner hud-corner-tl" />
      <h3 className="font-bold text-white mb-3">{title}</h3>

      {/* Formula */}
      <div className="mb-5 p-3 rounded-xl" style={{ background: "rgba(209,255,0,0.04)", border: "1px solid rgba(209,255,0,0.12)" }}>
        <div className="hud-label mb-1" style={{ color: "rgba(209,255,0,0.5)" }}>{t('candidate_view.argument_math_model')}</div>
        <div className="font-mono text-sm" style={{ color: "var(--acid)" }}>{formula}</div>
        <div className="text-xs text-white/38 mt-1">{formulaDesc}</div>
      </div>

      {/* Positive */}
      <div className="mb-4">
        <div className="hud-label mb-2" style={{ color: "rgba(209,255,0,0.5)" }}>{t('candidate_view.argument_positive')}</div>
        <ul className="space-y-2">
          {positive.map((p, i) => (
            <li key={i} className="flex gap-2 text-sm text-white/65 leading-relaxed">
              <span style={{ color: "var(--acid)", flexShrink: 0 }}>+</span>{p}
            </li>
          ))}
        </ul>
      </div>

      {/* Negative */}
      <div className="mb-4">
        <div className="hud-label mb-2 text-amber-400/55">{t('candidate_view.argument_constraining')}</div>
        <ul className="space-y-2">
          {negative.map((n, i) => (
            <li key={i} className="flex gap-2 text-sm text-white/55 leading-relaxed">
              <span className="text-amber-400 flex-shrink-0">−</span>{n}
            </li>
          ))}
        </ul>
      </div>

      {/* Synthesis */}
      <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="hud-label mb-2">{t('candidate_view.argument_synthesis')}</div>
        <p className="text-sm text-white/72 leading-relaxed">{synthesis}</p>
      </div>
    </div>
  );
}

// ─── Radar Chart (SVG) ────────────────────────────────────────
function RadarChart({ axes }: { axes: { label: string; value: number }[] }) {
  const n = axes.length;
  const size = 220;
  const cx = size / 2, cy = size / 2;
  const r = 80;

  function angle(i: number) { return (i / n) * 2 * Math.PI - Math.PI / 2; }
  function point(i: number, v: number) {
    const a = angle(i);
    const pct = v / 100;
    return [cx + r * pct * Math.cos(a), cy + r * pct * Math.sin(a)];
  }

  const polygon = axes.map((ax, i) => point(i, ax.value)).map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map(pct => (
        <polygon
          key={pct}
          points={axes.map((_, i) => {
            const a = angle(i);
            return `${cx + r * pct * Math.cos(a)},${cy + r * pct * Math.sin(a)}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      ))}

      {axes.map((_, i) => {
        const a = angle(i);
        return (
          <line key={i}
            x1={cx} y1={cy}
            x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
            stroke="rgba(255,255,255,0.07)" strokeWidth="1"
          />
        );
      })}

      <polygon
        points={polygon}
        fill="rgba(209,255,0,0.12)"
        stroke="var(--acid)"
        strokeWidth="2"
      />

      {axes.map((ax, i) => {
        const [x, y] = point(i, ax.value);
        return <circle key={ax.label} cx={x} cy={y} r="4" fill="var(--acid)" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />;
      })}

      {axes.map((ax, i) => {
        const a = angle(i);
        const lx = cx + (r + 18) * Math.cos(a);
        const ly = cy + (r + 18) * Math.sin(a);
        return (
          <text key={ax.label} x={lx} y={ly}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="rgba(255,255,255,0.45)"
            fontFamily="JetBrains Mono, monospace" letterSpacing="0.05em"
          >
            {ax.label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Arc Gauge (дуга + глубина; без отдельного фона-карточки) ─
function ArcGauge({ value, label, size = 120, inverted = false }: { value: number; label: string; size?: number; inverted?: boolean }) {
  const gid = useId().replace(/:/g, "");
  const svgH = size / 2 + 28;
  const r = (size / 2) - 16;
  const cx = size / 2;
  const cy = size / 2;
  const left = 16;
  const right = size - 16;
  const arcD = `M ${left} ${cy} A ${r} ${r} 0 0 1 ${right} ${cy}`;
  const circumference = Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100) / 100;
  const good = inverted ? "#60A5FA" : "#F59E0B";
  const mid = "#fbbf24";
  const bad = "#f87171";
  const color = inverted
    ? (value > 55 ? bad : value > 35 ? mid : good)
    : (value >= 70 ? good : value >= 45 ? mid : bad);

  const dashOffset = circumference * (1 - pct);
  const sw = size >= 140 ? 11 : size >= 100 ? 9 : 7;
  const fsVal = size > 100 ? 24 : 15;
  const fsLbl = size > 100 ? 8 : 6.5;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
        <defs>
          <linearGradient id={`${gid}-arcGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity={0.75} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
          <filter id={`${gid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* тёмная «колодца» под дугой */}
        <path
          d={arcD}
          fill="none"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={sw + 5}
          strokeLinecap="round"
          opacity={0.85}
        />
        <path
          d={arcD}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={sw + 2}
          strokeLinecap="round"
        />
        <path
          d={arcD}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={sw}
          strokeLinecap="round"
        />
        <path
          d={arcD}
          fill="none"
          stroke={`url(#${gid}-arcGrad)`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={`url(#${gid}-glow)`}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.35s ease" }}
        />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={fsVal}
          fill={color}
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight="900"
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
        >
          {value}%
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize={fsLbl}
          fill="rgba(255,255,255,0.38)"
          fontFamily="JetBrains Mono, monospace"
          letterSpacing="0.1em"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

// ─── Leadership Chart (thermometer + fist caps, tag cloud) ───
function LeadershipChart({ transformational, responsibility, sjtVerbs, essayText }: {
  transformational: number; responsibility: number;
  sjtVerbs: { scenario_id: number; chosen_option: string }[];
  essayText: string;
}) {
  const { t } = useTranslation();
  const total = Math.min(transformational + responsibility, 200);
  const compositePct = Math.min(100, Math.round((total / 200) * 100));
  const transPct = Math.min(100, Math.round(transformational));
  const respPct = Math.min(100, Math.round(responsibility));
  const verbs = extractVerbs(essayText, sjtVerbs);

  return (
    <div className="py-1">
      <div
        style={{
          textAlign: "center",
          fontSize: "13px",
          letterSpacing: "0.14em",
          fontWeight: 800,
          color: "rgba(255,255,255,0.88)",
          marginBottom: "20px",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
        }}
      >
        {String(t("candidate_view.leadership_potential_title")).toUpperCase()}
      </div>

      <div className="flex items-end justify-center gap-1.5 sm:gap-3 mb-5 px-1">
        <LeadershipThermometer
          label={t("candidate_view.lead_scale_transformational")}
          percent={transPct}
          barHeight={120}
          color="#60A5FA"
        />
        <LeadershipThermometer
          label={t("candidate_view.lead_scale_integrated")}
          percent={compositePct}
          barHeight={168}
          color="#F59E0B"
        />
        <LeadershipThermometer
          label={t("candidate_view.lead_scale_authentic")}
          percent={respPct}
          barHeight={142}
          color="#C084FC"
        />
      </div>

      {verbs.length > 0 && (
        <div
          className="flex flex-wrap gap-2 justify-center"
          style={{ paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          {verbs.map((v, i) => (
            <span
              key={i}
              style={{
                padding: "5px 11px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.035)",
                fontSize: "12px",
                color: "rgba(255,255,255,0.52)",
                fontFamily: "ui-monospace, JetBrains Mono, monospace",
              }}
            >
              &quot;{v.toLowerCase()}&quot;
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadershipThermometer({ label, percent, barHeight, color }: {
  label: string; percent: number; barHeight: number; color: string;
}) {
  const pct = Math.min(100, Math.max(0, percent)) / 100;
  const w = 58;
  const hex = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#F59E0B";
  const isAmber = hex.toLowerCase() === "#f59e0b";
  const pctTextColor = isAmber ? "rgba(12,8,2,0.95)" : "#fff";

  return (
    <div className="flex flex-col items-center" style={{ flex: "0 0 auto", maxWidth: 130 }}>
      {/* подпись */}
      <div
        style={{
          fontSize: "8px",
          letterSpacing: "0.09em",
          lineHeight: 1.3,
          color: hex,
          opacity: 0.7,
          textAlign: "center",
          minHeight: "34px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: "10px",
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
        }}
      >
        {label.toUpperCase()}
      </div>

      {/* колба — нейтральная, цвет только у заливки */}
      <div
        style={{
          width: w,
          height: barHeight,
          borderRadius: "10px 10px 14px 14px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.35)",
          boxShadow: "inset 0 0 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* тёмные горизонтальные деления */}
        {[0.25, 0.5, 0.75].map((t) => (
          <div key={t} style={{
            position: "absolute",
            left: "12%", right: "12%",
            bottom: `${t * 100}%`,
            height: "1px",
            background: "rgba(255,255,255,0.06)",
          }} />
        ))}

        {/* заливка */}
        <div
          style={{
            position: "absolute",
            left: 0, right: 0, bottom: 0,
            height: `${pct * 100}%`,
            background: `linear-gradient(to top, ${hex}55 0%, ${hex}cc 60%, ${hex} 100%)`,
            boxShadow: `0 0 18px ${hex}55, inset 0 -2px 8px rgba(0,0,0,0.35)`,
            transition: "height 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />

        {/* блик (стекло) */}
        <div style={{
          position: "absolute",
          top: 0, left: "10%", width: "28%", bottom: 0,
          background: "linear-gradient(to right, rgba(255,255,255,0.07) 0%, transparent 100%)",
          borderRadius: "10px 0 0 14px",
          pointerEvents: "none",
        }} />

        {/* верхнее свечение заливки */}
        {pct > 0.05 && (
          <div style={{
            position: "absolute",
            left: "8%", right: "8%",
            bottom: `${pct * 100}%`,
            height: "6px",
            marginBottom: "-3px",
            background: hex,
            borderRadius: "3px",
            opacity: 0.6,
            filter: `blur(3px)`,
            pointerEvents: "none",
          }} />
        )}

        {/* процент */}
        {pct > 0.1 && (
          <div style={{
            position: "absolute",
            left: 0, right: 0,
            bottom: `${pct * 50}%`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span
              style={{
                fontSize: barHeight >= 150 ? "16px" : "12px",
                fontWeight: 900,
                color: pctTextColor,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  textShadow: isAmber ? "none" : `0 0 8px ${hex}99, 0 1px 3px rgba(0,0,0,0.8)`,
              }}
            >
              {Math.round(percent)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Motivation Chart (arc gauge + inner/outer balance strip) ─
function MotivationChart({ innerScore, innerFactors, outerFactors }: {
  innerScore: number; outerScore?: number;
  innerFactors: string[]; outerFactors: string[];
}) {
  const { t } = useTranslation();
  const outerPct = Math.min(100, Math.max(0, 100 - innerScore));

  return (
    <div className="py-2">
      <div className="flex flex-col items-center mb-6">
        <div>
          <ArcGauge
            value={innerScore}
            label={String(t("candidate_view.mot_arc_label")).toUpperCase()}
            size={176}
          />
        </div>

        <div className="mt-5 w-full max-w-[280px] px-1">
          <div
            className="mb-2 flex justify-between"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "9px",
              letterSpacing: "0.09em",
              fontWeight: 700,
            }}
          >
            <span style={{ color: "rgba(245,158,11,0.8)" }}>{t("candidate_view.mot_strip_autonomous")}</span>
            <span style={{ color: "rgba(96,165,250,0.85)" }}>{t("candidate_view.mot_strip_external")}</span>
          </div>
          <div
            className="relative flex h-3.5 w-full overflow-hidden rounded-full"
            style={{
              background: "rgba(0,0,0,0.45)",
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                width: `${innerScore}%`,
                background: "linear-gradient(90deg, rgba(245,158,11,0.35), #F59E0B)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 0 12px rgba(245,158,11,0.25)",
                transition: "width 1s cubic-bezier(0.22, 1, 0.36, 1)",
                minWidth: innerScore > 0 ? 3 : 0,
              }}
            />
            <div
              style={{
                width: `${outerPct}%`,
                background: "linear-gradient(90deg, rgba(59,130,246,0.4), #60A5FA)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 12px rgba(96,165,250,0.2)",
                transition: "width 1s cubic-bezier(0.22, 1, 0.36, 1)",
                minWidth: outerPct > 0 ? 3 : 0,
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-[18%] w-[28%] rounded-full"
              style={{
                background: "linear-gradient(90deg, rgba(255,255,255,0.06), transparent)",
              }}
            />
          </div>
          <div
            className="mt-1.5 flex justify-between font-mono text-[10px]"
            style={{ fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.42)" }}
          >
            <span style={{ color: "rgba(245,158,11,0.65)" }}>{innerScore}%</span>
            <span style={{ color: "rgba(96,165,250,0.65)" }}>{outerPct}%</span>
          </div>
        </div>
      </div>

      {innerFactors.length > 0 && (
        <div className="mb-4">
          <div className="hud-label mb-2">{t("candidate_view.mot_list_intrinsic")}</div>
          <div className="space-y-2">
            {innerFactors.slice(0, 3).map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderLeft: "3px solid rgba(245,158,11,0.55)",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.72)",
                  lineHeight: 1.45,
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {outerFactors.length > 0 && (
        <div>
          <div className="hud-label mb-2">{t("candidate_view.mot_list_extrinsic")}</div>
          <div className="space-y-2">
            {outerFactors.slice(0, 2).map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderLeft: "3px solid rgba(96,165,250,0.55)",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.62)",
                  lineHeight: 1.45,
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Commission Timeline ──────────────────────────────────────
function CommissionTimeline({ events }: { events: TimelineEvent[] }) {
  const { t } = useTranslation();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  // Merge consecutive same-direction events
  const merged: (TimelineEvent & { merged?: number })[] = [];
  let i = 0;
  while (i < sorted.length) {
    const cur = sorted[i];
    let count = 1;
    while (i + count < sorted.length && sorted[i + count].direction === cur.direction) count++;
    const blockNum = merged.length + 1;
    if (count >= 3) {
      merged.push({
        ...cur,
        title: cur.direction === "down"
          ? t("candidate_view.comm_block_merged_down", { b: blockNum, count })
          : t("candidate_view.comm_block_merged_up", { b: blockNum, count }),
        description: sorted.slice(i, i + count).map(e => e.title).join(" → "),
        merged: count,
      });
    } else {
      for (let j = 0; j < count; j++) {
        merged.push({
          ...sorted[i + j],
          title: t("candidate_view.comm_block_item", { b: merged.length + 1, title: sorted[i + j].title }),
        });
      }
    }
    i += count;
  }

  const colors = { up: "var(--acid)", neutral: "rgba(255,255,255,0.4)", down: "#FF6B6B" };

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}>
      <div style={{ display: "flex", gap: "12px", minWidth: merged.length * 180, paddingBottom: "8px" }}>
        {merged.map((ev, idx) => (
          <div key={ev.id + idx} style={{
            width: 160, flexShrink: 0, padding: "12px",
            borderRadius: "12px",
            background: `${colors[ev.direction]}0A`,
            border: `1px solid ${colors[ev.direction]}33`,
          }}>
            <div style={{ fontSize: "9px", color: colors[ev.direction], fontFamily: "JetBrains Mono, monospace", marginBottom: "4px" }}>
              {ev.date} · {ev.direction === "up" ? t("timeline.dir_growth") : ev.direction === "down" ? t("timeline.dir_setback") : t("timeline.dir_neutral")}
              {ev.merged ? ` (×${ev.merged})` : ""}
            </div>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "rgba(255,255,255,0.85)", marginBottom: "4px" }}>
              {ev.title}
            </div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", lineHeight: "1.4" }}>
              {ev.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Transcript line ──────────────────────────────────────────
function TranscriptLine({ msg, idx }: { msg: InterviewMessage; idx: number }) {
  const { t } = useTranslation();
  const isAI = msg.role === "ai";
  return (
    <div style={{
      padding: "10px 12px", borderRadius: "8px",
      background: isAI ? "rgba(209,255,0,0.03)" : "rgba(255,255,255,0.025)",
      borderLeft: `2px solid ${isAI ? "rgba(209,255,0,0.3)" : "rgba(255,255,255,0.12)"}`,
    }}>
      <div style={{ fontSize: "8px", color: isAI ? "rgba(209,255,0,0.5)" : "rgba(255,255,255,0.28)", marginBottom: "4px", letterSpacing: "0.1em" }}>
        {isAI ? t("candidate_view.transcript_role_ai") : t("candidate_view.transcript_role_candidate")} · {t("candidate_view.transcript_msg", { n: idx + 1 })}
      </div>
      <div style={{ color: "rgba(255,255,255,0.72)", lineHeight: "1.6" }}>
        {msg.content}
      </div>
    </div>
  );
}

// ─── Sliding-window variance-ratio math ───────────────────────
// All heavy computation lives here so it can be wrapped in useMemo.

interface WindowAnalysis {
  t: number;          // seconds from start
  stress: number;     // 0-100 browInnerUp avg
  reading: number;    // 0-100 variance-ratio based
  varRatio: number;   // raw Var(X)/Var(Y)
  isReading: boolean; // threshold exceeded
}

function computeWindows(
  log: BlendshapeEntry[],
  calib: EyeCalibration,
): WindowAnalysis[] {
  if (!log.length) return [];

  const WINDOW_MS   = 3000;
  const STEP_MS     = 500;
  const GB          = calib.gaze_boundary / 100; // convert % → 0-1
  const SENS        = calib.saccade_sensitivity;
  const VAR_THRESH  = 3.5;                        // Var(X)/Var(Y) > this = reading

  const totalMs = log[log.length - 1].t;
  const result: WindowAnalysis[] = [];

  for (let start = 0; start <= totalMs - WINDOW_MS; start += STEP_MS) {
    const end = start + WINDOW_MS;
    const win = log.filter(e => e.t >= start && e.t < end);
    if (win.length < 3) continue;

    // Lateral gaze X: right = (eyeLookOutL + eyeLookInR)/2  –  left = (eyeLookInL + eyeLookOutR)/2
    // Vertical gaze Y: up = eyeLookUp, down = eyeLookDown (if available, else 0)
    const xVals = win.map(e => {
      const right = ((e.eyeLookOutL ?? 0) + (e.eyeLookInR ?? 0)) / 2;
      const left  = ((e.eyeLookInL ?? 0) + (e.eyeLookOutR ?? 0)) / 2;
      return right - left;
    });
    const yVals = win.map(e => {
      const up   = (e as unknown as Record<string, number>)["eyeLookUpLeft"]  ?? 0;
      const down = (e as unknown as Record<string, number>)["eyeLookDownLeft"] ?? 0;
      return up - down;
    });

    const variance = (arr: number[]) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };

    const varX = variance(xVals);
    const varY = variance(yVals) || 0.0001; // avoid div/0
    const rawRatio = varX / varY;
    const scaledRatio = rawRatio * SENS;

    // Gaze boundary: fraction of samples outside the allowed centre zone
    const outOfBounds = win.filter(e => {
      const mag = Math.max(
        Math.abs((e.eyeLookOutL ?? 0) - (e.eyeLookInL ?? 0)),
        Math.abs((e.eyeLookOutR ?? 0) - (e.eyeLookInR ?? 0)),
      );
      return mag > GB;
    }).length / win.length;

    // Stress: mean browInnerUp
    const stressMean = win.reduce((a, e) => a + (e.browInnerUp ?? 0), 0) / win.length;

    // Reading probability in this window
    const readingScore = Math.min(100, Math.round(
      ((scaledRatio > 1 ? Math.log(scaledRatio) * 25 : 0) + outOfBounds * 60)
    ));

    result.push({
      t: (start + WINDOW_MS / 2) / 1000,
      stress:    Math.round(stressMean * 100),
      reading:   readingScore,
      varRatio:  parseFloat(rawRatio.toFixed(2)),
      isReading: scaledRatio > VAR_THRESH,
    });
  }
  return result;
}

function computeIntegrity(
  windows: WindowAnalysis[],
  metrics: BehaviorMetrics,
  calib: EyeCalibration,
): number {
  if (!windows.length) return metrics.integrity_score ?? 1;
  const N = windows.filter(w => w.isReading).length * calib.saccade_sensitivity;
  const V = windows.reduce((a, w) => a + w.stress, 0) / windows.length;
  const freezePenalty = calib.emotion_freeze_penalty
    ? Math.max(0, 0.1 - (V / 1000))  // flat -10% if very low stress throughout
    : 0;
  return Math.max(0, Math.min(1, 1.0 - (0.08 * N + 0.003 * V) - freezePenalty));
}

// ─── Video Behavior Panel ─────────────────────────────────────

function VideoBehaviorPanel({ metrics }: { metrics?: BehaviorMetrics }) {
  const { settings } = useCommission();
  const calib: EyeCalibration = settings.eye_calibration ?? {
    saccade_sensitivity: 1.0, gaze_boundary: 20, emotion_freeze_penalty: true,
  };

  const riskColor = (r?: string) =>
    r === "high" ? "#ef4444" : r === "medium" ? "#f59e0b" : "var(--acid)";
  const riskLabel = (r?: string) =>
    r === "high" ? "ВЫСОКИЙ" : r === "medium" ? "СРЕДНИЙ" : "НИЗКИЙ";

  // ── Sliding-window analysis (recalculates when calibration sliders change) ──
  const log: BlendshapeEntry[] = useMemo(
    () => metrics?.behavioral_log ?? [],
    [metrics],
  );

  const windows = useMemo(
    () => computeWindows(log, calib),
    [log, calib.saccade_sensitivity, calib.gaze_boundary],
  );

  const liveIntegrity = useMemo(
    () => metrics ? computeIntegrity(windows, metrics, calib) : 1,
    [windows, metrics, calib.emotion_freeze_penalty],
  );

  const liveRisk: "low" | "medium" | "high" = useMemo(() => {
    const readCount = windows.filter(w => w.isReading).length;
    if (liveIntegrity < 0.55 || readCount >= 8) return "high";
    if (liveIntegrity < 0.75 || readCount >= 4) return "medium";
    return "low";
  }, [liveIntegrity, windows]);

  // Gaze scatter data: one point per 2-second averaged window
  const scatterData = useMemo(() => {
    if (!log.length) return [];
    const STEP = 2000;
    const total = log[log.length - 1].t;
    const pts: { x: number; y: number; isReading: boolean }[] = [];
    for (let s = 0; s <= total - STEP; s += STEP) {
      const win = log.filter(e => e.t >= s && e.t < s + STEP);
      if (!win.length) continue;
      const avgX = win.reduce((a, e) => {
        const r = ((e.eyeLookOutL ?? 0) + (e.eyeLookInR ?? 0)) / 2;
        const l = ((e.eyeLookInL ?? 0) + (e.eyeLookOutR ?? 0)) / 2;
        return a + (r - l);
      }, 0) / win.length;
      const avgY = win.reduce((a, e) => {
        const u = (e as unknown as Record<string, number>)["eyeLookUpLeft"]   ?? 0;
        const d = (e as unknown as Record<string, number>)["eyeLookDownLeft"] ?? 0;
        return a + (u - d);
      }, 0) / win.length;
      const ww = windows.find(w => Math.abs(w.t - (s / 1000 + 1)) < 1.5);
      pts.push({ x: parseFloat(avgX.toFixed(3)), y: parseFloat(avgY.toFixed(3)), isReading: ww?.isReading ?? false });
    }
    return pts;
  }, [log, windows]);

  // Explainable AI insight about the scatter pattern
  const scatterInsight = useMemo(() => {
    if (!scatterData.length) return null;
    const xs = scatterData.map(p => p.x);
    const ys = scatterData.map(p => p.y);
    const variance = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };
    const vx = variance(xs), vy = variance(ys) || 0.0001;
    const ratio = parseFloat((vx / vy).toFixed(1));
    if (ratio >= 5) return `На карте взгляда обнаружен чёткий горизонтальный паттерн. Отношение горизонтальных микро-движений к вертикальным составляет ${ratio}:1, что характерно для чтения текста с экрана.`;
    if (ratio >= 2.5) return `Горизонтальные движения глаз доминируют (соотношение ${ratio}:1). Возможны периодические попытки чтения или взгляды в сторону.`;
    return `Точки образуют компактный кластер — зрительный контакт равномерный. Соотношение X:Y = ${ratio}:1 (норма ≤ 2.0).`;
  }, [scatterData]);

  const readingWindows = windows.filter(w => w.isReading);

  return (
    <div className="mt-8">
      {/* Section header */}
      <div
        className="flex items-center gap-3 mb-5 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <span className="text-lg">👁</span>
        <div>
          <div className="hud-label text-xs" style={{ color: "rgba(147,197,253,0.6)" }}>
            MEDIAPIPE · FACE BLENDSHAPES · X-RAY VISION
          </div>
          <h3 className="font-bold text-white text-sm mt-0.5">
            Анализ движений глаз и поведения
          </h3>
        </div>
        {metrics ? (
          <div
            className="ml-auto flex items-center gap-2 px-3 py-1 rounded-full"
            style={{
              background: `${riskColor(liveRisk)}14`,
              border: `1px solid ${riskColor(liveRisk)}40`,
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: riskColor(liveRisk) }} />
            <span className="hud-mono text-xs font-bold" style={{ color: riskColor(liveRisk) }}>
              РИСК: {riskLabel(liveRisk)}
            </span>
          </div>
        ) : (
          <span className="ml-auto hud-mono text-xs text-white/25">НЕТ ДАННЫХ</span>
        )}
      </div>

      {metrics ? (
        <div className="space-y-5">

          {/* ── Calibration hint ─────────────────────────────────────────── */}
          {windows.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: "rgba(209,255,0,0.04)", border: "1px solid rgba(209,255,0,0.1)" }}>
              <span style={{ color: "rgba(209,255,0,0.5)" }} className="hud-mono">КАЛИБРОВКА ×{calib.saccade_sensitivity.toFixed(1)}</span>
              <span className="text-white/35">Граница взгляда {calib.gaze_boundary}%</span>
              <span className="text-white/25">·</span>
              <span className="text-white/35">Мимика: {calib.emotion_freeze_penalty ? "учитывается" : "игнорируется"}</span>
              <span className="ml-auto text-white/25">Изменить → Настройки</span>
            </div>
          )}

          {/* ── KPI tiles ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "КОНТАКТ С КАМЕРОЙ",
                value: `${metrics.eye_contact_consistency ?? 0}%`,
                color: (metrics.eye_contact_consistency ?? 0) >= 75 ? "var(--acid)" : "#f59e0b",
              },
              {
                label: "ОКНА ЧТЕНИЯ",
                value: String(readingWindows.length),
                color: readingWindows.length >= 4 ? "#ef4444" : readingWindows.length >= 2 ? "#f59e0b" : "var(--acid)",
                sub: `из ${windows.length}`,
              },
              {
                label: "ВЕРОЯТНОСТЬ ЧТЕНИЯ",
                value: `${Math.round((readingWindows.length / Math.max(windows.length, 1)) * 100)}%`,
                color: readingWindows.length / Math.max(windows.length, 1) >= 0.3 ? "#ef4444" : "var(--acid)",
              },
              {
                label: "ЭМО. ВОЛАТИЛЬНОСТЬ",
                value: `${metrics.emotional_volatility ?? 0}/100`,
                color: (metrics.emotional_volatility ?? 0) >= 60 ? "#ef4444" : "rgba(255,255,255,0.6)",
              },
            ].map(({ label, value, color, sub }) => (
              <div
                key={label}
                className="rounded-xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="hud-label text-[10px] mb-1" style={{ color: "rgba(147,197,253,0.55)" }}>
                  {label}
                </div>
                <div className="text-2xl font-black" style={{ color, fontFamily: "'Space Grotesk', sans-serif" }}>
                  {value}
                </div>
                {sub && <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* ── Integrity score with LIVE formula ─────────────────────────── */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="hud-label text-xs" style={{ color: "rgba(147,197,253,0.55)" }}>
                ИНДЕКС ЦЕЛОСТНОСТИ · Score_integrity {windows.length > 0 && <span style={{ color: "var(--acid)" }}>(LIVE)</span>}
              </span>
              <span
                className="hud-mono text-sm font-black"
                style={{ color: riskColor(liveRisk) }}
              >
                {(liveIntegrity * 100).toFixed(1)} / 100
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full rounded-full mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${liveIntegrity * 100}%`,
                  background: `linear-gradient(90deg, ${riskColor(liveRisk)}80, ${riskColor(liveRisk)})`,
                }}
              />
            </div>
            {/* Formula display */}
            <p className="text-white/30 text-xs font-mono">
              Score = 1.0 − (0.08 × N_windows × sensitivity + 0.003 × Volatility)
              {"  →  "}
              1.0 − (0.08 × {readingWindows.length} × {calib.saccade_sensitivity.toFixed(1)} + 0.003 × {metrics.emotional_volatility ?? 0})
              {" = "}
              <span style={{ color: riskColor(liveRisk) }}>
                {liveIntegrity.toFixed(3)}
              </span>
            </p>
          </div>

          {/* ── Timeline chart (live, re-renders on slider change) ────────── */}
          {windows.length > 2 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="hud-label text-xs mb-3" style={{ color: "rgba(147,197,253,0.55)" }}>
                ТАЙМЛАЙН · УРОВЕНЬ СТРЕССА И ВЕРОЯТНОСТЬ ЧТЕНИЯ
                {readingWindows.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                    style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>
                    {readingWindows.length} ОКНА ЧТЕНИЯ
                  </span>
                )}
              </div>
              <div style={{ height: 160 }}>
                <Line
                  data={{
                    labels: windows.map((p) => {
                      const s = Math.floor(p.t);
                      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
                    }),
                    datasets: [
                      {
                        label: "Стресс (browInnerUp)",
                        data: windows.map((p) => p.stress),
                        borderColor: "#f59e0b",
                        backgroundColor: "rgba(245,158,11,0.08)",
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        borderWidth: 1.5,
                      },
                      {
                        label: "Вероятность чтения",
                        data: windows.map((p) => p.reading),
                        borderColor: "#ef4444",
                        backgroundColor: "rgba(239,68,68,0.08)",
                        fill: true,
                        tension: 0.4,
                        pointRadius: windows.map(w => w.isReading ? 4 : 0),
                        pointBackgroundColor: "#ef4444",
                        borderWidth: 1.5,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                      legend: {
                        labels: { color: "rgba(255,255,255,0.45)", font: { size: 10 }, boxWidth: 12 },
                      },
                      tooltip: {
                        backgroundColor: "rgba(0,0,0,0.85)",
                        titleColor: "rgba(255,255,255,0.7)",
                        bodyColor: "rgba(255,255,255,0.55)",
                      },
                    },
                    scales: {
                      x: {
                        ticks: { color: "rgba(255,255,255,0.3)", maxTicksLimit: 8, font: { size: 9 } },
                        grid: { color: "rgba(255,255,255,0.04)" },
                      },
                      y: {
                        min: 0,
                        max: 100,
                        ticks: { color: "rgba(255,255,255,0.3)", font: { size: 9 } },
                        grid: { color: "rgba(255,255,255,0.04)" },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Gaze Scatter Plot ─────────────────────────────────────────── */}
          {scatterData.length > 3 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="hud-label text-xs mb-1" style={{ color: "rgba(147,197,253,0.55)" }}>
                КАРТА ВЗГЛЯДА · GAZE SCATTER PLOT
              </div>
              <p className="text-white/25 text-xs mb-3">
                Ось X = горизонтальное смещение взгляда · Ось Y = вертикальное.
                Широкая горизонтальная полоса = паттерн чтения. Плотный круг в центре = хороший контакт.
              </p>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      type="number" dataKey="x" name="Горизонталь"
                      domain={[-0.6, 0.6]}
                      tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
                      tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      label={{ value: "← лево / право →", position: "insideBottom", offset: -2, fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
                    />
                    <YAxis
                      type="number" dataKey="y" name="Вертикаль"
                      domain={[-0.4, 0.4]}
                      tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
                      tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      label={{ value: "↕ верх/низ", angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
                    />
                    <RTooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                      formatter={(v, name) => [
                        typeof v === "number" ? v.toFixed(3) : String(v ?? ""),
                        String(name ?? ""),
                      ]}
                    />
                    {/* Boundary circle guide */}
                    <ReferenceLine x={0} stroke="rgba(255,255,255,0.08)" />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                    {/* Normal points */}
                    <Scatter
                      name="Нет чтения"
                      data={scatterData.filter(p => !p.isReading)}
                      fill="var(--acid)"
                      fillOpacity={0.6}
                      r={3}
                    />
                    {/* Reading-flagged points */}
                    <Scatter
                      name="Паттерн чтения"
                      data={scatterData.filter(p => p.isReading)}
                      fill="#ef4444"
                      fillOpacity={0.85}
                      r={5}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              {/* Explainable AI badge */}
              {scatterInsight && (
                <div className="mt-3 px-3 py-2 rounded-xl text-xs"
                  style={{ background: "rgba(147,197,253,0.06)", border: "1px solid rgba(147,197,253,0.14)" }}>
                  <span className="hud-mono text-[10px] mr-2" style={{ color: "rgba(147,197,253,0.6)" }}>
                    EXPLAINABLE AI INSIGHTS
                  </span>
                  <span className="text-white/55">{scatterInsight}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Explainable AI reasoning ──────────────────────────────────── */}
          {metrics.explainable_ai && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(147,197,253,0.04)", border: "1px solid rgba(147,197,253,0.12)" }}
            >
              <div className="hud-label text-xs mb-2" style={{ color: "rgba(147,197,253,0.6)" }}>
                EXPLAINABLE AI · ОБОСНОВАНИЕ СИСТЕМЫ
              </div>
              <p className="text-white/55 text-xs leading-relaxed">{metrics.explainable_ai}</p>
            </div>
          )}

          {/* ── Signal columns ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            {(metrics.signals_positive ?? []).length > 0 && (
              <GlassCard title="ПОЗИТИВНЫЕ СИГНАЛЫ">
                <ul className="space-y-2 mt-3">
                  {metrics.signals_positive.map((s, i) => (
                    <li key={i} className="text-xs text-white/60 flex gap-2">
                      <span className="flex-shrink-0" style={{ color: "var(--acid)" }}>✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            )}
            {(metrics.signals_negative ?? []).length > 0 && (
              <GlassCard title="ТРЕВОЖНЫЕ СИГНАЛЫ">
                <ul className="space-y-2 mt-3">
                  {metrics.signals_negative.map((s, i) => (
                    <li key={i} className="text-xs text-white/60 flex gap-2">
                      <span className="flex-shrink-0 text-red-400">!</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            )}
            {(metrics.signals_negative ?? []).length === 0 && (metrics.signals_positive ?? []).length === 0 && (
              <div className="col-span-2 text-center text-white/25 text-xs py-4">
                Недостаточно данных для сигналов
              </div>
            )}
          </div>

          <p className="text-white/15 text-xs italic">
            * Анализ выполнен через MediaPipe FaceLandmarker blendshapes (500 мс интервал).
            Саккады определяются как ≥4 смены знака латерального вектора взгляда за 3 с.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-3xl mb-3 opacity-30">👁</div>
          <p className="text-white/30 text-sm">Данные видео-поведения недоступны</p>
          <p className="text-white/18 text-xs mt-1">
            Кандидат проходил текстовое интервью или данные ещё не получены
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Utility helpers ──────────────────────────────────────────
function extractVerbs(essay: string, sjt: { chosen_option: string }[]): string[] {
  const leadership = ["united", "organized", "inspired", "led", "delegated", "объединил", "организовал", "вдохновил", "возглавил", "помог", "решил", "взял", "инициировал"];
  const text = (essay + " " + sjt.map(s => s.chosen_option).join(" ")).toLowerCase();
  return leadership.filter(v => text.includes(v.toLowerCase())).slice(0, 8);
}

function extractInnerMotivation(candidate: CommissionDetail): string[] {
  const text = ((candidate.essay || "") + " " + candidate.interview_messages.map(m => m.content).join(" ")).toLowerCase();
  const signals = [
    ["понял", "understood the problem"],
    ["хотел решить", "wanted to solve"],
    ["мне было важно", "it mattered to me"],
    ["разобраться", "figure it out"],
    ["passion", "genuine passion"],
    ["because I cared", "driven by values"],
  ];
  return signals.filter(([k]) => text.includes(k)).map(([, v]) => v);
}

function extractOuterMotivation(candidate: CommissionDetail): string[] {
  const text = ((candidate.essay || "") + " " + candidate.interview_messages.map(m => m.content).join(" ")).toLowerCase();
  const signals = [
    ["грант", "100% grant prestige"],
    ["родители", "parental expectation"],
    ["статус", "status seeking"],
    ["сертификат", "certificate collection"],
    ["престиж", "institutional prestige"],
    ["prove", "proving to others"],
  ];
  return signals.filter(([k]) => text.includes(k)).map(([, v]) => v);
}

// Helper functions for extracting structured AI explanations
function extractPoints(explanation: string | { positive_points?: string[]; negative_points?: string[] } | undefined, field: 'positive_points' | 'negative_points'): string[] | null {
  if (!explanation) return null;
  
  // New structure: object with positive_points/negative_points arrays
  if (typeof explanation === 'object' && explanation !== null && field in explanation) {
    const points = explanation[field];
    if (Array.isArray(points) && points.length > 0) {
      return points.filter(p => typeof p === 'string' && p.trim().length > 0);
    }
  }
  
  // Legacy structure: plain string - return null to use fallback
  return null;
}

function extractSynthesis(explanation: string | { synthesis?: string } | undefined): string | null {
  if (!explanation) return null;
  
  // New structure: object with synthesis field
  if (typeof explanation === 'object' && explanation !== null && 'synthesis' in explanation) {
    const synth = explanation.synthesis;
    if (typeof synth === 'string' && synth.trim().length > 0) {
      return synth;
    }
  }
  
  // Legacy structure: plain string
  if (typeof explanation === 'string' && explanation.trim().length > 0) {
    return explanation;
  }
  
  return null;
}
