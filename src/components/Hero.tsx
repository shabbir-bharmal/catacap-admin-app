import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Users, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { ThemeBadge } from "@/components/ThemeBadge";
import { currency_format } from "@/helpers/format";

interface APIInvestment {
  name: string;
  description: string;
  raised: number;
  projectedReturn: number;
  goal: string;
  investors: number;
  image: string;
  themes: string;
  daysSinceCreated: number;
  highestInvestment: number;
  latestInvestorAvatar: string[];
}

interface Theme {
  id: number;
  name: string;
}


function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function MiniCard({
  investment,
  index,
  themes,
  currentThemeId,
}: {
  investment: APIInvestment;
  index: number;
  themes: Theme[];
  currentThemeId?: number;
}) {
  const goal = parseFloat(investment.goal) || 0;
  const percentage =
    goal > 0 ? Math.min(Math.round((investment.raised / goal) * 100), 100) : 0;
  // Use currentThemeId if provided, otherwise parse first theme from comma-separated list
  const themeIds = investment.themes
    .split(",")
    .map((t) => parseInt(t.trim()))
    .filter((id) => !isNaN(id));
  const themeId =
    currentThemeId && themeIds.includes(currentThemeId)
      ? currentThemeId
      : themeIds[0] || 1;
  const themeData = themes.find((t) => t.id === themeId);
  const themeName = themeData?.name || "Impact";

  const slug = createSlug(investment.name);
  return (
    <Link href={`/investments/${slug}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.5 }}
        className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden w-44 sm:w-56 flex-shrink-0 cursor-pointer hover:shadow-xl transition-shadow duration-300"
        data-testid={`card-mini-investment-${index}`}
      >
        <div className="relative h-32 overflow-hidden">
          <img
            src={investment.image}
            alt={investment.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 left-2">
            <ThemeBadge
              theme={themeName}
              className="px-2.5 py-1 shadow-sm"
              iconClassName="w-3 h-3"
              labelClassName="text-[11px]"
            />
          </div>
        </div>
        <div className="p-4">
          <h4 className="text-sm font-semibold text-slate-800 line-clamp-1 mb-2">
            {investment.name}
          </h4>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-primary h-2 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-primary font-semibold">
              {currency_format(investment.raised, true)}
            </span>
            <span className="text-slate-500 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {investment.investors}
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function ThemedCardsGrid({
  investments,
  themes,
  themeId,
}: {
  investments: APIInvestment[];
  themes: Theme[];
  themeId: number;
}) {
  const cardsToShow = investments.slice(0, 3);

  const wiggleVariants = [
    { rotate: [0, 0.5, 0, -0.5, 0] },
    { rotate: [0, -0.5, 0, 0.5, 0] },
    { rotate: [0, 0.3, 0, -0.3, 0] },
  ];

  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={themeId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-row gap-4 justify-center items-start"
      >
        <div className="flex flex-col gap-4">
          {cardsToShow[0] && (
            <motion.div
              key={`${themeId}-${cardsToShow[0].name}-0`}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                ...wiggleVariants[0],
              }}
              transition={{
                delay: 0,
                duration: 0.3,
                rotate: { duration: 3, repeat: Infinity, ease: "easeInOut" },
              }}
              whileHover={{ y: -4, rotate: 0, transition: { duration: 0.2 } }}
            >
              <MiniCard investment={cardsToShow[0]} index={0} themes={themes} currentThemeId={themeId} />
            </motion.div>
          )}
          {cardsToShow[2] && (
            <motion.div
              key={`${themeId}-${cardsToShow[2].name}-2`}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                ...wiggleVariants[2],
              }}
              transition={{
                delay: 0.1,
                duration: 0.3,
                rotate: { duration: 4, repeat: Infinity, ease: "easeInOut" },
              }}
              whileHover={{ y: -4, rotate: 0, transition: { duration: 0.2 } }}
            >
              <MiniCard investment={cardsToShow[2]} index={2} themes={themes} currentThemeId={themeId} />
            </motion.div>
          )}
        </div>
        {cardsToShow[1] && (
          <motion.div
            key={`${themeId}-${cardsToShow[1].name}-1`}
            style={{ marginTop: "60px" }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              ...wiggleVariants[1],
            }}
            transition={{
              delay: 0.05,
              duration: 0.3,
              rotate: { duration: 3.5, repeat: Infinity, ease: "easeInOut" },
            }}
            whileHover={{ y: -4, rotate: 0, transition: { duration: 0.2 } }}
          >
            <MiniCard investment={cardsToShow[1]} index={1} themes={themes} currentThemeId={themeId} />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function MobileThemedCards({
  investments,
  themes,
  themeId,
}: {
  investments: APIInvestment[];
  themes: Theme[];
  themeId: number;
}) {
  const cardsToShow = investments.slice(0, 3);

  const wiggleVariants = [
    { rotate: [0, 0.5, 0, -0.5, 0] },
    { rotate: [0, -0.5, 0, 0.5, 0] },
    { rotate: [0, 0.3, 0, -0.3, 0] },
  ];

  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={themeId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-4 px-4"
      >
        <div className="flex gap-3 justify-center items-start w-full">
          {cardsToShow[0] && (
            <motion.div
              key={`mobile-${themeId}-${cardsToShow[0].name}-0`}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1, ...wiggleVariants[0] }}
              transition={{ delay: 0, duration: 0.3, rotate: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
            >
              <MiniCard investment={cardsToShow[0]} index={0} themes={themes} currentThemeId={themeId} />
            </motion.div>
          )}
          {cardsToShow[1] && (
            <motion.div
              key={`mobile-${themeId}-${cardsToShow[1].name}-1`}
              style={{ marginTop: "30px" }}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1, ...wiggleVariants[1] }}
              transition={{ delay: 0.05, duration: 0.3, rotate: { duration: 3.5, repeat: Infinity, ease: "easeInOut" } }}
            >
              <MiniCard investment={cardsToShow[1]} index={1} themes={themes} currentThemeId={themeId} />
            </motion.div>
          )}
        </div>
        {cardsToShow[2] && (
          <motion.div
            key={`mobile-${themeId}-${cardsToShow[2].name}-2`}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1, ...wiggleVariants[2] }}
            transition={{ delay: 0.1, duration: 0.3, rotate: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
          >
            <MiniCard investment={cardsToShow[2]} index={2} themes={themes} currentThemeId={themeId} />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function Hero() {
  const [currentThemeIndex, setCurrentThemeIndex] = useState(0);

  const { data: themes = [] } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
    staleTime: 0,
    gcTime: 0,
  });

  const { data: investments = [], isLoading } = useQuery<APIInvestment[]>({
    queryKey: ["/api/investments?isActive=true"],
    staleTime: 0,
    gcTime: 0,
  });

  // Group investments by theme to get counts (handles comma-separated themes)
  const themeInvestmentCounts = investments.reduce(
    (acc, inv) => {
      const themeIds = inv.themes.split(",").map((t) => t.trim());
      themeIds.forEach((themeId) => {
        acc[themeId] = (acc[themeId] || 0) + 1;
      });
      return acc;
    },
    {} as Record<string, number>,
  );

  const dynamicThemes = themes
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      investments: themeInvestmentCounts[String(theme.id)] || 0,
    }))
    .filter((t) => t.investments > 0);

  const displayThemes =
    dynamicThemes.length > 0
      ? dynamicThemes
      : [
          {
            id: 1,
            name: "Impact Investing",
            investments: investments.length,
          },
        ];

  useEffect(() => {
    if (displayThemes.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentThemeIndex((prev) => (prev + 1) % displayThemes.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [displayThemes.length]);

  const currentTheme =
    displayThemes[currentThemeIndex % displayThemes.length] || displayThemes[0];

  // Filter investments by current theme (handles comma-separated theme lists)
  const themedInvestments = useMemo(() => {
    if (!currentTheme) return investments.slice(0, 4);
    const themeIdStr = String(currentTheme.id);
    return investments.filter((inv) => {
      const invThemes = inv.themes.split(",").map((t) => t.trim());
      return invThemes.includes(themeIdStr);
    });
  }, [investments, currentTheme]);

  // Calculate remaining investments after showing 3
  const remainingCount = Math.max(0, themedInvestments.length - 3);

  const activeInvestments = investments.length;

  const stats = [
    {
      value: "$3.8M",
      label: "Invested",
    },
    {
      value: isLoading ? "..." : String(activeInvestments),
      label: "Active Investments",
    },
    {
      value: "718",
      label: "Active Investors",
    },
  ];

  return (
    <section
      className="relative bg-background overflow-hidden pt-20 pb-8 lg:pb-0"
      data-testid="hero-section"
    >
      {/* Floating decorative elements - fluffy animated shapes */}
      <motion.div
        animate={{
          y: [0, -20, 0],
          rotate: [0, 10, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-28 right-1/4 w-4 h-4 md:w-6 md:h-6 bg-gradient-to-br from-primary to-emerald-400 rounded-full opacity-70 blur-[1px]"
      />
      <motion.div
        animate={{
          y: [0, 25, 0],
          x: [0, 15, 0],
          rotate: [12, 24, 12],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-40 left-12 md:left-20 w-8 h-8 md:w-12 md:h-12 bg-secondary/15 rounded-2xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-40 right-20 w-5 h-5 md:w-7 md:h-7 bg-gradient-to-tr from-amber-300 to-orange-400 rounded-full blur-[2px]"
      />
      <motion.div
        animate={{
          y: [0, -15, 0],
          rotate: [0, -15, 0],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-36 left-8 md:left-16 w-6 h-6 md:w-8 md:h-8 border-2 border-primary/40 rounded-full"
      />
      <motion.div
        animate={{
          y: [0, 18, 0],
          x: [0, -12, 0],
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute top-20 left-1/3 w-3 h-3 md:w-4 md:h-4 bg-teal-400 rounded-full"
      />
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 180, 360],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-48 left-1/4 w-6 h-6 md:w-8 md:h-8 border-2 border-dashed border-primary/30 rounded-lg"
      />
      <motion.div
        animate={{
          y: [0, -30, 0],
          scale: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute top-56 right-32 w-2 h-2 md:w-3 md:h-3 bg-violet-400 rounded-full opacity-60"
      />
      <motion.div
        animate={{
          x: [0, 20, 0],
          y: [0, -10, 0],
          rotate: [45, 55, 45],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
        className="absolute bottom-28 right-1/3 w-4 h-4 md:w-5 md:h-5 bg-gradient-to-r from-pink-300 to-rose-400 rounded-lg opacity-50 rotate-45"
      />
      <motion.div
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1.5,
        }}
        className="absolute top-64 left-40 w-10 h-10 md:w-14 md:h-14 bg-gradient-to-br from-emerald-200/40 to-teal-300/40 rounded-full blur-md"
      />
      <motion.div
        animate={{
          y: [0, 12, 0],
          x: [0, -8, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 3,
        }}
        className="absolute bottom-20 left-16 w-3 h-3 bg-sky-400 rounded-full opacity-50"
      />
      <motion.div
        animate={{
          rotate: [0, 360],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute top-44 right-16 w-5 h-5 md:w-6 md:h-6 border border-amber-400/50 rounded-full"
      />
      <motion.div
        animate={{
          y: [0, -25, 0],
          opacity: [0.4, 0.8, 0.4],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2.5,
        }}
        className="absolute bottom-36 left-1/2 w-2 h-2 bg-primary rounded-full"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* DESKTOP LAYOUT */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-8 items-center w-full py-8">
          {/* Text Content - Left Side */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-6 text-left relative z-10"
          >
            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-foreground leading-tight">
              <span
                className="bg-[linear-gradient(90deg,#215482_0%,#215482_50%,#3b6fa0_100%)] bg-clip-text text-transparent"
                data-testid="text-hero-title"
              >
                Start exploring
              </span>
              <br />
              <span className="text-primary">
                to make an impact
              </span>
            </h1>

            {/* Rotating Theme Badge */}
            <div className="h-9">
              {currentTheme && (
                <motion.div
                  key={currentThemeIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  <ThemeBadge
                    theme={currentTheme.name}
                    className="shadow-sm py-2"
                    suffix={`${currentTheme.investments} investments`}
                    data-testid="text-current-theme"
                  />
                </motion.div>
              )}
            </div>

            {/* Static Impact Statement */}
            <div className="flex items-start gap-3">
              <div className="w-1 h-12 bg-primary rounded-full mt-1" />
              <p
                className="text-lg lg:text-xl text-muted-foreground max-w-md"
                data-testid="text-hero-subtitle"
              >
                Invest in verified impact opportunities with transparent returns
                and measurable outcomes.
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="flex flex-wrap items-center gap-4 pt-2"
              data-testid="hero-buttons"
            >
              {/* <Link href="/investments">
                <Button size="lg" className="rounded-full" data-testid="button-find-investments">
                  Find Investments
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link> */}

              <Button
                size="lg"
                className="rounded-full border-2 border-primary text-primary"
                data-testid="button-watch-demo"
                onClick={() => {
                  const videoSection = document.getElementById(
                    "community-video-section",
                  );
                  if (videoSection) {
                    videoSection.scrollIntoView({ behavior: "smooth" });
                    setTimeout(() => {
                      const iframe = document.querySelector(
                        '[data-testid="video-catacap-intro"]',
                      ) as HTMLIFrameElement;
                      if (iframe) {
                        const currentSrc = iframe.src;
                        iframe.src = currentSrc.includes("autoplay=1")
                          ? currentSrc
                          : currentSrc + "?autoplay=1";
                      }
                    }, 800);
                  }
                }}
              >
                <Play className="w-5 h-5 mr-2 text-white" />
                <span className="text-white">Learn About CataCap</span>
              </Button>
            </motion.div>

            {/* Stats Section with elegant curly brace styling */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="flex items-stretch justify-between gap-4 pt-6"
            >
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
                  className="relative flex-1 text-center px-4 py-3"
                >
                  {/* Left curly bracket decorative border */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3/4 w-[3px] rounded-full bg-gradient-to-b from-transparent via-secondary/40 to-transparent" />
                  {/* Top accent curve */}
                  <div className="absolute left-0 top-[12%] w-3 h-[3px] rounded-full bg-secondary/30" />
                  {/* Bottom accent curve */}
                  <div className="absolute left-0 bottom-[12%] w-3 h-[3px] rounded-full bg-secondary/30" />

                  <p className="text-2xl lg:text-3xl font-bold text-secondary">
                    {stat.value}
                  </p>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                    {stat.label}
                  </p>

                  {/* Right curly bracket decorative border */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3/4 w-[3px] rounded-full bg-gradient-to-b from-transparent via-secondary/40 to-transparent" />
                  {/* Top accent curve right */}
                  <div className="absolute right-0 top-[12%] w-3 h-[3px] rounded-full bg-secondary/30" />
                  {/* Bottom accent curve right */}
                  <div className="absolute right-0 bottom-[12%] w-3 h-[3px] rounded-full bg-secondary/30" />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Themed Investment Cards - Right Side */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="relative flex flex-col"
          >
            {/* Light background for the cards area */}
            <div className="absolute inset-0 rounded-[2rem]" />

            {/* Cards Container */}
            <div className="relative px-4 py-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-[420px]">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : themedInvestments.length > 0 ? (
                <ThemedCardsGrid
                  investments={themedInvestments}
                  themes={themes}
                  themeId={currentTheme?.id || 1}
                />
              ) : (
                <div className="flex items-center justify-center h-[420px] text-muted-foreground">
                  No investments available for this theme
                </div>
              )}

              {/* "X more" CTA */}
              {remainingCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="mt-4 text-center"
                >
                  {/* <Link href={`/investments?theme=${currentTheme?.id || 1}`}>
                    <Button 
                      variant="outline" 
                      className={`rounded-full ${currentTheme?.bgColor} ${currentTheme?.textColor} border-0`}
                      data-testid="button-view-more-investments"
                    >
                      {remainingCount} more {currentTheme?.name} investments
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link> */}
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>

        {/* MOBILE LAYOUT */}
        <div className="lg:hidden w-full py-6 space-y-5">
          {/* Rotating Theme Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            {currentTheme && (
              <motion.div
                key={currentThemeIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <ThemeBadge
                  theme={currentTheme.name}
                  className="shadow-sm py-2"
                  suffix={`${currentTheme.investments} investments`}
                />
              </motion.div>
            )}
          </motion.div>

          {/* Themed Cards - Mobile */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative"
          >
            <div className="absolute -right-4 top-4 bottom-4 w-2/3 bg-gradient-to-br from-primary/10 to-emerald-100 rounded-[2rem] -z-10" />

            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : themedInvestments.length > 0 ? (
              <div className="relative py-4">
                <MobileThemedCards
                  investments={themedInvestments}
                  themes={themes}
                  themeId={currentTheme?.id || 1}
                />
                {/* "X more" CTA - Mobile */}
                {remainingCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-3 text-center"
                  >
                    {/* <Link href={`/investments?theme=${currentTheme?.id || 1}`}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className={`rounded-full ${currentTheme?.bgColor} ${currentTheme?.textColor}`}
                        data-testid="button-view-more-investments-mobile"
                      >
                        {remainingCount} more
                        <ArrowRight className="ml-1 w-3 h-3" />
                      </Button>
                    </Link> */}
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No investments for this theme
              </div>
            )}
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center space-y-4"
          >
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
              <span className="bg-[linear-gradient(90deg,#215482_0%,#215482_50%,#3b6fa0_100%)] bg-clip-text text-transparent">
                Start exploring
              </span>
              <br />
              <span className="text-[#81bb3e]">
                to make an impact
              </span>
            </h1>

            <p className="text-base text-muted-foreground max-w-md mx-auto">
              Invest in verified impact opportunities with transparent returns
              and measurable outcomes.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-wrap items-center gap-3 justify-center"
          >
            {/* <Link href="/investments">
              <Button size="default" className="rounded-full" data-testid="button-find-investments-mobile">
                Find Investments
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link> */}

            <Button
              size="icon"
              className="rounded-full border-2 border-primary text-primary"
              data-testid="button-watch-demo-mobile"
              onClick={() => {
                const videoSection = document.getElementById(
                  "community-video-section",
                );
                if (videoSection) {
                  videoSection.scrollIntoView({ behavior: "smooth" });
                  setTimeout(() => {
                    const iframe = document.querySelector(
                      '[data-testid="video-catacap-intro"]',
                    ) as HTMLIFrameElement;
                    if (iframe) {
                      const currentSrc = iframe.src;
                      iframe.src = currentSrc.includes("autoplay=1")
                        ? currentSrc
                        : currentSrc + "?autoplay=1";
                    }
                  }, 800);
                }
              }}
            >
              <Play className="w-4 h-4 text-white" />
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="flex justify-center gap-6 pt-4"
          >
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 + index * 0.1, duration: 0.4 }}
                className="text-center"
              >
                <p className="text-xl font-bold text-primary">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
