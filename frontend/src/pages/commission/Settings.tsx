import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCommission, DEFAULT_SETTINGS, DEFAULT_EYE_CALIBRATION } from "../../context/CommissionContext";
import type { CategoryWeights, EyeCalibration } from "../../context/CommissionContext";
import { motion } from "framer-motion";
import { MeshBackground } from "../../components/MeshBackground";
import { CommissionSidebar } from "../../components/CommissionSidebar";
import { useTranslation } from "react-i18next";

const WEIGHT_LABELS: Record<keyof CategoryWeights, { labelKey: string; color: string; descKey: string }> = {
  path_traveled: { labelKey: "settings.w_path", color: "var(--acid)", descKey: "settings.w_path_desc" },
  leadership: { labelKey: "settings.w_leadership", color: "#6478FF", descKey: "settings.w_leadership_desc" },
  motivation: { labelKey: "settings.w_motivation", color: "#F97316", descKey: "settings.w_motivation_desc" },
  resilience: { labelKey: "settings.w_resilience", color: "#A855F7", descKey: "settings.w_resilience_desc" },
  authenticity: { labelKey: "settings.w_authenticity", color: "#EC4899", descKey: "settings.w_authenticity_desc" },
};

export function CommissionSettings() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const { settings, updateSettings, updateWeights, updateEyeCalibration } = useCommission();
  const { t, i18n } = useTranslation();

  const sysinfoItems = useMemo(() => {
    const rows = t("settings.sysinfo_items", { returnObjects: true }) as { label: string; value: string; status: string }[];
    return Array.isArray(rows) ? rows : [];
  }, [t, i18n.language]);

  const [localWeights, setLocalWeights] = useState<CategoryWeights>({ ...settings.weights });
  const [threshold, setThreshold] = useState(settings.ai_threshold);
  const [eyeCalib, setEyeCalib] = useState<EyeCalibration>({
    ...DEFAULT_EYE_CALIBRATION,
    ...(settings.eye_calibration ?? {}),
  });
  const [saved, setSaved] = useState(false);
  const [inputMode, setInputMode] = useState<Record<keyof CategoryWeights, boolean>>({
    path_traveled: false, leadership: false, motivation: false, resilience: false, authenticity: false,
  });

  useEffect(() => {
    if (!auth?.token) { navigate("/commission/login"); return; }
  }, []);

  // Sync local to context whenever save happens
  useEffect(() => {
    setLocalWeights({ ...settings.weights });
    setThreshold(settings.ai_threshold);
    setEyeCalib({ ...DEFAULT_EYE_CALIBRATION, ...(settings.eye_calibration ?? {}) });
  }, [settings]);

  const total = Object.values(localWeights).reduce((s, v) => s + v, 0);
  const totalOk = Math.abs(total - 100) < 0.01;

  function handleWeightChange(key: keyof CategoryWeights, raw: string) {
    const val = parseFloat(raw);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      setLocalWeights(prev => ({ ...prev, [key]: Math.round(val * 10) / 10 }));
      setSaved(false);
    }
  }

  function handleSlider(key: keyof CategoryWeights, val: number) {
    setLocalWeights(prev => ({ ...prev, [key]: Math.round(val * 10) / 10 }));
    setSaved(false);
  }

  function autoBalance(changedKey: keyof CategoryWeights, newVal: number) {
    const others = (Object.keys(localWeights) as (keyof CategoryWeights)[]).filter(k => k !== changedKey);
    const remaining = 100 - newVal;
    const current = others.reduce((s, k) => s + localWeights[k], 0);
    if (current === 0) {
      const each = remaining / others.length;
      const balanced = { ...localWeights, [changedKey]: newVal };
      others.forEach(k => { balanced[k] = Math.round(each * 10) / 10; });
      setLocalWeights(balanced);
    } else {
      const factor = remaining / current;
      const balanced = { ...localWeights, [changedKey]: newVal };
      let sum = newVal;
      others.forEach((k, i) => {
        if (i < others.length - 1) {
          balanced[k] = Math.round(localWeights[k] * factor * 10) / 10;
          sum += balanced[k];
        } else {
          balanced[k] = Math.round((100 - sum) * 10) / 10;
        }
      });
      setLocalWeights(balanced);
    }
    setSaved(false);
  }

  function handleSave() {
    if (!totalOk) return;
    updateWeights(localWeights);
    updateSettings({ ai_threshold: threshold });
    updateEyeCalibration(eyeCalib);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleReset() {
    setLocalWeights({ ...DEFAULT_SETTINGS.weights });
    setThreshold(DEFAULT_SETTINGS.ai_threshold);
    setEyeCalib({ ...DEFAULT_EYE_CALIBRATION });
    setSaved(false);
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
              <h1 className="text-base font-bold text-white">{t("settings.title")}</h1>
              <div className="hud-label">{t("settings.subtitle")}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hud-mono text-[11px]"
                style={{ color: totalOk ? "var(--acid)" : "#f87171" }}>
                {t("settings.total")}: {Math.round(total * 10) / 10}%
                {totalOk ? " ✓" : ` ✗ ${t("settings.must_100")}`}
              </span>
              <button onClick={handleReset} className="btn-secondary text-sm py-2 px-3">
                {t("settings.reset")}
              </button>
              <button onClick={handleSave} disabled={!totalOk} className="btn-primary text-sm px-5 py-2">
                {saved ? t("settings.saved") : t("settings.save")}
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

          {/* Weight configuration */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="glass-card rounded-2xl p-6"
          >
            <div className="hud-corner hud-corner-tl" />
            <div className="hud-corner hud-corner-tr" />

            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-white text-lg">{t("settings.weights_title")}</h2>
                <p className="text-white/40 text-sm mt-0.5">
                  {t("settings.weights_desc")}
                </p>
              </div>
              {/* Visual total ring */}
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                border: `3px solid ${totalOk ? "var(--acid)" : "#f87171"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "border-color 0.3s",
                background: totalOk ? "rgba(209,255,0,0.06)" : "rgba(248,113,113,0.06)",
              }}>
                <div style={{
                  fontSize: "14px", fontWeight: "900",
                  color: totalOk ? "var(--acid)" : "#f87171",
                  fontFamily: "'Space Grotesk', sans-serif",
                  textAlign: "center", lineHeight: 1,
                }}>
                  {Math.round(total * 10) / 10}
                  <div style={{ fontSize: "9px", fontWeight: "400", opacity: 0.7 }}>/ 100</div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {(Object.keys(localWeights) as (keyof CategoryWeights)[]).map((key, idx) => {
                const cfg = WEIGHT_LABELS[key];
                const val = localWeights[key];
                const isEditing = inputMode[key];
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                        <div>
                          <span className="font-semibold text-white text-sm">{t(cfg.labelKey)}</span>
                          <span className="text-white/30 text-xs ml-2">{t(cfg.descKey)}</span>
                        </div>
                      </div>
                      {/* Value input */}
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={val}
                            onChange={e => handleWeightChange(key, e.target.value)}
                            onBlur={() => setInputMode(m => ({ ...m, [key]: false }))}
                            autoFocus
                            className="input text-right"
                            style={{ width: "80px", padding: "4px 8px", fontSize: "13px" }}
                          />
                        ) : (
                          <button
                            onClick={() => setInputMode(m => ({ ...m, [key]: true }))}
                            style={{
                              minWidth: 64, padding: "4px 10px",
                              borderRadius: "8px", border: `1px solid ${cfg.color}44`,
                              background: `${cfg.color}0A`,
                              color: cfg.color, fontFamily: "JetBrains Mono, monospace",
                              fontSize: "13px", fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            {val.toFixed(1)}%
                          </button>
                        )}
                        <button
                          onClick={() => autoBalance(key, val)}
                          className="btn-secondary text-xs py-1 px-2"
                          title={t("settings.auto_balance_title")}
                        >
                          ⇌
                        </button>
                      </div>
                    </div>

                    {/* Slider */}
                    <div style={{ position: "relative", height: "4px" }}>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={0.5}
                        value={val}
                        onChange={e => handleSlider(key, parseFloat(e.target.value))}
                        style={{
                          width: "100%",
                          height: "4px",
                          appearance: "none",
                          outline: "none",
                          borderRadius: "2px",
                          background: `linear-gradient(to right, ${cfg.color} 0%, ${cfg.color} ${val}%, rgba(255,255,255,0.1) ${val}%, rgba(255,255,255,0.1) 100%)`,
                          cursor: "pointer",
                        }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Total warning */}
            {!totalOk && (
              <div className="mt-5 p-3 rounded-xl error-box text-xs">
                {t("settings.weight_error", { val: Math.round(total * 10) / 10 })}
                {total > 100 && ` ${t("settings.weight_reduce", { val: Math.round((total - 100) * 10) / 10 })}`}
                {total < 100 && ` ${t("settings.weight_add", { val: Math.round((100 - total) * 10) / 10 })}`}
              </div>
            )}

            {/* Quick presets */}
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="hud-label mb-3">{t("settings.presets")}</div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { labelKey: "settings.balanced", w: { path_traveled: 25, leadership: 25, motivation: 25, resilience: 15, authenticity: 10 } },
                  { labelKey: "settings.leadership_focus", w: { path_traveled: 20, leadership: 35, motivation: 20, resilience: 15, authenticity: 10 } },
                  { labelKey: "settings.grit_focus", w: { path_traveled: 20, leadership: 20, motivation: 20, resilience: 30, authenticity: 10 } },
                  { labelKey: "settings.motivation_focus", w: { path_traveled: 20, leadership: 20, motivation: 35, resilience: 15, authenticity: 10 } },
                ].map(preset => (
                  <button
                    key={preset.labelKey}
                    onClick={() => { setLocalWeights(preset.w as CategoryWeights); setSaved(false); }}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* AI Detector threshold */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="glass-card rounded-2xl p-6"
          >
            <div className="hud-corner hud-corner-tl" />

            <h2 className="font-bold text-white text-lg mb-2">{t("settings.threshold_title")}</h2>
            <p className="text-white/40 text-sm mb-5">
              {t("settings.threshold_desc")}
            </p>

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-white/60 text-sm">{t("settings.trigger")}</span>
                <input
                  type="number"
                  min={30}
                  max={90}
                  step={1}
                  value={threshold}
                  onChange={e => { setThreshold(Number(e.target.value)); setSaved(false); }}
                  className="input text-center"
                  style={{ width: "70px", padding: "6px", fontSize: "14px" }}
                />
                <span className="text-white/60 text-sm">%</span>
              </div>
              <div style={{
                padding: "6px 14px", borderRadius: "8px",
                background: threshold > 70 ? "rgba(248,113,113,0.08)" : threshold < 50 ? "rgba(251,191,36,0.08)" : "rgba(209,255,0,0.06)",
                border: `1px solid ${threshold > 70 ? "rgba(248,113,113,0.3)" : threshold < 50 ? "rgba(251,191,36,0.3)" : "rgba(209,255,0,0.2)"}`,
                color: threshold > 70 ? "#f87171" : threshold < 50 ? "#fbbf24" : "var(--acid)",
                fontSize: "12px", fontFamily: "JetBrains Mono, monospace", fontWeight: "700",
              }}>
                {threshold > 70 ? t("settings.thresh_lenient_mode") : threshold < 50 ? t("settings.thresh_strict_mode") : t("settings.thresh_balanced_mode")}
              </div>
            </div>

            <input
              type="range"
              min={30}
              max={90}
              step={1}
              value={threshold}
              onChange={e => { setThreshold(Number(e.target.value)); setSaved(false); }}
              style={{
                width: "100%", height: "4px", appearance: "none",
                borderRadius: "2px", outline: "none", cursor: "pointer",
                background: `linear-gradient(to right, #f87171 0%, #fbbf24 40%, var(--acid) 70%, rgba(255,255,255,0.1) 70%, rgba(255,255,255,0.1) 100%)`,
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="hud-label text-red-400/60">{t("settings.strict_label")}</span>
              <span className="hud-label">{t("settings.recommended")}</span>
              <span className="hud-label text-amber-400/60">{t("settings.lenient_label")}</span>
            </div>

            <div className="mt-4 p-3 rounded-xl text-xs text-white/40"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {t("settings.current_threshold", { val: threshold })}
            </div>
          </motion.div>

          {/* Eye-tracking calibration */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="glass-card rounded-2xl p-6"
          >
            <div className="hud-corner hud-corner-tl" />

            <div className="flex items-center gap-3 mb-1">
              <span className="text-lg">👁</span>
              <div>
                <h2 className="font-bold text-white text-lg leading-tight">X-Ray Vision · Калибровка детектора</h2>
                <p className="text-white/40 text-sm mt-0.5">
                  Настройте строгость анализа движений глаз. Изменения применяются ко всем кандидатам в реальном времени.
                </p>
              </div>
            </div>

            <div className="space-y-6 mt-5">

              {/* Saccade sensitivity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-white text-sm">Чувствительность к саккадам</span>
                    <span className="text-white/30 text-xs ml-2">Saccade Sensitivity</span>
                  </div>
                  <div style={{
                    minWidth: 56, padding: "4px 10px", borderRadius: "8px",
                    border: "1px solid rgba(209,255,0,0.3)", background: "rgba(209,255,0,0.07)",
                    color: "var(--acid)", fontFamily: "JetBrains Mono, monospace",
                    fontSize: "13px", fontWeight: "700", textAlign: "center",
                  }}>
                    ×{eyeCalib.saccade_sensitivity.toFixed(1)}
                  </div>
                </div>
                <input
                  type="range" min={0.1} max={3.0} step={0.1}
                  value={eyeCalib.saccade_sensitivity}
                  onChange={e => { setEyeCalib(p => ({ ...p, saccade_sensitivity: parseFloat(e.target.value) })); setSaved(false); }}
                  style={{
                    width: "100%", height: "4px", appearance: "none",
                    borderRadius: "2px", outline: "none", cursor: "pointer",
                    background: `linear-gradient(to right, var(--acid) 0%, var(--acid) ${((eyeCalib.saccade_sensitivity - 0.1) / 2.9) * 100}%, rgba(255,255,255,0.1) ${((eyeCalib.saccade_sensitivity - 0.1) / 2.9) * 100}%, rgba(255,255,255,0.1) 100%)`,
                  }}
                />
                <div className="flex justify-between mt-1">
                  <span className="hud-label" style={{ color: "rgba(255,255,255,0.3)" }}>×0.1 Мягко</span>
                  <span className="hud-label" style={{ color: "var(--acid)" }}>×1.0 Стандарт</span>
                  <span className="hud-label" style={{ color: "#ef4444" }}>×3.0 Строго</span>
                </div>
                <p className="text-white/25 text-xs mt-1.5">
                  Множитель для числа обнаруженных саккадических паттернов. ×1.0 = стандарт, ×3.0 = штраф утраивается.
                </p>
              </div>

              {/* Gaze boundary */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-white text-sm">Допустимое отклонение взгляда</span>
                    <span className="text-white/30 text-xs ml-2">Gaze Boundary</span>
                  </div>
                  <div style={{
                    minWidth: 56, padding: "4px 10px", borderRadius: "8px",
                    border: "1px solid rgba(147,197,253,0.3)", background: "rgba(147,197,253,0.06)",
                    color: "#93c5fd", fontFamily: "JetBrains Mono, monospace",
                    fontSize: "13px", fontWeight: "700", textAlign: "center",
                  }}>
                    {eyeCalib.gaze_boundary}%
                  </div>
                </div>
                <input
                  type="range" min={10} max={50} step={1}
                  value={eyeCalib.gaze_boundary}
                  onChange={e => { setEyeCalib(p => ({ ...p, gaze_boundary: parseInt(e.target.value) })); setSaved(false); }}
                  style={{
                    width: "100%", height: "4px", appearance: "none",
                    borderRadius: "2px", outline: "none", cursor: "pointer",
                    background: `linear-gradient(to right, #93c5fd 0%, #93c5fd ${((eyeCalib.gaze_boundary - 10) / 40) * 100}%, rgba(255,255,255,0.1) ${((eyeCalib.gaze_boundary - 10) / 40) * 100}%, rgba(255,255,255,0.1) 100%)`,
                  }}
                />
                <div className="flex justify-between mt-1">
                  <span className="hud-label" style={{ color: "#ef4444" }}>10% Строго</span>
                  <span className="hud-label" style={{ color: "var(--acid)" }}>20% Стандарт</span>
                  <span className="hud-label" style={{ color: "rgba(255,255,255,0.3)" }}>50% Свободно</span>
                </div>
                <p className="text-white/25 text-xs mt-1.5">
                  Насколько далеко от центра камеры кандидат может смотреть без штрафа. 10% = почти только в камеру.
                </p>
              </div>

              {/* Emotion freeze penalty toggle */}
              <div className="flex items-center justify-between rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div>
                  <span className="font-semibold text-white text-sm">Штраф за «каменное лицо»</span>
                  <span className="text-white/30 text-xs ml-2">Emotion Freeze Penalty</span>
                  <p className="text-white/30 text-xs mt-1">
                    Если мимика отсутствует (browInnerUp почти не меняется) при активной речи — вероятно чтение.
                  </p>
                </div>
                <button
                  onClick={() => { setEyeCalib(p => ({ ...p, emotion_freeze_penalty: !p.emotion_freeze_penalty })); setSaved(false); }}
                  style={{
                    flexShrink: 0, marginLeft: 16,
                    width: 48, height: 26, borderRadius: 13,
                    border: "none", cursor: "pointer",
                    background: eyeCalib.emotion_freeze_penalty ? "var(--acid)" : "rgba(255,255,255,0.12)",
                    transition: "background 0.25s",
                    position: "relative",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 3,
                    left: eyeCalib.emotion_freeze_penalty ? 25 : 3,
                    width: 20, height: 20, borderRadius: "50%",
                    background: eyeCalib.emotion_freeze_penalty ? "#000" : "rgba(255,255,255,0.5)",
                    transition: "left 0.25s",
                  }} />
                </button>
              </div>

            </div>

            {/* Preview of current impact */}
            <div className="mt-5 p-3 rounded-xl text-xs"
              style={{ background: "rgba(209,255,0,0.03)", border: "1px solid rgba(209,255,0,0.1)" }}>
              <span className="hud-label" style={{ color: "rgba(209,255,0,0.5)" }}>ТЕКУЩИЙ ЭФФЕКТ · </span>
              <span className="text-white/45">
                При {eyeCalib.saccade_sensitivity >= 2 ? "высокой" : eyeCalib.saccade_sensitivity >= 1 ? "стандартной" : "низкой"} чувствительности
                {" "}и границе {eyeCalib.gaze_boundary}% —
                {" "}{eyeCalib.saccade_sensitivity > 1.5 ? " любые быстрые движения глаз будут засчитаны как паттерны чтения." : eyeCalib.saccade_sensitivity < 0.7 ? " только явное пилообразное чтение будет засчитано." : " стандартный порог детекции."}
                {eyeCalib.emotion_freeze_penalty ? " Штраф за мимику: ВКЛ." : " Штраф за мимику: ВЫКЛ."}
              </span>
            </div>
          </motion.div>

          {/* Other settings */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="glass-card rounded-2xl p-6"
          >
            <div className="hud-corner hud-corner-tl" />
            <h2 className="font-bold text-white text-lg mb-4">{t("settings.sysinfo_title")}</h2>

            <div className="grid grid-cols-2 gap-4">
              {sysinfoItems.map((item, i) => (
                <div key={`${item.label}-${i}`} className="glass rounded-xl p-4">
                  <div className="hud-label mb-1">{item.label}</div>
                  <div className="text-white/70 text-sm font-medium">{item.value}</div>
                  <div className="hud-mono mt-1" style={{ color: "var(--acid)" }}>{item.status}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 p-4 rounded-xl" style={{ background: "rgba(209,255,0,0.03)", border: "1px solid rgba(209,255,0,0.1)" }}>
              <div className="hud-label mb-2" style={{ color: "rgba(209,255,0,0.5)" }}>{t("settings.test_creds")}</div>
              <div className="space-y-1 font-mono text-xs text-white/55">
                <div>commission1@invisionu.kz · commission123</div>
                <div>commission2@invisionu.kz · commission123</div>
                <div>admin@invisionu.kz · admin123</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
