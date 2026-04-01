"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/ui/file-upload";
import { Switch } from "@/components/ui/switch";
import { SyncGoogleSheetButton } from "@/components/ui/sync-google-sheet-button";
import { SaveGoogleSheet } from "@/components/ui/save-google-sheet";
import { SyncGoogleDocButton } from "@/components/ui/sync-google-doc-button";
import { SaveGoogleDoc } from "@/components/ui/save-google-doc";
import { 
  Smartphone, 
  Plus, 
  Trash2, 
  Settings, 
  FileText, 
  Database, 
  Globe, 
  Key, 
  Sparkles, 
  Zap, 
  Code,
  LayoutDashboard,
  ShieldCheck,
  Link as LinkIcon,
  RefreshCcw
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/* ================= TYPES ================= */

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
    gemini_api_key: string | null;
    groq_api_key: string | null;
    mistral_api_key: string | null;
};

/* ================= COMPONENT ================= */

export default function FilesPage() {
    const [phoneGroups, setPhoneGroups] = useState<PhoneNumberGroup[]>([]);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [generatingPrompt, setGeneratingPrompt] = useState(false);

    const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);

    const [editPhoneNumber, setEditPhoneNumber] = useState("");
    const [editIntent, setEditIntent] = useState("");
    const [editAuthToken, setEditAuthToken] = useState("");
    const [editOrigin, setEditOrigin] = useState("");
    const [editSystemPrompt, setEditSystemPrompt] = useState("");
    const [editGeminiKey, setEditGeminiKey] = useState("");
    const [editGroqKey, setEditGroqKey] = useState("");
    const [editMistralKey, setEditMistralKey] = useState("");
    const [isNewPhone, setIsNewPhone] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    const [devMode, setDevMode] = useState(false);
    const [processingMode, setProcessingMode] = useState<"ocr" | "transcribe">("transcribe");
    const [devInfo, setDevInfo] = useState<{ extractedText?: string, chunks?: number, mode?: string } | null>(null);

    const loadPhoneGroups = useCallback(async () => {
        try {
            const res = await fetch("/api/phone-groups");
            const data = await res.json();
            if (data.success) {
                setPhoneGroups(data.groups || []);
            }
        } catch (error) {
            console.error("Error loading phone groups:", error);
        }
    }, []);

    useEffect(() => {
        void loadPhoneGroups();
    }, [loadPhoneGroups]);

    useEffect(() => {
        if (selectedPhoneNumber) {
            const group = phoneGroups.find(g => g.phone_number === selectedPhoneNumber);
            if (group) {
                setEditPhoneNumber(group.phone_number);
                setEditIntent(group.intent || "");
                setEditAuthToken(group.auth_token || "");
                setEditOrigin(group.origin || "");
                setEditSystemPrompt(group.system_prompt || "");
                setEditGeminiKey(group.gemini_api_key || "");
                setEditGroqKey(group.groq_api_key || "");
                setEditMistralKey(group.mistral_api_key || "");
                setIsNewPhone(false);
            }
        }
    }, [selectedPhoneNumber, phoneGroups]);

    function handleFileSelect(file: File) {
        setSelectedFile(file);
    }

    function handleNewPhone() {
        setSelectedPhoneNumber(null);
        setEditPhoneNumber("");
        setEditIntent("");
        setEditAuthToken("");
        setEditOrigin("");
        setEditSystemPrompt("");
        setEditGeminiKey("");
        setEditGroqKey("");
        setEditMistralKey("");
        setSelectedFile(null);
        setIsNewPhone(true);
        setDevInfo(null);
    }

    async function generateSystemPrompt() {
        if (!editIntent.trim() || !editPhoneNumber.trim()) {
            alert("Please provide both phone number and intent");
            return;
        }

        setGeneratingPrompt(true);
        try {
            const res = await fetch("/api/generate-system-prompt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    intent: editIntent.trim(),
                    phone_number: editPhoneNumber.trim(),
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate system prompt");

            setEditSystemPrompt(data.system_prompt);
            setEditIntent(data.intent);

            alert("System prompt generated and saved successfully!");
            await loadPhoneGroups();

            if (isNewPhone) {
                setSelectedPhoneNumber(editPhoneNumber.trim());
                setIsNewPhone(false);
            }
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Failed to generate system prompt");
        } finally {
            setGeneratingPrompt(false);
        }
    }

    async function handleUpload() {
        if (!selectedFile || !editPhoneNumber.trim() || !editAuthToken.trim() || !editOrigin.trim()) {
            alert("Please provide all required fields and a file.");
            return;
        }

        const form = new FormData();
        form.append("file", selectedFile);
        form.append("phone_number", editPhoneNumber.trim());
        form.append("auth_token", editAuthToken.trim());
        form.append("origin", editOrigin.trim());
        form.append("gemini_api_key", editGeminiKey.trim());
        form.append("groq_api_key", editGroqKey.trim());
        form.append("mistral_api_key", editMistralKey.trim());
        form.append("dev_mode", devMode.toString());
        form.append("processing_mode", processingMode);

        if (editIntent.trim()) form.append("intent", editIntent.trim());

        setUploading(true);
        try {
            const res = await fetch("/api/process-file", { method: "POST", body: form });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload?.error ?? "Failed to process file");

            alert(`Success! ${payload.chunks} chunks processed.`);
            setSelectedFile(null);
            if (devMode) setDevInfo({ extractedText: payload.extractedText, chunks: payload.chunks, mode: payload.processingMode });
            await loadPhoneGroups();
            setSelectedPhoneNumber(editPhoneNumber.trim());
            setIsNewPhone(false);
        } catch (error) {
            console.error(error);
            alert("Upload error.");
        } finally {
            setUploading(false);
        }
    }

    async function deleteFile(fileId: string) {
        if (!confirm("Delete this file?")) return;
        try {
            const res = await fetch(`/api/files?id=${fileId}`, { method: "DELETE" });
            if (res.ok) await loadPhoneGroups();
        } catch (error) {
            console.error(error);
        }
    }

    async function deletePhoneNumber(phoneNum: string) {
        if (!confirm("Delete this phone set?")) return;
        try {
            const res = await fetch(`/api/phone-mappings?phone_number=${phoneNum}`, { method: "DELETE" });
            if (res.ok) {
                setSelectedPhoneNumber(null);
                await loadPhoneGroups();
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function savePhoneSettings() {
        if (!editPhoneNumber.trim()) return;
        setSavingSettings(true);
        try {
            const res = await fetch("/api/update-phone-settings", {
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
            if (res.ok) {
                alert("Settings synced.");
                await loadPhoneGroups();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSavingSettings(false);
        }
    }

    const selectedGroup = phoneGroups.find(g => g.phone_number === selectedPhoneNumber);

    return (
        <div className="flex h-screen bg-background overflow-hidden relative">
            {/* Left Sidebar */}
            <aside className="w-72 bg-white/60 backdrop-blur-3xl border-r border-black/5 flex flex-col z-20 overflow-hidden shrink-0">
                <div className="p-8 flex items-center gap-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm">
                        <Database size={20} />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight text-slate-900 leading-none">AuraChat</h1>
                        <p className="text-[10px] font-medium text-slate-500 mt-1">Admin Dashboard</p>
                    </div>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-8 mt-6">
                    <div className="px-2">
                        <Button onClick={handleNewPhone} className="w-full gap-2 rounded-xl py-6 bg-primary text-white font-semibold text-sm hover:translate-y-[-1px] transition-all shadow-md shadow-primary/10" variant="default">
                            <Plus size={18} />
                            Add WhatsApp Bot
                        </Button>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-black/20 uppercase tracking-[0.3em] px-4 mb-2 block">Active Nodes</label>
                        <div className="space-y-1.5 px-2">
                            {phoneGroups.map((group) => (
                                <button
                                    key={group.phone_number}
                                    onClick={() => setSelectedPhoneNumber(group.phone_number)}
                                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between group ${
                                        selectedPhoneNumber === group.phone_number
                                            ? "bg-white border-slate-200 shadow-sm text-slate-900"
                                            : "bg-transparent border-transparent hover:bg-slate-100 text-slate-500"
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Smartphone size={16} className={selectedPhoneNumber === group.phone_number ? "text-primary" : "text-slate-400"} />
                                        <span className="text-sm font-medium tracking-tight truncate max-w-[120px]">{group.phone_number}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{group.files.length}</span>
                                        {selectedPhoneNumber === group.phone_number && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-black/5 bg-black/[0.02]">
                    <Link href="/chat">
                        <Button variant="ghost" className="w-full justify-start gap-4 rounded-2xl py-6 hover:bg-white text-foreground/40 hover:text-primary transition-all font-black text-[10px] uppercase tracking-widest">
                            <LayoutDashboard size={20} className="text-primary/40 group-hover:text-primary" />
                            <span>Dashboard</span>
                        </Button>
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative z-10 py-16">
                <div className="section-container">
                    {selectedPhoneNumber || isNewPhone ? (
                        <div className="animate-in fade-in duration-500">
                            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-slate-100 pb-10">
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                                        {isNewPhone ? "Register New Bot" : "Bot Management"}
                                    </h2>
                                    <p className="text-slate-500 font-medium text-base">
                                        Configure your AI assistant settings and manage its knowledge base.
                                    </p>
                                </div>
                                {selectedPhoneNumber && (
                                    <Button onClick={() => deletePhoneNumber(selectedPhoneNumber)} variant="ghost" className="text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all rounded-lg px-4 h-10 border border-transparent hover:border-red-100 text-xs font-semibold">
                                        <Trash2 size={16} className="mr-2" />
                                        Delete Bot
                                    </Button>
                                )}
                            </header>

                             <Tabs defaultValue="configuration" className="w-full">
                                <TabsList className="bg-slate-100/50 border border-slate-200 p-1 rounded-xl h-auto gap-1 mb-10 w-fit flex">
                                    <TabsTrigger value="configuration" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all font-semibold text-sm flex items-center gap-2">
                                        <Settings size={16} />
                                        Settings
                                    </TabsTrigger>
                                    <TabsTrigger value="files" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all font-semibold text-sm flex items-center gap-2">
                                        <Database size={16} />
                                        Knowledge Base
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="configuration" className="space-y-12 animate-in fade-in slide-in-from-bottom-10 pt-4">
                                    {/* System Config Card */}
                                    <div className="glass-card p-12 space-y-10 group/card">
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-center group-hover/card:scale-105 transition-transform duration-700">
                                                <Smartphone size={24} className="text-foreground/40" />
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black tracking-tight text-foreground">Linguistic Identity</h3>
                                                <p className="text-foreground/20 text-[8px] font-bold uppercase tracking-[0.4em] mt-1.5">Core Vector Parameters</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                                            <div className="space-y-4">
                                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] px-1 text-foreground/30">WhatsApp Protocol ID</label>
                                                <div className="relative group/input">
                                                    <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-foreground/10 group-focus-within/input:text-foreground transition-colors">
                                                        <LinkIcon size={16} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={editPhoneNumber}
                                                        onChange={(e) => setEditPhoneNumber(e.target.value)}
                                                        disabled={!isNewPhone}
                                                        className="w-full bg-black/[0.02] border-black/5 rounded-[1.5rem] pl-16 pr-8 py-8 focus:outline-none focus:bg-white focus:ring-4 focus:ring-black/5 transition-all font-mono text-base font-bold disabled:opacity-30 border"
                                                        placeholder="15551234567"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] px-1 text-foreground/30">Intelligence Intent</label>
                                                <div className="flex gap-4">
                                                    <input
                                                        type="text"
                                                        value={editIntent}
                                                        onChange={(e) => setEditIntent(e.target.value)}
                                                        className="flex-1 bg-black/[0.02] border-black/5 rounded-[1.5rem] px-8 py-8 focus:outline-none focus:bg-white focus:ring-4 focus:ring-black/5 transition-all font-bold text-foreground placeholder:text-foreground/10 border"
                                                        placeholder="e.g. Portfolio Manager"
                                                    />
                                                    <Button onClick={generateSystemPrompt} disabled={generatingPrompt} className="bg-foreground text-white hover:bg-black px-12 rounded-[1.5rem] font-bold text-[9px] uppercase tracking-[0.2em] shadow-xl shadow-black/10 transition-all">
                                                        {generatingPrompt ? <RefreshCcw className="animate-spin" /> : "Synthesize"}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {editSystemPrompt && (
                                            <div className="space-y-6 pt-16 border-t border-black/5 animate-in fade-in slide-in-from-top-4 duration-700">
                                                <div className="flex items-center justify-between px-1">
                                                    <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-foreground/30 flex items-center gap-4">
                                                        <Code size={14} className="text-emerald-400" /> Behavioral Logic Schema
                                                    </label>
                                                    <span className="text-[8px] font-bold text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full uppercase tracking-widest border border-emerald-100">Live Runtime</span>
                                                </div>
                                                <div className="relative group/text">
                                                    <textarea
                                                        value={editSystemPrompt}
                                                        onChange={(e) => setEditSystemPrompt(e.target.value)}
                                                        rows={12}
                                                        className="w-full bg-black/[0.01] border border-black/5 rounded-[3rem] px-12 py-12 focus:outline-none focus:bg-white focus:ring-8 focus:ring-black/5 transition-all text-sm font-medium leading-relaxed text-foreground/60 shadow-inner"
                                                    />
                                                    <div className="absolute top-12 right-12 text-foreground/5 group-focus-within/text:text-foreground/10 transition-colors">
                                                        <Sparkles size={40} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Security & API Card */}
                                    <div className="glass-card p-12 space-y-12 group/sec">
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-center text-foreground/40">
                                                <ShieldCheck size={24} />
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black tracking-tight text-foreground">Encrypted Pipeline</h3>
                                                <p className="text-foreground/20 text-[8px] font-bold uppercase tracking-[0.4em] mt-1.5">Authorization & Security Nodes</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                                            <div className="space-y-4">
                                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] px-1 text-foreground/30">Root Auth Token</label>
                                                <input
                                                    type="password"
                                                    value={editAuthToken}
                                                    onChange={(e) => setEditAuthToken(e.target.value)}
                                                    className="w-full bg-black/[0.02] border border-black/5 rounded-[1.5rem] px-8 py-8 focus:outline-none focus:bg-white focus:ring-4 focus:ring-black/5 transition-all font-mono font-bold"
                                                />
                                            </div>
                                            <div className="space-y-4">
                                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] px-1 text-foreground/30">Operational Endpoint</label>
                                                <input
                                                    type="text"
                                                    value={editOrigin}
                                                    onChange={(e) => setEditOrigin(e.target.value)}
                                                    placeholder="https://vortex.ai/..."
                                                    className="w-full bg-black/[0.02] border border-black/5 rounded-[1.5rem] px-8 py-8 focus:outline-none focus:bg-white focus:ring-4 focus:ring-black/5 transition-all font-bold text-foreground border"
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-16 border-t border-black/5">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                                                {[
                                                    { label: "Neural Gemini", val: editGeminiKey, set: setEditGeminiKey, color: "text-blue-500" },
                                                    { label: "Logical Groq", val: editGroqKey, set: setEditGroqKey, color: "text-orange-500" },
                                                    { label: "Semantic Mistral", val: editMistralKey, set: setEditMistralKey, color: "text-emerald-500" }
                                                ].map((api) => (
                                                    <div key={api.label} className="space-y-4 p-8 rounded-[2rem] bg-black/[0.01] border border-black/5 hover:bg-white transition-all duration-500 shadow-sm hover:shadow-xl hover:shadow-black/5">
                                                        <div className="flex items-center gap-4 mb-2">
                                                            <div className="w-10 h-10 rounded-2xl bg-white shadow-sm border border-black/5 flex items-center justify-center">
                                                                <Key size={16} className={api.color} />
                                                            </div>
                                                            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-foreground/40">{api.label}</span>
                                                        </div>
                                                        <input type="password" value={api.val} onChange={e=>api.set(e.target.value)} className="w-full bg-transparent border-transparent px-2 text-foreground font-mono text-sm focus:outline-none" placeholder="••••••••••••" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <Button onClick={savePhoneSettings} disabled={savingSettings || isNewPhone} className="w-full py-12 rounded-[3rem] bg-foreground text-white font-bold uppercase tracking-[0.4em] text-[12px] shadow-3xl shadow-black/20 hover:translate-y-[-2px] active:translate-y-[1px] transition-all">
                                            {savingSettings ? <RefreshCcw className="animate-spin mr-6" /> : <Zap size={24} className="mr-6 fill-white" />}
                                            {savingSettings ? "Committing Logic..." : "Commit Operational Settings"}
                                        </Button>
                                    </div>
                                </TabsContent>

                                <TabsContent value="files" className="space-y-12 animate-in fade-in slide-in-from-bottom-10 pt-4">
                                    {/* Webhook Tooltip Card */}
                                    <div className="glass-card p-12 flex flex-col md:flex-row items-center gap-12 group/hand">
                                        <div className="flex-1 space-y-4">
                                            <div className="flex items-center gap-5">
                                                <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center text-foreground/40 group-hover/hand:scale-110 transition-transform">
                                                    <Globe size={22} />
                                                </div>
                                                <h4 className="text-2xl font-black text-foreground tracking-tight">Endpoint Handshake</h4>
                                            </div>
                                            <p className="text-foreground/20 text-[9px] font-bold uppercase tracking-[0.3em] pl-1">Map 11za webhooks to this secure node for operational logic sync.</p>
                                        </div>
                                        <div className="flex items-center gap-5 bg-black/[0.02] p-4 rounded-[2rem] border border-black/5 w-full md:w-auto min-w-[500px] shadow-inner group/code">
                                            <code className="text-[10px] font-mono font-bold text-foreground/40 px-6 flex-1 truncate">https://vortex-agent.com/api/webhook</code>
                                            <Button variant="ghost" size="sm" onClick={() => {navigator.clipboard.writeText("https://vortex-agent.com/api/webhook"); alert("Copied!");}} className="h-14 px-10 rounded-[1.2rem] bg-white text-foreground font-bold text-[9px] uppercase tracking-[0.2em] shadow-xl shadow-black/5 border border-transparent hover:border-black/5 transition-all">Copy Hash</Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                        {/* Cloud Sync Cards */}
                                        <div className="glass-card p-10 space-y-10 group/sheet">
                                            <div className="flex items-center gap-6">
                                                <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-center text-foreground/40 group-hover/sheet:scale-105 transition-transform duration-700">
                                                    <LayoutDashboard size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold text-foreground">Sheet Sync</h3>
                                                    <p className="text-foreground/20 text-[8px] font-bold uppercase tracking-[0.4em] mt-1.5 pl-0.5">Structured Archive</p>
                                                </div>
                                            </div>
                                            <div className="bg-emerald-50/30 p-8 rounded-[2rem] border border-emerald-500/10">
                                                <SaveGoogleSheet phoneNumber={selectedPhoneNumber!} />
                                            </div>
                                            <SyncGoogleSheetButton phoneNumber={selectedPhoneNumber!} />
                                        </div>

                                        <div className="glass-card p-10 space-y-10 group/doc">
                                            <div className="flex items-center gap-6">
                                                <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-center text-foreground/40 group-hover/doc:scale-105 transition-transform duration-700">
                                                    <FileText size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold text-foreground">Doc Injection</h3>
                                                    <p className="text-foreground/20 text-[8px] font-bold uppercase tracking-[0.4em] mt-1.5 pl-0.5">Semantic Clustered</p>
                                                </div>
                                            </div>
                                            <div className="bg-blue-50/30 p-8 rounded-[2rem] border border-blue-500/10">
                                                <SaveGoogleDoc phoneNumber={selectedPhoneNumber!} />
                                            </div>
                                            <SyncGoogleDocButton phoneNumber={selectedPhoneNumber!} />
                                        </div>
                                    </div>

                                    {/* Local File Uplink */}
                                    <div className="glass-card p-12 space-y-12">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-6">
                                                <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-center text-foreground/40">
                                                    <LinkIcon size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold text-foreground">Local Uplink</h3>
                                                    <p className="text-foreground/20 text-[8px] font-bold uppercase tracking-[0.4em] mt-1.5 pl-0.5">Manual Injection</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6 bg-black/[0.03] px-6 py-4 rounded-2xl border border-black/5">
                                                <span className="text-[10px] font-black uppercase text-foreground/40 tracking-[0.2em]">Neural Vision</span>
                                                <Switch checked={devMode} onCheckedChange={setDevMode} className="data-[state=checked]:bg-primary" />
                                            </div>
                                        </div>
                                        
                                        <div className="bg-black/[0.03] rounded-[3rem] p-4 border border-black/5">
                                            <FileUpload
                                                onFileSelect={handleFileSelect}
                                                accept=".pdf,image/*"
                                                maxSize={50}
                                                selectedFile={selectedFile}
                                            />
                                        </div>

                                        {devMode && selectedFile && selectedFile.type.startsWith("image/") && (
                                            <div className="bg-black/[0.02] p-8 rounded-[2.5rem] border border-black/5 flex flex-col md:flex-row gap-6 justify-center animate-in zoom-in-95">
                                               {[
                                                   { id: "ocr", label: "Semantic Vision OCR", desc: "Raw Text Extraction" },
                                                   { id: "transcribe", label: "Neural Transcription", desc: "Contextual Translation" }
                                               ].map((mode) => (
                                                   <button
                                                        key={mode.id}
                                                        type="button"
                                                        onClick={() => setProcessingMode(mode.id as any)}
                                                        className={`flex-1 p-8 rounded-[1.5rem] border transition-all text-left group ${
                                                            processingMode === mode.id 
                                                                ? "bg-white border-primary shadow-xl shadow-primary/10 ring-1 ring-primary"
                                                                : "bg-white/40 border-transparent hover:bg-white hover:border-black/5 shadow-sm"
                                                        }`}
                                                   >
                                                        <div className="flex items-center justify-between">
                                                            <div className="space-y-1">
                                                                <h4 className={`text-sm font-black tracking-tight ${processingMode === mode.id ? "text-primary" : "text-foreground"}`}>{mode.label}</h4>
                                                                <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest leading-none">{mode.desc}</p>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${processingMode === mode.id ? "border-primary bg-primary scale-110" : "border-black/5 bg-white"}`}>
                                                                {processingMode === mode.id && <div className="w-2 h-2 rounded-full bg-white shadow-sm" />}
                                                            </div>
                                                        </div>
                                                   </button>
                                               ))}
                                            </div>
                                        )}

                                        <Button onClick={handleUpload} disabled={uploading || !selectedFile} className="w-full py-12 rounded-[2.5rem] bg-foreground text-white font-bold uppercase tracking-[0.3em] text-[12px] shadow-3xl shadow-black/20 hover:translate-y-[-2px] active:translate-y-[1px] transition-all">
                                            {uploading ? <RefreshCcw className="animate-spin mr-6" /> : <Plus size={24} className="mr-6 " />}
                                            {uploading ? "Analyzing Assets..." : "Confirm Protocol Uplink"}
                                        </Button>
                                    </div>

                                    {/* File Terminal List */}
                                    {selectedGroup && selectedGroup.files.length > 0 && (
                                        <div className="space-y-10 pt-10">
                                            <div className="flex items-center justify-between px-6">
                                                <h3 className="text-[9px] font-bold uppercase tracking-[0.5em] text-foreground/20 flex items-center gap-5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                                    Operational Asset Ledger
                                                </h3>
                                                <span className="text-[9px] font-bold text-foreground/40 bg-black/5 px-6 py-2 rounded-full border border-black/5 uppercase tracking-widest">{selectedGroup.files.length} Live Artifacts</span>
                                            </div>
                                            <div className="grid grid-cols-1 gap-6">
                                                {selectedGroup.files.map((file) => (
                                                    <div key={file.id} className="glass-card p-10 rounded-[3rem] flex items-center justify-between group hover:bg-black/[0.01] transition-all border border-black/5">
                                                        <div className="flex items-center gap-10">
                                                            <div className="w-14 h-14 rounded-2xl bg-black/[0.02] flex items-center justify-center border border-black/5 group-hover:scale-105 transition-transform">
                                                                <FileText size={22} className="text-foreground/20" />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <h4 className="font-bold text-lg tracking-tight text-foreground/80">{file.name}</h4>
                                                                <div className="flex items-center gap-6 text-[8px] uppercase font-bold tracking-[0.25em] text-foreground/20">
                                                                    <span className="bg-black/5 text-foreground/40 px-3 py-1 rounded-lg">{file.file_type}</span>
                                                                    <span className="flex items-center gap-2"><Database size={12}/> {file.chunk_count} Cognitive Nodes</span>
                                                                    <span className="opacity-30">|</span>
                                                                    <span>Active Profile</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button variant="ghost" size="icon" onClick={() => deleteFile(file.id)} className="rounded-[1.5rem] w-16 h-16 text-red-500/20 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-100">
                                                            <Trash2 size={24} />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>
                             </Tabs>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[72vh] text-center space-y-10 animate-in fade-in zoom-in-[0.98] duration-1000">
                            <div className="w-28 h-28 rounded-[3rem] bg-white border border-black/5 flex items-center justify-center shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] group">
                                <Smartphone size={40} className="text-foreground/20 group-hover:scale-110 transition-transform duration-500" />
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-5xl font-black tracking-tighter text-foreground">Operational Standby</h3>
                                <p className="text-foreground/30 max-w-sm mx-auto font-medium text-lg leading-relaxed">
                                    Select a node from the management deck or initialize a new terminal to begin knowledge injection.
                                </p>
                            </div>
                            <Button onClick={handleNewPhone} className="rounded-full bg-foreground text-white px-14 py-8 font-bold uppercase tracking-[0.3em] text-[10px] shadow-2xl shadow-black/20 hover:translate-y-[-2px] transition-all">
                                Initialize Management Deck
                            </Button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}