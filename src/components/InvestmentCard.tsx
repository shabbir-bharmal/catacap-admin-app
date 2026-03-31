import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeBadge } from "@/components/ThemeBadge";
import { cn } from "@/lib/utils";
import { currency_format } from "@/helpers/format";

export interface APIInvestment {
  name: string;
  description: string;
  raised: number;
  projectedReturn: number;
  goal: string;
  investors: number;
  image: string;
  themes: string;
  investmentTypes?: string;
  daysSinceCreated: number;
  highestInvestment: number;
  latestInvestorAvatar: string[];
}

export interface Theme {
  id: number;
  name: string;
}

const PLACEHOLDER_AVATAR = "https://catacapstorage.blob.core.windows.net/prodcontainer/914f8749-c162-4b3b-9250-8176b1737a1e.jpg";

export function createSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function stripHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]*>/g, '');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
}

function getSpeedometerColors(percentage: number): { bg: string; fill: string } {
  if (percentage >= 90) return { bg: "#bbf7d0", fill: "#02a95c" };
  if (percentage >= 70) return { bg: "#dcfce7", fill: "#22c55e" };
  if (percentage >= 50) return { bg: "#fed7aa", fill: "#f97316" };
  if (percentage >= 30) return { bg: "#dbeafe", fill: "#2563eb" };
  return { bg: "#e2e8f0", fill: "#64748b" };
}

export function Speedometer({ percentage }: { percentage: number }) {
  const colors = getSpeedometerColors(percentage);
  const startAngle = -110;
  const endAngle = 110;
  const cx = 50;
  const cy = 50;
  const radius = 38;

  const startRad = (startAngle - 90) * (Math.PI / 180);
  const endRad = (endAngle - 90) * (Math.PI / 180);

  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  const arcPath = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <path d={arcPath} fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round" />
        <motion.path
          d={arcPath}
          fill="none"
          stroke={colors.fill}
          strokeWidth="10"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: percentage / 100 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.1 }}
          style={{ strokeDasharray: "1", strokeDashoffset: "0" }}
        />
        <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill={colors.fill}>
          {percentage}%
        </text>
      </svg>
    </div>
  );
}

export function InvestorAvatars({ avatars, investorCount }: { avatars: string[]; investorCount: number }) {
  const validAvatars = avatars?.filter(
    (avatar) => avatar && avatar.trim() !== "" && avatar !== PLACEHOLDER_AVATAR
  ) || [];

  const displayCount = investorCount || 0;

  if (displayCount === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="w-4 h-4" />
        <span>Be the first investor</span>
      </div>
    );
  }

  if (validAvatars.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {Array.from({ length: Math.min(displayCount, 3) }).map((_, i) => (
            <Avatar key={i} className="w-7 h-7 border-2 border-white dark:border-slate-700">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {String.fromCharCode(65 + i)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{displayCount} investor{displayCount !== 1 ? 's' : ''}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {validAvatars.slice(0, 3).map((avatar, i) => (
          <Avatar key={i} className="w-7 h-7 border-2 border-white dark:border-slate-700">
            <AvatarImage src={avatar} alt="Investor" />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {String.fromCharCode(65 + i)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{displayCount} investor{displayCount !== 1 ? 's' : ''}</span>
    </div>
  );
}

interface InvestmentCardProps {
  investment: APIInvestment;
  themes: Theme[];
  index: number;
  className?: string;
  "data-testid"?: string;
}

export function InvestmentCard({
  investment,
  themes,
  index,
  className,
  "data-testid": testId,
}: InvestmentCardProps) {
  const goal = parseFloat(investment.goal) || 0;
  const percentage = goal > 0 ? Math.min(Math.round((investment.raised / goal) * 100), 100) : 0;
  const tagline = stripHtml(investment.description).slice(0, 120);
  const slug = createSlug(investment.name);

  return (
    <Link href={`/investments/${slug}`}>
      <div
        className={cn("bg-white dark:bg-slate-800 rounded-2xl shadow-xl group h-full flex flex-col hover-elevate cursor-pointer", className)}
        data-testid={testId || `card-investment-${index}`}
      >
        <div className="relative overflow-hidden rounded-t-2xl shrink-0">
          <img
            src={investment.image}
            alt={investment.name}
            className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
            data-testid={`img-investment-${index}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${percentage}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.3 }}
              className="h-full bg-gradient-to-r from-primary to-emerald-400"
            />
          </div>
        </div>

        <div className="p-5 flex flex-col flex-grow">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 line-clamp-1" data-testid={`text-investment-name-${index}`}>
            {investment.name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 min-h-[40px]" data-testid={`text-investment-desc-${index}`}>
            {tagline}...
          </p>

          <div className="flex items-end justify-between gap-2 mb-4">
            <div className="text-left">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Raised</span>
              <p className="text-base font-bold text-slate-900 dark:text-white" data-testid={`text-raised-${index}`}>{currency_format(investment.raised, false, 0)}</p>
            </div>
            <Speedometer percentage={percentage} />
            <div className="text-right">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Goal</span>
              <p className="text-base font-bold text-primary" data-testid={`text-goal-${index}`}>{currency_format(goal, false, 0)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4" data-testid={`themes-${index}`}>
            {investment.themes
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
              .map((themeId) => {
                const themeData = themes.find((th) => String(th.id) === themeId);
                if (!themeData) return null;
                return (
                  <ThemeBadge
                    key={themeId}
                    theme={themeData.name}
                    className="px-2 py-0.5"
                    iconClassName="w-3.5 h-3.5"
                    labelClassName="text-[11px]"
                    data-testid={`badge-theme-${themeId}-${index}`}
                  />
                );
              })}
          </div>

          <div className="mb-4 mt-auto" data-testid={`investors-${index}`}>
            <InvestorAvatars
              avatars={investment.latestInvestorAvatar}
              investorCount={investment.investors}
            />
          </div>

          <Button className="w-full rounded-xl font-semibold" data-testid={`button-explore-${index}`}>
            Explore Investment
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </Link>
  );
}
