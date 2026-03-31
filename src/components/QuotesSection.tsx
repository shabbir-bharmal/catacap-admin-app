import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { useEffect, useState } from "react";
import { BrushStrokeText } from "@/components/BrushStrokeText";

const quotes = [
  {
    id: 1,
    text: "CATA Cap opened my eyes to the power of catalytic philanthropy. My investments are now generating both financial returns and measurable social impact.",
    author: "Jennifer Chen",
    role: "Family Office Director",
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 2,
    text: "As a first-time impact investor, the platform made it easy to find ventures aligned with my values. The transparency and community support are exceptional.",
    author: "David Okonkwo",
    role: "Tech Entrepreneur",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 3,
    text: "We've funded three women-led startups through CATA Cap. Watching them grow while earning returns feels like the future of philanthropy.",
    author: "Maria Santos",
    role: "Foundation Trustee",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 4,
    text: "The patient capital we received helped us scale sustainably. Traditional VCs wanted quick exits, but CATA Cap understood our long-term mission.",
    author: "James Mwangi",
    role: "Social Enterprise Founder",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 5,
    text: "Impact investing seemed complicated until I joined CATA Cap. Now I'm part of a community making real change while growing my portfolio.",
    author: "Sophie Laurent",
    role: "Individual Investor",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 6,
    text: "Our ocean cleanup initiative received funding when no one else believed in us. Two years later, we've removed 500 tons of plastic from the sea.",
    author: "Thomas Berg",
    role: "Environmental Innovator",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
];

export default function QuotesSection() {
  const [isPaused, setIsPaused] = useState(false);

  const duplicatedQuotes = [...quotes, ...quotes];

  return (
    <section className="py-16 md:py-24 bg-slate-900 overflow-hidden" data-testid="quotes-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Testimonials
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mt-3">
            What Our <BrushStrokeText>Community</BrushStrokeText> Says
          </h2>
          <p className="text-slate-400 mt-4 max-w-2xl mx-auto">
            Hear from investors and investees who are transforming philanthropy together
          </p>
        </motion.div>
      </div>

      {/* Rolling Quotes Container */}
      <div
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        data-testid="quotes-carousel"
      >
        {/* Gradient Overlays */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none" />

        {/* Scrolling Track */}
        <div
          className="flex gap-6"
          style={{
            animation: `scroll 40s linear infinite`,
            animationPlayState: isPaused ? 'paused' : 'running',
            width: 'max-content',
          }}
        >
          {duplicatedQuotes.map((quote, index) => (
            <div
              key={`${quote.id}-${index}`}
              className="flex-shrink-0 w-80 md:w-96 bg-slate-800/50 border border-slate-700 rounded-xl p-6 backdrop-blur-sm"
              data-testid={`quote-card-${quote.id}`}
            >
              {/* Quote Icon */}
              <Quote className="w-8 h-8 text-primary/40 mb-4" />

              {/* Quote Text */}
              <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-6">
                "{quote.text}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <img
                  src={quote.image}
                  alt={quote.author}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-white text-sm">{quote.author}</p>
                  <p className="text-xs text-slate-400">{quote.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}
