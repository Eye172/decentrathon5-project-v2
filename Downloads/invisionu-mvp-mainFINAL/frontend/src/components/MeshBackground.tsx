import { useEffect, useRef } from "react";

interface Props {
  variant?: "default" | "dense" | "minimal";
}

export function MeshBackground({ variant = "default" }: Props) {
  const tickRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!tickRef.current) return;
    const chars = "0123456789ABCDEF";
    const id = setInterval(() => {
      if (tickRef.current) {
        tickRef.current.textContent = Array.from({ length: 8 }, () =>
          chars[Math.floor(Math.random() * chars.length)]
        ).join("");
      }
    }, 180);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Mesh gradient blobs */}
      <div
        className="mesh-blob mesh-blob-1"
        style={{
          width: "680px", height: "680px",
          background: "radial-gradient(circle, rgba(120,40,200,0.18) 0%, transparent 70%)",
          top: "-180px", left: "-120px",
        }}
      />
      <div
        className="mesh-blob mesh-blob-2"
        style={{
          width: "600px", height: "600px",
          background: "radial-gradient(circle, rgba(20,80,200,0.16) 0%, transparent 70%)",
          bottom: "-150px", right: "-100px",
        }}
      />
      <div
        className="mesh-blob mesh-blob-3"
        style={{
          width: "500px", height: "500px",
          background: "radial-gradient(circle, rgba(0,180,140,0.10) 0%, transparent 70%)",
          top: "40%", left: "40%",
          transform: "translate(-50%, -50%)",
        }}
      />
      {variant !== "minimal" && (
        <div
          className="mesh-blob"
          style={{
            width: "400px", height: "400px",
            background: "radial-gradient(circle, rgba(209,255,0,0.04) 0%, transparent 70%)",
            top: "20%", right: "15%",
            animation: "meshFloat2 32s ease-in-out infinite reverse",
          }}
        />
      )}

      {/* HUD grid overlay */}
      {variant !== "minimal" && <div className="hud-grid" />}

      {/* Scan line */}
      {variant !== "minimal" && <div className="scan-overlay" />}

      {/* Corner HUD info — bottom left */}
      <div
        className="absolute bottom-4 left-5 flex flex-col gap-0.5"
        style={{ zIndex: 2 }}
      >
        <span className="hud-label">SYS // inVision U</span>
        <div className="flex items-center gap-2">
          <div className="status-dot" />
          <span className="hud-mono">LIVE</span>
          <span className="hud-mono opacity-40">|</span>
          <span className="hud-mono" ref={tickRef}>4F2A9E1B</span>
        </div>
      </div>

      {/* Corner HUD info — bottom right */}
      <div
        className="absolute bottom-4 right-5 flex flex-col items-end gap-0.5"
        style={{ zIndex: 2 }}
      >
        <span className="hud-label">AI ADMISSIONS v2.0</span>
        <span className="hud-mono opacity-50">DECENTRATHON 5.0</span>
      </div>

      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(5,5,5,0.6) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
