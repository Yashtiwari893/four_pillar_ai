"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
    BarChart3,
    Bot,
    Database,
    LayoutDashboard,
    MessageSquare,
    Settings,
    Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";

type NavItem = {
    href: string;
    label: string;
    icon: LucideIcon;
    exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "/files", label: "Data Sources", icon: Database },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
];

type AppShellProps = {
    title: string;
    subtitle: string;
    children: ReactNode;
    headerActions?: ReactNode;
    sidebarExtras?: ReactNode;
    contentClassName?: string;
};

function isActive(pathname: string, item: NavItem) {
    if (item.exact) {
        return pathname === item.href;
    }

    return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
    title,
    subtitle,
    children,
    headerActions,
    sidebarExtras,
    contentClassName,
}: AppShellProps) {
    const pathname = usePathname();
    const activeNav = NAV_ITEMS.find((item) => isActive(pathname, item));
    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        void supabaseBrowser.auth.getUser().then(({ data }) => {
            setUserEmail(data.user?.email ?? null);
        });
    }, [pathname]);

    async function handleSignOut() {
        await supabaseBrowser.auth.signOut();
        window.location.href = "/";
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(120%_120%_at_100%_0%,#d6e8ff_0%,#f7fbff_50%,#f6f8fc_100%)] text-slate-900">
            <div className="mx-auto flex min-h-screen max-w-[1600px]">
                <aside className="hidden w-72 border-r border-slate-200/70 bg-white/80 p-5 backdrop-blur md:flex md:flex-col">
                    <Link href="/" className="mb-8 flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
                            <Bot size={17} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold">11za RAG AI</p>
                            <p className="text-xs text-slate-500">Unified Workspace</p>
                        </div>
                    </Link>

                    <nav className="space-y-1">
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(pathname, item);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                                        active
                                            ? "bg-slate-900 text-white shadow-sm"
                                            : "text-slate-600 hover:bg-slate-100"
                                    )}
                                >
                                    <Icon size={16} />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {sidebarExtras ? <div className="mt-4">{sidebarExtras}</div> : null}

                    <div className="mt-auto rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                            <Sparkles size={15} />
                            System Status
                        </div>
                        <p className="text-xs text-slate-200">Everything is connected and ready. Continue your workflow from any section.</p>
                    </div>
                </aside>

                <main className="flex min-h-screen flex-1 flex-col overflow-hidden">
                    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur md:px-8">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Workspace {activeNav ? `/ ${activeNav.label}` : ""}
                                </p>
                                <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
                                <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {userEmail ? (
                                    <>
                                        <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 sm:inline-block">{userEmail}</span>
                                        <Button variant="outline" size="sm" onClick={handleSignOut}>Sign out</Button>
                                    </>
                                ) : (
                                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">Public Mode</span>
                                )}
                                {headerActions}
                            </div>
                        </div>
                    </header>

                    <section className={cn("min-h-0 flex-1 overflow-hidden p-5 md:p-8", contentClassName)}>{children}</section>
                </main>
            </div>

            <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 p-2 backdrop-blur md:hidden">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item);
                    return (
                        <Link
                            key={`mobile-${item.href}`}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium",
                                active ? "bg-slate-900 text-white" : "text-slate-600"
                            )}
                        >
                            <Icon size={16} />
                            <span className="truncate">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
