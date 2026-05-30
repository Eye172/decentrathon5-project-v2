import { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { TimelineEvent } from "../types";

interface Props {
  events: TimelineEvent[];
  onChange: (events: TimelineEvent[]) => void;
}

const DIR_BASE = {
  up: { border: "#D1FF00", text: "#D1FF00", bg: "rgba(209,255,0,0.08)", cardOffset: -130 },
  neutral: { border: "rgba(255,255,255,0.35)", text: "rgba(255,255,255,0.65)", bg: "rgba(255,255,255,0.05)", cardOffset: -60 },
  down: { border: "#FF6B6B", text: "#FF6B6B", bg: "rgba(255,107,107,0.08)", cardOffset: 30 },
} as const;

const CANVAS_H = 400;
const AXIS_Y = CANVAS_H / 2;
const EVENT_W = 160;

export function TimelineBuilder({ events, onChange }: Props) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<TimelineEvent, "id">>({
    date: "", title: "", description: "", direction: "neutral",
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const DIR_CONFIG = useMemo(() => ({
    up: { ...DIR_BASE.up, label: t("timeline.dir_growth") },
    neutral: { ...DIR_BASE.neutral, label: t("timeline.dir_neutral") },
    down: { ...DIR_BASE.down, label: t("timeline.dir_setback") },
  }), [t]);

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  function openAdd() {
    setForm({ date: "", title: "", description: "", direction: "neutral" });
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(ev: TimelineEvent) {
    setForm({ date: ev.date, title: ev.title, description: ev.description, direction: ev.direction });
    setEditingId(ev.id);
    setShowModal(true);
  }

  function save() {
    if (!form.date || !form.title.trim()) return;
    if (editingId) {
      onChange(events.map(e => e.id === editingId ? { ...form, id: editingId } : e));
    } else {
      onChange([...events, { ...form, id: `ev_${Date.now()}` }]);
    }
    setShowModal(false);
  }

  function remove(id: string) {
    onChange(events.filter(e => e.id !== id));
    setShowModal(false);
  }

  const canvasW = Math.max(900, sorted.length * EVENT_W + 200);

  const axisLabels = [
    { y: AXIS_Y - 130, label: t("timeline.axis_success") },
    { y: AXIS_Y, label: t("timeline.axis_neutral") },
    { y: AXIS_Y + 130, label: t("timeline.axis_setback") },
  ];

  return (
    <div className="select-none">
      <div
        ref={scrollRef}
        style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
          height: `${CANVAS_H}px`,
          position: "relative",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div className="hud-grid" style={{ borderRadius: "16px" }} />
        <div style={{ width: canvasW, height: CANVAS_H, position: "relative" }}>
          <div className="scan-overlay" />

          {axisLabels.map(({ y, label }) => (
            <div key={label} style={{
              position: "absolute", left: 8, top: y - 6,
              fontSize: "8px", color: "rgba(255,255,255,0.18)",
              fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em",
            }}>{label}</div>
          ))}

          {[-130, 0, 130].map(offset => (
            <div key={offset} style={{
              position: "absolute",
              left: 50, right: 50,
              top: AXIS_Y + offset,
              height: 1,
              background: offset === 0
                ? "rgba(255,255,255,0.15)"
                : "rgba(255,255,255,0.05)",
              borderTop: offset !== 0 ? "1px dashed rgba(255,255,255,0.06)" : "none",
            }} />
          ))}

          <div style={{
            position: "absolute", left: 52, top: AXIS_Y - 5,
            width: 10, height: 10, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
          }} />

          {sorted.length > 1 && sorted.map((_, i) => {
            if (i === 0) return null;
            const prev = sorted[i - 1];
            const curr = sorted[i];
            const x1 = 80 + (i - 1) * EVENT_W + 60;
            const x2 = 80 + i * EVENT_W + 60;
            const y1 = AXIS_Y + (prev.direction === "up" ? -130 : prev.direction === "down" ? 130 : 0);
            const y2 = AXIS_Y + (curr.direction === "up" ? -130 : curr.direction === "down" ? 130 : 0);
            const prevColor = DIR_CONFIG[prev.direction].border;
            return (
              <svg key={i} style={{ position: "absolute", left: 0, top: 0, width: canvasW, height: CANVAS_H, pointerEvents: "none", overflow: "visible" }}>
                <path
                  d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={prevColor}
                  strokeWidth="1.5"
                  strokeOpacity="0.3"
                  strokeDasharray="4 4"
                />
              </svg>
            );
          })}

          {sorted.map((ev, i) => {
            const cfg = DIR_CONFIG[ev.direction];
            const x = 80 + i * EVENT_W;
            const nodeY = AXIS_Y + (ev.direction === "up" ? -130 : ev.direction === "down" ? 130 : 0);
            const cardY = nodeY + cfg.cardOffset;
            return (
              <motion.div key={ev.id} style={{ display: "contents" }}>
                <div style={{
                  position: "absolute",
                  left: x + 55,
                  top: ev.direction === "up" ? cardY + 80 : nodeY,
                  width: 1,
                  height: Math.abs(nodeY - (ev.direction === "up" ? cardY + 80 : nodeY + cfg.cardOffset + 80)),
                  background: `linear-gradient(${ev.direction === "down" ? "to bottom" : "to top"}, ${cfg.border}00, ${cfg.border}55)`,
                  pointerEvents: "none",
                }} />

                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 400 }}
                  onClick={() => openEdit(ev)}
                  style={{
                    position: "absolute",
                    left: x + 48,
                    top: nodeY - 8,
                    width: 16, height: 16,
                    borderRadius: "50%",
                    background: cfg.bg,
                    border: `2px solid ${cfg.border}`,
                    boxShadow: `0 0 10px ${cfg.border}44`,
                    cursor: "pointer",
                    zIndex: 3,
                  }}
                />

                <div style={{
                  position: "absolute",
                  left: x + 35,
                  top: ev.direction === "up" ? nodeY + 10 : nodeY - 22,
                  fontSize: "9px",
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "JetBrains Mono, monospace",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}>{ev.date}</div>

                <motion.div
                  initial={{ opacity: 0, y: ev.direction === "up" ? -10 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 + 0.1 }}
                  onClick={() => openEdit(ev)}
                  style={{
                    position: "absolute",
                    left: x + 4,
                    top: cardY,
                    width: 108,
                    padding: "8px 10px",
                    borderRadius: "10px",
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}55`,
                    cursor: "pointer",
                    zIndex: 4,
                  }}
                >
                  <div style={{
                    fontSize: "10px",
                    fontWeight: "700",
                    color: cfg.text,
                    marginBottom: "3px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>{i + 1}. {ev.title}</div>
                  <div style={{
                    fontSize: "9px",
                    color: "rgba(255,255,255,0.4)",
                    lineHeight: "1.4",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>{ev.description}</div>
                  <div style={{
                    fontSize: "8px",
                    color: cfg.text,
                    opacity: 0.6,
                    marginTop: "4px",
                    fontFamily: "JetBrains Mono, monospace",
                  }}>{cfg.label}</div>
                </motion.div>
              </motion.div>
            );
          })}

          {sorted.length === 0 && (
            <div style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
            }}>
              <div style={{ fontSize: "32px", marginBottom: "8px", opacity: 0.2 }}>+</div>
              <div className="hud-label">{t("timeline.add_first_event")}</div>
            </div>
          )}

          {sorted.length > 0 && (
            <div style={{
              position: "absolute",
              right: 20,
              top: AXIS_Y - 10,
              fontSize: "20px",
              color: "rgba(255,255,255,0.2)",
              pointerEvents: "none",
            }}>›</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 px-1">
        <div className="flex items-center gap-4">
          {(Object.keys(DIR_CONFIG) as (keyof typeof DIR_CONFIG)[]).map((key) => {
            const cfg = DIR_CONFIG[key];
            return (
              <div key={key} className="flex items-center gap-1.5">
                <div style={{ width: 8, height: 8, borderRadius: "50%", border: `2px solid ${cfg.border}`, background: cfg.bg }} />
                <span style={{ fontSize: "10px", color: cfg.text, fontFamily: "JetBrains Mono, monospace", opacity: 0.7 }}>{cfg.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="hud-mono">{t("timeline.count_min", { count: events.length })}</span>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openAdd}
            className="btn-primary text-sm px-4 py-2"
          >
            {t("timeline.add_event")}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(8px)",
              zIndex: 999,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "20px",
            }}
            onClick={e => e.target === e.currentTarget && setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="glass-card rounded-2xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="hud-corner hud-corner-tl" />
              <div className="hud-corner hud-corner-tr" />

              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-white text-lg">
                  {editingId ? t("timeline.modal_edit") : t("timeline.modal_add")}
                </h3>
                <button type="button" onClick={() => setShowModal(false)} style={{ color: "rgba(255,255,255,0.3)", fontSize: "20px", lineHeight: 1 }}>×</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="field-label">{t("timeline.field_date")}</label>
                  <input
                    className="input"
                    type="month"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="field-label">
                    {t("timeline.field_title")}
                    <span style={{ color: "rgba(255,255,255,0.28)", marginLeft: "8px" }}>{form.title.length}/50</span>
                  </label>
                  <input
                    className="input"
                    maxLength={50}
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={t("timeline.placeholder_title")}
                  />
                </div>

                <div>
                  <label className="field-label">
                    {t("timeline.field_description")}
                    <span style={{ color: "rgba(255,255,255,0.28)", marginLeft: "8px" }}>{form.description.length}/200</span>
                  </label>
                  <textarea
                    className="input"
                    style={{ minHeight: "72px", resize: "vertical" }}
                    maxLength={200}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder={t("timeline.placeholder_desc")}
                  />
                </div>

                <div>
                  <label className="field-label">{t("timeline.field_direction")}</label>
                  <div className="flex gap-2">
                    {(["up", "neutral", "down"] as const).map(dir => {
                      const cfg = DIR_CONFIG[dir];
                      const active = form.direction === dir;
                      return (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, direction: dir }))}
                          style={{
                            flex: 1, padding: "10px 8px",
                            borderRadius: "10px",
                            border: `1.5px solid ${active ? cfg.border : "rgba(255,255,255,0.1)"}`,
                            background: active ? cfg.bg : "rgba(255,255,255,0.025)",
                            color: active ? cfg.text : "rgba(255,255,255,0.42)",
                            fontSize: "12px", fontWeight: "600",
                            cursor: "pointer",
                            transition: "all 0.18s",
                          }}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", marginTop: "6px", fontFamily: "JetBrains Mono, monospace" }}>
                    {form.direction === "up" && t("timeline.hint_up")}
                    {form.direction === "neutral" && t("timeline.hint_neutral")}
                    {form.direction === "down" && t("timeline.hint_down")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => remove(editingId)}
                    style={{
                      fontSize: "13px", color: "#FF6B6B",
                      background: "rgba(255,107,107,0.08)",
                      border: "1px solid rgba(255,107,107,0.22)",
                      borderRadius: "10px", padding: "8px 14px",
                      cursor: "pointer",
                    }}
                  >
                    {t("timeline.delete")}
                  </button>
                ) : <div />}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary text-sm px-4 py-2">
                    {t("timeline.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={!form.date || !form.title.trim()}
                    className="btn-primary text-sm px-4 py-2"
                  >
                    {editingId ? t("timeline.save") : t("timeline.add_btn")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
