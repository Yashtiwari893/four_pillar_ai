"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
    return (
        <AppShell
            title="Settings"
            subtitle="Centralized controls for bot behavior, credentials, and data synchronization."
            contentClassName="pb-24 md:pb-8"
        >
            <div className="grid gap-4 lg:grid-cols-3">
                <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-2">
                    <h2 className="text-base font-semibold">Configuration Center</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        All low-level settings live inside the Data Sources workspace so you can configure and validate in one flow.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <Button asChild>
                            <Link href="/files">Open Data Sources</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/chat">Open Chat Test Console</Link>
                        </Button>
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold">Recommended Flow</h2>
                    <ol className="mt-4 space-y-2 text-sm text-slate-600">
                        <li className="rounded-lg bg-slate-50 px-3 py-2">1. Create or select bot profile</li>
                        <li className="rounded-lg bg-slate-50 px-3 py-2">2. Add knowledge sources</li>
                        <li className="rounded-lg bg-slate-50 px-3 py-2">3. Generate or edit system prompt</li>
                        <li className="rounded-lg bg-slate-50 px-3 py-2">4. Validate answers in chat</li>
                    </ol>
                </article>
            </div>
        </AppShell>
    );
}
