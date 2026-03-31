import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  Rows3,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { BrushStrokeText } from "@/components/BrushStrokeText";
import {
  InvestmentCard,
  type APIInvestment,
  type Theme,
} from "@/components/InvestmentCard";

type ViewMode = "carousel" | "grid";

const GRID_PAGE_SIZE = 6;

export default function FeaturedInvestments() {
  const [viewMode, setViewMode] = useState<ViewMode>("carousel");
  const [activeIndex, setActiveIndex] = useState(typeof window !== "undefined" && window.innerWidth >= 768 ? 3 : 1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gridPage, setGridPage] = useState(0);

  const autoSlideRef = useRef<NodeJS.Timeout | null>(null);
  const gap = 24;

  const { data: apiInvestments = [], isLoading } = useQuery<APIInvestment[]>({
    queryKey: ["/api/investments"],
    queryFn: async () => {
      const res = await fetch("/api/investments?isActive=true");
      if (!res.ok) throw new Error("Failed to fetch investments");
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
  });

  const { data: themes = [] } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
    staleTime: 0,
    gcTime: 0,
  });

  const originalLength = apiInvestments.length;
  const [slidesPerStep, setSlidesPerStep] = useState(
    typeof window !== "undefined" && window.innerWidth >= 768 ? 3 : 1
  );

  useEffect(() => {
    const updateSlidesPerStep = () => {
      const newStep = window.innerWidth >= 768 ? 3 : 1;
      setSlidesPerStep(newStep);
      setActiveIndex(newStep);
      setIsTransitioning(false);
    };
    window.addEventListener("resize", updateSlidesPerStep);
    return () => window.removeEventListener("resize", updateSlidesPerStep);
  }, []);

  const cloneCount = slidesPerStep;

  const extendedInvestments = apiInvestments.length >= 3
    ? [
        ...apiInvestments.slice(-cloneCount),
        ...apiInvestments,
        ...apiInvestments.slice(0, cloneCount),
      ]
    : apiInvestments;

  const totalGridPages = Math.ceil(apiInvestments.length / GRID_PAGE_SIZE);
  const paginatedInvestments = apiInvestments.slice(
    gridPage * GRID_PAGE_SIZE,
    (gridPage + 1) * GRID_PAGE_SIZE
  );

  useEffect(() => {
    if (!isTransitioning || apiInvestments.length < 3) return;

    const transitionDuration = 500;

    if (activeIndex >= originalLength + cloneCount) {
      setTimeout(() => {
        setIsTransitioning(false);
        setActiveIndex(cloneCount);
      }, transitionDuration);
    }

    if (activeIndex <= 0) {
      setTimeout(() => {
        setIsTransitioning(false);
        setActiveIndex(originalLength);
      }, transitionDuration);
    }
  }, [activeIndex, isTransitioning, originalLength, apiInvestments.length, cloneCount]);

  const nextSlide = useCallback(() => {
    if (apiInvestments.length < 3) return;
    setIsTransitioning(true);
    setActiveIndex((prev) => prev + slidesPerStep);
  }, [apiInvestments.length, slidesPerStep]);

  const prevSlide = useCallback(() => {
    if (apiInvestments.length < 3) return;
    setIsTransitioning(true);
    setActiveIndex((prev) => prev - slidesPerStep);
  }, [apiInvestments.length, slidesPerStep]);

  useEffect(() => {
    if (viewMode === "carousel" && !isPaused && apiInvestments.length >= 3) {
      autoSlideRef.current = setInterval(() => {
        nextSlide();
      }, 4000);
    }
    return () => {
      if (autoSlideRef.current) clearInterval(autoSlideRef.current);
    };
  }, [viewMode, isPaused, nextSlide, apiInvestments.length]);

  const getTranslateX = () => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const cardWidth = isMobile ? 320 : 380;
    const slideSize = cardWidth + gap;
    return -(activeIndex * slideSize);
  };

  if (isLoading) {
    return (
      <section className="py-16 md:py-24 bg-slate-900 dark:bg-slate-950 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-slate-400">Loading featured investments...</span>
          </div>
        </div>
      </section>
    );
  }

  if (apiInvestments.length === 0) {
    return null;
  }

  return (
    <section
      className="py-16 md:py-24 bg-slate-900 dark:bg-slate-950 relative overflow-hidden"
      data-testid="featured-investments-section"
    >
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"
        >
          <div>
            <span className="text-primary font-semibold text-sm uppercase tracking-wider">
              Featured Opportunities
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mt-3">
              Featured <BrushStrokeText>Investments</BrushStrokeText>
            </h2>
            <p className="text-slate-400 mt-4 max-w-xl">
              Discover high-impact investment opportunities that align with your
              values.
            </p>
          </div>

          <div className="w-fit flex flex-wrap items-center gap-2 bg-slate-800/50 backdrop-blur-sm rounded-full p-1.5 border border-slate-700/50">
            <Button
              variant={viewMode === "carousel" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setViewMode("carousel"); setGridPage(0); }}
              className={`rounded-full ${viewMode !== "carousel" ? "text-white" : ""}`}
              data-testid="button-view-carousel"
            >
              <Rows3 className="w-4 h-4 mr-1" />
              Carousel
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setViewMode("grid"); setGridPage(0); }}
              className={`rounded-full ${viewMode !== "grid" ? "text-white" : ""}`}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="w-4 h-4 mr-1" />
              Grid
            </Button>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {viewMode === "carousel" && apiInvestments.length >= 3 && (
            <motion.div
              key="carousel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
            >
              <div className="overflow-hidden w-full py-4 -my-4">
                <div
                  className="flex gap-6 will-change-transform"
                  style={{
                    transform: `translateX(${getTranslateX()}px)`,
                    transition: isTransitioning
                      ? "transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)"
                      : "none",
                  }}
                >
                  {extendedInvestments.map((investment, index) => (
                    <div
                      key={`${investment.name}-clone-${index}`}
                      className="shrink-0 w-[320px] md:w-[380px]"
                    >
                      <InvestmentCard
                        investment={investment}
                        themes={themes}
                        index={index}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={prevSlide}
                  className="w-12 h-12 rounded-full border-2 border-slate-600 flex items-center justify-center text-slate-300 transition-colors duration-200 hover:border-white hover:text-white"
                  data-testid="button-carousel-prev"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={nextSlide}
                  className="w-12 h-12 rounded-full border-2 border-slate-600 flex items-center justify-center text-slate-300 transition-colors duration-200 hover:border-white hover:text-white"
                  data-testid="button-carousel-next"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {(viewMode === "grid" || (viewMode === "carousel" && apiInvestments.length < 3)) && (
            <motion.div
              key="grid"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
                data-testid="investments-grid"
              >
                {paginatedInvestments.map((investment, index) => (
                  <motion.div
                    key={investment.name}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1, duration: 0.5 }}
                  >
                    <InvestmentCard
                      investment={investment}
                      themes={themes}
                      index={gridPage * GRID_PAGE_SIZE + index}
                    />
                  </motion.div>
                ))}
              </div>

              {totalGridPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-10">
                  <button
                    onClick={() => setGridPage((p) => Math.max(0, p - 1))}
                    disabled={gridPage === 0}
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ${
                      gridPage === 0
                        ? "border-slate-700 text-slate-600 cursor-not-allowed"
                        : "border-slate-600 text-slate-300 hover:border-white hover:text-white"
                    }`}
                    data-testid="button-grid-prev"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-slate-400 text-sm font-medium min-w-[80px] text-center" data-testid="text-grid-page">
                    Page {gridPage + 1} of {totalGridPages}
                  </span>
                  <button
                    onClick={() => setGridPage((p) => Math.min(totalGridPages - 1, p + 1))}
                    disabled={gridPage === totalGridPages - 1}
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ${
                      gridPage === totalGridPages - 1
                        ? "border-slate-700 text-slate-600 cursor-not-allowed"
                        : "border-slate-600 text-slate-300 hover:border-white hover:text-white"
                    }`}
                    data-testid="button-grid-next"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center mt-12"
        >
        </motion.div>
      </div>
    </section>
  );
}
