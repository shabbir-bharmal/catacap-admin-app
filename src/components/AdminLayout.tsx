import { useState, useCallback } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

function getSidebarState(): boolean {
  try {
    const stored = localStorage.getItem("admin-sidebar-open");
    if (stored !== null) return stored === "true";
  } catch {}
  return true;
}

export function AdminLayout({ children, title }: AdminLayoutProps) {
  const [open, setOpenState] = useState(getSidebarState);

  const setOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem("admin-sidebar-open", String(next));
      } catch {}
      return next;
    });
  }, []);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem"
  };

  return (
    <SidebarProvider open={open} onOpenChange={setOpen} style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <main className="flex-1 overflow-auto bg-background p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
