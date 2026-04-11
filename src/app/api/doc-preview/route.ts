import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phoneNumber = searchParams.get("phone_number");

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: "phone_number is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch doc mapping for this phone number
    const { data: mapping, error: mappingError } = await supabaseAdmin
      .from("google_doc_mappings")
      .select("doc_id, doc_name, last_synced_at, last_chunk_count")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (mappingError || !mapping) {
      return NextResponse.json({
        success: true,
        connected: false,
        message: "No Google Doc connected",
        chunks: [],
        total: 0,
        last_synced_at: null
      });
    }

    // 2️⃣ Get first 20 chunks for preview
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from("chunks")
      .select("content")
      .eq("phone_number", phoneNumber)
      .eq("source", "google_doc")
      .order("id")
      .limit(20);

    if (chunksError) {
      console.error("Error fetching chunks:", chunksError);
      return NextResponse.json(
        { error: "Failed to fetch doc data" },
        { status: 500 }
      );
    }

    const { count: totalCount, error: countError } = await supabaseAdmin
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .eq("phone_number", phoneNumber)
      .eq("source", "google_doc");

    if (countError) {
      console.error("Error counting doc chunks:", countError);
      return NextResponse.json(
        { error: "Failed to count doc chunks" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      connected: true,
      docId: mapping.doc_id,
      docName: mapping.doc_name,
      chunks: chunks || [],
      total: totalCount || 0,
      last_synced_at: mapping.last_synced_at,
      last_chunk_count: mapping.last_chunk_count || 0,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}