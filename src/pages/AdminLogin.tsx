import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { loginWithCredentials, verifyTwoFactor, LoginResponse } from "@/api/auth/authApi";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import catacapLogo from "@assets/CataCap-Logo.png";

export default function AdminLogin() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(null);
    const [showTwoFactorStep, setShowTwoFactorStep] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { token, login } = useAuth();

    useEffect(() => {
        if (token) {
            setLocation("/dashboard");
        }
    }, [token, setLocation]);

    const completeLogin = async (authToken: string) => {
        await login(authToken);
        toast({
            title: "Welcome back!",
            description: "You have been logged in successfully.",
        });
        setLocation("/dashboard");
    };

    const buildTwoFactorPayload = (code: string) => ({
        email: loginResponse?.email || username,
        code: Number(code),
    });

    const resetTwoFactorState = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setOtp("");
        setLoginResponse(null);
        setShowTwoFactorStep(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) {
            toast({
                title: "Missing fields",
                description: "Please enter your email or username and password.",
                variant: "destructive",
            });
            return;
        }
        setIsLoading(true);
        try {
            const data = await loginWithCredentials({
                email: username,
                password: password,
            });

            if (data?.token) {
                await completeLogin(data.token);
            } else if (data?.requires2FA && data?.email) {
                setLoginResponse(data);
                setOtp("");
                setShowTwoFactorStep(true);
                toast({
                    title: "Verification required",
                    description: data?.message || "Enter the 6-digit code sent to you to complete sign in.",
                });
            } else {
                toast({
                    title: "Login failed",
                    description: data?.message || "Invalid email or password.",
                    variant: "destructive",
                });
            }
        } catch (error: any) {
            const errorData = error?.response?.data;
            toast({
                title: "Login failed",
                description: errorData?.message || errorData?.title || errorData?.detail || "Invalid email or password. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyTwoFactor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length !== 6) {
            toast({
                title: "Invalid code",
                description: "Please enter the 6-digit verification code.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const data = await verifyTwoFactor(buildTwoFactorPayload(otp));

            if (data?.token) {
                await completeLogin(data.token);
                resetTwoFactorState();
                return;
            }

            toast({
                title: "Verification failed",
                description: data?.message || "Unable to verify the code. Please try again.",
                variant: "destructive",
            });
        } catch (error: any) {
            const errorData = error?.response?.data;
            toast({
                title: "Verification failed",
                description: errorData?.message || errorData?.title || errorData?.detail || "Unable to verify the code. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#405189] relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full opacity-10">
                    {[
                        { w: 80, h: 80, t: 10, l: 5 },
                        { w: 120, h: 120, t: 60, l: 15 },
                        { w: 60, h: 60, t: 25, l: 80 },
                        { w: 100, h: 100, t: 70, l: 70 },
                        { w: 90, h: 90, t: 40, l: 40 },
                        { w: 70, h: 70, t: 85, l: 25 },
                        { w: 110, h: 110, t: 15, l: 60 },
                        { w: 50, h: 50, t: 50, l: 90 },
                        { w: 130, h: 130, t: 75, l: 50 },
                        { w: 65, h: 65, t: 5, l: 35 },
                    ].map((circle, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full bg-white/20"
                            style={{
                                width: `${circle.w}px`,
                                height: `${circle.h}px`,
                                top: `${circle.t}%`,
                                left: `${circle.l}%`,
                            }}
                        />
                    ))}
                </div>
            </div>
            <div className="w-full max-w-md px-4 relative z-10">
                <Card className="border-0 shadow-xl" data-testid="card-admin-login">
                    <CardContent className="p-8">
                        <div className="text-center mb-6">
                            <Link href="/dashboard" className="inline-block no-underline mb-4" data-testid="link-admin-login-brand">
                                <img src={catacapLogo} alt="CataCap" className="h-10 mx-auto" data-testid="img-admin-logo" />
                            </Link>
                            <h2 className="text-xl font-semibold text-foreground" data-testid="text-admin-login-title">
                                {showTwoFactorStep ? "Two-Factor Verification" : "Welcome Back!"}
                            </h2>
                            <p className="text-muted-foreground text-sm mt-1" data-testid="text-admin-login-subtitle">
                                {showTwoFactorStep
                                    ? `Enter the 6-digit code sent to ${loginResponse?.email || username}.`
                                    : "Sign in to continue to CataCap Admin."}
                            </p>

                        </div>
                        {showTwoFactorStep ? (
                            <form key="2fa-form" onSubmit={handleVerifyTwoFactor} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-3">Verification Code</label>
                                    <InputOTP
                                        maxLength={6}
                                        value={otp}
                                        onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                                        containerClassName="justify-center"
                                        data-testid="input-admin-otp"
                                        autoFocus
                                    >
                                        <InputOTPGroup>
                                            <InputOTPSlot index={0} />
                                            <InputOTPSlot index={1} />
                                            <InputOTPSlot index={2} />
                                            <InputOTPSlot index={3} />
                                            <InputOTPSlot index={4} />
                                            <InputOTPSlot index={5} />
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                                <Button
                                    type="submit"
                                    className="w-full py-2.5 text-sm font-medium bg-[#0ab39c] hover:bg-[#099880] text-white border-0"
                                    data-testid="button-admin-verify-otp"
                                    disabled={isLoading || otp.length !== 6}
                                >
                                    {isLoading ? "Verifying..." : "Verify Code"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full py-2.5 text-sm font-medium"
                                    data-testid="button-admin-back-to-login"
                                    disabled={isLoading}
                                    onClick={(e) => resetTwoFactorState(e)}
                                >
                                    Back to login
                                </Button>
                            </form>
                        ) : (
                            <form key="login-form" onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">Email or Username</label>
                                    <input
                                        type="text"
                                        placeholder="Enter email or username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#405189]/40 focus:border-[#405189] transition-colors text-sm"
                                        data-testid="input-admin-email"
                                        required
                                        maxLength={50}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Enter password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-3 py-2.5 pr-10 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#405189]/40 focus:border-[#405189] transition-colors text-sm"
                                            data-testid="input-admin-password"
                                            required
                                            maxLength={50}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                            data-testid="button-admin-toggle-password"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <Button
                                    type="submit"
                                    className="w-full py-2.5 text-sm font-medium bg-[#0ab39c] hover:bg-[#099880] text-white border-0"
                                    data-testid="button-admin-login-submit"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Signing In..." : "Sign In"}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
