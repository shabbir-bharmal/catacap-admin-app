import { Link } from "wouter";
import { Mail } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import catacapLogo from "@assets/CataCap-Logo.png";

const quickLinks = [
  { label: "Explore Investments", href: "https://catacap.org/investments", external: true },
  { label: "Sign Up", href: "/register", external: false },
  { label: "Log In", href: "/login", external: false },
  { label: "Raise Money", href: "/raise-money", external: false },
  { label: "Groups", href: "/communities", external: false },
  { label: "Companies", href: "/companies", external: false },
];

const infoLinks = [
  { label: "Terms and Conditions", href: "/terms", external: false },
  { label: "Privacy Policy", href: "/privacy", external: false },
];

const aboutLinks = [
  { label: "About CataCap", href: "/about", external: false },
  { label: "FAQs", href: "/faqs", external: false },
  { label: "News", href: "/news", external: false },
];

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Link href="/">
              <img 
                src={catacapLogo} 
                alt="CataCap" 
                className="h-12 lg:h-[4rem] w-auto brightness-0 invert mb-4"
                data-testid="img-footer-logo"
              />
            </Link>
            <p className="text-sm text-slate-400 mb-6">
              Transforming philanthropy through impact investing. Join us in creating sustainable change with purpose and returns.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">QUICK LINKS</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-slate-400 hover:text-primary transition-colors"
                      data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 hover:text-primary transition-colors"
                      data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Info Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">INFO</h3>
            <ul className="space-y-3">
              {infoLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 hover:text-primary transition-colors"
                    data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About CataCap */}
          <div>
            <h3 className="text-white font-semibold mb-4">ABOUT CATACAP</h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 hover:text-primary transition-colors"
                    data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get In Touch */}
          <div>
            <h3 className="text-white font-semibold mb-4">GET IN TOUCH</h3>
            <ul className="space-y-4">
              <li>
                <a 
                  href="mailto:support@catacap.org" 
                  className="text-sm text-slate-400 hover:text-primary transition-colors flex items-center gap-2"
                  data-testid="link-email"
                >
                  <Mail className="w-4 h-4" />
                  support@catacap.org
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/company/catacap-us/posts/?feedView=all"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-primary transition-colors flex items-center gap-2"
                  data-testid="link-linkedin"
                >
                  <SiLinkedin className="w-4 h-4" />
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()}, CataCap. All Rights Reserved
            </p>
            <div className="flex gap-4">
              <a
                href="mailto:support@catacap.org"
                className="text-slate-500 hover:text-primary transition-colors"
                aria-label="Email"
                data-testid="footer-email-icon"
              >
                <Mail className="w-5 h-5" />
              </a>
              <a
                href="https://www.linkedin.com/company/catacap-us/posts/?feedView=all"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-primary transition-colors"
                aria-label="LinkedIn"
                data-testid="footer-linkedin-icon"
              >
                <SiLinkedin className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
