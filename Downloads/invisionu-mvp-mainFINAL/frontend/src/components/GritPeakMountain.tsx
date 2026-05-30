import type { CommissionDetail } from "../types";

/** Вертикальный отступ: цитаты в верхней зоне, гора ниже. */
const OY = 108;

/** Три вершины: левая «плечо», центральный пик, правая уступ. */
const MOUNTAIN_D =
  "M 12 354 L 74 354 L 100 290 L 124 316 L 170 132 L 202 226 L 242 184 L 272 306 L 302 354 L 408 354 L 408 362 L 12 362 Z";

const CLIMB_X0 = 124;
const CLIMB_Y0 = 208 + OY;
const CLIMB_X1 = 170;
const CLIMB_Y1 = 24 + OY;

const VB_W = 420;
const VB_H = 256 + OY;

/** Больше балл → больше слотов для цитат (если цитат нет — блоки не рендерятся). */
function quoteSlotsForScore(score: number): number {
  if (score >= 88) return 6;
  if (score >= 73) return 5;
  if (score >= 58) return 4;
  if (score >= 43) return 3;
  if (score >= 28) return 2;
  if (score >= 12) return 1;
  return 0;
}

/** Фрагменты текста кандидата, релевантные стойкости / grit (эссе, интервью, карта жизни). */
function extractResilienceQuotes(candidate: CommissionDetail): string[] {
  const chunks: string[] = [];
  if (candidate.essay?.trim()) chunks.push(candidate.essay);
  candidate.interview_messages
    .filter((m) => m.role === "candidate")
    .forEach((m) => chunks.push(m.content));
  try {
    if (candidate.extra_activities) {
      const parsed = JSON.parse(candidate.extra_activities);
      if (Array.isArray(parsed)) {
        parsed.forEach((ev: { title?: string; description?: string }) => {
          const bit = [ev.title, ev.description].filter(Boolean).join(". ").trim();
          if (bit.length >= 12) chunks.push(bit);
        });
      }
    }
  } catch {
    /* ignore */
  }

  const text = chunks.join("\n");
  const resilienceRe =
    /персист|упорств|не\s+сда|несмотря|трудност|провал|снова|продолж|месяц|год|выдерж|преодол|настойчив|терпен|вновь|очередн|ошибк|неудач|қайта|табанд|қиындық|сәтсіз|жалғасты|шыдам|despite|failed|failure|persistence|grit|obstacle|challenge|setback|persever|kept going|give up|gave up|months|years|again|struggle|resilien|overcome|difficult/i;

  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim().replace(/^["«»"]+|["«»"]+$/g, ""))
    .filter((s) => s.length >= 24 && s.length <= 320);

  const hits = sentences.filter((s) => resilienceRe.test(s));
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const h of hits) {
    const key = h.slice(0, 80).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h.length > 140 ? `${h.slice(0, 137)}…` : h);
    if (unique.length >= 10) break;
  }

  if (unique.length === 0 && candidate.essay?.trim()) {
    const ex = candidate.essay.trim();
    if (ex.length >= 30) unique.push(ex.length > 140 ? `${ex.slice(0, 137)}…` : ex);
  }

  return unique;
}

/** Все блоки над горой (нижний край < вершины ~132). */
const QUOTE_LAYOUT: { x: number; y: number; w: number; h: number; lx: number; ly: number }[] = [
  { x: 6, y: 6, w: 128, h: 44, lx: 70, ly: 48 },
  { x: 146, y: 6, w: 128, h: 44, lx: 210, ly: 48 },
  { x: 286, y: 6, w: 128, h: 44, lx: 350, ly: 48 },
  { x: 6, y: 54, w: 128, h: 44, lx: 70, ly: 96 },
  { x: 146, y: 54, w: 128, h: 44, lx: 210, ly: 96 },
  { x: 286, y: 54, w: 128, h: 44, lx: 350, ly: 96 },
];

const ACID     = "#D1FF00";
const CYAN     = "#06E6FF";
const HATCH_C  = "#06E6FF";
const LEVEL_C  = "rgba(209,255,0,0.45)";

function Alpinist({ scale = 1 }: { scale?: number }) {
  return (
    <g transform={`scale(${scale})`} filter="url(#alpinistGlow)">
      {/* рюкзак */}
      <path
        d="M -10 -2 L -12 8 L -6 10 L -4 2 Z"
        fill="#1a2d4a"
        stroke="#06E6FF"
        strokeWidth="0.6"
      />
      <rect x="-11" y="-6" width="8" height="10" rx="1.5" fill="#162540" stroke="#06E6FF" strokeWidth="0.55" />
      {/* лямка рюкзака — acid green */}
      <line x1="-7" y1="-6" x2="-6" y2="2" stroke="#D1FF00" strokeWidth="0.8" />
      {/* тело — тёмно-синий костюм с видимыми гранями */}
      <path d="M -4 -8 L 6 -6 L 7 4 L 2 10 L -3 8 Z" fill="#1c3354" stroke="#06E6FF" strokeWidth="0.7" />
      {/* полоса на груди — acid green */}
      <line x1="1" y1="-7" x2="2" y2="6" stroke="#D1FF00" strokeWidth="1.4" strokeLinecap="round" />
      {/* ноги */}
      <path d="M 2 10 L 8 18 L 6 20 L 0 12 Z" fill="#142236" stroke="#06E6FF" strokeWidth="0.5" />
      <path d="M -3 8 L -6 18 L -4 20 L 0 12 Z" fill="#0f1c2d" stroke="#06E6FF" strokeWidth="0.5" />
      {/* ботинки — cyan подошва */}
      <ellipse cx="7"  cy="20.5" rx="3.2" ry="1.4" fill="#0e1e33" stroke="#06E6FF" strokeWidth="0.7" />
      <ellipse cx="-5" cy="20.5" rx="3"   ry="1.3" fill="#0e1e33" stroke="#06E6FF" strokeWidth="0.7" />
      {/* рука */}
      <path d="M 5 -4 L 12 -2 L 11 1 L 5 -1 Z" fill="#1c3354" stroke="#06E6FF" strokeWidth="0.5" />
      {/* ледоруб — белый металл с acid клыком */}
      <line x1="11" y1="-3" x2="22" y2="-14" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M 22 -14 L 26 -18 L 24 -12 Z" fill="#D1FF00" stroke="#a3c700" strokeWidth="0.4" />
      {/* голова */}
      <circle cx="0" cy="-12" r="5.5" fill="#1a3050" stroke="#06E6FF" strokeWidth="0.65" />
      {/* визор шлема — cyan заливка */}
      <path
        d="M -3.5 -13 A 4 4 0 0 1 3.5 -13 L 3 -10 L -3 -10 Z"
        fill="#06E6FF"
        fillOpacity={0.35}
        stroke="#06E6FF"
        strokeWidth="0.6"
      />
      {/* блик визора */}
      <line x1="-2" y1="-12.5" x2="-1" y2="-10.5" stroke="white" strokeWidth="0.5" strokeOpacity={0.5} strokeLinecap="round" />
      {/* фонарик — acid green */}
      <rect x="-1.2" y="-17.5" width="2.4" height="3" rx="0.6" fill="#D1FF00" />
      <ellipse cx="0" cy="-17" rx="2.5" ry="1.2" fill="#D1FF00" fillOpacity={0.5} />
    </g>
  );
}

interface Props {
  score: number;
  candidate: CommissionDetail;
}

export function GritPeakMountain({ score, candidate }: Props) {
  const allQuotes = extractResilienceQuotes(candidate);
  const slots = quoteSlotsForScore(score);
  const displayQuotes = slots > 0 ? allQuotes.slice(0, slots) : [];

  const tClimb = Math.min(0.9, Math.max(0.26, 0.3 + (score / 100) * 0.54));
  const cx = CLIMB_X0 + (CLIMB_X1 - CLIMB_X0) * tClimb;
  const cy = CLIMB_Y0 + (CLIMB_Y1 - CLIMB_Y0) * tClimb;

  const hatchTop = 130;
  const hatchBottom = 362;
  const lines: number[] = [];
  for (let y = hatchBottom; y >= hatchTop; y -= 2.8) lines.push(y);

  const summitLabel = 100;
  const progressReadout = Math.round(2100 + (score / 100) * 900);

  return (
    <div className="relative w-full mx-auto select-none">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-auto block"
        style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.35))" }}
        aria-label="Grit peak visualization"
      >
        <defs>
          <clipPath id="gritMountainClip">
            <path d={MOUNTAIN_D} />
          </clipPath>
          <linearGradient id="gritSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(6,230,255,0.07)" />
            <stop offset="100%" stopColor="rgba(6,230,255,0.00)" />
          </linearGradient>
          <linearGradient id="gritMountainFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(209,255,0,0.06)" />
            <stop offset="100%" stopColor="rgba(6,230,255,0.03)" />
          </linearGradient>
          <filter id="acidGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="alpinistGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#06E6FF" floodOpacity="0.45" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect width={VB_W} height={OY + 14} fill="url(#gritSky)" />

        <g clipPath="url(#gritMountainClip)">
          {lines.map((y) => (
            <line
              key={y}
              x1={0}
              x2={VB_W}
              y1={y}
              y2={y}
              stroke={HATCH_C}
              strokeWidth={0.85}
              opacity={0.18}
            />
          ))}
        </g>

        {/* горная заливка с глубиной */}
        <path
          d={MOUNTAIN_D}
          fill="url(#gritMountainFill)"
          stroke="none"
        />

        {/* основной контур горы — acid green с glow */}
        <path
          d={MOUNTAIN_D}
          fill="none"
          stroke={ACID}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.85}
          filter="url(#acidGlow)"
        />
        {/* тонкий внутренний контур для глубины */}
        <path
          d={MOUNTAIN_D}
          fill="none"
          stroke={CYAN}
          strokeWidth={0.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* горизонталь уровня альпиниста */}
        <line
          x1={4}
          x2={VB_W - 4}
          y1={cy}
          y2={cy}
          stroke={LEVEL_C}
          strokeWidth={1.1}
          strokeDasharray="5 4"
          filter="url(#acidGlow)"
        />
        <line x1={4} x2={VB_W - 4} y1={cy} y2={cy} stroke={ACID} strokeWidth={0.3} opacity={0.5} />

        <text
          x={14}
          y={cy + 4}
          fontSize={11}
          fill={ACID}
          fontFamily="JetBrains Mono, monospace"
          fontWeight={700}
        >
          ~{Math.round(score)}%
        </text>
        <text
          x={VB_W - 12}
          y={126}
          textAnchor="end"
          fontSize={10}
          fill="rgba(255,255,255,0.35)"
          fontFamily="JetBrains Mono, monospace"
          letterSpacing="0.06em"
        >
          {summitLabel}
        </text>
        <line
          x1={VB_W - 28}
          x2={VB_W - 12}
          y1={130}
          y2={130}
          stroke={CYAN}
          strokeWidth={0.7}
          opacity={0.4}
        />
        <text
          x={VB_W - 12}
          y={cy - 6}
          textAnchor="end"
          fontSize={9}
          fill={CYAN}
          fontFamily="JetBrains Mono, monospace"
          opacity={0.8}
        >
          {progressReadout}
        </text>

        {displayQuotes.map((_, i) => {
          const pos = QUOTE_LAYOUT[i];
          if (!pos) return null;
          return (
            <line
              key={`conn-${i}`}
              x1={pos.lx}
              y1={pos.ly}
              x2={cx}
              y2={cy - 2}
              stroke={CYAN}
              strokeWidth={0.7}
              strokeDasharray="3 3"
              opacity={0.35}
            />
          );
        })}

        <g transform={`translate(${cx}, ${cy}) rotate(-10 0 2)`}>
          <Alpinist scale={1.02} />
        </g>

        {displayQuotes.map((q, i) => {
          const pos = QUOTE_LAYOUT[i];
          if (!pos) return null;
          return (
            <foreignObject key={`q-${i}`} x={pos.x} y={pos.y} width={pos.w} height={pos.h}>
              <div
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(6,230,255,0.22)",
                  background: "rgba(4,10,20,0.82)",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 0 12px rgba(6,230,255,0.07), inset 0 0 8px rgba(209,255,0,0.03)",
                  height: "100%",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 9,
                    lineHeight: 1.35,
                    color: "rgba(220,240,255,0.85)",
                    fontFamily: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
                    fontStyle: "italic",
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  &ldquo;{q}&rdquo;
                </p>
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
