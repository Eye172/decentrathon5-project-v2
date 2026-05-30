import type { Recommendation } from "../types";
import { useTranslation } from "react-i18next";

interface RecommendationBadgeProps {
  value: Recommendation | null;
  size?: "sm" | "md";
}

const CLASSES: Record<string, string> = {
  recommend: "bg-[#CAFF00]/12 text-[#CAFF00] border-[#CAFF00]/25",
  review: "bg-yellow-400/12 text-yellow-400 border-yellow-400/25",
  reject: "bg-red-400/12 text-red-400 border-red-400/25",
};

export function RecommendationBadge({ value, size = "sm" }: RecommendationBadgeProps) {
  const { t } = useTranslation();

  if (!value) return <span className="text-white/25 text-sm">—</span>;

  const labelKey = value === "recommend" ? "badges.recommend" : value === "review" ? "badges.review" : "badges.reject";
  const classes = CLASSES[value];
  const sizeClass = size === "sm" ? "text-xs px-2.5 py-0.5" : "text-sm px-3 py-1";

  return (
    <span className={`inline-block rounded-full border font-semibold ${classes} ${sizeClass}`}>
      {t(labelKey)}
    </span>
  );
}
