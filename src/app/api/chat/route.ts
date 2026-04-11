import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedText } from "@/lib/embeddings";
import { retrieveRelevantChunksForPhoneNumber } from "@/lib/retrieval";
import { buildRagSystemPrompt } from "@/lib/ragPrompt";
import { getUserFromRequest } from "@/lib/authServer";

type RetrievedChunk = {
    id: string;
    chunk: string;
    similarity: number;
};

export async function POST(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const body = await req.json();
        const { session_id, message, selected_number_id, number_id, test_via_webhook } = body;
        void test_via_webhook;

        const selectedNumber = selected_number_id || number_id;

        if (!session_id || !message) {
            return NextResponse.json(
                { error: "session_id and message are required" },
                { status: 400 }
            );
        }

        if (!selectedNumber) {
            return NextResponse.json(
                { error: "selected_number_id (or number_id) is required" },
                { status: 400 }
            );
        }

        const { data: mapping, error: mappingError } = await supabaseAdmin
            .from("phone_document_mapping")
            .select("system_prompt, mistral_api_key, groq_api_key")
            .eq("phone_number", selectedNumber)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (mappingError) {
            return NextResponse.json(
                { error: "Failed to load bot configuration" },
                { status: 500 }
            );
        }

        if (!mapping) {
            return NextResponse.json(
                { error: "No bot profile found for selected number" },
                { status: 404 }
            );
        }

        // 1. Embed the user query
        const queryEmbedding = await embedText(message, 3, mapping.mistral_api_key);

        if (!queryEmbedding) {
            return NextResponse.json(
                { error: "Failed to generate embedding" },
                { status: 500 }
            );
        }

        // 2. Retrieve relevant chunks for this selected bot number
        const matches = (await retrieveRelevantChunksForPhoneNumber(queryEmbedding, selectedNumber, 6)) as RetrievedChunk[];

        const contextChunks = matches
            .map((m) => ({ chunk: m.chunk || "", similarity: m.similarity }))
            .filter((m) => m.chunk.trim().length > 0);

        // 3. Load conversation history
        let historyQuery = supabaseAdmin
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
        const customSystemPrompt = mapping.system_prompt?.trim() || "";
        const ragPrompt = buildRagSystemPrompt(contextChunks);
        const mergedSystemPrompt = customSystemPrompt
            ? `${customSystemPrompt}\n\n${ragPrompt}`
            : ragPrompt;

        const messages = [
            {
                role: "system",
                content: mergedSystemPrompt,
            },
            ...recentHistory,
            ...(shouldAppendUserMessage ? [{ role: "user", content: message }] : [])
        ];

        // 5. Call Groq with streaming
        const localGroq = new Groq({ apiKey: mapping.groq_api_key || process.env.GROQ_API_KEY! });
        const completion = await localGroq.chat.completions.create({
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
