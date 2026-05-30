import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

const LANGUAGES = [
  { code: "ru", label: "РУС", full: "Русский" },
  { code: "en", label: "ENG", full: "English" },
  { code: "kz", label: "ҚАЗ", full: "Қазақша" },
] as const;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // expanded controls the SIZE of the container — decoupled from content state
  const [expanded, setExpanded] = useState(false);
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[1];

  function handleOpen() {
    setExpanded(true);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    // container shrinks only AFTER panel content has finished fading out
  }

  return (
    <div style={{ position: "fixed", left: 0, bottom: "88px", zIndex: 1000 }}>
      {/* Single morphing element — layout animation handles size transition */}
      <motion.div
        layout
        transition={{
          layout: { type: "spring", stiffness: 360, damping: 32 },
        }}
        onClick={!expanded ? handleOpen : undefined}
        style={{
          position: "relative",
          borderRadius: "0 16px 16px 0",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          background: expanded ? "rgba(6, 6, 6, 0.94)" : "rgba(8, 8, 8, 0.92)",
          border: "1px solid",
          borderLeft: "none",
          borderColor: expanded
            ? "rgba(209, 255, 0, 0.35)"
            : "rgba(255, 255, 255, 0.13)",
          boxShadow: expanded
            ? "6px 0 32px rgba(0,0,0,0.6), 0 0 28px rgba(209,255,0,0.08)"
            : "4px 0 20px rgba(0,0,0,0.55)",
          overflow: "hidden",
          cursor: expanded ? "default" : "pointer",
          minWidth: expanded ? "172px" : "36px",
        }}
      >
        {/* Top colour strip — always present, morphs opacity */}
        <motion.div
          layout
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: "1px",
            background:
              "linear-gradient(90deg, rgba(209,255,0,0.7), rgba(100,120,255,0.55), transparent)",
            pointerEvents: "none",
          }}
        />

        <AnimatePresence
          mode="wait"
          initial={false}
          onExitComplete={() => {
            // fires after panel content fully fades out → NOW shrink the container
            if (!open) setExpanded(false);
          }}
        >
          {/* ── CLOSED STATE: vertical tab ── */}
          {!open && (
            <motion.div
              key="tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                padding: "16px 11px",
              }}
            >
              {/* Globe */}
              <svg
                width="14" height="14" viewBox="0 0 16 16" fill="none"
                style={{ color: "rgba(255,255,255,0.50)", flexShrink: 0 }}
              >
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                <ellipse cx="8" cy="8" rx="2.8" ry="6.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>

              {/* Vertical language label */}
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 800,
                  fontSize: "9px",
                  letterSpacing: "0.14em",
                  writingMode: "vertical-rl",
                  color: "rgba(209,255,0,0.80)",
                  textShadow: "0 0 10px rgba(209,255,0,0.5)",
                  userSelect: "none",
                }}
              >
                {current.label}
              </span>

              {/* Down arrow */}
              <svg
                width="10" height="10" viewBox="0 0 12 12" fill="none"
                style={{ color: "rgba(255,255,255,0.30)" }}
              >
                <path
                  d="M2 4l4 4 4-4"
                  stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          )}

          {/* ── OPEN STATE: expanded panel ── */}
          {open && (
            <motion.div
              key="panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: 0.08 }}
              style={{ padding: "12px 12px 10px 10px" }}
            >
              {/* HUD label */}
              <div style={{ paddingBottom: "8px", paddingLeft: "4px" }}>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "8.5px",
                    letterSpacing: "0.20em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.22)",
                  }}
                >
                  // Language
                </span>
              </div>

              {/* Language options */}
              {LANGUAGES.map(({ code, label, full }, i) => {
                const isActive = i18n.language === code;
                return (
                  <motion.button
                    key={code}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{
                      delay: 0.08 + i * 0.06,
                      type: "spring",
                      stiffness: 400,
                      damping: 28,
                    }}
                    onClick={() => { i18n.changeLanguage(code); handleClose(); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      width: "100%",
                      padding: "7px 8px",
                      marginBottom: "2px",
                      borderRadius: "10px",
                      border: "1px solid",
                      borderColor: isActive
                        ? "rgba(209,255,0,0.28)"
                        : "transparent",
                      background: isActive
                        ? "rgba(209,255,0,0.09)"
                        : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background =
                          "rgba(255,255,255,0.05)";
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "rgba(255,255,255,0.09)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "transparent";
                      }
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "11px",
                        fontWeight: 800,
                        width: "32px",
                        flexShrink: 0,
                        color: isActive ? "#D1FF00" : "rgba(255,255,255,0.35)",
                        textShadow: isActive
                          ? "0 0 10px rgba(209,255,0,0.65)"
                          : "none",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: "12px",
                        color: isActive
                          ? "rgba(255,255,255,0.80)"
                          : "rgba(255,255,255,0.28)",
                      }}
                    >
                      {full}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="lang-dot"
                        style={{
                          marginLeft: "auto",
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: "#D1FF00",
                          boxShadow:
                            "0 0 6px rgba(209,255,0,1), 0 0 14px rgba(209,255,0,0.5)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </motion.button>
                );
              })}

              {/* Collapse arrow — bottom right corner */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  paddingTop: "6px",
                }}
              >
                <motion.button
                  onClick={handleClose}
                  whileHover={{ x: -2 }}
                  whileTap={{ scale: 0.90 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.28)",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color =
                      "rgba(209,255,0,0.7)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "rgba(209,255,0,0.22)";
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(209,255,0,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color =
                      "rgba(255,255,255,0.28)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.04)";
                  }}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 12 12" fill="none"
                  >
                    <path
                      d="M8 2L4 6l4 4"
                      stroke="currentColor" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "8px",
                      letterSpacing: "0.10em",
                    }}
                  >
                    CLOSE
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom colour strip */}
        <motion.div
          layout
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            height: "1px",
            background:
              "linear-gradient(90deg, rgba(100,120,255,0.45), rgba(209,255,0,0.40), transparent)",
            pointerEvents: "none",
          }}
        />
      </motion.div>
    </div>
  );
}
