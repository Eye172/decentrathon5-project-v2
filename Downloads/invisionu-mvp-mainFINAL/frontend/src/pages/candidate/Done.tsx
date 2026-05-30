import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { MeshBackground } from "../../components/MeshBackground";

export function Done() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="page-dark flex items-center justify-center px-4 min-h-screen">
      <MeshBackground variant="default" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg"
        style={{ zIndex: 10 }}
      >
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="hud-corner hud-corner-tl" />
          <div className="hud-corner hud-corner-tr" />
          <div className="hud-corner hud-corner-bl" />
          <div className="hud-corner hud-corner-br" />

          {/* Success icon with ripple */}
          <div className="relative flex items-center justify-center w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full opacity-20 animate-ping"
              style={{ background: "var(--acid)", animationDuration: "2s" }} />
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center glass"
              style={{ border: "1px solid rgba(209,255,0,0.25)" }}>
              <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
                <path d="M8 20l8 8 16-16" stroke="var(--acid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div className="hud-label mb-2 tracking-[0.2em]">// APPLICATION COMPLETE</div>
          <h1 className="text-3xl font-black text-white mb-3">{t("done.title")}</h1>
          <p className="text-white/48 mb-8 leading-relaxed max-w-sm mx-auto">{t("done.desc")}</p>

          {/* Status timeline */}
          <div className="rounded-2xl px-5 py-5 mb-8 text-left space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="hud-label mb-2 tracking-widest">{t("done.next_title")}</p>

            <TimelineItem
              icon={<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="var(--acid)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              color="rgba(209,255,0,0.15)"
              text={t("done.step1")}
              active
            />
            <TimelineItem
              icon={<span className="text-blue-400" style={{ fontSize: "8px" }}>⏳</span>}
              color="rgba(59,130,246,0.12)"
              text={t("done.step2")}
            />
            <TimelineItem
              icon={<span style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>○</span>}
              color="rgba(255,255,255,0.05)"
              text={t("done.step3")}
              dim
            />
          </div>

          <button onClick={() => { logout(); navigate("/"); }} className="btn-secondary w-full py-3">
            {t("common.logout")}
          </button>

          <p className="hud-label mt-4 text-center">ID PRESERVED · ANONYMOUS · SECURE</p>
        </div>
      </motion.div>
    </div>
  );
}

function TimelineItem({
  icon, color, text, active, dim,
}: {
  icon: React.ReactNode; color: string; text: string; active?: boolean; dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: color }}>
        {icon}
      </span>
      <span style={{ color: dim ? "rgba(255,255,255,0.32)" : active ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.6)" }}>
        {text}
      </span>
    </div>
  );
}
