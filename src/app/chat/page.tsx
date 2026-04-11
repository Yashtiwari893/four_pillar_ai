"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { v4 as uuid } from "uuid";
import { Bot, RotateCcw, Send, Sparkles, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppShell } from "@/components/layout/app-shell";
import { authedFetch } from "@/lib/authedFetch";

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

type BotProfile = {
    phone_number: string;
    intent: string | null;
};

type ChatSession = {
    id: string;
    title: string;
    updatedAt: string;
};

const SELECTED_NUMBER_KEY = "chat_selected_number";
const sessionListKey = (numberId: string) => `chat_sessions_${numberId}`;
const activeSessionKey = (numberId: string) => `chat_session_id_${numberId}`;

function readSessions(numberId: string): ChatSession[] {
    const raw = localStorage.getItem(sessionListKey(numberId));
    if (!raw) return [];
    try {
        return JSON.parse(raw) as ChatSession[];
    } catch {
        return [];
    }
}

function writeSessions(numberId: string, sessions: ChatSession[]) {
    localStorage.setItem(sessionListKey(numberId), JSON.stringify(sessions.slice(0, 30)));
}

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isLoadingBots, setIsLoadingBots] = useState(true);
    const [botProfiles, setBotProfiles] = useState<BotProfile[]>([]);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [testViaWebhook, setTestViaWebhook] = useState(false);
    const [sessions, setSessions] = useState<ChatSession[]>([]);

    const bottomRef = useRef<HTMLDivElement | null>(null);
    const selectedBot = useMemo(
        () => botProfiles.find((bot) => bot.phone_number === selectedNumber) || null,
        [botProfiles, selectedNumber]
    );

    function persistSessions(numberId: string, next: ChatSession[]) {
        const compact = next.slice(0, 20);
        setSessions(compact);
        writeSessions(numberId, compact);
    }

    function createSession(numberId: string) {
        const id = `${numberId}__${uuid()}`;
        const nextSession: ChatSession = {
            id,
            title: "New conversation",
            updatedAt: new Date().toISOString(),
        };

        const existing = readSessions(numberId);
        persistSessions(numberId, [nextSession, ...existing.filter((s) => s.id !== id)]);
        localStorage.setItem(activeSessionKey(numberId), id);
        setSessionId(id);
        setMessages([]);
    }

    useEffect(() => {
        async function loadBotProfiles() {
            try {
                setIsLoadingBots(true);
                const res = await authedFetch("/api/phone-groups");
                const data = await res.json();
                if (!res.ok || !data.success) {
                    setBotProfiles([]);
                    return;
                }

                const list: BotProfile[] = (data.groups || []).map((item: { phone_number: string; intent?: string | null }) => ({
                    phone_number: item.phone_number,
                    intent: item.intent || null,
                }));

                setBotProfiles(list);

                if (list.length === 0) {
                    setSelectedNumber(null);
                    setSessions([]);
                    setSessionId(null);
                    return;
                }

                const storedNumber = localStorage.getItem(SELECTED_NUMBER_KEY);
                const validStored = storedNumber && list.some((p) => p.phone_number === storedNumber);
                const nextNumber = validStored ? storedNumber : list[0].phone_number;
                setSelectedNumber(nextNumber);
                localStorage.setItem(SELECTED_NUMBER_KEY, nextNumber);
            } catch (error) {
                console.error("Failed to load bot profiles", error);
                setBotProfiles([]);
                setSelectedNumber(null);
                setSessions([]);
                setSessionId(null);
            } finally {
                setIsLoadingBots(false);
            }
        }

        void loadBotProfiles();
    }, []);

    useEffect(() => {
        if (!selectedNumber) {
            setSessions([]);
            setSessionId(null);
            setMessages([]);
            return;
        }

        const numberSessions = readSessions(selectedNumber);
        setSessions(numberSessions);

        const storedActive = localStorage.getItem(activeSessionKey(selectedNumber));
        const activeExists = storedActive && numberSessions.some((s) => s.id === storedActive);

        if (activeExists) {
            setSessionId(storedActive);
            return;
        }

        if (numberSessions.length > 0) {
            setSessionId(numberSessions[0].id);
            localStorage.setItem(activeSessionKey(selectedNumber), numberSessions[0].id);
            return;
        }

        createSession(selectedNumber);
    }, [selectedNumber]);

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
        if (!input.trim() || !sessionId || isSending || !selectedNumber) return;

        const content = input.trim();
        const userMessage: ChatMessage = { role: "user", content };

        persistSessions(
            selectedNumber,
            [
                {
                    id: sessionId,
                    title: content.slice(0, 56),
                    updatedAt: new Date().toISOString(),
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
                    selected_number_id: selectedNumber,
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
                    selected_number_id: selectedNumber,
                    user_id: null,
                    test_via_webhook: testViaWebhook,
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
                    selected_number_id: selectedNumber,
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
        if (!selectedNumber) return;
        createSession(selectedNumber);
    }

    function switchSession(targetSessionId: string) {
        if (!selectedNumber) return;
        setSessionId(targetSessionId);
        localStorage.setItem(activeSessionKey(selectedNumber), targetSessionId);
    }

    function switchNumber(numberId: string) {
        setSelectedNumber(numberId);
        localStorage.setItem(SELECTED_NUMBER_KEY, numberId);
    }

    async function deleteConversation(sessionToDelete: string) {
        if (!selectedNumber) return;
        const ok = window.confirm("Delete this conversation permanently? This removes it from the database too.");
        if (!ok) return;

        try {
            const res = await authedFetch("/api/delete-chat-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionToDelete,
                    selected_number_id: selectedNumber,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "Failed to delete conversation");
            }

            const nextSessions = sessions.filter((session) => session.id !== sessionToDelete);
            persistSessions(selectedNumber, nextSessions);

            if (sessionId === sessionToDelete) {
                localStorage.removeItem(activeSessionKey(selectedNumber));
                setMessages([]);
                if (nextSessions.length > 0) {
                    setSessionId(nextSessions[0].id);
                    localStorage.setItem(activeSessionKey(selectedNumber), nextSessions[0].id);
                } else {
                    createSession(selectedNumber);
                }
            }
        } catch (error) {
            alert(error instanceof Error ? error.message : "Failed to delete conversation");
        }
    }

    return (
        <AppShell
            title="Chat Console"
            subtitle="Select a bot number and test exactly how that bot responds."
            contentClassName="p-0 flex min-h-0 overflow-hidden pb-20 md:pb-0"
            headerActions={
                <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        <input
                            type="checkbox"
                            checked={testViaWebhook}
                            onChange={(e) => setTestViaWebhook(e.target.checked)}
                            className="h-3.5 w-3.5"
                        />
                        Test via Webhook
                    </label>
                    <Button variant="outline" onClick={resetChat} disabled={!selectedNumber}>
                        <RotateCcw size={14} />
                        Reset Chat
                    </Button>
                    <Button variant="outline" onClick={resetChat} disabled={!selectedNumber}>New Chat</Button>
                </div>
            }
            sidebarExtras={
                <>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold text-slate-700">Testing Bot</p>
                        <p className="mt-1 text-xs text-slate-500">Select WhatsApp number to test that bot configuration.</p>
                        <div className="mt-3 space-y-2">
                            {isLoadingBots ? (
                                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                                    Loading numbers...
                                </p>
                            ) : botProfiles.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                                    No bot numbers found. Create one in Data Sources.
                                </p>
                            ) : (
                                botProfiles.map((bot) => (
                                    <button
                                        key={bot.phone_number}
                                        onClick={() => switchNumber(bot.phone_number)}
                                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                                            selectedNumber === bot.phone_number
                                                ? "border-slate-900 bg-slate-900 text-white"
                                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                        }`}
                                    >
                                        <p className="truncate font-medium">{bot.phone_number}</p>
                                        <p className={`truncate text-[11px] ${selectedNumber === bot.phone_number ? "text-slate-200" : "text-slate-400"}`}>
                                            {bot.intent || "No intent configured"}
                                        </p>
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
                                    No previous sessions for this number.
                                </p>
                            ) : (
                                sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                                            sessionId === session.id
                                                ? "border-slate-900 bg-slate-900 text-white"
                                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => switchSession(session.id)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <p className="truncate font-medium">{session.title}</p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void deleteConversation(session.id)}
                                            className={`rounded-md p-1 transition ${
                                                sessionId === session.id
                                                    ? "text-white/80 hover:bg-white/10 hover:text-white"
                                                    : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            }`}
                                            aria-label="Delete conversation"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            }
        >
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1 overflow-hidden px-4 py-6 md:px-8">
                    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-28">
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm">
                            <p className="font-semibold text-blue-900">
                                Testing Bot: {selectedNumber || "No number selected"}
                            </p>
                            <p className="mt-1 text-blue-800/80">
                                {selectedBot?.intent || "No intent set for this bot yet."}
                            </p>
                        </div>

                        {messages.length === 0 && !isThinking && (
                            <div className="mt-10 rounded-3xl border border-slate-200/70 bg-white/80 p-10 text-center">
                                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white">
                                    <Sparkles size={24} />
                                </div>
                                <h2 className="text-xl font-semibold">Ask anything to test this bot</h2>
                                <p className="mt-2 text-sm text-slate-500">
                                    Switch numbers anytime to validate each bot independently.
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

                <div className="sticky bottom-0 z-20 shrink-0 border-t border-slate-200/70 bg-white/95 px-4 py-4 backdrop-blur md:px-8">
                    <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={selectedNumber ? "Ask something to test this bot..." : "Select a bot number to start"}
                            disabled={!selectedNumber || isSending}
                            className="h-11 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                        />
                        <Button
                            onClick={() => void sendMessage()}
                            disabled={!selectedNumber || !input.trim() || isSending}
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
