"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileUp, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";
import { authedFetch } from "@/lib/authedFetch";

type Metrics = {
    total_files: number;
    total_chunks: number;
    active_bots: number;
    web_chat_messages: number;
    whatsapp_messages: number;
};

export default function DashboardPage() {
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
                console.error("Failed to load dashboard metrics", error);
            } finally {
                setIsLoading(false);
            }
        }

        void loadMetrics();
    }, []);

    const cards = [
        { label: "Active Bots", value: metrics.active_bots, helper: "Configured phone profiles" },
        { label: "Data Sources", value: metrics.total_files, helper: "Files connected to RAG" },
        { label: "Knowledge Chunks", value: metrics.total_chunks, helper: "Embeddings indexed" },
        {
            label: "Total Conversations",
            value: metrics.web_chat_messages + metrics.whatsapp_messages,
            helper: "Web + WhatsApp messages",
        },
    ];

    return (
        <AppShell
            title="11za RAG AI Dashboard"
            subtitle="Track your data pipeline and move from upload to insights in one connected workspace."
            headerActions={
                <>
                    <Button asChild variant="outline">
                        <Link href="/files">
                            <FileUp size={16} />
                            Upload Data
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/chat">
                            <MessageSquare size={16} />
                            Open Chat
                        </Link>
                    </Button>
                </>
            }
        >
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <article
                        key={card.label}
                        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                        <p className="mt-3 text-3xl font-semibold tracking-tight">
                            {isLoading ? "..." : card.value.toLocaleString()}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">{card.helper}</p>
                    </article>
                ))}
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-3">
                <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-2">
                    <h2 className="text-base font-semibold">Connected Workflow</h2>
                    <p className="mt-1 text-sm text-slate-500">Follow this path for fastest onboarding and best answer quality.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <Link href="/files" className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white">
                            <p className="text-xs font-semibold uppercase text-slate-500">Step 1</p>
                            <p className="mt-2 text-sm font-semibold">Upload data sources</p>
                        </Link>
                        <Link href="/files" className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white">
                            <p className="text-xs font-semibold uppercase text-slate-500">Step 2</p>
                            <p className="mt-2 text-sm font-semibold">Configure bot intent</p>
                        </Link>
                        <Link href="/chat" className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white">
                            <p className="text-xs font-semibold uppercase text-slate-500">Step 3</p>
                            <p className="mt-2 text-sm font-semibold">Test in chat console</p>
                        </Link>
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold">Usage Snapshot</h2>
                    <p className="mt-1 text-sm text-slate-500">Live totals from web and WhatsApp channels.</p>
                    <div className="mt-5 space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                            <span className="text-slate-500">Web chat messages</span>
                            <span className="font-semibold">{isLoading ? "..." : metrics.web_chat_messages}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                            <span className="text-slate-500">WhatsApp messages</span>
                            <span className="font-semibold">{isLoading ? "..." : metrics.whatsapp_messages}</span>
                        </div>
                    </div>
                </article>
            </section>
        </AppShell>
    );
}
