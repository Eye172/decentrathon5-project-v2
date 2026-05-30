interface ScoreBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
}

const COLOR_MAP: Record<string, string> = {
  brand:   "var(--acid)",
  blue:    "#60a5fa",
  green:   "#34d399",
  yellow:  "#facc15",
  purple:  "#c084fc",
  indigo:  "#818cf8",
  orange:  "#fb923c",
};

export function ScoreBar({ label, value, max, color = "blue" }: ScoreBarProps) {
  const pct = Math.round((value / max) * 100);
  const barColor = COLOR_MAP[color] ?? "#60a5fa";

  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1.5">
        <span className="text-sm text-white/52">{label}</span>
        <span className="text-sm font-semibold font-mono text-white/72">{value} / {max}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 8px ${barColor}55` }}
        />
      </div>
    </div>
  );
}
