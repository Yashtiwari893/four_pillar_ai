import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getUserFromRequest } from "@/lib/authServer";

export async function GET(req: Request) {
    const user = await getUserFromRequest(req);

    const { searchParams } = new URL(req.url);
    const session_id = searchParams.get("session_id");

    if (!session_id) {
        return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    let query = supabase
        .from("messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true });

    if (user) {
        query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (data || []).map((item) => ({
        role: item.role,
        content: item.content,
    }));

    return NextResponse.json({ messages: formatted });
}
