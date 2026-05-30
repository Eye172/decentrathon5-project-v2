import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState, useRef, useMemo } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { MeshBackground } from "../components/MeshBackground";
import { useTranslation } from "react-i18next";

// ─── Perspective grid background ──────────────────────────────
function PerspectiveGrid() {
  return (
    <div style={{
      position: "absolute",
      bottom: 0, left: "50%",
      transform: "translateX(-50%)",
      width: "130%", height: "420px",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: 2,
    }}>
      {/* The grid plane */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.8, delay: 0.1 }}
        style={{
          position: "absolute",
          bottom: -60, left: "-10%",
          width: "120%", height: "280%",
          backgroundImage: `
            linear-gradient(rgba(209,255,0,0.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(209,255,0,0.09) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          transform: "perspective(600px) rotateX(72deg) scaleX(1.1)",
          transformOrigin: "bottom center",
          maskImage: "radial-gradient(ellipse 75% 60% at 50% 100%, black 20%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 60% at 50% 100%, black 20%, transparent 100%)",
        }}
      />
      {/* Glow at horizon */}
      <div style={{
        position: "absolute",
        bottom: "18%", left: "50%",
        transform: "translateX(-50%)",
        width: "60%", height: "3px",
        background: "radial-gradient(ellipse at center, rgba(209,255,0,0.35), transparent 70%)",
        filter: "blur(2px)",
      }} />
    </div>
  );
}

// ─── Scanline sweep ────────────────────────────────────────────
function ScanlineSweep() {
  return (
    <motion.div
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: "2px",
        background: "linear-gradient(90deg, transparent 0%, rgba(209,255,0,0.55) 30%, rgba(209,255,0,0.8) 50%, rgba(209,255,0,0.55) 70%, transparent 100%)",
        pointerEvents: "none",
        zIndex: 20,
        filter: "blur(0.5px)",
        boxShadow: "0 0 12px rgba(209,255,0,0.4)",
      }}
      animate={{ top: ["0%", "100%"] }}
      transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 5, ease: "linear", delay: 1.5 }}
    />
  );
}

// ─── Glitch reveal for SELECTION ──────────────────────────────
function GlitchReveal({ children, style }: { children: string; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      {/* Cyan ghost — left offset */}
      <motion.div
        aria-hidden
        style={{
          position: "absolute", top: 0, left: 0,
          color: "cyan", userSelect: "none",
          clipPath: "polygon(0 20%, 100% 20%, 100% 42%, 0 42%)",
        }}
        initial={{ opacity: 0, x: 0 }}
        animate={{ opacity: [0, 0.7, 0.3, 0, 0.5, 0, 0], x: [0, -8, 4, 0, -3, 0, 0] }}
        transition={{ duration: 1.05, delay: 0.35, times: [0, 0.1, 0.25, 0.45, 0.6, 0.8, 1] }}
      >{children}</motion.div>

      {/* Magenta ghost — right offset */}
      <motion.div
        aria-hidden
        style={{
          position: "absolute", top: 0, left: 0,
          color: "magenta", userSelect: "none",
          clipPath: "polygon(0 58%, 100% 58%, 100% 80%, 0 80%)",
        }}
        initial={{ opacity: 0, x: 0 }}
        animate={{ opacity: [0, 0.6, 0, 0.4, 0, 0.3, 0], x: [0, 6, -4, 2, -1, 0, 0] }}
        transition={{ duration: 1.05, delay: 0.35, times: [0, 0.1, 0.3, 0.5, 0.65, 0.8, 1] }}
      >{children}</motion.div>

      {/* White flash */}
      <motion.div
        aria-hidden
        style={{ position: "absolute", top: 0, left: 0, color: "white", userSelect: "none" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0, 0.6, 0, 0] }}
        transition={{ duration: 0.6, delay: 0.36, times: [0, 0.05, 0.2, 0.3, 0.5, 1] }}
      >{children}</motion.div>

      {/* Main — final settled text */}
      <motion.div
        initial={{ opacity: 0, x: 0, filter: "none" }}
        animate={{
          opacity:  [0, 1, 0.4, 1, 0.7, 1,   1],
          x:        [0, -6,  5, -3,  2, 0,   0],
          filter: [
            "none",
            "drop-shadow(4px 0 0 cyan) drop-shadow(-4px 0 0 magenta) brightness(2)",
            "drop-shadow(-3px 0 0 cyan) brightness(1.6)",
            "drop-shadow(2px 0 0 magenta)",
            "drop-shadow(0 0 8px rgba(209,255,0,0.8))",
            "drop-shadow(0 0 30px rgba(209,255,0,0.4))",
            "drop-shadow(0 0 60px rgba(209,255,0,0.15))",
          ],
        }}
        transition={{ duration: 1.1, delay: 0.3, times: [0, 0.08, 0.22, 0.38, 0.55, 0.75, 1] }}
      >{children}</motion.div>
    </div>
  );
}

// ─── Depth title with 3D mouse tracking ───────────────────────
const DEPTH_LAYERS = 7;

function DepthTitle({ line1, line2, admissionsBadge }: { line1: string; line2: string; admissionsBadge: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [5, -5]), { stiffness: 100, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-400, 400], [-4, 4]), { stiffness: 100, damping: 20 });

  return (
    <div
      ref={ref}
      onMouseMove={e => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        mouseX.set(e.clientX - r.left - r.width / 2);
        mouseY.set(e.clientY - r.top - r.height / 2);
      }}
      onMouseLeave={() => { mouseX.set(0); mouseY.set(0); }}
      style={{ perspective: "900px", userSelect: "none", cursor: "default" }}
    >
      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}>

        {/* LINE 1: DEEP TECH */}
        <div style={{ position: "relative", lineHeight: 1, marginBottom: "0.06em" }}>
          {Array.from({ length: DEPTH_LAYERS }).map((_, i) => (
            <motion.div
              key={i} aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.15 + i * 0.03 }}
              style={{
                position: "absolute",
                top: `${(DEPTH_LAYERS - i) * 1.7}px`,
                left: `${(DEPTH_LAYERS - i) * 0.9}px`,
                fontSize: "clamp(2.8rem, 9vw, 6.5rem)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 900, letterSpacing: "-0.04em",
                color: `rgba(255,255,255,${0.02 + i * 0.013})`,
                whiteSpace: "nowrap", pointerEvents: "none",
              }}
            >{line1}</motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "relative",
              fontSize: "clamp(2.8rem, 9vw, 6.5rem)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 900, letterSpacing: "-0.04em",
              color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap",
              textShadow: "0 0 80px rgba(255,255,255,0.06), 0 2px 20px rgba(0,0,0,0.9)",
            }}
          >{line1}</motion.div>
        </div>

        {/* LINE 2: SELECTION — with glitch */}
        <div style={{ position: "relative", lineHeight: 1, marginBottom: "0.18em" }}>
          {Array.from({ length: DEPTH_LAYERS }).map((_, i) => (
            <motion.div
              key={i} aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 + i * 0.03 }}
              style={{
                position: "absolute",
                top: `${(DEPTH_LAYERS - i) * 2.1}px`,
                left: `${(DEPTH_LAYERS - i) * 1.1}px`,
                fontSize: "clamp(2.8rem, 9vw, 6.5rem)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 900, letterSpacing: "-0.04em",
                color: `rgba(209,255,0,${0.05 + i * 0.022})`,
                whiteSpace: "nowrap", pointerEvents: "none",
              }}
            >{line2}</motion.div>
          ))}
          <GlitchReveal style={{
            fontSize: "clamp(2.8rem, 9vw, 6.5rem)",
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 900, letterSpacing: "-0.04em",
            color: "var(--acid)", whiteSpace: "nowrap",
            textShadow: [
              "0 0 60px rgba(209,255,0,0.4)",
              "0 0 120px rgba(209,255,0,0.18)",
              "1px 1px 0 rgba(209,255,0,0.55)",
              "2px 2px 0 rgba(209,255,0,0.38)",
              "3px 3px 0 rgba(209,255,0,0.22)",
              "4px 4px 0 rgba(209,255,0,0.12)",
            ].join(", "),
          }}>{line2}</GlitchReveal>
        </div>

        {/* iU badge + system label */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.6 }}
          style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "6px" }}
        >
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "5px 14px 5px 8px", borderRadius: "100px",
            background: "rgba(209,255,0,0.06)", border: "1px solid rgba(209,255,0,0.22)",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: "6px",
              background: "rgba(209,255,0,0.12)", border: "1px solid rgba(209,255,0,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "8px", fontWeight: 900, color: "var(--acid)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>iU</div>
            <span style={{
              color: "var(--acid)", fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "13px", fontWeight: 700, letterSpacing: "0.07em",
            }}>inVision U</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div className="status-dot" style={{ width: 5, height: 5 }} />
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: "10px",
              color: "rgba(255,255,255,0.28)", letterSpacing: "0.13em",
            }}>{admissionsBadge}</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── Typewriter text ───────────────────────────────────────────
function TypewriterText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const start = setTimeout(() => {
      const iv = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) { clearInterval(iv); setDone(true); }
      }, 22);
      return () => clearInterval(iv);
    }, delay * 1000);
    return () => clearTimeout(start);
  }, [text, delay]);

  return (
    <span>
      {displayed}
      {!done && (
        <span style={{
          display: "inline-block", width: "2px", height: "1.1em",
          background: "var(--acid)", verticalAlign: "text-bottom",
          marginLeft: "2px", animation: "cursorBlink 0.8s step-end infinite",
        }} />
      )}
    </span>
  );
}

// ─── Animated counter ──────────────────────────────────────────
function AnimatedCounter({
  target, prefix = "", suffix = "", decimals = 0, delay = 0,
}: {
  target: number; prefix?: string; suffix?: string; decimals?: number; delay?: number;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const start = performance.now();
      const dur = 1400;
      function tick(now: number) {
        const progress = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(parseFloat((eased * target).toFixed(decimals)));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [target, delay]);

  const display = decimals > 0
    ? value.toFixed(decimals)
    : value >= 1000
    ? value.toLocaleString("en")
    : String(value);

  return <>{prefix}{display}{suffix}</>;
}

// ─── Feature cards (visual meta; copy from i18n landing.features) ─
const FEATURE_META = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 2"/>
        <path d="M12 7v3M12 14v3M7 12H4M20 12h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="1" fill="currentColor"/>
      </svg>
    ),
    color: "var(--acid)", rgb: "209,255,0",
    bg: "rgba(209,255,0,0.04)", border: "rgba(209,255,0,0.16)",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="11" width="18" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="12" cy="16.5" r="1.8" fill="currentColor" opacity="0.7"/>
        <path d="M12 16.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    color: "#34d399", rgb: "52,211,153",
    bg: "rgba(52,211,153,0.04)", border: "rgba(52,211,153,0.18)",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.5"/>
      </svg>
    ),
    color: "#a78bfa", rgb: "167,139,250",
    bg: "rgba(167,139,250,0.04)", border: "rgba(167,139,250,0.18)",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color: "#60a5fa", rgb: "96,165,250",
    bg: "rgba(96,165,250,0.04)", border: "rgba(96,165,250,0.18)",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#fb923c", rgb: "251,146,60",
    bg: "rgba(251,146,60,0.04)", border: "rgba(251,146,60,0.18)",
  },
];

type FeatureRow = (typeof FEATURE_META)[0] & { label: string; sub: string; detail: string };

// ─── Feature card ──────────────────────────────────────────────
function FeatureCard({ f, i }: { f: FeatureRow; i: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        position: "relative",
        padding: "20px",
        borderRadius: "16px",
        background: hovered ? `rgba(${f.rgb},0.07)` : f.bg,
        border: `1px solid ${hovered ? `rgba(${f.rgb},0.32)` : f.border}`,
        backdropFilter: "blur(16px)",
        transition: "background 0.25s, border 0.25s, box-shadow 0.25s, transform 0.25s",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? `0 8px 32px rgba(${f.rgb},0.1), 0 0 0 1px rgba(${f.rgb},0.15)` : "none",
        cursor: "default",
        overflow: "hidden",
      }}
    >
      {/* Corner accent */}
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: "40px", height: "40px",
        borderTop: `1px solid rgba(${f.rgb},0.35)`,
        borderLeft: `1px solid rgba(${f.rgb},0.35)`,
        borderRadius: "16px 0 0 0",
        opacity: hovered ? 1 : 0.5,
        transition: "opacity 0.25s",
      }} />
      <div style={{
        position: "absolute", bottom: 0, right: 0,
        width: "28px", height: "28px",
        borderBottom: `1px solid rgba(${f.rgb},0.2)`,
        borderRight: `1px solid rgba(${f.rgb},0.2)`,
        borderRadius: "0 0 16px 0",
        opacity: hovered ? 0.8 : 0.3,
        transition: "opacity 0.25s",
      }} />

      {/* Glow blob behind icon */}
      <div style={{
        position: "absolute", top: -20, left: -10,
        width: "80px", height: "80px",
        background: `radial-gradient(ellipse at center, rgba(${f.rgb},0.12), transparent 70%)`,
        filter: "blur(8px)",
        opacity: hovered ? 1 : 0.5,
        transition: "opacity 0.3s",
        pointerEvents: "none",
      }} />

      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: "13px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `rgba(${f.rgb},0.08)`,
        border: `1px solid rgba(${f.rgb},0.22)`,
        color: f.color, marginBottom: "14px", flexShrink: 0,
        boxShadow: hovered ? `0 0 20px rgba(${f.rgb},0.2)` : "none",
        transition: "box-shadow 0.25s",
      }}>
        {f.icon}
      </div>

      {/* Label */}
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: "14px", fontWeight: 800,
        color: f.color, marginBottom: "5px", lineHeight: 1.2,
        letterSpacing: "-0.01em",
      }}>{f.label}</div>

      {/* Sub */}
      <div style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "10px", color: "rgba(255,255,255,0.42)",
        letterSpacing: "0.04em", marginBottom: "10px", lineHeight: 1.3,
      }}>{f.sub}</div>

      {/* Detail — appears on hover */}
      <motion.div
        animate={{ opacity: hovered ? 1 : 0, height: hovered ? "auto" : 0 }}
        transition={{ duration: 0.2 }}
        style={{ overflow: "hidden" }}
      >
        <div style={{
          fontSize: "11px", color: "rgba(255,255,255,0.35)",
          lineHeight: 1.5, fontFamily: "'Space Grotesk', sans-serif",
          paddingTop: "6px",
          borderTop: `1px solid rgba(${f.rgb},0.12)`,
        }}>{f.detail}</div>
      </motion.div>
    </motion.div>
  );
}

// ─── Landing ───────────────────────────────────────────────────
export function Landing() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const features = useMemo(() => {
    const parts = t("landing.features", { returnObjects: true }) as { label: string; sub: string; detail: string }[];
    return FEATURE_META.map((meta, i) => ({
      ...meta,
      label: parts[i]?.label ?? "",
      sub: parts[i]?.sub ?? "",
      detail: parts[i]?.detail ?? "",
    }));
  }, [t, i18n.language]);

  useEffect(() => {
    if (auth?.role === "commission") navigate("/commission");
    if (auth?.role === "candidate") navigate("/apply");
  }, [auth]);

  return (
    <div
      className="page-dark flex flex-col items-center justify-center px-4 min-h-screen"
      style={{ overflow: "hidden", paddingTop: "48px", paddingBottom: "64px" }}
    >
      <MeshBackground />

      {/* Atmospheric blooms */}
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -70%)", width: "800px", height: "450px", background: "radial-gradient(ellipse at center, rgba(209,255,0,0.06) 0%, transparent 65%)", pointerEvents: "none", zIndex: 1, filter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "35%", transform: "translate(-50%, -30%)", width: "450px", height: "450px", background: "radial-gradient(ellipse at center, rgba(100,120,255,0.04) 0%, transparent 60%)", pointerEvents: "none", zIndex: 1 }} />

      {/* Perspective grid */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "380px", zIndex: 2, pointerEvents: "none" }}>
        <PerspectiveGrid />
      </div>

      <div className="relative w-full max-w-4xl" style={{ zIndex: 10 }}>

        {/* Top bar */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "52px", padding: "0 4px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: 34, height: 34, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(209,255,0,0.07)", border: "1px solid rgba(209,255,0,0.18)" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, color: "var(--acid)", fontFamily: "'Space Grotesk', sans-serif" }}>iU</span>
            </div>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", letterSpacing: "0.18em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>inVision U</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="status-dot" style={{ width: 5, height: 5 }} />
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.28)" }}>{t('landing.system_online')}</span>
          </div>
        </motion.div>

        {/* Hero section with scanline */}
        <div style={{ position: "relative" }}>
          <ScanlineSweep />

          {/* Depth title */}
          <div style={{ marginBottom: "16px" }}>
            <DepthTitle
              line1={t("landing.hero_deep_tech")}
              line2={t("landing.hero_selection")}
              admissionsBadge={t("landing.ai_admissions_badge")}
            />
          </div>

          {/* Tagline — typewriter */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.55, duration: 0.4 }}
            style={{
              color: "rgba(255,255,255,0.38)", fontSize: "15px",
              marginBottom: "28px", maxWidth: "520px", lineHeight: 1.65,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            <TypewriterText
              text={t("landing.hero_tagline")}
              delay={1.65}
            />
          </motion.p>

          {/* Stats counters */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.0, duration: 0.5 }}
            style={{ display: "flex", gap: "32px", marginBottom: "44px" }}
          >
            {[
              { target: 1247, suffix: "+", label: t('landing.stat_candidates_label'), decimals: 0, delay: 2.1, color: "var(--acid)" },
              { target: 98.3, suffix: "%", label: t('landing.stat_accuracy_label'), decimals: 1, delay: 2.25, color: "#a78bfa" },
              { target: 4.2, suffix: t("landing.stat_seconds_suffix"), label: t('landing.stat_time_label'), decimals: 1, delay: 2.4, color: "#60a5fa" },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 900,
                  color: stat.color, lineHeight: 1,
                  textShadow: `0 0 20px ${stat.color}44`,
                }}>
                  <AnimatedCounter target={stat.target} suffix={stat.suffix} decimals={stat.decimals} delay={stat.delay} />
                </div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "rgba(255,255,255,0.28)", letterSpacing: "0.1em", marginTop: "4px" }}>
                  {stat.label.toUpperCase()}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <RoleCard
            delay={0.2}
            onClick={() => navigate("/register")}
            accentColor="var(--acid)" accentRgb="209,255,0"
            nodeLabel={t("landing.node_candidate")}
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12z" stroke="var(--acid)" strokeWidth="1.5"/><path d="M3.6 21.6c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4" stroke="var(--acid)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
            iconBg="rgba(209,255,0,0.07)" iconBorder="rgba(209,255,0,0.15)"
            title={t('landing.candidate_title')}
            desc={t('landing.candidate_desc')}
            cta={t('landing.candidate_cta')}
            steps={[t('landing.step_c1'), t('landing.step_c2'), t('landing.step_c3'), t('landing.step_c4')]}
          />
          <RoleCard
            delay={0.3}
            onClick={() => navigate("/commission/login")}
            accentColor="#6478FF" accentRgb="100,120,255"
            nodeLabel={t("landing.node_commission")}
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#6478FF" strokeWidth="1.5"/><path d="M7 8h10M7 12h7M7 16h5" stroke="#6478FF" strokeWidth="1.5" strokeLinecap="round"/></svg>}
            iconBg="rgba(100,120,255,0.07)" iconBorder="rgba(100,120,255,0.18)"
            title={t('landing.commission_title')}
            desc={t('landing.commission_desc')}
            cta={t('landing.commission_cta')}
            steps={[t('landing.step_m1'), t('landing.step_m2'), t('landing.step_m3'), t('landing.step_m4')]}
          />
        </div>

        {/* Feature cards — big grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.45 }}
        >
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08))" }} />
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px", color: "rgba(255,255,255,0.22)", letterSpacing: "0.24em" }}>
              {t("landing.system_specs")}
            </span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(255,255,255,0.08), transparent)" }} />
          </div>

          {/* 5 cards: 3 on top row, 2 centered on bottom */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "10px" }}>
            {features.slice(0, 3).map((f, i) => (
              <FeatureCard key={i} f={f} i={i} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", maxWidth: "calc(66.6% + 10px)", margin: "0 auto" }}>
            {features.slice(3).map((f, i) => (
              <FeatureCard key={i + 3} f={f} i={i + 3} />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Role card with step preview ──────────────────────────────
function RoleCard({
  delay, onClick, accentColor, accentRgb, nodeLabel,
  icon, iconBg, iconBorder, title, desc, cta, steps,
}: {
  delay: number; onClick: () => void;
  accentColor: string; accentRgb: string; nodeLabel: string;
  icon: React.ReactNode; iconBg: string; iconBorder: string;
  title: string; desc: string; cta: string; steps: string[];
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      className="glass-card rounded-2xl p-7 text-left group"
      style={{
        transition: "box-shadow 0.25s",
        boxShadow: hovered ? `0 0 0 1px rgba(${accentRgb},0.28), 0 12px 50px rgba(${accentRgb},0.1)` : "none",
      }}
    >
      <div className="hud-corner hud-corner-tl" />
      <div className="hud-corner hud-corner-tr" />
      <div className="hud-corner hud-corner-bl" />
      <div className="hud-corner hud-corner-br" />

      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ transitionDuration: "0.3s" }}>
        <span className="hud-mono text-[10px]">{nodeLabel}</span>
      </div>

      <div style={{ width: 48, height: 48, borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px", background: iconBg, border: `1px solid ${iconBorder}` }}>
        {icon}
      </div>

      <h2 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, marginBottom: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h2>
      <p style={{ color: "rgba(255,255,255,0.38)", fontSize: "13px", lineHeight: 1.6, marginBottom: "18px" }}>{desc}</p>

      {/* Step preview — appears on hover */}
      <motion.div
        animate={{ opacity: hovered ? 1 : 0, height: hovered ? "auto" : 0, marginBottom: hovered ? 16 : 0 }}
        transition={{ duration: 0.22 }}
        style={{ overflow: "hidden" }}
      >
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {steps.map((s, i) => (
            <div key={s} style={{
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <span style={{
                padding: "3px 8px", borderRadius: "6px", fontSize: "10px",
                background: `rgba(${accentRgb},0.07)`, border: `1px solid rgba(${accentRgb},0.2)`,
                color: accentColor, fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
              }}>{i + 1}. {s}</span>
              {i < steps.length - 1 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>›</span>}
            </div>
          ))}
        </div>
      </motion.div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: accentColor }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }} className="group-hover:translate-x-1 transition-transform inline-block">{cta}</span>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="group-hover:translate-x-1 transition-transform">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </motion.button>
  );
}
