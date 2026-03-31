import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, TrendingUp, Heart, Sprout, DollarSign } from "lucide-react";
import { BrushStrokeText } from "@/components/BrushStrokeText";
import { ThemeBadge } from "@/components/ThemeBadge";
import { currency_format } from "@/helpers/format";

const impactCards = [
  {
    id: 1,
    icon: DollarSign,
    title: "Smart Investment",
    description: "Invest in verified impact opportunities with transparent returns and measurable outcomes.",
    color: "text-primary",
    bgColor: "bg-primary/10",
    stat: "$50M+",
    statLabel: "Invested",
  },
  {
    id: 2,
    icon: Heart,
    title: "Real Impact",
    description: "Every dollar creates tangible change in communities, environment, and lives worldwide.",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    stat: "200+",
    statLabel: "Projects Funded",
  },
  {
    id: 3,
    icon: Sprout,
    title: "Sustainable Growth",
    description: "Watch your investments flourish while generating positive returns for you and society.",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    stat: "15%",
    statLabel: "Avg. Annual Return",
  },
];

const featuredGroups = [
  {
    id: 1,
    name: "Empower Her",
    title: "Investing in Women-Led Ventures",
    theme: "Gender Equity",
    description: "A community of philanthropic investors dedicated to funding women-led companies and closing the gender gap in venture capital.",
    members: 500,
    raised: 15000000,
    image: "https://images.unsplash.com/photo-1573164713988-8665fc963095?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    link: "/empowerher",
    color: "text-pink-600",
    bgColor: "bg-pink-50",
  },
  {
    id: 2,
    name: "Sea Forward",
    title: "Protecting Our Oceans",
    theme: "Ocean",
    description: "Investors committed to ocean conservation and sustainable blue economy ventures that protect marine ecosystems.",
    members: 320,
    raised: 8000000,
    image: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    link: "https://catacap.org/investments/group/seaforward",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
  },
  {
    id: 3,
    name: "Investor Circle",
    title: "Collective Impact Investing",
    theme: "Other",
    description: "A diverse community of impact investors pooling resources to fund transformative social and environmental ventures.",
    members: 750,
    raised: 25000000,
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    link: "https://catacap.org/investments/group/ic",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    id: 4,
    name: "Climate Action Fund",
    title: "Funding the green revolution",
    theme: "Climate Change",
    description: "Supporting ventures that combat climate change through innovative renewable energy and sustainability solutions.",
    members: 890,
    raised: 24500000,
    image: "https://images.unsplash.com/photo-1466611653911-95081537e5b7?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    link: "https://catacap.org/investments/group/climate",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
];

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}


export default function GroupsSection() {
  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-amber-50/50 via-background to-cyan-50/30 dark:from-amber-950/10 dark:via-background dark:to-cyan-950/10 relative overflow-hidden" data-testid="groups-section">
      {/* Background Visual Chain */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Connecting flow lines */}
        <svg className="absolute top-1/4 left-0 w-full h-96 opacity-10" viewBox="0 0 1200 400" fill="none" preserveAspectRatio="none">
          <motion.path
            d="M0 200 C200 100, 400 300, 600 200 S1000 100, 1200 200"
            stroke="url(#flowGradient)"
            strokeWidth="3"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
          <motion.path
            d="M0 250 C300 150, 500 350, 700 250 S1100 150, 1200 250"
            stroke="url(#flowGradient2)"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 2.5, delay: 0.3, ease: "easeInOut" }}
          />
          <defs>
            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#02a95c" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="flowGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>

        {/* Floating circles representing money flow */}
        <motion.div
          animate={{ x: [0, 100, 200], y: [0, -20, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 left-1/4 w-4 h-4 bg-primary/30 rounded-full blur-sm hidden lg:block"
        />
        <motion.div
          animate={{ x: [0, 150, 300], y: [0, 30, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 5, repeat: Infinity, delay: 1, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/3 w-3 h-3 bg-amber-500/30 rounded-full blur-sm hidden lg:block"
        />
        <motion.div
          animate={{ x: [0, 120, 240], y: [0, -15, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, delay: 2, ease: "easeInOut" }}
          className="absolute top-2/3 left-1/2 w-5 h-5 bg-emerald-500/30 rounded-full blur-sm hidden lg:block"
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            How It Works
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mt-3">
            Donate. Invest. <BrushStrokeText>Grow.</BrushStrokeText>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-lg">
            Your journey from investor to changemaker starts here
          </p>
        </motion.div>

        {/* Visual Impact Chain - Investment → Impact → Grow */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-20"
        >
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 relative">
            {/* Connection Lines (Desktop only) */}
            <div className="absolute top-1/2 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-primary via-rose-500 to-emerald-500 hidden md:block -translate-y-1/2 z-0 opacity-30" />
            
            {impactCards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className="relative z-10"
              >
                <div className="bg-card border border-border rounded-2xl p-8 text-center hover-elevate h-full shadow-lg">
                  {/* Step Number */}
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-background border-2 border-primary rounded-full flex items-center justify-center text-sm font-bold text-primary">
                    {index + 1}
                  </div>

                  {/* Icon */}
                  <div className={`w-20 h-20 ${card.bgColor} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
                    <card.icon className={`w-10 h-10 ${card.color}`} />
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    {card.title}
                  </h3>

                  {/* Description */}
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    {card.description}
                  </p>

                  {/* Stat */}
                  <div className="pt-4 border-t border-border">
                    <p className={`text-3xl font-bold ${card.color}`}>{card.stat}</p>
                    <p className="text-sm text-muted-foreground">{card.statLabel}</p>
                  </div>
                </div>

                {/* Arrow connector (mobile) */}
                {index < impactCards.length - 1 && (
                  <div className="flex justify-center my-4 md:hidden">
                    <motion.div
                      animate={{ y: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <ArrowRight className="w-6 h-6 text-primary rotate-90" />
                    </motion.div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Investment Groups Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mb-12"
        >
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Community
          </span>
          <h3 className="text-2xl md:text-3xl font-bold text-foreground mt-3">
            Join Investment Groups
          </h3>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Amplify your impact by investing alongside like-minded individuals
          </p>
        </motion.div>

        {/* Featured Groups Grid - With Images */}
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {featuredGroups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="bg-white border border-border rounded-2xl overflow-hidden hover-elevate shadow-lg"
              data-testid={`card-group-${group.id}`}
            >
              <div className="flex flex-col md:flex-row">
                {/* Image - 1/3 */}
                <div className="md:w-1/3 h-48 md:h-auto flex-shrink-0">
                  <img
                    src={group.image}
                    alt={group.name}
                    className="w-full h-full object-cover"
                    data-testid={`img-group-${group.id}`}
                  />
                </div>

                {/* Content - 2/3 */}
                <div className="md:w-2/3 p-6">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${group.bgColor} ${group.color} text-sm font-semibold mb-3`} data-testid={`badge-group-name-${group.id}`}>
                    {group.name}
                  </div>
                  
                  <h4 className="text-lg font-bold text-foreground mb-2" data-testid={`text-group-title-${group.id}`}>
                    {group.title}
                  </h4>
                  
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4" data-testid={`text-group-desc-${group.id}`}>
                    {group.description}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{formatNumber(group.members)}+ members</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-primary">{currency_format(group.raised, true)}</span>
                    </div>
                  </div>

                  {/* Theme Tile */}
                  <div className="mb-4">
                    <ThemeBadge
                      theme={group.theme}
                      data-testid={`badge-group-theme-${group.id}`}
                    />
                  </div>

                  {/* CTA */}
                  {group.link.startsWith('/') ? (
                    <Link href={group.link}>
                      <Button
                        className="rounded-full"
                        data-testid={`button-join-group-${group.id}`}
                      >
                        Learn More
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </Link>
                  ) : (
                    <a href={group.link} target="_blank" rel="noopener noreferrer">
                      <Button
                        className="rounded-full"
                        data-testid={`button-join-group-${group.id}`}
                      >
                        Join Group
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Explore All Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-center mt-12"
        >
          <Link href="/communities">
            <Button
              size="lg"
              className="rounded-full"
              data-testid="button-explore-groups"
            >
              Explore All Groups
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
