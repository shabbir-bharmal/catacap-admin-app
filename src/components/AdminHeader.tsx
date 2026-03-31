import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Bell, Search, Maximize2, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";

interface AdminHeaderProps {
  title?: string;
}

export function AdminHeader({ title }: AdminHeaderProps) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <header className="flex h-[60px] items-center gap-3 border-b px-4 sticky top-0 z-[9999] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
      <Separator orientation="vertical" className="h-5" />

      <div className="relative hidden md:block">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search..."
          className="pl-8 w-52 h-9 text-sm bg-muted/40 border-0 focus-visible:bg-background"
          data-testid="input-admin-search"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleFullscreen}
          data-testid="button-admin-fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          data-testid="button-admin-theme-toggle"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Button size="icon" variant="ghost" className="relative" data-testid="button-admin-notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#f06548]" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <div className="flex items-center gap-2 pl-1" data-testid="button-admin-avatar">
          <Avatar className="h-8 w-8">
            {user?.profileImage ? (
              <AvatarImage src={user.profileImage} alt={user.name || "Admin"} />
            ) : null}
            <AvatarFallback className="text-xs bg-[#405189]/10 text-[#405189] dark:bg-[#405189]/20" data-testid="text-admin-avatar-initials">
              {user?.firstName && user?.lastName
                ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
                : "AD"}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-tight">{user?.name || "Admin"}</p>
            <p className="text-[10px] text-muted-foreground">{user?.role || "Administrator"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
