import { Link } from "wouter";
import { Header } from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Header />

            <main className="px-4 py-48">
                <div className="max-w-lg w-full text-center mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="relative mb-8">
                            <span className="text-[10rem] sm:text-[12rem] font-black leading-none text-[#1e3a5f]/10 dark:text-[#5b9bd5]/10 select-none block">
                                404
                            </span>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div
                                    animate={{ y: [0, -8, 0] }}
                                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                >
                                    <div className="w-16 h-16 rounded-full bg-[#80b73f] flex items-center justify-center shadow-lg">
                                        <Search className="w-7 h-7 text-white" />
                                    </div>
                                </motion.div>
                            </div>
                        </div>

                        <h1
                            className="text-2xl sm:text-3xl font-bold text-foreground mb-3"
                            data-testid="text-404-title"
                        >
                            Page Not Found
                        </h1>
                        <p
                            className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed"
                            data-testid="text-404-message"
                        >
                            The page you're looking for doesn't exist or has been moved. Let's get you back on track to making an impact.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Link href="/">
                                <Button
                                    className="bg-[#80b73f] text-white gap-2 px-6"
                                    data-testid="button-go-home"
                                >
                                    <Home className="w-4 h-4" />
                                    Back to Home
                                </Button>
                            </Link>
                            <Link href="/dashboard">
                                <Button
                                    variant="outline"
                                    className="gap-2 px-6"
                                    data-testid="button-dashboard"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Admin Dashboard
                                </Button>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
