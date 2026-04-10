import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getUserFromRequest } from "@/lib/authServer";

export const runtime = "nodejs";

type FileRow = {
    id: string;
    name: string;
    created_at: string;
    rag_chunks?: { count: number }[];
};

export async function GET(req: Request) {
    const user = await getUserFromRequest(req);

    let query = supabase
        .from("rag_files")
        .select("id, name, created_at, rag_chunks(count)")
        .order("created_at", { ascending: false });

    if (user) {
        query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const files = (data as FileRow[] | null)?.map((file) => ({
        id: file.id,
        name: file.name,
        created_at: file.created_at,
        chunk_count: file.rag_chunks?.[0]?.count ?? 0,
    })) ?? [];

    return NextResponse.json({ files });
}

export async function DELETE(req: Request) {
    const user = await getUserFromRequest(req);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    let query = supabase
        .from("rag_files")
        .delete()
        .eq("id", id);

    if (user) {
        query = query.eq("user_id", user.id);
    }

    const { error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
