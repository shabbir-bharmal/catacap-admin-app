import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Menu, X, ChevronDown, User, Home, DollarSign, Landmark, UserCog, TrendingUp, HelpCircle, LogOut, Bell, Briefcase, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

const RisingArrow = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={className}
    fill="currentColor"
  >
    <path d="M3 17L9 11L13 15L21 7M21 7V13M21 7H15" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);
import { ThemeToggle } from "./ThemeToggle";
import logoImage from "@assets/CataCap-Logo.png";

interface HeaderProps {
  logoSrc?: string;
  logoAlt?: string;
  logoHref?: string;
  minimal?: boolean;
  sticky?: boolean;
}

export function Header({ logoSrc, logoAlt, logoHref, minimal, sticky = true }: HeaderProps = {}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isLoggedIn, user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const userDropdownItems = [
    { label: "Home", href: "/home", icon: Home },
    { label: "Add Funds", href: "/add-funds", icon: DollarSign },
    { label: "Raise Money", href: "/raise-money", icon: Landmark },
    { label: "My Account", href: "/settings", icon: UserCog },
    ...(user?.hasInvestments ? [{ label: "My Investments", href: "/my-investments", icon: TrendingUp }] : []),
    { label: "Need help?", href: "#", icon: HelpCircle, subtitle: "support@catacap.org" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems: { label: string; href: string; highlight?: boolean }[] = [];

  const donorsDropdownItems = [
    { label: "Explore Investments", href: "/investments" },
    { label: "Funded Companies", href: "/funded-companies" },
  ];

  const groupLeadersDropdownItems = [
    { label: "Groups", href: "/communities" },
    { label: "For Companies", href: "/companies" },
  ];

  const aboutDropdownItems = [
    { label: "About CataCap", href: "/about" },
    { label: "News", href: "/news" },
    { label: "FAQs", href: "/faqs" },
    { label: "Completed Investments", href: "/funded-companies" },
    { label: "Raise Money", href: "/raise-money" },
  ];

  const myCatacapDropdownItems = [
    { label: "Portfolio", href: "/portfolio", icon: Briefcase },
    { label: "Community", href: "/community", icon: Users },
  ];

  return (
    <header
      className={`${sticky ? "fixed top-0" : "relative"} left-0 right-0 z-[200]`}
      data-testid="header"
    >
      <div
        className={`w-full transition-all duration-300 bg-background dark:bg-card shadow-[0_2px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.3)] border-b border-border/50`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div>
            <div className="flex items-center justify-between gap-4 h-16 lg:h-20">
              <Link href={logoHref || "/"} data-testid="link-logo">
                <div className="flex items-center cursor-pointer">
                  <img
                    src={logoSrc || logoImage}
                    alt={logoAlt || "CataCap Logo"}
                    className="h-12 lg:h-[4rem] w-auto object-contain"
                    data-testid="img-logo"
                  />
                </div>
              </Link>

              {!minimal && <nav className="hidden lg:flex items-center gap-1 flex-wrap" data-testid="nav-desktop">
                {navItems.map((item) => (
                  <Link key={item.label} href={item.href}>
                    <Button
                      variant="ghost"
                      className={`rounded-full text-sm font-medium ${item.highlight ? "text-primary font-semibold" : ""}`}
                      data-testid={`link-${item.label.toLowerCase().replace(" ", "-")}`}
                    >
                      {item.highlight && <RisingArrow className="w-5 h-5 mr-1" />}
                      {item.label}
                    </Button>
                  </Link>
                ))}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="rounded-full text-sm font-medium data-[state=open]:bg-accent"
                      data-testid="dropdown-donors"
                    >
                      For Donors/Investors
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-52 bg-background">
                    {donorsDropdownItems.map((item) => (
                      <Link key={item.label} href={item.href}>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          data-testid={`dropdown-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      </Link>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="rounded-full text-sm font-medium data-[state=open]:bg-accent"
                      data-testid="dropdown-group-leaders"
                    >
                      For Group Leaders
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-48 bg-background">
                    {groupLeadersDropdownItems.map((item) => (
                      <Link key={item.label} href={item.href}>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          data-testid={`dropdown-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      </Link>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="rounded-full text-sm font-medium data-[state=open]:bg-accent"
                      data-testid="dropdown-about-catacap"
                    >
                      About CataCap
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-52 bg-background">
                    {aboutDropdownItems.map((item) => (
                      <Link key={item.label} href={item.href}>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          data-testid={`dropdown-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      </Link>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {isLoggedIn && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="rounded-full text-sm font-medium data-[state=open]:bg-accent"
                        data-testid="dropdown-my-catacap"
                      >
                        My CataCap
                        <ChevronDown className="w-4 h-4 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-48 bg-background">
                      {myCatacapDropdownItems.map((item) => (
                        <Link key={item.label} href={item.href}>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            data-testid={`dropdown-item-${item.label.toLowerCase()}`}
                          >
                            <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                            {item.label}
                          </DropdownMenuItem>
                        </Link>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </nav>}

              {!minimal && <div className="hidden lg:flex items-center gap-2 flex-wrap" data-testid="auth-buttons-desktop">
                {isLoggedIn ? (
                  <>
                    <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-notifications">
                      <Bell className="w-5 h-5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="rounded-full flex items-center gap-1 px-2" data-testid="button-user-dropdown">
                          <div className="w-8 h-8 rounded-full border-2 border-primary flex items-center justify-center overflow-hidden">
                            {user?.profileImage ? (
                              <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {userDropdownItems.map((item) => (
                          <Link key={item.label} href={item.href}>
                            <DropdownMenuItem
                              className="cursor-pointer py-3 px-4"
                              data-testid={`dropdown-user-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              <item.icon className="w-5 h-5 mr-3 text-muted-foreground" />
                              <div>
                                <span>{item.label}</span>
                                {item.subtitle && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                                )}
                              </div>
                            </DropdownMenuItem>
                          </Link>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer py-3 px-4"
                          onClick={handleLogout}
                          data-testid="dropdown-user-logout"
                        >
                          <LogOut className="w-5 h-5 mr-3 text-muted-foreground" />
                          <span>Log out</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      className="rounded-full text-sm font-medium"
                      data-testid="button-login"
                      asChild
                    >
                      <Link href="/login">
                        Login
                      </Link>
                    </Button>
                    <Button
                      className="rounded-full px-6"
                      data-testid="button-signup"
                      asChild
                    >
                      <Link href="/register">
                        Register
                      </Link>
                    </Button>
                  </>
                )}
              </div>}

              {!minimal && <div className="flex lg:hidden items-center gap-2 flex-wrap">
                {isLoggedIn ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-mobile">
                        <div className="w-8 h-8 rounded-full border-2 border-primary flex items-center justify-center overflow-hidden">
                          {user?.profileImage ? (
                            <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-primary" />
                          )}
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {userDropdownItems.map((item) => (
                        <Link key={item.label} href={item.href}>
                          <DropdownMenuItem
                            className="cursor-pointer py-3 px-4"
                            data-testid={`mobile-dropdown-user-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <item.icon className="w-5 h-5 mr-3 text-muted-foreground" />
                            <div>
                              <span>{item.label}</span>
                              {item.subtitle && (
                                <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                              )}
                            </div>
                          </DropdownMenuItem>
                        </Link>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer py-3 px-4"
                        onClick={handleLogout}
                        data-testid="mobile-dropdown-user-logout"
                      >
                        <LogOut className="w-5 h-5 mr-3 text-muted-foreground" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    data-testid="button-user-mobile"
                    asChild
                  >
                    <Link href="/login">
                      <User className="w-5 h-5" />
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  data-testid="button-mobile-menu"
                >
                  {isMobileMenuOpen ? (
                    <X className="w-6 h-6" />
                  ) : (
                    <Menu className="w-6 h-6" />
                  )}
                </Button>
              </div>}
            </div>
          </div>
        </div>
      </div>

      {!minimal && isMobileMenuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/20 dark:bg-black/40 z-[-1]"
            onClick={() => setIsMobileMenuOpen(false)}
            data-testid="mobile-menu-overlay"
          />
          <nav
            className="lg:hidden fixed top-16 left-0 right-0 bottom-0 bg-background dark:bg-card border-t border-border overflow-y-auto"
            data-testid="nav-mobile"
          >
            <div className="flex flex-col min-h-full px-6 py-6">
              <div className="flex-1 space-y-0">
                <div className="pt-2 pb-2 text-lg font-semibold text-muted-foreground">For Donors/Investors</div>
                {donorsDropdownItems.map((item) => (
                  <Link key={item.label} href={item.href}>
                    <button
                      className="w-full flex items-center justify-between py-4 border-b border-border text-left"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid={`mobile-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span className="text-base font-medium">{item.label}</span>
                      <ChevronDown className="w-5 h-5 text-muted-foreground rotate-[-90deg]" />
                    </button>
                  </Link>
                ))}

                <div className="pt-6 pb-2 text-lg font-semibold text-muted-foreground">For Group Leaders</div>
                {groupLeadersDropdownItems.map((item) => (
                  <Link key={item.label} href={item.href}>
                    <button
                      className="w-full flex items-center justify-between py-4 border-b border-border text-left"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid={`mobile-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span className="text-base font-medium">{item.label}</span>
                      <ChevronDown className="w-5 h-5 text-muted-foreground rotate-[-90deg]" />
                    </button>
                  </Link>
                ))}

                <div className="pt-6 pb-2 text-lg font-semibold text-muted-foreground">About CataCap</div>
                {aboutDropdownItems.map((item) => (
                  <Link key={item.label} href={item.href}>
                    <button
                      className="w-full flex items-center justify-between py-4 border-b border-border text-left"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid={`mobile-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span className="text-base font-medium">{item.label}</span>
                      <ChevronDown className="w-5 h-5 text-muted-foreground rotate-[-90deg]" />
                    </button>
                  </Link>
                ))}

                {isLoggedIn && (
                  <>
                    <div className="pt-6 pb-2 text-lg font-semibold text-muted-foreground">My CataCap</div>

                    {myCatacapDropdownItems.map((item) => (
                      <Link key={item.label} href={item.href}>
                        <button
                          className="w-full flex items-center justify-between py-4 border-b border-border text-left"
                          onClick={() => setIsMobileMenuOpen(false)}
                          data-testid={`mobile-link-${item.label.toLowerCase()}`}
                        >
                          <span className="text-base font-medium flex items-center gap-2">
                            <item.icon className="w-5 h-5 text-muted-foreground" />
                            {item.label}
                          </span>
                          <ChevronDown className="w-5 h-5 text-muted-foreground rotate-[-90deg]" />
                        </button>
                      </Link>
                    ))}
                  </>
                )}
              </div>

              <div className="pt-8 pb-4 flex flex-col items-center gap-3">
                <Link
                  href="/login"
                  className="text-base font-medium text-foreground"
                  data-testid="button-login-mobile"
                >
                  Login
                </Link>
                <Button className="w-full rounded-full" data-testid="button-signup-mobile" asChild>
                  <Link href="/register">
                    Register
                  </Link>
                </Button>
              </div>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
