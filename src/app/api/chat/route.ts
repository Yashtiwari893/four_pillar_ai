import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { supabase } from "@/lib/supabaseClient";
import { embedText } from "@/lib/embeddings";
import { retrieveRelevantChunks } from "@/lib/retrieval";
import { buildRagSystemPrompt } from "@/lib/ragPrompt";
import { getUserFromRequest } from "@/lib/authServer";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

type RetrievedChunk = {
    id: string;
    chunk?: string;
    content?: string;
    similarity: number;
};

export async function POST(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const body = await req.json();
        const { session_id, message, file_id } = body;

        if (!session_id || !message) {
            return NextResponse.json(
                { error: "session_id and message are required" },
                { status: 400 }
            );
        }

        if (!file_id) {
            return NextResponse.json(
                { error: "file_id is required" },
                { status: 400 }
            );
        }

        // 1. Embed the user query
        const queryEmbedding = await embedText(message);

        if (!queryEmbedding) {
            return NextResponse.json(
                { error: "Failed to generate embedding" },
                { status: 500 }
            );
        }

        // 2. Retrieve relevant chunks
        const matches = (await retrieveRelevantChunks(queryEmbedding, file_id, 5, user?.id)) as RetrievedChunk[];

        const contextChunks = matches
            .map((m) => ({ chunk: m.chunk || m.content || "", similarity: m.similarity }))
            .filter((m) => m.chunk.trim().length > 0);

        // 3. Load conversation history
        let historyQuery = supabase
            .from("messages")
            .select("role, content")
            .eq("session_id", session_id)
            .order("created_at", { ascending: true });

        if (user) {
            historyQuery = historyQuery.eq("user_id", user.id);
        }

        const { data: historyRows } = await historyQuery;

        const history = (historyRows || []).map(m => ({
            role: m.role,
            content: m.content
        }));

        const recentHistory = history.slice(-16);
        const lastMessage = recentHistory[recentHistory.length - 1];
        const shouldAppendUserMessage =
            !(lastMessage?.role === "user" && lastMessage?.content === message);

        // 4. Inject RAG context into Groq LLM
        const messages = [
            {
                role: "system",
                content: buildRagSystemPrompt(contextChunks),
            },
            ...recentHistory,
            ...(shouldAppendUserMessage ? [{ role: "user", content: message }] : [])
        ];

        // 5. Call Groq with streaming
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            temperature: 0.2,
            stream: true
        });

        // Create a streaming response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of completion) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            controller.enqueue(encoder.encode(content));
                        }
                    }
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked'
            }
        });
    } catch (err: unknown) {
        console.error("CHAT_ERROR:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
