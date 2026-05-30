import { useTranslation } from "react-i18next";

interface AiDetectionBadgeProps {
  score: number | null;
}

export function AiDetectionBadge({ score }: AiDetectionBadgeProps) {
  const { t } = useTranslation();

  if (score === null) return <span className="text-white/25 text-sm">—</span>;

  const pct = Math.round(score * 100);

  if (pct < 35) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#CAFF00]/10 text-[#CAFF00] border border-[#CAFF00]/20 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[#CAFF00] inline-block" />
        {t("badges.original")} · {pct}%
      </span>
    );
  }
  if (pct < 60) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
        {t("badges.check")} · {pct}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-400/10 text-red-400 border border-red-400/20 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
      {t("badges.ai_risk")} · {pct}%
    </span>
  );
}
