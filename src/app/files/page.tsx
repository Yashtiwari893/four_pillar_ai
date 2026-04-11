"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    Bot,
    CheckCircle2,
    Database,
    FileCode2,
    FileImage,
    FileSpreadsheet,
    FileText,
    Loader2,
    MessageSquare,
    Plus,
    RefreshCcw,
    Settings,
    Sheet,
    Trash2,
    UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";
import { SaveGoogleSheet } from "@/components/ui/save-google-sheet";
import { SaveGoogleDoc } from "@/components/ui/save-google-doc";
import { SyncGoogleSheetButton } from "@/components/ui/sync-google-sheet-button";
import { SyncGoogleDocButton } from "@/components/ui/sync-google-doc-button";
import { SecretInput } from "@/components/ui/secret-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authedFetch } from "@/lib/authedFetch";

type FileItem = {
    id: string;
    name: string;
    file_type: string;
    chunk_count?: number;
    created_at: string;
};

type PhoneNumberGroup = {
    phone_number: string;
    intent: string | null;
    system_prompt: string | null;
    files: FileItem[];
    auth_token: string;
    origin: string;
    webhook_id?: string | null;
    webhook_secret?: string | null;
    webhook_enabled?: boolean;
    gemini_api_key: string | null;
    groq_api_key: string | null;
    mistral_api_key: string | null;
};

type UploadStatus = "queued" | "processing" | "completed" | "failed";

type UploadQueueItem = {
    id: string;
    file: File;
    status: UploadStatus;
    chunks?: number;
    fileId?: string;
    error?: string;
};

type Feedback = { type: "success" | "error"; message: string } | null;

type MainTab = "overview" | "bot-profile" | "knowledge-base" | "integrations" | "webhook";

type SheetStatus = {
    connected: boolean;
    hasData: boolean;
    sheet_id: string | null;
    last_synced_at: string | null;
    total_chunks: number;
    sync_status: "synced" | "pending_sync" | "not_connected";
};

type DocStatus = {
    isConnected: boolean;
    hasData: boolean;
    docId: string | null;
    docName: string | null;
    lastSyncedAt: string | null;
    chunkCount: number;
};

const MAX_UPLOAD_MB = 50;
const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"];

function formatBytes(bytes?: number) {
    if (!bytes || Number.isNaN(bytes)) return "Unknown";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(iso?: string | null) {
    if (!iso) return "Never";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Never";
    return date.toLocaleString();
}

function getFileTypeLabel(fileType: string, fileName: string) {
    const lowerType = fileType.toLowerCase();
    const lowerName = fileName.toLowerCase();

    if (lowerType.includes("image") || /\.(png|jpg|jpeg|webp)$/.test(lowerName)) return "Image";
    if (lowerType.includes("csv") || lowerName.endsWith(".csv")) return "CSV";
    if (lowerType.includes("text") || /\.(txt|md)$/.test(lowerName)) return "Text";
    if (lowerType.includes("pdf") || lowerName.endsWith(".pdf")) return "PDF";
    return "File";
}

function FileTypeIcon({ fileType, fileName }: { fileType: string; fileName: string }) {
    const label = getFileTypeLabel(fileType, fileName);
    if (label === "Image") return <FileImage size={16} className="text-blue-600" />;
    if (label === "CSV") return <FileSpreadsheet size={16} className="text-emerald-600" />;
    if (label === "Text") return <FileCode2 size={16} className="text-amber-600" />;
    return <FileText size={16} className="text-rose-600" />;
}

function StatusBadge({ status }: { status: UploadStatus | "processed" | "pending" | "connected" }) {
    if (status === "processing") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                <Loader2 size={12} className="animate-spin" />
                Processing
            </span>
        );
    }

    if (status === "failed" || status === "pending") {
        return (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                Pending
            </span>
        );
    }

    if (status === "queued") {
        return (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                Queued
            </span>
        );
    }

    if (status === "connected") {
        return (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                Connected
            </span>
        );
    }

    return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Processed
        </span>
    );
}

export default function FilesPage() {
    const [phoneGroups, setPhoneGroups] = useState<PhoneNumberGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);

    const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);
    const [isNewBot, setIsNewBot] = useState(false);
    const [activeMainTab, setActiveMainTab] = useState<MainTab>("overview");
    const [showPromptEditor, setShowPromptEditor] = useState(true);

    const [editPhoneNumber, setEditPhoneNumber] = useState("");
    const [editIntent, setEditIntent] = useState("");
    const [editSystemPrompt, setEditSystemPrompt] = useState("");
    const [editAuthToken, setEditAuthToken] = useState("");
    const [editOrigin, setEditOrigin] = useState("");
    const [editGeminiKey, setEditGeminiKey] = useState("");
    const [editGroqKey, setEditGroqKey] = useState("");
    const [editMistralKey, setEditMistralKey] = useState("");

    const [queue, setQueue] = useState<UploadQueueItem[]>([]);
    const [feedback, setFeedback] = useState<Feedback>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

    const [sheetStatus, setSheetStatus] = useState<SheetStatus | null>(null);
    const [docStatus, setDocStatus] = useState<DocStatus | null>(null);
    const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);

    const [knownFileSizes, setKnownFileSizes] = useState<Record<string, number>>({});
    const [baseUrl, setBaseUrl] = useState("");

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const reprocessInputRef = useRef<HTMLInputElement | null>(null);
    const [reprocessTargetFileId, setReprocessTargetFileId] = useState<string | null>(null);

    const selectedGroup = useMemo(
        () => phoneGroups.find((group) => group.phone_number === selectedPhoneNumber),
        [phoneGroups, selectedPhoneNumber]
    );

    const selectedGroupChunks = useMemo(
        () => (selectedGroup?.files || []).reduce((sum, file) => sum + (file.chunk_count || 0), 0),
        [selectedGroup]
    );

    const webhookUrl = useMemo(() => {
        if (!baseUrl || !selectedGroup?.webhook_id) return "";
        const secret = selectedGroup.webhook_secret || "";
        const tokenPart = secret ? `?token=${encodeURIComponent(secret)}` : "";
        return `${baseUrl}/api/webhook/whatsapp/${selectedGroup.webhook_id}${tokenPart}`;
    }, [baseUrl, selectedGroup]);

    const localLibraryRows = useMemo(
        () =>
            (selectedGroup?.files || []).map((file) => ({
                id: file.id,
                name: file.name,
                source: getFileTypeLabel(file.file_type || "", file.name),
                createdAt: file.created_at,
                size: formatBytes(knownFileSizes[file.id]),
                status: (file.chunk_count || 0) > 0 ? "processed" as const : "pending" as const,
                chunks: file.chunk_count || 0,
            })),
        [selectedGroup, knownFileSizes]
    );

    const isBotConnected = useMemo(
        () => Boolean(editPhoneNumber && editAuthToken && editOrigin),
        [editPhoneNumber, editAuthToken, editOrigin]
    );

    const loadPhoneGroups = useCallback(async () => {
        try {
            setIsLoadingGroups(true);
            const res = await authedFetch("/api/phone-groups");
            const data = await res.json();
            if (res.ok && data.success) {
                setPhoneGroups(data.groups || []);
            } else {
                setPhoneGroups([]);
                setFeedback({
                    type: "error",
                    message: data?.error || "Could not load bot profiles.",
                });
            }
        } catch (error) {
            console.error("Error loading phone groups", error);
            setFeedback({ type: "error", message: "Could not load bot profiles." });
            setPhoneGroups([]);
        } finally {
            setIsLoadingGroups(false);
        }
    }, []);

    const loadIntegrationStatus = useCallback(async (phoneNumber: string) => {
        try {
            setIsLoadingIntegrations(true);
            const [sheetRes, docRes] = await Promise.all([
                authedFetch(`/api/google-sheet-status?phone_number=${encodeURIComponent(phoneNumber)}`),
                authedFetch(`/api/google-doc-status?phone_number=${encodeURIComponent(phoneNumber)}`),
            ]);

            const [sheetData, docData] = await Promise.all([sheetRes.json(), docRes.json()]);

            setSheetStatus(sheetRes.ok ? (sheetData as SheetStatus) : null);
            setDocStatus(docRes.ok ? (docData as DocStatus) : null);
        } catch (error) {
            console.error("Failed to load integration status", error);
            setSheetStatus(null);
            setDocStatus(null);
        } finally {
            setIsLoadingIntegrations(false);
        }
    }, []);

    useEffect(() => {
        void loadPhoneGroups();
    }, [loadPhoneGroups]);

    useEffect(() => {
        const raw = localStorage.getItem("known_file_sizes");
        if (!raw) return;
        try {
            setKnownFileSizes(JSON.parse(raw) as Record<string, number>);
        } catch {
            setKnownFileSizes({});
        }
    }, []);

    useEffect(() => {
        setBaseUrl(window.location.origin);
    }, []);

    useEffect(() => {
        if (!selectedPhoneNumber) return;

        const group = phoneGroups.find((g) => g.phone_number === selectedPhoneNumber);
        if (!group) return;

        setEditPhoneNumber(group.phone_number);
        setEditIntent(group.intent || "");
        setEditSystemPrompt(group.system_prompt || "");
        setEditAuthToken(group.auth_token || "");
        setEditOrigin(group.origin || "");
        setEditGeminiKey(group.gemini_api_key || "");
        setEditGroqKey(group.groq_api_key || "");
        setEditMistralKey(group.mistral_api_key || "");
        setIsNewBot(false);
        void loadIntegrationStatus(group.phone_number);
    }, [selectedPhoneNumber, phoneGroups, loadIntegrationStatus]);

    function resetBotEditor() {
        setSelectedPhoneNumber(null);
        setIsNewBot(true);
        setEditPhoneNumber("");
        setEditIntent("");
        setEditSystemPrompt("");
        setEditAuthToken("");
        setEditOrigin("");
        setEditGeminiKey("");
        setEditGroqKey("");
        setEditMistralKey("");
        setQueue([]);
        setSheetStatus(null);
        setDocStatus(null);
        setActiveMainTab("overview");
    }

    function validateAndQueueFiles(fileList: FileList | File[]) {
        const files = Array.from(fileList);
        const nextItems: UploadQueueItem[] = [];

        for (const file of files) {
            const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
            const validType = ACCEPTED_EXTENSIONS.includes(extension) || file.type.startsWith("image/");
            const validSize = file.size <= MAX_UPLOAD_MB * 1024 * 1024;

            if (!validType) {
                setFeedback({
                    type: "error",
                    message: `${file.name} has unsupported type. Allowed: PDF, CSV, TXT, MD, and images.`,
                });
                continue;
            }

            if (!validSize) {
                setFeedback({ type: "error", message: `${file.name} exceeds ${MAX_UPLOAD_MB}MB limit.` });
                continue;
            }

            nextItems.push({
                id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                file,
                status: "queued",
            });
        }

        if (!nextItems.length) return;
        setQueue((prev) => [...prev, ...nextItems]);
        setFeedback({ type: "success", message: `${nextItems.length} file(s) added to upload queue.` });
    }

    function onSelectFiles(e: ChangeEvent<HTMLInputElement>) {
        if (!e.target.files?.length) return;
        validateAndQueueFiles(e.target.files);
        e.target.value = "";
    }

    function onDropFiles(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        if (!e.dataTransfer.files?.length) return;
        validateAndQueueFiles(e.dataTransfer.files);
    }

    function removeQueuedFile(id: string) {
        setQueue((prev) => prev.filter((item) => item.id !== id));
    }

    async function generateSystemPrompt() {
        if (!editPhoneNumber.trim() || !editIntent.trim()) {
            setFeedback({ type: "error", message: "Phone number and intent are required." });
            return;
        }

        setIsGeneratingPrompt(true);
        try {
            const res = await authedFetch("/api/generate-system-prompt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: editPhoneNumber.trim(),
                    intent: editIntent.trim(),
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to generate prompt");
            }

            setEditSystemPrompt(data.system_prompt || "");
            setFeedback({ type: "success", message: "System prompt generated. Review and save settings." });
            setShowPromptEditor(true);

            if (isNewBot) {
                setSelectedPhoneNumber(editPhoneNumber.trim());
                setIsNewBot(false);
            }
        } catch (error) {
            setFeedback({
                type: "error",
                message: error instanceof Error ? error.message : "Prompt generation failed.",
            });
        } finally {
            setIsGeneratingPrompt(false);
        }
    }

    async function saveBotSettings() {
        if (!editPhoneNumber.trim()) {
            setFeedback({ type: "error", message: "Phone number is required." });
            return;
        }

        setIsSavingSettings(true);
        try {
            const res = await authedFetch("/api/update-phone-settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: editPhoneNumber.trim(),
                    intent: editIntent.trim() || null,
                    system_prompt: editSystemPrompt.trim() || null,
                    auth_token: editAuthToken.trim() || null,
                    origin: editOrigin.trim() || null,
                    gemini_api_key: editGeminiKey.trim() || null,
                    groq_api_key: editGroqKey.trim() || null,
                    mistral_api_key: editMistralKey.trim() || null,
                }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || "Could not save settings.");
            }

            setFeedback({ type: "success", message: "Bot settings saved successfully." });
            await loadPhoneGroups();
            setSelectedPhoneNumber(editPhoneNumber.trim());
            setIsNewBot(false);
            await loadIntegrationStatus(editPhoneNumber.trim());
        } catch (error) {
            setFeedback({ type: "error", message: error instanceof Error ? error.message : "Save failed." });
        } finally {
            setIsSavingSettings(false);
        }
    }

    async function processSingleFile(file: File, queueId: string) {
        const form = new FormData();
        form.append("file", file);
        form.append("phone_number", editPhoneNumber.trim());
        form.append("auth_token", editAuthToken.trim());
        form.append("origin", editOrigin.trim());
        form.append("gemini_api_key", editGeminiKey.trim());
        form.append("groq_api_key", editGroqKey.trim());
        form.append("mistral_api_key", editMistralKey.trim());
        if (editIntent.trim()) form.append("intent", editIntent.trim());

        const res = await authedFetch("/api/process-file", {
            method: "POST",
            body: form,
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload?.error || "Upload failed");
        }

        setQueue((prev) =>
            prev.map((item) =>
                item.id === queueId
                    ? {
                        ...item,
                        status: "completed",
                        chunks: typeof payload?.chunks === "number" ? payload.chunks : 0,
                        fileId: typeof payload?.file_id === "string" ? payload.file_id : undefined,
                    }
                    : item
            )
        );

        if (typeof payload?.file_id === "string") {
            setKnownFileSizes((prev) => {
                const next = { ...prev, [payload.file_id]: file.size };
                localStorage.setItem("known_file_sizes", JSON.stringify(next));
                return next;
            });
        }
    }

    async function uploadAllQueuedFiles() {
        if (!editPhoneNumber.trim() || !editAuthToken.trim() || !editOrigin.trim()) {
            setFeedback({
                type: "error",
                message: "Before upload, fill Phone Number, Auth Token, and Origin in Bot Profile.",
            });
            return;
        }

        const queued = queue.filter((item) => item.status === "queued");
        if (!queued.length) {
            setFeedback({ type: "error", message: "No queued files to upload." });
            return;
        }

        setIsUploading(true);
        let successCount = 0;
        let failedCount = 0;

        for (const item of queued) {
            setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "processing", error: undefined } : q)));

            try {
                await processSingleFile(item.file, item.id);
                successCount += 1;
            } catch (error) {
                failedCount += 1;
                const message = error instanceof Error ? error.message : "Upload failed";
                setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "failed", error: message } : q)));
            }
        }

        setIsUploading(false);
        await loadPhoneGroups();
        setSelectedPhoneNumber(editPhoneNumber.trim());
        setIsNewBot(false);

        if (failedCount === 0) {
            setFeedback({ type: "success", message: `${successCount} file(s) processed successfully.` });
            setQueue((prev) => prev.filter((item) => item.status !== "completed"));
        } else {
            setFeedback({
                type: "error",
                message: `${successCount} succeeded, ${failedCount} failed. Fix errors and retry failed files.`,
            });
        }
    }

    async function deleteFile(fileId: string) {
        if (!confirm("Delete this file from data sources?")) return;
        try {
            const res = await authedFetch(`/api/files?id=${fileId}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Delete failed");
            setFeedback({ type: "success", message: "File deleted." });
            await loadPhoneGroups();
        } catch (error) {
            setFeedback({ type: "error", message: error instanceof Error ? error.message : "Delete failed." });
        }
    }

    async function deleteBotProfile(phoneNumber: string) {
        if (!confirm("Delete this bot profile and all its mappings?")) return;
        try {
            const res = await authedFetch(`/api/phone-mappings?phone_number=${phoneNumber}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Delete bot failed");
            setFeedback({ type: "success", message: "Bot profile deleted." });
            setSelectedPhoneNumber(null);
            setIsNewBot(false);
            await loadPhoneGroups();
        } catch (error) {
            setFeedback({ type: "error", message: error instanceof Error ? error.message : "Delete bot failed." });
        }
    }

    function triggerReprocess(fileId: string) {
        setReprocessTargetFileId(fileId);
        reprocessInputRef.current?.click();
    }

    async function handleReprocessFileSelection(e: ChangeEvent<HTMLInputElement>) {
        if (!e.target.files?.length || !reprocessTargetFileId) return;
        const replacementFile = e.target.files[0];
        e.target.value = "";

        const queueId = `reprocess-${reprocessTargetFileId}-${Date.now()}`;
        setQueue((prev) => [...prev, { id: queueId, file: replacementFile, status: "processing" }]);

        try {
            await processSingleFile(replacementFile, queueId);
            setFeedback({ type: "success", message: "Reprocess completed. New version indexed." });
            await loadPhoneGroups();
            setQueue((prev) => prev.filter((item) => item.id !== queueId));
        } catch (error) {
            const message = error instanceof Error ? error.message : "Reprocess failed";
            setQueue((prev) => prev.map((item) => (item.id === queueId ? { ...item, status: "failed", error: message } : item)));
            setFeedback({ type: "error", message: message });
        } finally {
            setReprocessTargetFileId(null);
        }
    }

    const sidebarExtras = (
        <>
            <Button onClick={resetBotEditor} className="w-full gap-2">
                <Plus size={15} />
                New Bot Profile
            </Button>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bot Profiles</p>
                <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {isLoadingGroups ? (
                        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">Loading profiles...</p>
                    ) : phoneGroups.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">No profiles yet.</p>
                    ) : (
                        phoneGroups.map((group) => (
                            <button
                                key={group.phone_number}
                                onClick={() => setSelectedPhoneNumber(group.phone_number)}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                                    selectedPhoneNumber === group.phone_number
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-xs font-semibold">{group.phone_number}</span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                        {group.files.length}
                                    </span>
                                </div>
                                <p className="mt-1 truncate text-[11px] text-slate-400">{group.intent || "No intent configured"}</p>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </>
    );

    return (
        <AppShell
            title="Data Sources"
            subtitle="Manage bot profile, knowledge base, integrations, and webhook through focused tabs."
            sidebarExtras={sidebarExtras}
            headerActions={
                <Button asChild variant="outline">
                    <Link href="/chat">
                        <MessageSquare size={14} />
                        Open Chat Test
                    </Link>
                </Button>
            }
            contentClassName="pb-24 md:pb-8"
        >
            <input ref={reprocessInputRef} type="file" className="hidden" onChange={handleReprocessFileSelection} />

            <div className="mx-auto max-w-6xl">
                {feedback && (
                    <div
                        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                            feedback.type === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-red-200 bg-red-50 text-red-700"
                        }`}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <p>{feedback.message}</p>
                            <Button size="sm" variant="ghost" onClick={() => setFeedback(null)}>
                                Dismiss
                            </Button>
                        </div>
                    </div>
                )}

                {!selectedPhoneNumber && !isNewBot ? (
                    <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white">
                            <Bot size={24} />
                        </div>
                        <h2 className="text-xl font-semibold">Select or create a bot profile</h2>
                        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                            Data Sources are managed per bot profile. Select one from sidebar to begin.
                        </p>
                        <Button className="mt-6" onClick={resetBotEditor}>
                            <Plus size={14} />
                            Create Profile
                        </Button>
                    </section>
                ) : (
                    <Tabs value={activeMainTab} onValueChange={(value) => setActiveMainTab(value as MainTab)}>
                        <TabsList className="mb-3 h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
                            <TabsTrigger value="overview" className="rounded-lg px-3 py-2 text-xs font-semibold">Overview</TabsTrigger>
                            <TabsTrigger value="bot-profile" className="rounded-lg px-3 py-2 text-xs font-semibold">Bot Profile</TabsTrigger>
                            <TabsTrigger value="knowledge-base" className="rounded-lg px-3 py-2 text-xs font-semibold">Knowledge Base</TabsTrigger>
                            <TabsTrigger value="integrations" className="rounded-lg px-3 py-2 text-xs font-semibold">Integrations</TabsTrigger>
                            <TabsTrigger value="webhook" className="rounded-lg px-3 py-2 text-xs font-semibold">Webhook</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-4">
                            <section className="grid gap-4 md:grid-cols-3">
                                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Bot</p>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">{editPhoneNumber || "New profile"}</p>
                                </article>
                                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Files</p>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">{selectedGroup?.files.length || 0}</p>
                                </article>
                                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Knowledge Chunks</p>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">{selectedGroupChunks + (sheetStatus?.total_chunks || 0) + (docStatus?.chunkCount || 0)}</p>
                                </article>
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <h2 className="text-base font-semibold">Quick Status</h2>
                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs text-slate-500">Bot Connection</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <StatusBadge status={isBotConnected ? "connected" : "pending"} />
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs text-slate-500">Google Sheets</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <StatusBadge status={sheetStatus?.connected ? "connected" : "pending"} />
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs text-slate-500">Google Docs</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <StatusBadge status={docStatus?.isConnected ? "connected" : "pending"} />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </TabsContent>

                        <TabsContent value="bot-profile" className="space-y-4">
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-base font-semibold">Bot Profile</h2>
                                        <p className="text-sm text-slate-500">Configure number identity, model keys, and behavior prompt.</p>
                                    </div>
                                    {!isNewBot && selectedPhoneNumber ? (
                                        <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => deleteBotProfile(selectedPhoneNumber)}>
                                            <Trash2 size={14} />
                                            Delete Profile
                                        </Button>
                                    ) : null}
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">WhatsApp Number</label>
                                        <input
                                            value={editPhoneNumber}
                                            onChange={(e) => setEditPhoneNumber(e.target.value)}
                                            disabled={!isNewBot}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400 disabled:opacity-60"
                                            placeholder="e.g. 15550001234"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">Intent</label>
                                        <div className="flex gap-2">
                                            <input
                                                value={editIntent}
                                                onChange={(e) => setEditIntent(e.target.value)}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                                                placeholder="e.g. Real estate advisor"
                                            />
                                            <Button variant="outline" onClick={generateSystemPrompt} disabled={isGeneratingPrompt}>
                                                {isGeneratingPrompt ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                                                Generate
                                            </Button>
                                            <Button variant="outline" onClick={() => setShowPromptEditor((prev) => !prev)}>
                                                {showPromptEditor ? "Hide Prompt" : "View Prompt"}
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">Auth Token</label>
                                        <SecretInput value={editAuthToken} onChange={(e) => setEditAuthToken(e.target.value)} autoHideMs={12000} placeholder="secret token" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">Origin / API Base</label>
                                        <input
                                            value={editOrigin}
                                            onChange={(e) => setEditOrigin(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                                            placeholder="https://your-api.com"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">Gemini API Key</label>
                                        <SecretInput value={editGeminiKey} onChange={(e) => setEditGeminiKey(e.target.value)} autoHideMs={12000} placeholder="optional" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">Groq API Key</label>
                                        <SecretInput value={editGroqKey} onChange={(e) => setEditGroqKey(e.target.value)} autoHideMs={12000} placeholder="optional" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">Mistral API Key</label>
                                        <SecretInput value={editMistralKey} onChange={(e) => setEditMistralKey(e.target.value)} autoHideMs={12000} placeholder="optional" />
                                    </div>
                                </div>

                                {showPromptEditor ? (
                                    <div className="mt-4">
                                        <label className="mb-1 block text-xs font-semibold text-slate-500">System Prompt</label>
                                        <textarea
                                            value={editSystemPrompt}
                                            onChange={(e) => setEditSystemPrompt(e.target.value)}
                                            rows={8}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                                            placeholder="Define assistant behavior and rules"
                                        />
                                    </div>
                                ) : null}

                                <div className="mt-4 flex justify-end">
                                    <Button onClick={saveBotSettings} disabled={isSavingSettings}>
                                        {isSavingSettings ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                                        Save Profile Settings
                                    </Button>
                                </div>
                            </section>
                        </TabsContent>

                        <TabsContent value="knowledge-base" className="space-y-4">
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-base font-semibold">Upload Files</h2>
                                        <p className="text-sm text-slate-500">Drag and drop files, then process queue for indexing.</p>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Database size={14} />
                                        Max {MAX_UPLOAD_MB}MB each
                                    </div>
                                </div>

                                <div
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={onDropFiles}
                                    className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"
                                >
                                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white text-slate-700 shadow-sm">
                                        <UploadCloud size={22} />
                                    </div>
                                    <p className="mt-3 text-sm font-semibold text-slate-800">Drop files here or browse from your device</p>
                                    <p className="mt-1 text-xs text-slate-500">Supported: PDF, CSV, TXT, MD, PNG, JPG, WEBP</p>
                                    <div className="mt-4">
                                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                            <Plus size={14} />
                                            Add Files
                                        </Button>
                                    </div>
                                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onSelectFiles} />
                                </div>

                                {queue.length > 0 ? (
                                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                                        <div className="grid grid-cols-[1.5fr_110px_130px_120px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>File</span>
                                            <span>Type</span>
                                            <span>Size</span>
                                            <span>Status</span>
                                        </div>
                                        <div className="divide-y divide-slate-200">
                                            {queue.map((item) => (
                                                <div key={item.id} className="grid grid-cols-[1.5fr_110px_130px_120px] items-center px-4 py-2.5 text-sm">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <FileTypeIcon fileType={item.file.type} fileName={item.file.name} />
                                                        <span className="truncate">{item.file.name}</span>
                                                    </div>
                                                    <span className="text-xs text-slate-500">{getFileTypeLabel(item.file.type, item.file.name)}</span>
                                                    <span className="text-xs text-slate-500">{formatBytes(item.file.size)}</span>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <StatusBadge status={item.status} />
                                                        {(item.status === "queued" || item.status === "failed") && (
                                                            <button className="text-slate-400 hover:text-red-600" onClick={() => removeQueuedFile(item.id)}>
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-4 flex justify-end">
                                    <Button onClick={uploadAllQueuedFiles} disabled={isUploading || queue.every((item) => item.status !== "queued")}>
                                        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                                        {isUploading ? "Processing Files..." : "Process Queued Files"}
                                    </Button>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-base font-semibold">Data Library</h2>
                                        <p className="text-sm text-slate-500">Uploaded files and processing status.</p>
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                        {localLibraryRows.length} file(s)
                                    </span>
                                </div>

                                {localLibraryRows.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                        <p className="text-sm font-semibold text-slate-700">No files uploaded yet</p>
                                        <p className="mt-1 text-xs text-slate-500">Upload files above to build the knowledge base.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                                                    <th className="px-3 py-2">Name</th>
                                                    <th className="px-3 py-2">Type</th>
                                                    <th className="px-3 py-2">Status</th>
                                                    <th className="px-3 py-2">Size</th>
                                                    <th className="px-3 py-2">Uploaded</th>
                                                    <th className="px-3 py-2">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {localLibraryRows.map((row) => (
                                                    <tr key={row.id} className="border-b border-slate-100">
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <FileTypeIcon fileType={row.source} fileName={row.name} />
                                                                <span className="max-w-[280px] truncate font-medium text-slate-800">{row.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">{row.source}</td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <StatusBadge status={row.status} />
                                                                <span className="text-[11px] text-slate-400">{row.chunks} chunks</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600">{row.size}</td>
                                                        <td className="px-3 py-3 text-slate-600">{formatDate(row.createdAt)}</td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <Button asChild size="sm" variant="outline">
                                                                    <Link href="/chat">Use in Chat</Link>
                                                                </Button>
                                                                <Button size="sm" variant="outline" onClick={() => triggerReprocess(row.id)}>
                                                                    Re-sync
                                                                </Button>
                                                                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => deleteFile(row.id)}>
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        </TabsContent>

                        <TabsContent value="integrations" className="space-y-4">
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-base font-semibold">Integrations</h2>
                                        <p className="text-sm text-slate-500">Connect and sync Google Sheets and Google Docs as core knowledge sources.</p>
                                    </div>
                                    <Button variant="outline" onClick={() => editPhoneNumber && loadIntegrationStatus(editPhoneNumber)} disabled={isLoadingIntegrations}>
                                        {isLoadingIntegrations ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                                        Refresh Status
                                    </Button>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <h3 className="text-sm font-semibold">Google Sheets</h3>
                                            <StatusBadge status={sheetStatus?.connected ? "connected" : "pending"} />
                                        </div>
                                        <SaveGoogleSheet phoneNumber={editPhoneNumber} />
                                        <div className="mt-3">
                                            <SyncGoogleSheetButton phoneNumber={editPhoneNumber} />
                                        </div>
                                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                                            <p>Connected Sheet: {sheetStatus?.sheet_id || "Not connected"}</p>
                                            <p>Last Sync: {formatDate(sheetStatus?.last_synced_at)}</p>
                                            <p>Total Chunks: {sheetStatus?.total_chunks || 0}</p>
                                        </div>
                                    </article>

                                    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <h3 className="text-sm font-semibold">Google Docs</h3>
                                            <StatusBadge status={docStatus?.isConnected ? "connected" : "pending"} />
                                        </div>
                                        <SaveGoogleDoc phoneNumber={editPhoneNumber} />
                                        <div className="mt-3">
                                            <SyncGoogleDocButton phoneNumber={editPhoneNumber} />
                                        </div>
                                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                                            <p>Connected Doc: {docStatus?.docName || docStatus?.docId || "Not connected"}</p>
                                            <p>Last Sync: {formatDate(docStatus?.lastSyncedAt)}</p>
                                            <p>Total Chunks: {docStatus?.chunkCount || 0}</p>
                                        </div>
                                    </article>
                                </div>
                            </section>
                        </TabsContent>

                        <TabsContent value="webhook" className="space-y-4">
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-base font-semibold">Webhook</h2>
                                        <p className="text-sm text-slate-500">Unique endpoint for this bot number with token-based verification.</p>
                                    </div>
                                    <StatusBadge status={selectedGroup?.webhook_enabled === false ? "pending" : "connected"} />
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <label className="mb-1 block text-xs font-semibold text-slate-500">Unique Webhook URL</label>
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                                        <input
                                            readOnly
                                            value={webhookUrl || "Webhook URL will appear after the profile is saved."}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
                                        />
                                        <Button
                                            variant="outline"
                                            disabled={!webhookUrl}
                                            onClick={async () => {
                                                if (!webhookUrl) return;
                                                await navigator.clipboard.writeText(webhookUrl);
                                                setFeedback({ type: "success", message: "Webhook URL copied to clipboard." });
                                            }}
                                        >
                                            Copy URL
                                        </Button>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                                    <h3 className="text-sm font-semibold">Setup Instructions</h3>
                                    <ol className="mt-2 space-y-2 text-sm text-slate-600">
                                        <li>1. Copy this unique webhook URL for the selected WhatsApp number.</li>
                                        <li>2. Paste it into your WhatsApp provider webhook callback setting.</li>
                                        <li>3. Ensure POST and verification requests are enabled.</li>
                                        <li>4. Send a test message and confirm status becomes active.</li>
                                    </ol>
                                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                        <CheckCircle2 size={14} />
                                        Flow: Upload or Connect Data -&gt; Process -&gt; Use in Chat
                                    </div>
                                </div>
                            </section>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </AppShell>
    );
}
