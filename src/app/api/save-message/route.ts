import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/authServer";

export async function POST(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const body = await req.json();
        const { session_id, role, content } = body;

        if (!session_id || !role || typeof content !== "string") {
            return NextResponse.json(
                { error: "session_id, role and content are required" },
                { status: 400 }
            );
        }

        const row: { session_id: string; role: string; content: string; user_id?: string } = {
            session_id,
            role,
            content,
        };

        if (user) {
            row.user_id = user.id;
        }

        const { error } = await supabase
            .from("messages")
            .insert([row]);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("SUPABASE_SAVE_ERROR:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
