import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BrushStrokeText from "./BrushStrokeText";
import environmentFinanceLogo from "@/assets/logo/environment-finance.png";
import forbesLogo from "@/assets/logo/ForbesLogo.png";
import impactAwardsImage from "@/assets/logo/impactAwards.png";

const accolades = [
  {
    id: 1,
    quote: "CataCap enables foundations, DAFs, and family offices to channel capital into high-impact, mission-aligned investments in climate, health, and equity...",
    source: "Environmental Finance",
    logo: environmentFinanceLogo,
    link: "https://www.environmental-finance.com/content/awards/impact-investment-awards-2025/winners/impact-investing-platform-of-the-year-catacap.html",
    backgroundImage: impactAwardsImage,
    award: "Impact Investing Platform of the Year 2025",
  },
  {
    id: 2,
    quote: "CataCap is unlocking mission-driven investing, empowering donors to turn charitable giving into lasting impact...",
    source: "Forbes",
    logo: null,
    link: "https://www.forbes.com/sites/geristengel/2025/09/11/how-to-unlock-mission-driven-investing-with-your-donations/",
    backgroundImage: forbesLogo,
    award: "Featured In Forbes",
  },
];

export default function ForbesFeatureSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrentIndex((prev) => {
      if (newDirection === 1) {
        return prev === accolades.length - 1 ? 0 : prev + 1;
      }
      return prev === 0 ? accolades.length - 1 : prev - 1;
    });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      paginate(1);
    }, 8000);
    return () => clearInterval(timer);
  }, [currentIndex]);

  const currentAccolade = accolades[currentIndex];

  return (
    <section
      className="relative bg-gradient-to-b from-slate-200 to-slate-100 dark:from-slate-900 dark:to-slate-800 overflow-hidden"
      data-testid="section-forbes-feature"
    >
      <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" viewBox="0 0 1200 600" fill="none" preserveAspectRatio="none">
        <motion.path
          d="M0 600 C200 500, 400 400, 600 300 S900 150, 1200 0"
          stroke="url(#awardFlowGradient1)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        <motion.path
          d="M0 550 C250 450, 500 350, 750 250 S1000 100, 1200 50"
          stroke="url(#awardFlowGradient2)"
          strokeWidth="2.5"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.2, delay: 0.2, ease: "easeInOut" }}
        />
        <motion.path
          d="M0 500 C300 400, 600 300, 900 200 S1100 50, 1200 100"
          stroke="url(#awardFlowGradient3)"
          strokeWidth="1.5"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.5, delay: 0.4, ease: "easeInOut" }}
        />
        <motion.path
          d="M0 650 C150 550, 350 450, 550 350 S850 200, 1200 150"
          stroke="url(#awardFlowGradient4)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.8, delay: 0.6, ease: "easeInOut" }}
        />
        <defs>
          <linearGradient id="awardFlowGradient1" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#02a95c" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="awardFlowGradient2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="awardFlowGradient3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#02a95c" />
          </linearGradient>
          <linearGradient id="awardFlowGradient4" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" data-testid="text-awards-title">
              Awards and <BrushStrokeText>Accolades</BrushStrokeText>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">CataCap Community Making Real Change</p>
          </motion.div>

          <div className="relative">
            <div className="overflow-hidden rounded-xl shadow-lg">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentIndex}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  className="relative"
                >
                  <div className="flex flex-col lg:flex-row h-[560px] sm:h-[520px] lg:h-[450px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div 
                      className="flex items-center justify-center bg-slate-50 dark:bg-slate-700/50 p-4 h-[220px] shrink-0 lg:hidden"
                      data-testid="div-background-image-mobile"
                    >
                      <img 
                        src={currentAccolade.backgroundImage} 
                        alt={currentAccolade.source}
                        className="h-full max-h-[190px] w-auto object-contain"
                        data-testid="img-award-image-mobile"
                      />
                    </div>

                    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-12 overflow-hidden">
                      <div>
                        {currentAccolade.award && (
                          <span className="inline-block text-xs sm:text-sm font-medium text-primary mb-2 tracking-wide uppercase bg-primary/10 dark:bg-primary/15 px-3 py-1 rounded-md" data-testid="text-award-label">
                            {currentAccolade.award}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 flex items-center min-h-0">
                        <blockquote className="relative">
                          <span className="text-4xl sm:text-5xl text-slate-300 dark:text-slate-600 absolute -top-2 -left-1 sm:-top-3 sm:-left-2 font-serif">"</span>
                          <p 
                            className="font-serif text-slate-600 dark:text-slate-300 leading-snug pl-4 sm:pl-6 text-sm sm:text-base md:text-lg lg:text-2xl"
                            data-testid="text-accolade-quote"
                          >
                            {currentAccolade.quote}
                          </p>
                        </blockquote>
                      </div>

                      <div className="flex flex-col items-start gap-2 mt-2">
                        {currentAccolade.source !== "Forbes" && currentAccolade.logo && (
                          <img
                            src={currentAccolade.logo}
                            alt={currentAccolade.source}
                            className="h-6 md:h-8 object-contain"
                            data-testid="img-source-logo"
                          />
                        )}

                        <a
                          href={currentAccolade.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button
                            className="bg-secondary hover:bg-secondary/90 border-none text-secondary-foreground px-8 py-2 rounded-md text-sm font-medium tracking-wide"
                            data-testid="button-continue-reading"
                          >
                            Read More
                          </Button>
                        </a>
                      </div>
                    </div>

                    <div 
                      className="hidden lg:flex lg:w-1/2 relative items-center justify-center bg-slate-50 dark:bg-slate-700/50 p-8"
                      data-testid="div-background-image"
                    >
                      <img 
                        src={currentAccolade.backgroundImage} 
                        alt={currentAccolade.source}
                        className="max-w-[90%] max-h-[400px] object-contain w-full h-full"
                        data-testid="img-award-image"
                      />
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 mt-6 ml-4">
              <button
                onClick={() => paginate(-1)}
                className="w-10 h-10 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-center transition-colors duration-200 hover:bg-primary hover:border-primary group"
                data-testid="button-prev-accolade"
                aria-label="Previous accolade"
              >
                <ChevronLeft className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-white" />
              </button>
              <button
                onClick={() => paginate(1)}
                className="w-10 h-10 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-center transition-colors duration-200 hover:bg-primary hover:border-primary group"
                data-testid="button-next-accolade"
                aria-label="Next accolade"
              >
                <ChevronRight className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-white" />
              </button>
            </div>

            <div className="flex justify-center gap-2 mt-6">
              {accolades.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setDirection(index > currentIndex ? 1 : -1);
                    setCurrentIndex(index);
                  }}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentIndex 
                      ? "bg-primary w-6" 
                      : "bg-slate-300 dark:bg-slate-600"
                  }`}
                  data-testid={`button-indicator-${index}`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
