import { motion } from "framer-motion";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BrushStrokeText } from "@/components/BrushStrokeText";
import ClimateChangeImg from "@assets/Climate-Change.png";
import GenderEquityImg from "@assets/Gender-Equity.png";
import OceanImg from "@assets/Ocean.png";
import PovertyImg from "@assets/Poverty-Alleviation.png";
import RacialJusticeImg from "@assets/Racial-Justice.png";
import OtherImg from "@assets/Other.png";

interface Theme {
  id: number;
  name: string;
}

const themeIcons: Record<string, string> = {
  "Climate Change": ClimateChangeImg,
  "Gender Equity": GenderEquityImg,
  "Ocean": OceanImg,
  "Poverty Alleviation": PovertyImg,
  "Racial Justice": RacialJusticeImg,
  "Other": OtherImg,
};

export default function CategorySection() {
  const { data: themes = [] } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
    staleTime: 0,
    gcTime: 0,
  });

  const sortedThemes = [...themes].sort((a, b) => {
    if (a.name.toLowerCase() === "other") return 1;
    if (b.name.toLowerCase() === "other") return -1;
    return 0;
  });

  return (
    <section className="py-10 md:py-14 bg-background" data-testid="category-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Explore <BrushStrokeText>Impact</BrushStrokeText> Themes
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Discover investment opportunities across sectors driving positive change
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex flex-wrap justify-center gap-3 md:gap-4"
        >
          {sortedThemes.map((theme, index) => (
            <Link
              key={theme.id}
              href={`/investments?theme=${theme.id}`}
              data-testid={`link-category-${theme.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.4 }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border transition-all duration-200 hover-elevate hover:border-primary/50 cursor-pointer"
              >
                {themeIcons[theme.name] && (
                  <img
                    src={themeIcons[theme.name]}
                    alt={theme.name}
                    className="w-5 h-5 object-contain"
                  />
                )}

                <span className="text-sm font-medium text-foreground whitespace-nowrap">
                  {theme.name}
                </span>
              </motion.div>
            </Link>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
