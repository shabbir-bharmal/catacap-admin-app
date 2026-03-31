import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Mail, 
  ArrowRight, 
  Check, 
} from "lucide-react";
import { BrushStrokeText } from "@/components/BrushStrokeText";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import ClimateChangeImg from "@assets/Climate-Change.png";
import GenderEquityImg from "@assets/Gender-Equity.png";
import OceanImg from "@assets/Ocean.png";
import PovertyImg from "@assets/Poverty-Alleviation.png";
import RacialJusticeImg from "@assets/Racial-Justice.png";
import OtherImg from "@assets/Other.png";

interface Theme {
  id: string;
  label: string;
  image: string;
}

const themes: Theme[] = [
  { id: "climate", label: "Climate Change", image: ClimateChangeImg },
  { id: "gender", label: "Gender Equity", image: GenderEquityImg },
  { id: "ocean", label: "Ocean", image: OceanImg },
  { id: "poverty", label: "Poverty Alleviation", image: PovertyImg },
  { id: "racial", label: "Racial Justice", image: RacialJusticeImg },
  { id: "other", label: "Other Impact Areas", image: OtherImg },
];

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleThemeToggle = (themeId: string) => {
    setSelectedThemes(prev =>
      prev.includes(themeId)
        ? prev.filter(id => id !== themeId)
        : [...prev, themeId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Subscribed!",
      description: "You're now signed up for our newsletter.",
    });
    
    setEmail("");
    setSelectedThemes([]);
    setIsSubmitting(false);
  };

  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-primary/5 via-background to-primary/10 dark:from-primary/10 dark:via-background dark:to-primary/5" data-testid="newsletter-section">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="bg-card border border-border rounded-2xl p-8 md:p-12 shadow-lg"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">
              Get Investment <BrushStrokeText>Opportunities</BrushStrokeText> Straight to Your Inbox
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Sign up for our newsletter to get regular updates on impact investments that match your interests.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Theme Selection */}
            <div>
              <p className="text-center text-sm font-medium text-foreground mb-4">
                What themes do you care most about?
              </p>
              <div className="flex flex-wrap justify-center gap-3" data-testid="theme-selection">
                {themes.map((theme) => {
                  const isSelected = selectedThemes.includes(theme.id);
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      className={`
                        flex items-center gap-2 px-4 py-2.5 rounded-full border cursor-pointer transition-all
                        ${isSelected
                          ? 'bg-primary/10 border-primary text-primary shadow-sm'
                          : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:bg-slate-50'
                        }
                      `}
                      onClick={() => handleThemeToggle(theme.id)}
                      data-testid={`theme-${theme.id}`}
                    >
                      <img src={theme.image} alt={theme.label} className="w-5 h-5 object-contain" />
                      <span className="text-sm font-medium">
                        {theme.label}
                      </span>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Email Input */}
            <div className="max-w-md mx-auto">
              <label htmlFor="email" className="sr-only">Email address</label>
              <div className="flex gap-3">
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                  data-testid="input-email"
                />
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="rounded-full px-6"
                  data-testid="button-subscribe"
                >
                  {isSubmitting ? "..." : "Subscribe"}
                  {!isSubmitting && <ArrowRight className="ml-2 w-4 h-4" />}
                </Button>
              </div>
            </div>
          </form>

          {/* Privacy Note */}
          <p className="text-center text-xs text-muted-foreground mt-8">
            We respect your privacy. Unsubscribe at any time.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
