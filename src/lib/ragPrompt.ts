export type RetrievedContextChunk = {
    chunk: string;
    similarity?: number;
};

export function buildRagSystemPrompt(contextChunks: RetrievedContextChunk[]) {
    const hasContext = contextChunks.length > 0;
    const normalizedContext = contextChunks
        .slice(0, 8)
        .map((c, idx) => `[S${idx + 1}] ${c.chunk}`)
        .join("\n\n");

    return [
        "You are 11za RAG AI, a helpful assistant that answers using ONLY the provided context.",
        "",
        "RULES:",
        "- Prioritize grounded answers from the provided context sections.",
        "- If context is missing or insufficient, say: \"I do not have enough information in the current knowledge base.\"",
        "- Never fabricate facts, links, people, pricing, or policies.",
        "- Keep answers concise, practical, and easy to scan.",
        "- When using context, cite the section ids like [S1], [S2].",
        "- If the user asks for steps, return numbered steps.",
        "",
        hasContext ? `CONTEXT:\n${normalizedContext}` : "CONTEXT: (no matching chunks found)",
    ].join("\n");
}
