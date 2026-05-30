import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

// ─── Sidebar icons ────────────────────────────────────────────
const TABS = [
  {
    id: "leaderboard",
    path: "/commission",
    tooltipKey: "sidebar.leaderboard",
    matchFn: (p: string) => p === "/commission",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 8h10M7 12h7M7 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "candidate",
    path: null as string | null, // dynamic — set to last visited candidate
    tooltipKey: "sidebar.candidate",
    matchFn: (p: string) => p.startsWith("/commission/candidate"),
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="18" cy="6" r="2" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: "search",
    path: "/commission/search",
    tooltipKey: "sidebar.search",
    matchFn: (p: string) => p === "/commission/search",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "history",
    path: "/commission/history",
    tooltipKey: "sidebar.history",
    matchFn: (p: string) => p === "/commission/history",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 4l2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "settings",
    path: "/commission/settings",
    tooltipKey: "sidebar.settings",
    matchFn: (p: string) => p === "/commission/settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

interface Props {
  onLogout: () => void;
}

export function CommissionSidebar({ onLogout }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);
  const { t } = useTranslation();

  // Remember last visited candidate path for the "Candidate" tab
  const lastCandidatePath = location.pathname.startsWith("/commission/candidate")
    ? location.pathname
    : (sessionStorage.getItem("lastCandidatePath") ?? null);

  if (location.pathname.startsWith("/commission/candidate")) {
    sessionStorage.setItem("lastCandidatePath", location.pathname);
  }

  function handleTabClick(tab: typeof TABS[0]) {
    if (tab.id === "candidate") {
      if (lastCandidatePath) navigate(lastCandidatePath);
      // else do nothing — no candidate viewed yet
      return;
    }
    if (tab.path) navigate(tab.path);
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 0, top: 0, bottom: 0,
        width: 56,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "12px",
        paddingBottom: "12px",
        background: "rgba(5,5,5,0.92)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 34, height: 34, borderRadius: "10px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(209,255,0,0.08)", border: "1px solid rgba(209,255,0,0.18)",
          marginBottom: "20px", flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "11px", fontWeight: "900", color: "var(--acid)", fontFamily: "'Space Grotesk', sans-serif" }}>iU</span>
      </div>

      {/* Nav tabs */}
      <div className="flex flex-col items-center gap-2 flex-1">
        {TABS.map(tab => {
          const active = tab.matchFn(location.pathname);
          const disabled = tab.id === "candidate" && !lastCandidatePath;
          return (
            <div key={tab.id} style={{ position: "relative" }}>
              <motion.button
                whileHover={disabled ? {} : { scale: 1.08 }}
                whileTap={disabled ? {} : { scale: 0.94 }}
                onMouseEnter={() => setHovered(tab.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => !disabled && handleTabClick(tab)}
                style={{
                  width: 40, height: 40, borderRadius: "11px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: active ? "rgba(209,255,0,0.12)" : "transparent",
                  border: `1px solid ${active ? "rgba(209,255,0,0.3)" : "transparent"}`,
                  color: active ? "var(--acid)" : disabled ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.35)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  transition: "all 0.18s",
                  position: "relative",
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                {tab.icon}
                {active && (
                  <div style={{
                    position: "absolute",
                    left: -8, top: "50%", transform: "translateY(-50%)",
                    width: 3, height: 18, borderRadius: "0 2px 2px 0",
                    background: "var(--acid)",
                  }} />
                )}
              </motion.button>

              {/* Tooltip */}
              {hovered === tab.id && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    position: "absolute",
                    left: "calc(100% + 10px)",
                    top: "50%", transform: "translateY(-50%)",
                    background: "rgba(20,20,20,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "8px",
                    padding: "5px 10px",
                    whiteSpace: "nowrap",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.75)",
                    fontFamily: "JetBrains Mono, monospace",
                    pointerEvents: "none",
                    zIndex: 100,
                  }}
                >
                  {tab.id === "candidate" && disabled ? t("sidebar.candidate") : t(tab.tooltipKey)}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ width: 30, height: 1, background: "rgba(255,255,255,0.08)", marginBottom: "12px" }} />

      {/* Logout */}
      <div style={{ position: "relative" }}>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onMouseEnter={() => setHovered("logout")}
          onMouseLeave={() => setHovered(null)}
          onClick={onLogout}
          style={{
            width: 40, height: 40, borderRadius: "11px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent",
            border: "1px solid transparent",
            color: "rgba(255,255,255,0.25)",
            cursor: "pointer",
            transition: "all 0.18s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </motion.button>
        {hovered === "logout" && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
              position: "absolute",
              left: "calc(100% + 10px)",
              top: "50%", transform: "translateY(-50%)",
              background: "rgba(20,20,20,0.95)",
              border: "1px solid rgba(255,107,107,0.25)",
              borderRadius: "8px",
              padding: "5px 10px",
              whiteSpace: "nowrap",
              fontSize: "12px",
              color: "#f87171",
              fontFamily: "JetBrains Mono, monospace",
              pointerEvents: "none",
              zIndex: 100,
            }}
          >
            {t("common.logout")}
          </motion.div>
        )}
      </div>
    </div>
  );
}
