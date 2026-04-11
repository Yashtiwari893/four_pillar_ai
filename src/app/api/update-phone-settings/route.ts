import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/authServer";
import { randomBytes, randomUUID } from "crypto";

export async function POST(req: NextRequest) {
    try {
        const user = await getUserFromRequest(req);

        const body = await req.json();
        const { phone_number, intent, system_prompt, auth_token, origin, gemini_api_key, groq_api_key, mistral_api_key } = body;

        if (!phone_number) {
            return NextResponse.json(
                { error: "Phone number is required" },
                { status: 400 }
            );
        }

        console.log("Updating phone settings for:", phone_number);

        // Check if phone number has any mappings
        let existingMappingsQuery = supabaseAdmin
            .from("phone_document_mapping")
            .select("*")
            .eq("phone_number", phone_number);

        if (user) {
            existingMappingsQuery = existingMappingsQuery.eq("user_id", user.id);
        }

        const { data: existingMappings } = await existingMappingsQuery;

        let mappings = existingMappings || [];

        // If mapping doesn't exist yet, create it so settings can be saved in one step.
        if (mappings.length === 0) {
            const webhookId = randomUUID();
            const webhookSecret = randomBytes(16).toString("hex");
            const { data: insertedMapping, error: insertError } = await supabaseAdmin
                .from("phone_document_mapping")
                .insert({
                    phone_number,
                    webhook_id: webhookId,
                    webhook_secret: webhookSecret,
                    webhook_enabled: true,
                    ...(user ? { user_id: user.id } : {}),
                })
                .select("*")
                .single();

            if (insertError) {
                console.error("Error creating phone_document_mapping:", insertError);
                throw insertError;
            }

            mappings = insertedMapping ? [insertedMapping] : [];
        }

        // Update all mappings for this phone number
        const updateData: Record<string, string | boolean | null> = {};
        if (intent !== undefined) updateData.intent = intent;
        if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
        if (auth_token !== undefined) updateData.auth_token = auth_token;
        if (origin !== undefined) updateData.origin = origin;
        if (gemini_api_key !== undefined) updateData.gemini_api_key = gemini_api_key;
        if (groq_api_key !== undefined) updateData.groq_api_key = groq_api_key;
        if (mistral_api_key !== undefined) updateData.mistral_api_key = mistral_api_key;

        if (mappings.some((m) => !m.webhook_id)) {
            updateData.webhook_id = randomUUID();
        }
        if (mappings.some((m) => !m.webhook_secret)) {
            updateData.webhook_secret = randomBytes(16).toString("hex");
        }
        if (mappings.some((m) => m.webhook_enabled === null || m.webhook_enabled === undefined)) {
            updateData.webhook_enabled = true;
        }

        let updateMappingsQuery = supabaseAdmin
            .from("phone_document_mapping")
            .update(updateData)
            .eq("phone_number", phone_number);

        if (user) {
            updateMappingsQuery = updateMappingsQuery.eq("user_id", user.id);
        }

        const { error: updateMappingError } = await updateMappingsQuery;

        if (updateMappingError) {
            console.error("Error updating phone_document_mapping:", updateMappingError);
            throw updateMappingError;
        }

        // Also update credentials in all associated files for consistency
        if (auth_token !== undefined || origin !== undefined) {
            const fileIds = mappings
                .map(m => m.file_id)
                .filter(id => id !== null);

            if (fileIds.length > 0) {
                const updateFileData: Record<string, string | null> = {};
                if (auth_token !== undefined) updateFileData.auth_token = auth_token;
                if (origin !== undefined) updateFileData.origin = origin;

                let updateFilesQuery = supabaseAdmin
                    .from("rag_files")
                    .update(updateFileData)
                    .in("id", fileIds);

                if (user) {
                    updateFilesQuery = updateFilesQuery.eq("user_id", user.id);
                }

                const { error: updateFileError } = await updateFilesQuery;

                if (updateFileError) {
                    console.error("Error updating rag_files:", updateFileError);
                    throw updateFileError;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: "Phone settings updated successfully",
        });

    } catch (error) {
        console.error("Update phone settings error:", error);

        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Failed to update phone settings",
            },
            { status: 500 }
        );
    }
}
