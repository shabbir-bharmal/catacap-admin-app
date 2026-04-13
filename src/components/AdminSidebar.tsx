import { Link, useLocation } from "wouter";
import { useState } from "react";
import { sidebarConfig } from "@/config/adminSidebar";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar
} from "@/components/ui/sidebar";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { ChevronDown, ChevronRight, Maximize2, Sun, Moon, PanelLeft, MoreVertical, UserCircle, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AdminSidebar() {
  const [location, setLocation] = useLocation();
  const { toggleSidebar, state, isHovered } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { user, logout, hasActionPermission } = useAuth();

  const isCollapsed = state === "collapsed";

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const hasPermission = (item: any) => {
    if (item.superAdminOnly && !user?.isSuperAdmin) return false;

    if (item.children && item.children.length > 0) {
      return item.children.some((child: any) => {
        if (child.superAdminOnly && !user?.isSuperAdmin) return false;
        if (!child.permission) return true;
        return hasActionPermission(child.permission.module, child.permission.action);
      });
    }

    if (!item.permission) return true;

    return hasActionPermission(item.permission.module, item.permission.action);
  };

  /**
   * Check active state
   */
  const isItemActive = (item: any) => {
    if (item.url && location === item.url) return true;
    if (item.activeFor?.some((prefix: string) => location.startsWith(prefix))) return true;

    if (item.children) {
      return item.children.some((child: any) =>
        location === child.url ||
        child.activeFor?.some((prefix: string) => location.startsWith(prefix))
      );
    }

    return false;
  };

  /**
   * Render Single Item
   */
  const renderSingleItem = (item: any) => {
    const Icon = item.icon;
    const active = isItemActive(item);

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={active} tooltip={item.title} className="group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!h-8">
          <Link href={item.url}>
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="text-[14px] group-data-[collapsible=icon]:hidden truncate">{item.title}</span>
            {active && !isCollapsed && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 group-data-[collapsible=icon]:hidden" />}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  /**
   * Render Collapsible Menu
   */
  const renderCollapsible = (item: any) => {
    const Icon = item.icon;
    const active = isItemActive(item);

    const [open, setOpen] = useState(active);

    return (
      <Collapsible key={item.title} open={open} onOpenChange={setOpen} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton isActive={active} className="group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!h-8">
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="text-[14px] group-data-[collapsible=icon]:hidden truncate">{item.title}</span>
              <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden shrink-0" />
            </SidebarMenuButton>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <SidebarMenuSub className="border-l-0 ml-0.5">
              {item.children.map((child: any) => {
                if (!hasPermission(child)) return null;

                return (
                  <SidebarMenuSubItem key={child.title}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={
                        location === child.url ||
                        child.activeFor?.some((prefix: string) => location.startsWith(prefix))
                      }
                    >
                      <Link href={child.url}>
                        <span className="truncate">{child.title}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* HEADER */}

      <SidebarHeader className="p-3 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <Link href="/dashboard" className="flex items-center gap-2.5 no-underline min-w-0">
            <div
              className={`group/logo relative flex h-9 w-9 shrink-0 items-center justify-center cursor-pointer hover:bg-muted/50 rounded-md transition-colors`}
              onClick={(e) => {
                if (isCollapsed && !isHovered) {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleSidebar();
                }
              }}
            >
              <img
                src="/favicon.png"
                alt="CataCap"
                className={`h-8 w-8 object-contain transition-opacity ${isCollapsed && !isHovered ? 'group-hover/logo:opacity-0' : ''}`}
              />

              {isCollapsed && !isHovered && (
                <div className="invisible group-hover/logo:visible absolute inset-0 flex items-center justify-center">
                  <PanelLeft className="h-4 w-4 text-[#405189]" />
                </div>
              )}
            </div>

            <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
              <span className="text-sm font-semibold tracking-wide truncate">CATACAP</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">Admin Panel</span>
            </div>
          </Link>

          <Button size="icon" variant="ghost" onClick={toggleSidebar} className="h-7 w-7 shrink-0 group-data-[collapsible=icon]:hidden">
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="group-data-[collapsible=icon]:hidden mt-1.5">
          <span className="bg-destructive text-destructive-foreground text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            QA Environment
          </span>
        </div>
      </SidebarHeader>

      {/* MENU */}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {sidebarConfig.map((section) => {
              const visibleItems = section.items.filter((item) => hasPermission(item));

              if (visibleItems.length === 0) return null;

              return (
                <SidebarGroup key={section.heading}>
                  <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-2">
                    {section.heading}
                  </SidebarGroupLabel>

                  <SidebarGroupContent>
                    <SidebarMenu>
                      {visibleItems.map((item) => {
                        if (!item.children) return renderSingleItem(item);
                        return renderCollapsible(item);
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* FOOTER */}

      <SidebarFooter className="border-t border-sidebar-border p-2 overflow-hidden">
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-1">
          <Button size="icon" variant="ghost" onClick={toggleFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </Button>

          <Button size="icon" variant="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 min-w-0">
          <div className="group-data-[collapsible=icon]:hidden min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user?.name || "Admin"}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.role || "Administrator"}</p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="end" className="w-48">
              <DropdownMenuItem onClick={() => setLocation("/profile")}>
                <UserCircle className="h-4 w-4 mr-2" />
                My Profile
              </DropdownMenuItem>

              <DropdownMenuItem onClick={toggleFullscreen}>
                <Maximize2 className="h-4 w-4 mr-2" />
                Fullscreen
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={async () => {
                  await logout();
                  setLocation("/login");
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
