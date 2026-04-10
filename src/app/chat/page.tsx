"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { v4 as uuid } from "uuid";
import { Bot, Send, Sparkles, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppShell } from "@/components/layout/app-shell";
import { authedFetch } from "@/lib/authedFetch";

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

type FileItem = {
    id: string;
    name: string;
};

type ChatSession = {
    id: string;
    title: string;
    updatedAt: string;
    fileId?: string;
};

const CHAT_SESSIONS_KEY = "chat_sessions";

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [sessions, setSessions] = useState<ChatSession[]>([]);

    const bottomRef = useRef<HTMLDivElement | null>(null);

    function persistSessions(next: ChatSession[]) {
        const compact = next.slice(0, 20);
        setSessions(compact);
        localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(compact));
    }

    function createSession(fileId?: string | null) {
        const id = uuid();
        const nextSession: ChatSession = {
            id,
            title: "New conversation",
            updatedAt: new Date().toISOString(),
            fileId: fileId || undefined,
        };

        const existingRaw = localStorage.getItem(CHAT_SESSIONS_KEY);
        const existing = existingRaw ? (JSON.parse(existingRaw) as ChatSession[]) : [];
        persistSessions([nextSession, ...existing.filter((s) => s.id !== id)]);
        localStorage.setItem("chat_session_id", id);
        setSessionId(id);
        setMessages([]);
    }

    useEffect(() => {
        const stored = localStorage.getItem(CHAT_SESSIONS_KEY);
        const parsed = stored ? (JSON.parse(stored) as ChatSession[]) : [];
        setSessions(parsed);

        const storedSessionId = localStorage.getItem("chat_session_id");
        if (storedSessionId) {
            setSessionId(storedSessionId);
            return;
        }

        const id = uuid();
        const nextSession: ChatSession = {
            id,
            title: "New conversation",
            updatedAt: new Date().toISOString(),
        };
        const nextSessions = [nextSession, ...parsed.filter((s) => s.id !== id)].slice(0, 20);
        setSessions(nextSessions);
        localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(nextSessions));
        localStorage.setItem("chat_session_id", id);
        setSessionId(id);
    }, []);

    useEffect(() => {
        async function loadFiles() {
            try {
                const res = await authedFetch("/api/files");
                if (!res.ok) {
                    return;
                }
                const data = await res.json();
                const fetchedFiles: FileItem[] = data.files || [];
                setFiles(fetchedFiles);

                if (fetchedFiles.length > 0) {
                    const activeSession = sessions.find((s) => s.id === sessionId);
                    const preferredFile = activeSession?.fileId;
                    const exists = preferredFile && fetchedFiles.some((f) => f.id === preferredFile);
                    setSelectedFile(exists ? preferredFile! : fetchedFiles[0].id);
                }
            } catch (error) {
                console.error("Failed to load files", error);
            }
        }

        void loadFiles();
    }, [sessionId, sessions]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isThinking]);

    useEffect(() => {
        if (!sessionId) return;

        async function loadHistory() {
            try {
                const res = await authedFetch(`/api/get-messages?session_id=${sessionId}`);
                if (!res.ok) return;
                const data = await res.json();
                setMessages(data.messages || []);
            } catch (error) {
                console.error("Failed to load chat history", error);
            }
        }

        void loadHistory();
    }, [sessionId]);

    async function sendMessage() {
        if (!input.trim() || !sessionId || isSending || !selectedFile) return;

        const content = input.trim();
        const userMessage: ChatMessage = { role: "user", content };

        persistSessions(
            [
                {
                    id: sessionId,
                    title: content.slice(0, 56),
                    updatedAt: new Date().toISOString(),
                    fileId: selectedFile,
                },
                ...sessions.filter((s) => s.id !== sessionId),
            ]
        );

        setInput("");
        setIsSending(true);
        setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);

        try {
            await authedFetch("/api/save-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionId,
                    role: "user",
                    content,
                }),
            });

            setIsThinking(true);

            const res = await authedFetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: content,
                    file_id: selectedFile,
                }),
            });

            setIsThinking(false);

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                const message = payload?.error || "Could not get AI response.";
                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: message };
                    return updated;
                });
                return;
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let fullReply = "";

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    fullReply += chunk;

                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { role: "assistant", content: fullReply };
                        return updated;
                    });
                }
            }

            await authedFetch("/api/save-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionId,
                    role: "assistant",
                    content: fullReply,
                }),
            });
        } catch (error) {
            console.error(error);
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: "assistant",
                    content: "Something went wrong while sending your message.",
                };
                return updated;
            });
            setIsThinking(false);
        } finally {
            setIsSending(false);
        }
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    }

    function resetChat() {
        createSession(selectedFile);
    }

    function switchSession(targetSessionId: string) {
        setSessionId(targetSessionId);
        localStorage.setItem("chat_session_id", targetSessionId);

        const selectedSession = sessions.find((s) => s.id === targetSessionId);
        if (selectedSession?.fileId) {
            setSelectedFile(selectedSession.fileId);
        }
    }

    return (
        <AppShell
            title="Chat Console"
            subtitle="Ask questions against your selected knowledge source and iterate quickly."
            contentClassName="p-0 flex overflow-hidden pb-20 md:pb-0"
            headerActions={<Button variant="outline" onClick={resetChat}>New Chat</Button>}
            sidebarExtras={
                <>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold text-slate-700">Knowledge Source</p>
                        <p className="mt-1 text-xs text-slate-500">Choose which file this chat should reference.</p>
                        <div className="mt-3 space-y-2">
                            {files.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                                    No files found. Add documents in Data Sources.
                                </p>
                            ) : (
                                files.map((file) => (
                                    <button
                                        key={file.id}
                                        onClick={() => {
                                            setSelectedFile(file.id);
                                            resetChat();
                                        }}
                                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                                            selectedFile === file.id
                                                ? "border-slate-900 bg-slate-900 text-white"
                                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                        }`}
                                    >
                                        {file.name}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold text-slate-700">Chat History</p>
                        <p className="mt-1 text-xs text-slate-500">Recent sessions on this device.</p>
                        <div className="mt-3 space-y-2">
                            {sessions.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                                    No previous sessions.
                                </p>
                            ) : (
                                sessions.map((session) => (
                                    <button
                                        key={session.id}
                                        onClick={() => switchSession(session.id)}
                                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                                            sessionId === session.id
                                                ? "border-slate-900 bg-slate-900 text-white"
                                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                        }`}
                                    >
                                        <p className="truncate font-medium">{session.title}</p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            }
        >
            <div className="flex flex-1 flex-col">
                <ScrollArea className="flex-1 px-4 py-6 md:px-8">
                    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-32">
                        {messages.length === 0 && !isThinking && (
                            <div className="mt-10 rounded-3xl border border-slate-200/70 bg-white/80 p-10 text-center">
                                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white">
                                    <Sparkles size={24} />
                                </div>
                                <h2 className="text-xl font-semibold">Ask anything about your selected source</h2>
                                <p className="mt-2 text-sm text-slate-500">
                                    Upload data in Data Sources, then ask focused questions here.
                                </p>
                            </div>
                        )}

                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`flex items-start gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                {msg.role === "assistant" && (
                                    <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-white">
                                        <Bot size={14} />
                                    </div>
                                )}

                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[70%] ${
                                        msg.role === "user"
                                            ? "bg-slate-900 text-white"
                                            : "border border-slate-200 bg-white text-slate-800"
                                    }`}
                                >
                                    {msg.role === "assistant" ? (
                                        <div className="prose prose-sm max-w-none">
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    )}
                                </div>

                                {msg.role === "user" && (
                                    <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-slate-700">
                                        <User size={14} />
                                    </div>
                                )}
                            </div>
                        ))}

                        {isThinking && (
                            <div className="flex items-center gap-3">
                                <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-white">
                                    <Bot size={14} />
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                    <div className="flex gap-1.5">
                                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.2s]" />
                                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>
                </ScrollArea>

                <div className="border-t border-slate-200/70 bg-white/80 px-4 py-4 backdrop-blur md:px-8">
                    <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={selectedFile ? "Ask a question about your data..." : "Select a file to start"}
                            disabled={!selectedFile || isSending}
                            className="h-11 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                        />
                        <Button
                            onClick={() => void sendMessage()}
                            disabled={!selectedFile || !input.trim() || isSending}
                            size="icon"
                            className="h-11 w-11 rounded-xl"
                        >
                            <Send size={17} />
                        </Button>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
