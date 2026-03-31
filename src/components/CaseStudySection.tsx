import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Quote } from "lucide-react";
import { BrushStrokeText } from "@/components/BrushStrokeText";
import { Link } from "wouter";

const caseStudies = {
  funder: {
    perspective: "From Funder's Perspective",
    name: "Sarah Mitchell",
    role: "Impact Investor & Philanthropist",
    company: "Mitchell Family Foundation",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    quote: "CATA Cap transformed how I approach philanthropy. Instead of just giving, I'm now investing in sustainable solutions that generate returns while creating lasting impact. My $500K investment has already helped 3 climate ventures scale, and I've seen a 12% return.",
    stats: [
      { label: "Invested", value: "$500K" },
      { label: "Ventures Supported", value: "3" },
      { label: "Annual Return", value: "12%" },
    ],
  },
  investee: {
    perspective: "From Investee's Perspective",
    name: "Marcus Johnson",
    role: "Founder & CEO",
    company: "GreenGrid Energy",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    quote: "When traditional VCs turned us down, CATA Cap believed in our mission. Their patient capital and network of impact-focused investors helped us deploy solar microgrids to 50,000 homes in underserved communities. We've grown 10x in two years.",
    stats: [
      { label: "Funding Raised", value: "$2.5M" },
      { label: "Homes Powered", value: "50K" },
      { label: "Growth", value: "10x" },
    ],
  },
};

export default function CaseStudySection() {
  return (
    <section className="relative py-16 md:py-24 bg-background overflow-hidden" data-testid="case-study-section">
      <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" viewBox="0 0 1200 600" fill="none" preserveAspectRatio="none">
        <motion.path
          d="M0 390 C200 350, 400 280, 600 220 S900 150, 1200 270"
          stroke="url(#storyFlowGradient1)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        <motion.path
          d="M0 420 C250 370, 500 300, 750 240 S1000 180, 1200 300"
          stroke="url(#storyFlowGradient2)"
          strokeWidth="2.5"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.2, delay: 0.2, ease: "easeInOut" }}
        />
        <motion.path
          d="M0 360 C300 320, 600 250, 900 200 S1100 160, 1200 240"
          stroke="url(#storyFlowGradient3)"
          strokeWidth="1.5"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.5, delay: 0.4, ease: "easeInOut" }}
        />
        <motion.path
          d="M0 450 C150 400, 350 330, 550 270 S850 200, 1200 320"
          stroke="url(#storyFlowGradient4)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.8, delay: 0.6, ease: "easeInOut" }}
        />
        <defs>
          <linearGradient id="storyFlowGradient1" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#02a95c" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="storyFlowGradient2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="storyFlowGradient3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#02a95c" />
          </linearGradient>
          <linearGradient id="storyFlowGradient4" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            Success <BrushStrokeText>Stories</BrushStrokeText>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            Real stories from both sides of impact investing
          </p>
        </motion.div>

        {/* Case Studies Grid */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Funder Perspective */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
            data-testid="case-study-funder"
          >

            <div className="p-6 lg:p-8">
              {/* Quote */}
              <div className="relative mb-8">
                <Quote className="absolute -top-2 -left-2 w-8 h-8 text-primary/20" />
                <p className="text-foreground text-lg italic pl-6">
                  "{caseStudies.funder.quote}"
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {caseStudies.funder.stats.map((stat, index) => (
                  <div key={index} className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-xl lg:text-2xl font-bold text-primary">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Author */}
              <div className="flex items-center gap-4">
                <img
                  src={caseStudies.funder.image}
                  alt={caseStudies.funder.name}
                  className="w-14 h-14 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-foreground">{caseStudies.funder.name}</p>
                  <p className="text-sm text-muted-foreground">{caseStudies.funder.role}</p>
                  <p className="text-sm text-primary">{caseStudies.funder.company}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Investee Perspective */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
            data-testid="case-study-investee"
          >

            <div className="p-6 lg:p-8">
              {/* Quote */}
              <div className="relative mb-8">
                <Quote className="absolute -top-2 -left-2 w-8 h-8 text-amber-500/20" />
                <p className="text-foreground text-lg italic pl-6">
                  "{caseStudies.investee.quote}"
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {caseStudies.investee.stats.map((stat, index) => (
                  <div key={index} className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-xl lg:text-2xl font-bold text-amber-600 dark:text-amber-400">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Author */}
              <div className="flex items-center gap-4">
                <img
                  src={caseStudies.investee.image}
                  alt={caseStudies.investee.name}
                  className="w-14 h-14 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-foreground">{caseStudies.investee.name}</p>
                  <p className="text-sm text-muted-foreground">{caseStudies.investee.role}</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">{caseStudies.investee.company}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-center mt-12"
        >
          <Link href="/success-stories">
            <Button
              size="lg"
              className="rounded-full"
              data-testid="button-view-case-studies"
            >
              More from the CataCap Community
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
