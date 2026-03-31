import { Route, Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import AdminNotFound from "@/pages/AdminNotFound";

interface ProtectedRouteProps {
    path?: string;
    component: React.ComponentType<any>;
    moduleName?: string;
    requiresSuperAdmin?: boolean;
}

export function ProtectedRoute({ path, component: Component, moduleName, requiresSuperAdmin }: ProtectedRouteProps) {
    const { isLoggedIn, isLoadingUser, hasActionPermission, user } = useAuth();

    if (isLoadingUser) {
        return (
            <Route path={path}>
                <div className="flex items-center justify-center min-h-screen">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </Route>
        );
    }

    if (!isLoggedIn) {
        return (
            <Route path={path}>
                <Redirect to="/login" />
            </Route>
        );
    }

    if (moduleName && !hasActionPermission(moduleName, "manage")) {
        return (
            <AdminNotFound />
        );
    }

    if (requiresSuperAdmin && !user?.isSuperAdmin) {
        return (
            <AdminNotFound />
        );
    }

    return <Route path={path} component={Component} />;
}

