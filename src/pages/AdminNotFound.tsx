import { AdminLayout } from "../components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function AdminNotFound() {
  return (
    <AdminLayout title="Page Not Found">
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="text-center space-y-4">
          <h1
            className="text-[120px] leading-none font-bold text-[#2a4365]"
            data-testid="text-admin-404-code"
          >
            404
          </h1>
          <h2
            className="text-xl font-semibold text-foreground"
            data-testid="text-admin-404-title"
          >
            Oops! This page could not be found.
          </h2>
          <p
            className="text-sm text-muted-foreground"
            data-testid="text-admin-404-message"
          >
            Sorry, but the page you are looking for does NOT exist!
          </p>
          <div className="pt-4">
            <Button
              asChild
              className="bg-[#2a4365] hover:bg-[#1e3a5f] text-white rounded-full px-8"
              data-testid="button-admin-404-back"
            >
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
