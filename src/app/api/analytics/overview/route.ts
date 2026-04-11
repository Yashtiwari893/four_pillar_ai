import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const filesQuery = supabaseAdmin.from("rag_files").select("id", { count: "exact", head: true });
        const chunksQuery = supabaseAdmin.from("rag_chunks").select("id", { count: "exact", head: true });
        const botsQuery = supabaseAdmin.from("phone_document_mapping").select("phone_number");
        const chatMessagesQuery = supabaseAdmin.from("messages").select("id", { count: "exact", head: true });
        const waMessagesQuery = supabaseAdmin.from("whatsapp_messages").select("id", { count: "exact", head: true });

        if (user) {
            filesQuery.or(`user_id.eq.${user.id},user_id.is.null`);
            chunksQuery.or(`user_id.eq.${user.id},user_id.is.null`);
            botsQuery.or(`user_id.eq.${user.id},user_id.is.null`);
            chatMessagesQuery.or(`user_id.eq.${user.id},user_id.is.null`);
            waMessagesQuery.or(`user_id.eq.${user.id},user_id.is.null`);
        }

        const [
            filesResult,
            chunksResult,
            botsResult,
            chatMessagesResult,
            waMessagesResult,
        ] = await Promise.all([
            filesQuery,
            chunksQuery,
            botsQuery,
            chatMessagesQuery,
            waMessagesQuery,
        ]);

        const botRows = (botsResult.data || []) as Array<{ phone_number: string | null }>;
        const botCount = new Set(botRows.map((row) => row.phone_number).filter(Boolean)).size;

        return NextResponse.json({
            success: true,
            metrics: {
                total_files: filesResult.count || 0,
                total_chunks: chunksResult.count || 0,
                active_bots: botCount,
                web_chat_messages: chatMessagesResult.count || 0,
                whatsapp_messages: waMessagesResult.count || 0,
            },
        });
    } catch (error) {
        console.error("ANALYTICS_OVERVIEW_ERROR", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to load analytics",
            },
            { status: 500 }
        );
    }
}
