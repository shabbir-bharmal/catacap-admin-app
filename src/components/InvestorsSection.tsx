import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  ShieldCheck,
  Banknote,
  Leaf,
  Lightbulb,
  Users,
  Receipt,
  Sparkles,
} from "lucide-react";
import { BrushStrokeText } from "@/components/BrushStrokeText";
import { currency_format } from "@/helpers/format";

interface APIInvestment {
  name: string;
  raised: number;
  investors: number;
}

const keyBenefits = [
  {
    title: "Donate to Invest",
    description:
      "Use your philanthropic capital to back impact-driven ventures that support innovative solutions tackling themes like climate change or gender and racial equity. All donations are 100% tax deductible.",
    icon: Receipt,
  },
  {
    title: "Grow",
    description:
      "Generate potential returns to reinvest in more meaningful causes and amplify your giving.",
    icon: TrendingUp,
  },
  {
    title: "Multiply your Influence",
    description:
      "Join forces with other mission-aligned donors. Every dollar deplloyed continues the journey of purpose-driven giving—amplifying impact with every move.",
    icon: Leaf,
  },
];

export default function InvestorsSection() {
  const { data: investments = [], isLoading } = useQuery<APIInvestment[]>({
    queryKey: ["/api/investments?isActive=true"],
    staleTime: 0,
    gcTime: 0,
  });

  const totalRaised = investments.reduce(
    (sum, inv) => sum + (inv.raised || 0),
    0,
  );
  const totalInvestors = investments.reduce(
    (sum, inv) => sum + (inv.investors || 0),
    0,
  );
  const avgInvestment =
    investments.length > 0 ? totalRaised / investments.length : 0;
  const avgDisbursal =
    investments.length > 0 ? totalRaised / investments.length : 0;
  const avgInvestorsPerProject =
    investments.length > 0
      ? Math.round(totalInvestors / investments.length)
      : 0;

  const stats = [
    { value: "100%", label: "Tax Deductible", icon: Receipt },
    {
      value: currency_format(avgInvestment, true),
      label: "Avg. Investment Size",
      icon: TrendingUp,
    },
    {
      value: currency_format(avgDisbursal, true),
      label: "Avg. Disbursal Amount",
      icon: Banknote,
    },
    {
      value: `${avgInvestorsPerProject}`,
      label: "Avg. Investors/Project",
      icon: Users,
    },
  ];

  return (
    <section
      id="community-video-section"
      className="py-16 md:py-24 bg-gradient-to-br from-primary/5 via-background to-secondary/5 overflow-hidden relative"
      data-testid="investors-section"
    >
      {/* Floating Decorative Elements */}
      <motion.div
        animate={{
          y: [0, -20, 0],
          rotate: [0, 5, 0],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-20 left-10 w-16 h-16 rounded-full bg-primary/10 blur-xl"
      />
      <motion.div
        animate={{
          y: [0, 15, 0],
          rotate: [0, -3, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute top-40 right-20 w-24 h-24 rounded-full bg-secondary/10 blur-xl"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-primary mb-3"
          >
            <Sparkles className="w-4 h-4" />
            For Donors/Investors
            <Sparkles className="w-4 h-4" />
          </motion.span>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mt-3 mb-4 leading-tight">
            How CataCap <BrushStrokeText>Works</BrushStrokeText>
          </h2>

          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Transform your donations into sustainable impact by investing in
            ventures that drive global change.
          </p>
        </motion.div>

        {/* Two Column Layout - Video Left, Content Right */}
        <div className="grid lg:grid-cols-2 gap-12 items-start mb-16">
          {/* Left Column - YouTube Video */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="rounded-2xl overflow-hidden shadow-2xl bg-slate-900 aspect-video">
              <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/M4GHch7B0WE"
                title="Impact Investing on CataCap"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="w-full h-full"
                data-testid="video-catacap-intro"
              />
            </div>
          </motion.div>

          {/* Right Column - Linear Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-6"
          >
            <h3 className="text-2xl md:text-3xl font-bold text-foreground">
              Donate. Invest. Grow.
            </h3>

            {/* Benefits List */}
            <div className="space-y-5">
              {keyBenefits.map((benefit, index) => {
                const IconComponent = benefit.icon;
                return (
                  <motion.div
                    key={benefit.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                    className="flex items-start gap-4 group"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <IconComponent className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                        {benefit.title}
                      </h4>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          {stats.map((stat, index) => {
            const StatIcon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                className="text-center p-6 rounded-xl bg-white dark:bg-slate-800 border border-primary/30 shadow-md hover-elevate"
                data-testid={`stat-${index}`}
              >
                <div className="flex justify-center mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <StatIcon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-primary mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
