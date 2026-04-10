import { supabase } from "@/lib/supabaseClient";

type ChunkRow = {
    id: string;
    chunk: string;
    embedding: number[] | null;
};

type PhoneMatchRow = {
    id: string;
    content: string;
    similarity: number;
    source: string | null;
    source_row_hash: string | null;
};

type FileMappingRow = {
    file_id: string;
};

function cosineSimilarity(a: number[], b: number[]) {
    if (a.length !== b.length || a.length === 0) return -1;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return -1;
    return dot / denom;
}

export async function retrieveRelevantChunks(
    queryEmbedding: number[],
    fileId?: string,
    limit = 5,
    userId?: string
) {
    // If a file is explicitly selected, constrain retrieval to that file.
    if (fileId) {
        let query = supabase
            .from("rag_chunks")
            .select("id, chunk, embedding")
            .eq("file_id", fileId)
            .limit(300);

        if (userId) {
            query = query.eq("user_id", userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error("FILE-SCOPED VECTOR SEARCH ERROR:", error);
            throw error;
        }

        const ranked = ((data as ChunkRow[] | null) ?? [])
            .map((row) => {
                const embedding = Array.isArray(row.embedding) ? row.embedding : null;
                return {
                    id: row.id,
                    chunk: row.chunk,
                    similarity: embedding ? cosineSimilarity(queryEmbedding, embedding) : -1,
                };
            })
            .filter((row) => row.similarity > 0)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

        return ranked;
    }

    const { data, error } = await supabase.rpc("match_documents_by_phone", {
        query_embedding: queryEmbedding,
        match_count: limit,
        target_phone: null,
    });

    if (error) {
        console.error("VECTOR SEARCH ERROR:", error);
        throw error;
    }

    return data as { id: string; chunk: string; similarity: number }[];
}

/**
 * Retrieve relevant chunks from multiple files (for phone number mappings)
 */
export async function retrieveRelevantChunksFromFiles(
    queryEmbedding: number[],
    fileIds: string[],
    limit = 5
) {
    if (fileIds.length === 0) {
        return [];
    }

    if (fileIds.length === 1) {
        return retrieveRelevantChunks(queryEmbedding, fileIds[0], limit);
    }

    // For multiple files, we need to search across all of them
    // We'll get results from each file and then merge them
    const allChunks: { id: string; chunk: string; similarity: number; file_id: string }[] = [];

    for (const fileId of fileIds) {
        const chunks = await retrieveRelevantChunks(queryEmbedding, fileId, limit);
        allChunks.push(...chunks.map(c => ({ ...c, file_id: fileId })));
    }

    // Sort by similarity and return top N
    return allChunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}

/**
 * Retrieve relevant chunks for a phone number (including both file-based and direct chunks)
 */
export async function retrieveRelevantChunksForPhoneNumber(
    queryEmbedding: number[],
    phoneNumber: string,
    limit = 5
) {
    console.log(`Retrieving chunks for phone number: ${phoneNumber}, limit: ${limit}`);

    // Get direct chunks for this phone number (like Google Sheets)
    const { data: directChunks, error } = await supabase.rpc("match_documents_by_phone", {
        query_embedding: queryEmbedding,
        match_count: limit,
        target_phone: phoneNumber, // Always specify the target phone number
    });

    if (error) {
        console.error("VECTOR SEARCH ERROR for phone chunks:", error);
        // Continue with empty array
    }

    const phoneChunks = ((directChunks || []) as PhoneMatchRow[]).map((c) => ({
        id: c.id,
        chunk: c.content,
        similarity: c.similarity,
        source_type: c.source,
        row_hash: c.source_row_hash
    }));

    console.log(`Found ${phoneChunks.length} direct chunks for phone ${phoneNumber}`);

    // Get file IDs for this phone number (legacy support)
    const { data: fileIds } = await supabase
        .from("phone_document_mapping")
        .select("file_id")
        .eq("phone_number", phoneNumber);

    const fileRows = (fileIds || []) as FileMappingRow[];
    const fileChunks = fileRows.length ?
        await retrieveRelevantChunksFromFiles(queryEmbedding, fileRows.map((f) => f.file_id), limit) :
        [];

    console.log(`Found ${fileChunks.length} file-based chunks for phone ${phoneNumber}`);

    // Combine and sort all chunks
    const allChunks = [
        ...phoneChunks.map((c) => ({ ...c, source: "phone" })),
        ...fileChunks.map((c) => ({ ...c, source: "file" }))
    ];

    // Sort by similarity and return top results
    const sortedChunks = allChunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    console.log(`Returning ${sortedChunks.length} total chunks with similarities:`,
        sortedChunks.map(c => ({ similarity: c.similarity, source: c.source })));

    return sortedChunks;
}
