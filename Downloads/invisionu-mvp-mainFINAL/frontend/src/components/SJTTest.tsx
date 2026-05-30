import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { SJTAnswer } from "../types";

const TIME_LIMIT = 60;

type ScenarioRow = { title: string; scenario: string; options: string[] };

interface Props {
  onComplete: (answers: SJTAnswer[]) => void;
}

export function SJTTest({ onComplete }: Props) {
  const { t } = useTranslation();
  const scenarios = useMemo(() => {
    const raw = t("sjt.scenarios", { returnObjects: true }) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return (raw as ScenarioRow[]).map((row, i) => ({
      id: i + 1,
      title: row.title,
      scenario: row.scenario,
      options: row.options ?? [],
    }));
  }, [t]);

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<SJTAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [chosen, setChosen] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const startTimeRef = useRef(Date.now());

  const safeScenarios = scenarios.length > 0 ? scenarios : [{
    id: 1,
    title: "—",
    scenario: "—",
    options: ["—"],
  }];

  useEffect(() => {
    startTimeRef.current = Date.now();
    setTimeLeft(TIME_LIMIT);
    setChosen(null);
    setTransitioning(false);
  }, [idx]);

  useEffect(() => {
    if (transitioning || safeScenarios.length === 0) return;
    const tick = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(tick);
          const opts = safeScenarios[idx]?.options ?? [];
          advance(opts[0] ?? "");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [idx, transitioning, safeScenarios]);

  function advance(option: string) {
    if (transitioning || safeScenarios.length === 0) return;
    setTransitioning(true);
    setChosen(option);

    const scenario = safeScenarios[idx];
    const answer: SJTAnswer = {
      scenario_id: scenario.id,
      chosen_option: option,
      time_spent_ms: Date.now() - startTimeRef.current,
    };

    setTimeout(() => {
      const next = [...answers, answer];
      if (idx >= safeScenarios.length - 1) {
        onComplete(next);
      } else {
        setAnswers(next);
        setIdx(i => i + 1);
      }
    }, 500);
  }

  const scenario = safeScenarios[Math.min(idx, safeScenarios.length - 1)];
  const timerPct = (timeLeft / TIME_LIMIT) * 100;
  const timerColor = timeLeft <= 15 ? "#FF6B6B" : timeLeft <= 30 ? "#FBBF24" : "var(--acid)";

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="hud-label mb-1">{t("sjt.header")}</div>
          <div className="flex gap-2">
            {safeScenarios.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 28, height: 4, borderRadius: 2,
                  background: i < idx ? "var(--acid)" : i === idx ? "var(--acid)" : "rgba(255,255,255,0.1)",
                  opacity: i < idx ? 0.5 : 1,
                  transition: "all 0.3s",
                }}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hud-mono" style={{ color: timerColor, transition: "color 0.3s" }}>
            {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        </div>
      </div>

      <div style={{ height: "3px", background: "rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: "28px", overflow: "hidden" }}>
        <motion.div
          style={{
            height: "100%",
            borderRadius: 2,
            background: timerColor,
            transition: "background 0.3s",
          }}
          animate={{ width: `${timerPct}%` }}
          transition={{ duration: 1, ease: "linear" }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div style={{
              padding: "2px 10px", borderRadius: "6px",
              background: "rgba(209,255,0,0.08)", border: "1px solid rgba(209,255,0,0.2)",
              fontSize: "10px", color: "var(--acid)", fontFamily: "JetBrains Mono, monospace",
              fontWeight: "700", letterSpacing: "0.1em",
            }}>
              {t("sjt.case_badge", { current: idx + 1, total: safeScenarios.length })}
            </div>
            <span className="text-white/50 text-sm font-medium">{scenario.title}</span>
          </div>

          <div
            className="glass-card rounded-2xl p-5 mb-5"
            style={{ border: "1px solid rgba(209,255,0,0.1)" }}
          >
            <div className="hud-corner hud-corner-tl" />
            <p className="text-white/85 leading-relaxed" style={{ fontSize: "15px" }}>
              {scenario.scenario}
            </p>
          </div>

          <div className="space-y-3">
            {scenario.options.map((opt, i) => {
              const isChosen = chosen === opt;
              const letter = String.fromCharCode(65 + i);
              return (
                <motion.button
                  key={i}
                  type="button"
                  whileHover={!transitioning ? { scale: 1.01 } : {}}
                  whileTap={!transitioning ? { scale: 0.99 } : {}}
                  onClick={() => !transitioning && advance(opt)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "14px 16px",
                    borderRadius: "14px",
                    border: `1px solid ${isChosen ? "var(--acid)" : "rgba(255,255,255,0.1)"}`,
                    background: isChosen ? "rgba(209,255,0,0.08)" : "rgba(255,255,255,0.03)",
                    cursor: transitioning ? "default" : "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <span style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: "6px",
                    background: isChosen ? "var(--acid)" : "rgba(255,255,255,0.07)",
                    color: isChosen ? "#000" : "rgba(255,255,255,0.45)",
                    fontSize: "11px", fontWeight: "800",
                    fontFamily: "JetBrains Mono, monospace",
                    flexShrink: 0,
                    transition: "all 0.2s",
                  }}>
                    {letter}
                  </span>
                  <span style={{
                    color: isChosen ? "var(--acid)" : "rgba(255,255,255,0.72)",
                    fontSize: "14px",
                    lineHeight: "1.55",
                    transition: "color 0.2s",
                  }}>
                    {opt}
                  </span>
                </motion.button>
              );
            })}
          </div>

          <p className="hud-label text-center mt-4">
            {t("sjt.footer", { seconds: timeLeft })}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
