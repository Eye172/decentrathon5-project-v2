import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { candidateApi, setAuthToken } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { TimelineEvent, SJTAnswer } from "../../types";
import { motion, AnimatePresence } from "framer-motion";
import { MeshBackground } from "../../components/MeshBackground";
import { TimelineBuilder } from "../../components/TimelineBuilder";
import { SJTTest } from "../../components/SJTTest";
import { useTranslation } from "react-i18next";
import {
  draftKeys,
  clearLegacyApplyDraftKeys,
} from "../../utils/applyDraftStorage";

const STEP_IDS = [0, 1, 2, 3];
const ONBOARDING_ICONS = ["🗺️", "✍️", "⚡"];

/** Paste (Ctrl+V) in the essay field: allowed in `vite` dev, or when VITE_ALLOW_ESSAY_PASTE=true (e.g. prod test build). */
const ESSAY_PASTE_ALLOWED =
  import.meta.env.DEV || import.meta.env.VITE_ALLOW_ESSAY_PASTE === "true";

type EssayPromptMeta = { year: string; title: string };

/** Migrate drafts that stored the old fixed-English prompt string. */
function tryParseLegacyEssayPrompt(s: string): EssayPromptMeta | null {
  const m = s.match(
    /^In (\d{4}) you noted: "(.+)"\. Describe in detail:/
  );
  if (!m) return null;
  return { year: m[1], title: m[2] };
}

export function Apply() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const STEP_LABELS = [
    t('apply.step_profile'),
    t('apply.step_lifemap'),
    t('apply.step_deepdive'),
    t('apply.step_sjt'),
  ];

  const ONBOARDING = [
    { icon: ONBOARDING_ICONS[0], title: t('apply.onb_1_title'), desc: t('apply.onb_1_desc') },
    { icon: ONBOARDING_ICONS[1], title: t('apply.onb_2_title'), desc: t('apply.onb_2_desc') },
    { icon: ONBOARDING_ICONS[2], title: t('apply.onb_3_title'), desc: t('apply.onb_3_desc') },
  ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local sub-step (0=profile, 0.5=onboarding, 1=timeline, 2=essay, 3=sjt)
  const [subStep, setSubStep] = useState<number>(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);

  // Form data
  const [form, setForm] = useState({
    name: "", age: "", city: "", school: "", gpa: "", ielts: "", ent: "",
  });

  // Timeline
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  /** Candidate id for namespaced localStorage (set after /me). */
  const [candidateDraftId, setCandidateDraftId] = useState<number | null>(null);

  // Essay (prompt = i18n template + year/title from life map)
  const [essay, setEssay] = useState("");
  const [essayPromptMeta, setEssayPromptMeta] = useState<EssayPromptMeta | null>(null);
  /** Pre–i18n drafts: full English string only. */
  const [essayPromptLegacy, setEssayPromptLegacy] = useState<string | null>(null);
  const essayRef = useRef<HTMLTextAreaElement>(null);

  const essayPromptDisplay =
    essayPromptMeta != null
      ? t("apply.deepdive_prompt", {
          year: essayPromptMeta.year,
          title: essayPromptMeta.title,
        })
      : essayPromptLegacy;

  useEffect(() => {
    if (!auth?.token) { navigate("/login"); return; }
    setAuthToken(auth.token);
    let cancelled = false;

    candidateApi.me().then((p) => {
      if (cancelled) return;
      if (p.application_step >= 2) {
        navigate("/interview");
        return;
      }

      const cid = p.id;
      setCandidateDraftId(cid);
      clearLegacyApplyDraftKeys();
      const keys = draftKeys(cid);

      if (p.name) {
        setForm((f) => ({
          ...f,
          name: p.name || "",
          age: p.age != null ? String(p.age) : f.age,
          city: p.city || "",
          school: p.school || "",
          gpa: p.gpa != null ? String(p.gpa) : f.gpa,
          ielts: p.ielts_overall != null ? String(p.ielts_overall) : f.ielts,
          ent: p.ent_score != null ? String(p.ent_score) : f.ent,
        }));
      }
      if (p.essay) setEssay(p.essay);

      let events: TimelineEvent[] = [];
      if (p.extra_activities) {
        try {
          const parsed = JSON.parse(p.extra_activities) as unknown;
          if (Array.isArray(parsed) && parsed[0] && typeof (parsed[0] as TimelineEvent).direction === "string") {
            events = parsed as TimelineEvent[];
          }
        } catch { /* ignore */ }
      }
      if (events.length === 0) {
        const tl = localStorage.getItem(keys.timeline);
        if (tl) {
          try {
            const parsed = JSON.parse(tl) as unknown;
            if (Array.isArray(parsed) && parsed[0] && typeof (parsed[0] as TimelineEvent).direction === "string") {
              events = parsed as TimelineEvent[];
            }
          } catch { /* ignore */ }
        }
      }
      setTimelineEvents(events);

      const saved = localStorage.getItem(keys.step);
      if (saved) setSubStep(Number(saved));
      else setSubStep(0);

      let loadedEssayMeta: EssayPromptMeta | null = null;
      const metaRaw = localStorage.getItem(keys.essayPromptMeta);
      if (metaRaw) {
        try {
          const m = JSON.parse(metaRaw) as unknown;
          if (
            m &&
            typeof m === "object" &&
            "year" in m &&
            "title" in m &&
            typeof (m as EssayPromptMeta).year === "string" &&
            typeof (m as EssayPromptMeta).title === "string"
          ) {
            loadedEssayMeta = m as EssayPromptMeta;
          }
        } catch {
          /* ignore */
        }
      }
      if (loadedEssayMeta) {
        setEssayPromptMeta(loadedEssayMeta);
      } else {
        const ep = localStorage.getItem(keys.essayPrompt);
        if (ep) {
          const parsed = tryParseLegacyEssayPrompt(ep);
          if (parsed) {
            setEssayPromptMeta(parsed);
            localStorage.setItem(keys.essayPromptMeta, JSON.stringify(parsed));
            localStorage.removeItem(keys.essayPrompt);
          } else {
            setEssayPromptLegacy(ep);
          }
        }
      }

      if (p.application_step >= 1 && !saved) {
        setSubStep(1);
        localStorage.setItem(keys.step, "1");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [auth?.token, navigate]);

  function persistStep(n: number) {
    if (candidateDraftId == null) return;
    setSubStep(n);
    localStorage.setItem(draftKeys(candidateDraftId).step, String(n));
  }

  function gpaForApi(): number | null {
    const s = form.gpa.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function ageForApi(): number | null {
    const s = form.age.trim();
    if (!s) return null;
    const n = Number(form.age);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  function ieltsForApi(): number | null {
    const s = form.ielts.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 9 ? n : null;
  }

  function entForApi(): number | null {
    const s = form.ent.trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 && n <= 150 ? n : null;
  }

  // ─── Step 0: Profile ──────────────────────────────────────────────────────────
  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.city.trim() || !form.age.trim()) {
      setError(t('apply.error_required'));
      return;
    }
    const ageNum = ageForApi();
    if (ageNum == null || ageNum < 14 || ageNum > 25) {
      setError(t('apply.error_required'));
      return;
    }
    if (form.ielts.trim() && ieltsForApi() == null) {
      setError(t("apply.error_scores"));
      return;
    }
    if (form.ent.trim() && entForApi() == null) {
      setError(t("apply.error_scores"));
      return;
    }
    setSaving(true); setError(null);
    try {
      await candidateApi.saveQuestionnaire({
        name: form.name.trim(), age: ageNum, city: form.city.trim(),
        school: form.school.trim(), gpa: gpaForApi(),
        ielts_overall: ieltsForApi(),
        ent_score: entForApi(),
        achievements: "", extra_activities: "", leadership_examples: "", goals: "",
      });
      setShowOnboarding(true);
    } catch {
      setError(t('apply.error_save'));
    } finally {
      setSaving(false);
    }
  }

  // ─── Step 1: Timeline ─────────────────────────────────────────────────────────
  async function submitTimeline() {
    if (timelineEvents.length < 7) { setError(t('apply.lifemap_min_error')); return; }
    const hasFailure = timelineEvents.some(e => e.direction === "down");
    if (!hasFailure) { setError(t('apply.lifemap_failure_error')); return; }
    if (form.ielts.trim() && ieltsForApi() == null) {
      setError(t("apply.error_scores"));
      return;
    }
    if (form.ent.trim() && entForApi() == null) {
      setError(t("apply.error_scores"));
      return;
    }
    setSaving(true); setError(null);
    try {
      // Store timeline in extra_activities as JSON
      await candidateApi.saveQuestionnaire({
        name: form.name.trim(), age: Number(form.age), city: form.city.trim(),
        school: form.school.trim(), gpa: gpaForApi(),
        ielts_overall: ieltsForApi(),
        ent_score: entForApi(),
        achievements: "",
        extra_activities: JSON.stringify(timelineEvents),
        leadership_examples: "",
        goals: "",
      });
      if (candidateDraftId != null) {
        localStorage.setItem(draftKeys(candidateDraftId).timeline, JSON.stringify(timelineEvents));
      }

      // Generate essay prompt from timeline
      const failures = timelineEvents.filter(e => e.direction === "down");
      const chosen = failures.length > 0
        ? failures[Math.floor(Math.random() * failures.length)]
        : timelineEvents[Math.floor(timelineEvents.length / 2)];
      const meta: EssayPromptMeta = {
        year: chosen.date.slice(0, 4),
        title: chosen.title,
      };
      setEssayPromptMeta(meta);
      setEssayPromptLegacy(null);
      if (candidateDraftId != null) {
        const k = draftKeys(candidateDraftId);
        localStorage.setItem(k.essayPromptMeta, JSON.stringify(meta));
        localStorage.removeItem(k.essayPrompt);
      }
      persistStep(2);
    } catch {
      setError(t('apply.lifemap_save_error'));
    } finally {
      setSaving(false);
    }
  }

  // ─── Step 2: Essay ────────────────────────────────────────────────────────────
  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
  const minWords = 150;
  const maxWords = 300;

  function handlePaste(e: React.ClipboardEvent) {
    if (ESSAY_PASTE_ALLOWED) return;
    e.preventDefault();
    setError(t('apply.paste_error'));
    setTimeout(() => setError(null), 3500);
  }

  async function submitEssay() {
    if (wordCount < minWords) { setError(t('apply.min_words_error', { min: minWords, count: wordCount })); return; }
    if (wordCount > maxWords) { setError(t('apply.max_words_error', { max: maxWords, count: wordCount })); return; }
    setSaving(true); setError(null);
    try {
      // Save essay to backend (don't advance to step 2 yet — do that after SJT)
      // We store essay text in localStorage for now, and submit with SJT answers
      if (candidateDraftId != null) {
        localStorage.setItem(draftKeys(candidateDraftId).essayText, essay);
      }
      persistStep(3);
    } catch {
      setError(t('apply.error_save'));
    } finally {
      setSaving(false);
    }
  }

  // ─── Step 3: SJT ─────────────────────────────────────────────────────────────
  async function completeSJT(answers: SJTAnswer[]) {
    setSaving(true); setError(null);
    try {
      if (candidateDraftId == null) {
        setError(t('apply.submit_error'));
        setSaving(false);
        return;
      }
      const keys = draftKeys(candidateDraftId);
      localStorage.setItem(keys.sjt, JSON.stringify(answers));
      const storedEssay = localStorage.getItem(keys.essayText) || essay;

      // Save everything: essay + SJT answers, advance backend to step 2
      await candidateApi.saveQuestionnaire({
        name: form.name.trim(), age: Number(form.age), city: form.city.trim(),
        school: form.school.trim(), gpa: gpaForApi(),
        ielts_overall: ieltsForApi(),
        ent_score: entForApi(),
        achievements: essayPromptDisplay || "",
        extra_activities: localStorage.getItem(keys.timeline) || "",
        leadership_examples: JSON.stringify(answers),
        goals: "",
      });
      await candidateApi.saveEssay(storedEssay);

      localStorage.removeItem(keys.step);
      localStorage.removeItem(keys.timeline);
      localStorage.removeItem(keys.sjt);
      localStorage.removeItem(keys.essayPrompt);
      localStorage.removeItem(keys.essayPromptMeta);
      localStorage.removeItem(keys.essayText);

      navigate("/interview");
    } catch {
      setError(t('apply.submit_error'));
      setSaving(false);
    }
  }

  if (loading) return <FullPageLoader />;

  return (
    <div className="page-dark min-h-screen">
      <MeshBackground variant="minimal" />

      {/* Header */}
      <header className="glass-dark sticky top-0 z-20" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl glass flex items-center justify-center" style={{ border: "1px solid rgba(209,255,0,0.15)" }}>
              <span className="font-black text-sm" style={{ color: "var(--acid)", fontFamily: "'Space Grotesk', sans-serif" }}>iU</span>
            </div>
            <div>
              <span className="font-bold text-white text-sm">inVision U</span>
              <div className="hud-label" style={{ marginTop: "1px" }}>{t('apply.portal')}</div>
            </div>
          </div>
          <button onClick={() => { logout(); navigate("/"); }}
            className="text-sm transition-colors hover:text-white/60" style={{ color: "rgba(255,255,255,0.3)" }}>
            {t('common.logout')}
          </button>
        </div>
      </header>

      <div className="relative max-w-4xl mx-auto px-6 pt-8 pb-12" style={{ zIndex: 10 }}>
        {/* Progress Steps */}
        {!showOnboarding && (
          <div className="flex items-center gap-0 mb-10">
            {STEP_IDS.map((id, i) => {
              const done = subStep > id;
              const active = subStep === id;
              return (
                <div key={id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                      done ? "text-black border-transparent"
                      : active ? "border-[var(--acid)] text-[var(--acid)]"
                      : "border-white/15 text-white/25"
                    }`} style={done ? { background: "var(--acid)" } : {}}>
                      {done ? (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : i + 1}
                    </div>
                    <span className={`text-xs mt-1.5 font-medium ${active ? "text-[var(--acid)]" : done ? "text-[var(--acid)]/55" : "text-white/22"}`}>
                      {STEP_LABELS[i]}
                    </span>
                  </div>
                  {i < STEP_IDS.length - 1 && (
                    <div className={`flex-1 h-px mt-[-14px] mx-2 transition-all ${done ? "bg-[var(--acid)]/40" : "bg-white/8"}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-5 error-box"
          >
            {error}
          </motion.div>
        )}

        <AnimatePresence mode="wait">

          {/* Onboarding overlay */}
          {showOnboarding && (
            <motion.div
              key="onboarding"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center"
              style={{ background: "rgba(5,5,5,0.92)", backdropFilter: "blur(12px)", zIndex: 50 }}
            >
              <div className="w-full max-w-md px-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={onboardingSlide}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -24 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="glass-card rounded-2xl p-8 text-center"
                  >
                    <div className="hud-corner hud-corner-tl" />
                    <div className="hud-corner hud-corner-tr" />
                    <div className="text-5xl mb-5">{ONBOARDING[onboardingSlide].icon}</div>
                    <div className="hud-label mb-2 tracking-widest">{t('apply.onb_step', { current: onboardingSlide + 1, total: ONBOARDING.length })}</div>
                    <h2 className="text-2xl font-black text-white mb-3">{ONBOARDING[onboardingSlide].title}</h2>
                    <p className="text-white/52 leading-relaxed mb-8">{ONBOARDING[onboardingSlide].desc}</p>

                    <div className="flex gap-2 justify-center mb-6">
                      {ONBOARDING.map((_, i) => (
                        <div key={i} style={{
                          width: i === onboardingSlide ? 20 : 6, height: 6, borderRadius: 3,
                          background: i === onboardingSlide ? "var(--acid)" : "rgba(255,255,255,0.15)",
                          transition: "all 0.3s",
                        }} />
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        if (onboardingSlide < ONBOARDING.length - 1) {
                          setOnboardingSlide(s => s + 1);
                        } else {
                          setShowOnboarding(false);
                          persistStep(1);
                        }
                      }}
                      className="btn-primary w-full py-3 text-base"
                    >
                      {onboardingSlide < ONBOARDING.length - 1 ? t('apply.onb_next') : t('apply.onb_start')}
                    </button>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Step 0: Profile */}
          {!showOnboarding && subStep === 0 && (
            <motion.form
              key="profile"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={submitProfile}
              className="glass-card rounded-2xl p-8"
            >
              <div className="hud-corner hud-corner-tl" />
              <div className="hud-corner hud-corner-tr" />

              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="hud-label mb-1">{t('apply.step_progress', { n: 1, total: 4 })}</div>
                  <h2 className="text-xl font-bold text-white">{t('apply.basic_info_title')}</h2>
                  <p className="text-white/42 text-sm mt-1">{t('apply.basic_info_note')}</p>
                </div>
                <div style={{
                  padding: "6px 12px", borderRadius: "8px",
                  background: "rgba(209,255,0,0.06)", border: "1px solid rgba(209,255,0,0.15)",
                  fontSize: "10px", color: "var(--acid)", fontFamily: "JetBrains Mono, monospace",
                }}>{t('apply.anon_badge')}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <Field label={t('apply.field_name')} required>
                  <input className="input" placeholder={t('apply.placeholder_name')} value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </Field>
                <Field label={t('apply.field_age')} required>
                  <input className="input" type="number" min={14} max={25} placeholder={t('apply.placeholder_age')}
                    value={form.age}
                    onChange={e => setForm(f => ({ ...f, age: e.target.value }))} required />
                </Field>
                <Field label={t('apply.field_city')} required>
                  <input className="input" placeholder={t('apply.placeholder_place')} value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))} required />
                </Field>
                <Field label={t('apply.field_school_label')}>
                  <input className="input" placeholder={t('apply.placeholder_school_full')} value={form.school}
                    onChange={e => setForm(f => ({ ...f, school: e.target.value }))} />
                </Field>
                <Field label={t('apply.field_gpa_label')}>
                  <input className="input" type="number" min={0} max={5} step={0.1} placeholder={t('apply.placeholder_gpa')}
                    value={form.gpa}
                    onChange={e => setForm(f => ({ ...f, gpa: e.target.value }))} />
                </Field>
                <Field label={t('apply.field_ielts_optional')}>
                  <input className="input" type="number" min={0} max={9} step={0.5} placeholder={t('apply.placeholder_ielts')}
                    value={form.ielts}
                    onChange={e => setForm(f => ({ ...f, ielts: e.target.value }))} />
                </Field>
                <Field label={t('apply.field_ent_optional')}>
                  <input className="input" type="number" min={0} max={150} step={1} placeholder={t('apply.placeholder_ent')}
                    value={form.ent}
                    onChange={e => setForm(f => ({ ...f, ent: e.target.value }))} />
                </Field>
              </div>
              <p className="text-white/35 text-xs mb-4 -mt-2">{t('apply.scores_optional_hint')}</p>

              <div className="flex justify-end pt-2">
                <button type="submit" disabled={saving} className="btn-primary px-8 py-3">
                  {saving ? <Spinner label={t('common.saving')} /> : t('apply.continue')}
                </button>
              </div>
            </motion.form>
          )}

          {/* Step 1: Timeline Builder */}
          {!showOnboarding && subStep === 1 && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="glass-card rounded-2xl p-6 mb-4">
                <div className="hud-corner hud-corner-tl" />
                <div className="hud-corner hud-corner-tr" />
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="hud-label mb-1">{t('apply.step_progress', { n: 2, total: 4 })}</div>
                    <h2 className="text-xl font-bold text-white">{t('apply.lifemap_title')}</h2>
                  </div>
                  <div className="text-right">
                    <span className="hud-mono">{t('apply.lifemap_events', { count: timelineEvents.length })}</span>
                    <div className="hud-label mt-0.5">
                      {timelineEvents.length < 7
                        ? t('apply.lifemap_need', { count: 7 - timelineEvents.length })
                        : t('apply.lifemap_ready')}
                    </div>
                  </div>
                </div>
                <p className="text-white/42 text-sm leading-relaxed">
                  {t('apply.lifemap_hint')}
                </p>
              </div>

              <TimelineBuilder
                key={candidateDraftId ?? "draft"}
                events={timelineEvents}
                onChange={setTimelineEvents}
              />

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => persistStep(0)} className="btn-secondary text-sm">
                  {t('common.back')}
                </button>
                <button
                  onClick={submitTimeline}
                  disabled={saving || timelineEvents.length < 7}
                  className="btn-primary px-8 py-3"
                >
                  {saving ? <Spinner label={t('common.saving')} /> : t('apply.lifemap_continue', { count: timelineEvents.length })}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Micro-Essay */}
          {!showOnboarding && subStep === 2 && (
            <motion.div
              key="essay"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="glass-card rounded-2xl p-8"
            >
              <div className="hud-corner hud-corner-tl" />
              <div className="hud-corner hud-corner-tr" />

              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="hud-label mb-1">{t('apply.step_progress', { n: 3, total: 4 })}{t('apply.step_deepdive_extra')}</div>
                  <h2 className="text-xl font-bold text-white">{t('apply.deepdive_title')}</h2>
                </div>
                {!ESSAY_PASTE_ALLOWED && (
                  <span className="hud-mono">{t('apply.deepdive_no_paste')}</span>
                )}
              </div>

              {/* AI-selected prompt */}
              {essayPromptDisplay && (
                <div className="rounded-xl p-4 mb-5" style={{ background: "rgba(209,255,0,0.04)", border: "1px solid rgba(209,255,0,0.15)" }}>
                  <div className="hud-label mb-2" style={{ color: "rgba(209,255,0,0.55)" }}>{t('apply.deepdive_ai_label')}</div>
                  <p className="text-white/85 leading-relaxed" style={{ fontStyle: "italic" }}>{essayPromptDisplay}</p>
                </div>
              )}

              <div className="relative">
                <textarea
                  ref={essayRef}
                  className="input w-full"
                  style={{ minHeight: "260px", resize: "vertical", lineHeight: "1.7" }}
                  placeholder={t('apply.deepdive_placeholder')}
                  value={essay}
                  onChange={e => { setEssay(e.target.value); setError(null); }}
                  onPaste={handlePaste}
                />
                <div className={`absolute bottom-3 right-3 px-2 py-0.5 rounded-lg font-mono text-xs transition-colors ${
                  wordCount < minWords ? "text-red-400 bg-red-400/10"
                  : wordCount > maxWords ? "text-amber-400 bg-amber-400/10"
                  : "bg-[var(--acid)]/10"
                }`} style={wordCount >= minWords && wordCount <= maxWords ? { color: "var(--acid)" } : {}}>
                  {wordCount} {t('candidate_view.metric_words')} · {wordCount < minWords ? t('apply.deepdive_more', { count: minWords - wordCount }) : wordCount > maxWords ? t('apply.deepdive_over', { count: wordCount - maxWords }) : t('apply.deepdive_ok')}
                </div>
              </div>

              <p className="text-white/28 text-xs mt-2">
                {t('apply.deepdive_hint', { min: minWords, max: maxWords })}
              </p>

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => persistStep(1)} className="btn-secondary text-sm">
                  {t('apply.back_to_map')}
                </button>
                <button
                  onClick={submitEssay}
                  disabled={saving || wordCount < minWords}
                  className="btn-primary px-8 py-3"
                >
                  {saving ? <Spinner label={t('common.saving')} /> : t('apply.continue_sjt')}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: SJT */}
          {!showOnboarding && subStep === 3 && (
            <motion.div
              key="sjt"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="glass-card rounded-2xl p-8"
            >
              <div className="hud-corner hud-corner-tl" />
              <div className="hud-corner hud-corner-tr" />

              <div className="mb-6">
                <div className="hud-label mb-1">{t('apply.step_progress', { n: 4, total: 4 })}</div>
                <h2 className="text-xl font-bold text-white mb-1">{t('apply.sjt_title')}</h2>
                <p className="text-white/42 text-sm">
                  {t('apply.sjt_desc')}
                </p>
              </div>

              <SJTTest onComplete={completeSJT} />

              {saving && (
                <div className="text-center mt-4">
                  <Spinner label={t('apply.submitting')} />
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>

        <div className="text-center mt-8">
          <p className="text-xs text-white/18">
            {t('apply.anon_note')}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">
        {label}{required && <span className="ml-1" style={{ color: "var(--acid)" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
      {label}
    </span>
  );
}

function FullPageLoader() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cosmic)" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "var(--acid)" }} />
        </div>
        <span className="hud-label tracking-widest">{t('common.loading')}</span>
      </div>
    </div>
  );
}
