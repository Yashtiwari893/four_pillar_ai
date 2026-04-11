import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readGoogleDoc } from "@/lib/googleDoc";
import { embedText, embedBatch } from "@/lib/embeddings";
import { chunkText } from "@/lib/chunk";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { phone_number } = body as { phone_number?: string };
    if (!phone_number) {
      return NextResponse.json({ error: "phone_number is required" }, { status: 400 });
    }

    const { data: docMapping, error: mappingError } = await supabaseAdmin
      .from("google_doc_mappings")
      .select("*")
      .eq("phone_number", phone_number)
      .maybeSingle();

    if (mappingError) {
      console.error("Database error fetching doc mapping:", mappingError);
      return NextResponse.json({ error: "Database error while fetching doc mapping" }, { status: 500 });
    }

    if (!docMapping) {
      return NextResponse.json({ error: "No Google Doc configured for this number" }, { status: 404 });
    }

    const { data: phoneMapping } = await supabaseAdmin
      .from("phone_document_mapping")
      .select("mistral_api_key")
      .eq("phone_number", phone_number)
      .maybeSingle();

    const mistralKey = phoneMapping?.mistral_api_key;

    if (!docMapping.doc_id) {
      return NextResponse.json({ error: "Invalid doc mapping - missing doc_id" }, { status: 400 });
    }

    console.log(`Reading Google Doc: ${docMapping.doc_id}`);

    let docText: string;
    try {
      docText = await readGoogleDoc(docMapping.doc_id);
    } catch (docError: any) {
      console.error("Google Docs read error:", docError);

      if (docError?.code === 403 || docError?.status === 403) {
        return NextResponse.json(
          { error: "Google Doc access denied. Please share the doc with the service account email." },
          { status: 403 }
        );
      }

      if (docError?.code === 404 || docError?.status === 404) {
        return NextResponse.json(
          { error: "Google Doc not found. Please check the doc URL." },
          { status: 404 }
        );
      }

      return NextResponse.json({ error: "Failed to read Google Doc" }, { status: 500 });
    }

    if (!docText) {
      return NextResponse.json({
        totalChunks: 0,
        newChunks: 0,
        deletedChunks: 0,
        updatedChunks: 0,
        message: "No content found in the document",
      });
    }

    const chunks = chunkText(docText, 1600, 200);
    console.log(`Document chunked into ${chunks.length} chunks`);

    const currentDocHashes = new Set<string>();
    const chunkData: Array<{ hash: string; content: string }> = [];

    for (const chunk of chunks) {
      const hash = createHash("sha256").update(chunk).digest("hex");
      currentDocHashes.add(hash);
      chunkData.push({ hash, content: chunk });
    }

    console.log(`Found ${chunkData.length} chunks in doc`);

    const { data: existingData, error: existingError } = await supabaseAdmin
      .from("chunks")
      .select("id, row_hash, content")
      .eq("phone_number", phone_number)
      .eq("source", "google_doc");

    if (existingError) {
      console.error("Error fetching existing chunks:", existingError);
      return NextResponse.json({ error: "Failed to fetch existing chunks" }, { status: 500 });
    }

    const existingChunks = (existingData || []) as Array<{ id: string; row_hash: string; content: string }>;
    const existingHashes = new Set(existingChunks.map((chunk) => chunk.row_hash));
    const existingHashToChunk = new Map(existingChunks.map((chunk) => [chunk.row_hash, chunk]));

    const toAdd = chunkData.filter((chunk) => !existingHashes.has(chunk.hash));
    const toDelete = existingChunks.filter((chunk) => !currentDocHashes.has(chunk.row_hash));
    const toUpdate = chunkData.filter((chunk) => {
      const existing = existingHashToChunk.get(chunk.hash);
      return Boolean(existing && existing.content !== chunk.content);
    });

    console.log(`To add: ${toAdd.length}, to delete: ${toDelete.length}, to update: ${toUpdate.length}`);

    let added = 0;
    let deleted = 0;
    let updated = 0;

    if (toDelete.length > 0) {
      const deleteIds = toDelete.map((chunk) => chunk.id);
      const { error: deleteError } = await supabaseAdmin
        .from("chunks")
        .delete()
        .in("id", deleteIds);

      if (deleteError) {
        console.error("Error deleting chunks:", deleteError);
        return NextResponse.json({ error: "Failed to delete old chunks" }, { status: 500 });
      }

      deleted = toDelete.length;
      console.log(`Deleted ${deleted} old chunks`);
    }

    if (toAdd.length > 0) {
      try {
        const batchSize = 50;
        const batchDelayMs = 2000;

        for (let i = 0; i < toAdd.length; i += batchSize) {
          const batch = toAdd.slice(i, i + batchSize);
          const embeddings = await embedBatch(batch.map((chunk) => chunk.content), 3, mistralKey);

          const chunksToInsert = batch.map((chunk, index) => ({
            phone_number,
            content: chunk.content,
            embedding: embeddings[index],
            source: "google_doc",
            row_hash: chunk.hash,
          }));

          const { error: insertError } = await supabaseAdmin
            .from("chunks")
            .insert(chunksToInsert);

          if (insertError) {
            console.error("Error inserting chunk batch:", insertError);
            return NextResponse.json({ error: "Failed to insert new chunks" }, { status: 500 });
          }

          added += batch.length;

          if (i + batchSize < toAdd.length) {
            await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
          }
        }

        console.log(`Added ${added} new chunks`);
      } catch (error) {
        console.error("Database error during addition:", error);
        return NextResponse.json({ error: "Database error during addition" }, { status: 500 });
      }
    }

    if (toUpdate.length > 0) {
      try {
        for (const chunk of toUpdate) {
          const embedding = await embedText(chunk.content, 3, mistralKey);
          const existing = existingHashToChunk.get(chunk.hash);
          if (!existing) continue;

          const { error: updateError } = await supabaseAdmin
            .from("chunks")
            .update({
              content: chunk.content,
              embedding,
            })
            .eq("id", existing.id);

          if (updateError) {
            console.error("Error updating chunk:", updateError);
            return NextResponse.json({ error: "Failed to update chunk" }, { status: 500 });
          }

          updated++;
        }

        console.log(`Updated ${updated} chunks`);
      } catch (error) {
        console.error("Database error during update:", error);
        return NextResponse.json({ error: "Database error during update" }, { status: 500 });
      }
    }

    const { error: updateMappingError } = await supabaseAdmin
      .from("google_doc_mappings")
      .update({
        last_synced_at: new Date().toISOString(),
        last_chunk_count: chunkData.length,
      })
      .eq("phone_number", phone_number);

    if (updateMappingError) {
      console.error("Error updating doc mapping:", updateMappingError);
    }

    return NextResponse.json({
      totalChunks: chunkData.length,
      newChunks: added,
      deletedChunks: deleted,
      updatedChunks: updated,
      message: "Google Doc synced successfully",
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}