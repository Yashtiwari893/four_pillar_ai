import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getUserFromRequest } from "@/lib/authServer";

type ChunkCountRow = { file_id: string | null };
type MappingRow = {
    phone_number: string;
    intent: string | null;
    system_prompt: string | null;
    auth_token: string | null;
    origin: string | null;
    webhook_id: string | null;
    webhook_secret: string | null;
    webhook_enabled: boolean | null;
    gemini_api_key: string | null;
    groq_api_key: string | null;
    mistral_api_key: string | null;
    rag_files: { id: string; name: string; file_type: string; created_at: string } | null;
};

type LegacyMappingRow = Omit<MappingRow, "webhook_id" | "webhook_secret" | "webhook_enabled">;

type PhoneGroup = {
    phone_number: string;
    intent: string | null;
    system_prompt: string | null;
    auth_token: string;
    origin: string;
    webhook_id: string | null;
    webhook_secret: string | null;
    webhook_enabled: boolean;
    gemini_api_key: string | null;
    groq_api_key: string | null;
    mistral_api_key: string | null;
    files: Array<{ id: string; name: string; file_type: string; chunk_count: number; created_at: string }>;
};

export async function GET(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        // Try modern schema first (with webhook columns).
        let mappingsQuery = supabase
            .from("phone_document_mapping")
            .select(`
                phone_number,
                intent,
                system_prompt,
                auth_token,
                origin,
                webhook_id,
                webhook_secret,
                webhook_enabled,
                gemini_api_key,
                groq_api_key,
                mistral_api_key,
                file_id,
                rag_files (
                    id,
                    name,
                    file_type,
                    created_at
                )
            `)
            .order("phone_number", { ascending: true });

        if (user) {
            mappingsQuery = mappingsQuery.eq("user_id", user.id);
        }

        let { data: mappings, error: mappingError } = await mappingsQuery;

        // Backward-compatible fallback for environments where webhook migration hasn't run yet.
        if (mappingError && /webhook_(id|secret|enabled)/i.test(mappingError.message || "")) {
            let legacyQuery = supabase
                .from("phone_document_mapping")
                .select(`
                    phone_number,
                    intent,
                    system_prompt,
                    auth_token,
                    origin,
                    gemini_api_key,
                    groq_api_key,
                    mistral_api_key,
                    file_id,
                    rag_files (
                        id,
                        name,
                        file_type,
                        created_at
                    )
                `)
                .order("phone_number", { ascending: true });

            if (user) {
                legacyQuery = legacyQuery.eq("user_id", user.id);
            }

            const legacyResult = await legacyQuery;
            mappingError = legacyResult.error;
            mappings = (legacyResult.data as LegacyMappingRow[] | null)?.map((row) => ({
                phone_number: row.phone_number,
                intent: row.intent,
                system_prompt: row.system_prompt,
                auth_token: row.auth_token,
                origin: row.origin,
                webhook_id: null,
                webhook_secret: null,
                webhook_enabled: true,
                gemini_api_key: row.gemini_api_key,
                groq_api_key: row.groq_api_key,
                mistral_api_key: row.mistral_api_key,
                rag_files: row.rag_files,
            })) as MappingRow[];
        }

        if (mappingError) {
            throw mappingError;
        }

        // Get chunk counts for each file
        let chunkQuery = supabase
            .from("rag_chunks")
            .select("file_id");

        if (user) {
            chunkQuery = chunkQuery.eq("user_id", user.id);
        }

        const { data: chunkCounts, error: chunkError } = await chunkQuery;

        if (chunkError) {
            throw chunkError;
        }

        // Count chunks per file
        const chunkCountMap: Record<string, number> = {};
        (chunkCounts as ChunkCountRow[] | null)?.forEach((chunk) => {
            if (!chunk.file_id) return;
            chunkCountMap[chunk.file_id] = (chunkCountMap[chunk.file_id] || 0) + 1;
        });

        // Group by phone number
        const phoneGroups: Record<string, PhoneGroup> = {};

        (mappings as MappingRow[] | null)?.forEach((mapping) => {
            const phone = mapping.phone_number;
            const file = mapping.rag_files;

            if (!phoneGroups[phone]) {
                phoneGroups[phone] = {
                    phone_number: phone,
                    intent: mapping.intent,
                    system_prompt: mapping.system_prompt,
                    auth_token: mapping.auth_token || "",
                    origin: mapping.origin || "",
                    webhook_id: mapping.webhook_id || null,
                    webhook_secret: mapping.webhook_secret || null,
                    webhook_enabled: mapping.webhook_enabled ?? true,
                    gemini_api_key: mapping.gemini_api_key || null,
                    groq_api_key: mapping.groq_api_key || null,
                    mistral_api_key: mapping.mistral_api_key || null,
                    files: [],
                };
            }

            if (file) {
                phoneGroups[phone].files.push({
                    id: file.id,
                    name: file.name,
                    file_type: file.file_type,
                    chunk_count: chunkCountMap[file.id] || 0,
                    created_at: file.created_at,
                });
            }
        });

        const groups = Object.values(phoneGroups);

        return NextResponse.json({
            success: true,
            groups,
        });
    } catch (error) {
        console.error("Error fetching phone groups:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to fetch phone groups",
            },
            { status: 500 }
        );
    }
}
