import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Globe, Users, Waves, Heart, Scale } from "lucide-react";

interface FloatingCategoryProps {
  icon: ReactNode;
  label: string;
  className: string;
  animationClass: string;
  delay?: number;
}

function FloatingCategory({
  icon,
  label,
  className,
  animationClass,
  delay = 0,
}: FloatingCategoryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.8, ease: "easeOut" }}
      className={`absolute ${className} ${animationClass}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white dark:bg-card border border-border shadow-lg">
        {icon}
        <span className="text-xs lg:text-sm font-medium text-foreground whitespace-nowrap">
          {label}
        </span>
      </div>
    </motion.div>
  );
}

export function FloatingIcons() {
  const categories = [
    {
      icon: <Globe className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500" />,
      label: "Climate Change",
      position: "top-[0%] right-[5%] lg:top-[5%] lg:right-[0%]",
      animation: "animate-float-1",
      delay: 0.2,
    },
    {
      icon: <Users className="w-4 h-4 lg:w-5 lg:h-5 text-rose-500" />,
      label: "Gender Equity",
      position: "top-[20%] right-[-10%] lg:top-[25%] lg:right-[-15%]",
      animation: "animate-float-2",
      delay: 0.4,
    },
    {
      icon: <Waves className="w-4 h-4 lg:w-5 lg:h-5 text-blue-500" />,
      label: "Ocean",
      position: "top-[45%] right-[-5%] lg:top-[50%] lg:right-[-10%]",
      animation: "animate-float-3",
      delay: 0.6,
    },
    {
      icon: <Heart className="w-4 h-4 lg:w-5 lg:h-5 text-amber-500" />,
      label: "Poverty Alleviation",
      position: "bottom-[25%] right-[-5%] lg:bottom-[25%] lg:right-[-12%]",
      animation: "animate-float-4",
      delay: 0.8,
    },
    {
      icon: <Scale className="w-4 h-4 lg:w-5 lg:h-5 text-purple-500" />,
      label: "Racial Justice",
      position: "bottom-[5%] right-[10%] lg:bottom-[5%] lg:right-[5%]",
      animation: "animate-float-5",
      delay: 1.0,
    },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {categories.map((item, index) => (
        <FloatingCategory
          key={index}
          icon={item.icon}
          label={item.label}
          className={item.position}
          animationClass={item.animation}
          delay={item.delay}
        />
      ))}
    </div>
  );
}
