"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { authedFetch } from "@/lib/authedFetch";

type Metrics = {
    total_files: number;
    total_chunks: number;
    active_bots: number;
    web_chat_messages: number;
    whatsapp_messages: number;
};

export default function AnalyticsPage() {
    const [metrics, setMetrics] = useState<Metrics>({
        total_files: 0,
        total_chunks: 0,
        active_bots: 0,
        web_chat_messages: 0,
        whatsapp_messages: 0,
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadMetrics() {
            try {
                const res = await authedFetch("/api/analytics/overview");
                const data = await res.json();
                if (res.ok && data.metrics) {
                    setMetrics(data.metrics);
                }
            } catch (error) {
                console.error("Failed to load analytics", error);
            } finally {
                setIsLoading(false);
            }
        }

        void loadMetrics();
    }, []);

    const averageMessagesPerBot = useMemo(() => {
        const total = metrics.web_chat_messages + metrics.whatsapp_messages;
        if (!metrics.active_bots) return 0;
        return Math.round(total / metrics.active_bots);
    }, [metrics]);

    return (
        <AppShell
            title="Analytics"
            subtitle="Understand usage patterns and monitor system-level activity across channels."
            contentClassName="pb-24 md:pb-8"
        >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Active Bots" value={isLoading ? "..." : metrics.active_bots.toString()} />
                <MetricCard label="Data Sources" value={isLoading ? "..." : metrics.total_files.toString()} />
                <MetricCard label="Knowledge Chunks" value={isLoading ? "..." : metrics.total_chunks.toString()} />
                <MetricCard label="Messages per Bot" value={isLoading ? "..." : averageMessagesPerBot.toString()} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold">Channel Split</h2>
                    <p className="mt-1 text-sm text-slate-500">Where users are interacting with your assistants.</p>
                    <div className="mt-5 space-y-4">
                        <ProgressRow
                            label="Web Chat"
                            value={metrics.web_chat_messages}
                            total={Math.max(metrics.web_chat_messages + metrics.whatsapp_messages, 1)}
                        />
                        <ProgressRow
                            label="WhatsApp"
                            value={metrics.whatsapp_messages}
                            total={Math.max(metrics.web_chat_messages + metrics.whatsapp_messages, 1)}
                        />
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold">Operational Insights</h2>
                    <p className="mt-1 text-sm text-slate-500">Quick interpretation for product and support teams.</p>
                    <ul className="mt-5 space-y-2 text-sm text-slate-600">
                        <li className="rounded-lg bg-slate-50 px-3 py-2">Keep at least one high-quality source per bot for consistent answers.</li>
                        <li className="rounded-lg bg-slate-50 px-3 py-2">Use chat test console after each major data sync.</li>
                        <li className="rounded-lg bg-slate-50 px-3 py-2">Track sudden spikes in channel volume for model cost control.</li>
                    </ul>
                </article>
            </div>
        </AppShell>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        </article>
    );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
    const percentage = Math.round((value / total) * 100);

    return (
        <div>
            <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{label}</span>
                <span className="text-slate-500">{value} ({percentage}%)</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-slate-900 transition-all" style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
}
