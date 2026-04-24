import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Loader2,
    Check,
    Pencil,
    User,
    Mail,
    Shield,
    ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
    exportUsers,
    fetchUsers,
    UserEntry,
    updateAccountBalance,
    updateUserSettings,
    assignGroupAdmin,
    loginAsUser,
    assignRole,
    updateUserProfile,
    updateTwoFactorEnabled,
} from "../api/user/userApi";

export default function AdminUserProfile() {
    const {
        user,
        isLoggedIn,
        isLoadingUser,
        updateUser,
        refreshUser,
        patchUser,
        token,
    } = useAuth();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [isUpdatingTwoFactor, setIsUpdatingTwoFactor] = useState(false);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");

    useEffect(() => {
        if (!isLoggedIn && !isLoadingUser) {
            setLocation("/login");
            return;
        }

        if (user) {
            setFirstName(user.firstName || "");
            setLastName(user.lastName || "");
            setUsername(user.username || "");
            setEmail(user.email || "");
            setTwoFactorEnabled(!!user.twoFactorEnabled);
        }
    }, [isLoggedIn, isLoadingUser, user, setLocation]);

    const handleToggleTwoFactor = async (nextValue: boolean) => {
        const previousValue = twoFactorEnabled;
        setTwoFactorEnabled(nextValue);
        setIsUpdatingTwoFactor(true);
        try {
            const result = await updateTwoFactorEnabled(nextValue);
            const persistedValue =
                typeof result?.twoFactorEnabled === "boolean"
                    ? result.twoFactorEnabled
                    : nextValue;
            setTwoFactorEnabled(persistedValue);
            patchUser({ twoFactorEnabled: persistedValue });
            toast({
                title: persistedValue
                    ? "Two-factor authentication enabled"
                    : "Two-factor authentication disabled",
                description: persistedValue
                    ? "You'll be asked for a verification code the next time you sign in."
                    : "You'll no longer be asked for a verification code at sign-in.",
            });
        } catch (error) {
            setTwoFactorEnabled(previousValue);
            toast({
                title: "Error",
                description:
                    "Failed to update two-factor authentication. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsUpdatingTwoFactor(false);
        }
    };

    const handleSaveProfile = async () => {
        setIsSaving(true);
        try {
            await updateUserProfile({
                token: token || "",
                firstName,
                lastName,
                userName: username,
                email,
            });

            await refreshUser();
            setIsEditing(false);
            toast({
                title: "Profile updated",
                description: "Your profile has been updated successfully.",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update profile. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoadingUser) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-[#405189]" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
                        <div className="flex-1 pb-2">
                            <h1
                                className="text-xl font-semibold text-foreground"
                                data-testid="text-profile-name"
                            >
                                {user?.firstName && user?.lastName
                                    ? `${user.firstName} ${user.lastName}`
                                    : "Admin User"}
                            </h1>
                            <p
                                className="text-sm text-muted-foreground"
                                data-testid="text-profile-role"
                            >
                                {user?.role || "Administrator"}
                            </p>
                        </div>

                        <div className="pb-2">
                            {!isEditing ? (
                                <Button
                                    onClick={() => setIsEditing(true)}
                                    variant="outline"
                                    className="gap-2"
                                    data-testid="button-edit-profile"
                                >
                                    <Pencil className="h-4 w-4" />
                                    Edit Profile
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            if (user) {
                                                setFirstName(
                                                    user.firstName || "",
                                                );
                                                setLastName(
                                                    user.lastName || "",
                                                );
                                                setUsername(
                                                    user.username || "",
                                                );
                                                setEmail(user.email || "");
                                            }
                                            setIsEditing(false);
                                        }}
                                        data-testid="button-cancel-edit"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleSaveProfile}
                                        disabled={isSaving}
                                        className="bg-[#0ab39c] hover:bg-[#099880] text-white gap-2"
                                        data-testid="button-save-profile"
                                    >
                                        {isSaving ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Check className="h-4 w-4" />
                                        )}
                                        Save Changes
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card data-testid="card-profile-info">
                            <CardHeader>
                                <CardTitle className="text-base font-semibold">
                                    Profile Information
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">
                                            Full Name
                                        </p>
                                        <p
                                            className="text-sm font-medium"
                                            data-testid="text-info-fullname"
                                        >
                                            {user?.firstName && user?.lastName
                                                ? `${user.firstName} ${user.lastName}`
                                                : "Not set"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">
                                            Email
                                        </p>
                                        <p
                                            className="text-sm font-medium"
                                            data-testid="text-info-email"
                                        >
                                            {user?.email || "Not set"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">
                                            Username
                                        </p>
                                        <p
                                            className="text-sm font-medium"
                                            data-testid="text-info-username"
                                        >
                                            {user?.username || "Not set"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">
                                            Role
                                        </p>
                                        <Badge
                                            variant="secondary"
                                            className="mt-0.5"
                                            data-testid="badge-role"
                                        >
                                            {user?.role || "Administrator"}
                                        </Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            className="lg:col-span-2"
                            data-testid="card-profile-details"
                        >
                            <CardHeader>
                                <CardTitle className="text-base font-semibold">
                                    Account Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-muted/30 p-4">
                                    <div className="flex items-start gap-3">
                                        <ShieldCheck className="h-5 w-5 text-[#405189] shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">
                                                Two-Factor Authentication
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Require an emailed verification
                                                code when signing in to your
                                                admin account.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Switch
                                            checked={twoFactorEnabled}
                                            onCheckedChange={
                                                handleToggleTwoFactor
                                            }
                                            disabled={isUpdatingTwoFactor}
                                            aria-label="Toggle two-factor authentication"
                                            data-testid="switch-two-factor"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                                            First Name
                                        </label>
                                        {isEditing ? (
                                            <Input
                                                value={firstName}
                                                onChange={(e) =>
                                                    setFirstName(e.target.value)
                                                }
                                                data-testid="input-firstname"
                                            />
                                        ) : (
                                            <p
                                                className="text-sm py-2.5 px-3 bg-muted/50 rounded-md"
                                                data-testid="text-firstname"
                                            >
                                                {firstName || "-"}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                                            Last Name
                                        </label>
                                        {isEditing ? (
                                            <Input
                                                value={lastName}
                                                onChange={(e) =>
                                                    setLastName(e.target.value)
                                                }
                                                data-testid="input-lastname"
                                            />
                                        ) : (
                                            <p
                                                className="text-sm py-2.5 px-3 bg-muted/50 rounded-md"
                                                data-testid="text-lastname"
                                            >
                                                {lastName || "-"}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                                            Username
                                        </label>
                                        {isEditing ? (
                                            <Input
                                                value={username}
                                                onChange={(e) =>
                                                    setUsername(e.target.value)
                                                }
                                                data-testid="input-username"
                                            />
                                        ) : (
                                            <p
                                                className="text-sm py-2.5 px-3 bg-muted/50 rounded-md"
                                                data-testid="text-username"
                                            >
                                                {username || "-"}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                                            Email
                                        </label>
                                        {isEditing ? (
                                            <Input
                                                type="email"
                                                value={email}
                                                onChange={(e) =>
                                                    setEmail(e.target.value)
                                                }
                                                data-testid="input-email"
                                            />
                                        ) : (
                                            <p
                                                className="text-sm py-2.5 px-3 bg-muted/50 rounded-md"
                                                data-testid="text-email"
                                            >
                                                {email || "-"}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
