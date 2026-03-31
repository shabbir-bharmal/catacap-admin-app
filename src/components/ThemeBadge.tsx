import ClimateChangeImg from "@assets/Climate-Change.png";
import GenderEquityImg from "@assets/Gender-Equity.png";
import OceanImg from "@assets/Ocean.png";
import PovertyImg from "@assets/Poverty-Alleviation.png";
import RacialJusticeImg from "@assets/Racial-Justice.png";
import OtherImg from "@assets/Other.png";
import { cn } from "@/lib/utils";

const themeIconMap: Record<string, string> = {
  "climate change": ClimateChangeImg,
  "climate-change": ClimateChangeImg,
  "climate": ClimateChangeImg,
  "climate & sustainability": ClimateChangeImg,
  "gender equity": GenderEquityImg,
  "gender-equity": GenderEquityImg,
  "women empowerment": GenderEquityImg,
  "ocean": OceanImg,
  "ocean conservation": OceanImg,
  "poverty alleviation": PovertyImg,
  "poverty-alleviation": PovertyImg,
  "racial justice": RacialJusticeImg,
  "racial-justice": RacialJusticeImg,
  "climate action": ClimateChangeImg,
  "economic empowerment": OtherImg,
  "education access": OtherImg,
  "healthcare": PovertyImg,
  "sustainable communities": ClimateChangeImg,
  "technology innovation": OtherImg,
  "impact investing": OtherImg,
  "other": OtherImg,
};

function resolveThemeIcon(theme: string): string {
  return themeIconMap[theme.toLowerCase()] || OtherImg;
}

type ThemeColorSet = { bg: string; text: string };

const themeColorMap: Record<string, ThemeColorSet> = {
  "climate change": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  "climate-change": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  "climate": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  "climate & sustainability": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  "gender equity": { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400" },
  "gender-equity": { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400" },
  "women empowerment": { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400" },
  "racial justice": { bg: "bg-gray-200 dark:bg-gray-700/50", text: "text-gray-900 dark:text-gray-300" },
  "racial-justice": { bg: "bg-gray-200 dark:bg-gray-700/50", text: "text-gray-900 dark:text-gray-300" },
  "poverty alleviation": { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  "poverty-alleviation": { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  "ocean": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  "ocean conservation": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  "climate action": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  "economic empowerment": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  "education access": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  "healthcare": { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  "sustainable communities": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  "technology innovation": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
};

const defaultColors: ThemeColorSet = { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" };

function resolveThemeColors(theme: string): ThemeColorSet {
  return themeColorMap[theme.toLowerCase()] || defaultColors;
}

interface ThemeBadgeProps {
  theme: string;
  icon?: string;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  suffix?: string;
  suffixClassName?: string;
  "data-testid"?: string;
}

export function ThemeBadge({
  theme,
  icon,
  className,
  iconClassName,
  labelClassName,
  suffix,
  suffixClassName,
  "data-testid": testId,
}: ThemeBadgeProps) {
  const resolvedIcon = icon || resolveThemeIcon(theme);
  const colors = resolveThemeColors(theme);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full",
        colors.bg,
        className
      )}
      data-testid={testId}
    >
      <img
        src={resolvedIcon}
        alt={theme}
        className={cn("w-4 h-4 object-contain", iconClassName)}
      />
      <span className={cn("text-sm font-medium", colors.text, labelClassName)}>
        {theme}
      </span>
      {suffix && (
        <span className={cn("text-sm text-muted-foreground font-medium", suffixClassName)}>
          {suffix}
        </span>
      )}
    </div>
  );
}
