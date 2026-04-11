import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/authServer";

export async function POST(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const body = await req.json().catch(() => ({}));
        const sessionId = body?.session_id;
        const selectedNumber = body?.selected_number_id || body?.number_id;

        if (!sessionId || !selectedNumber) {
            return NextResponse.json(
                { error: "session_id and selected_number_id are required" },
                { status: 400 }
            );
        }

        let query = supabaseAdmin
            .from("messages")
            .delete()
            .eq("session_id", sessionId);

        if (user) {
            query = query.eq("user_id", user.id);
        }

        const { error } = await query;

        if (error) {
            console.error("DELETE_CHAT_SESSION_ERROR:", error);
            return NextResponse.json(
                { error: error.message || "Failed to delete conversation" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, session_id: sessionId });
    } catch (error) {
        console.error("DELETE_CHAT_SESSION_EXCEPTION:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to delete conversation" },
            { status: 500 }
        );
    }
}
