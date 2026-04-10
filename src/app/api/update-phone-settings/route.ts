import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getUserFromRequest } from "@/lib/authServer";

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
        let existingMappingsQuery = supabase
            .from("phone_document_mapping")
            .select("*")
            .eq("phone_number", phone_number);

        if (user) {
            existingMappingsQuery = existingMappingsQuery.eq("user_id", user.id);
        }

        const { data: existingMappings } = await existingMappingsQuery;

        if (!existingMappings || existingMappings.length === 0) {
            return NextResponse.json(
                { error: "Phone number not found" },
                { status: 404 }
            );
        }

        // Update all mappings for this phone number
        const updateData: Record<string, string | null> = {};
        if (intent !== undefined) updateData.intent = intent;
        if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
        if (auth_token !== undefined) updateData.auth_token = auth_token;
        if (origin !== undefined) updateData.origin = origin;
        if (gemini_api_key !== undefined) updateData.gemini_api_key = gemini_api_key;
        if (groq_api_key !== undefined) updateData.groq_api_key = groq_api_key;
        if (mistral_api_key !== undefined) updateData.mistral_api_key = mistral_api_key;

        let updateMappingsQuery = supabase
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
            const fileIds = existingMappings
                .map(m => m.file_id)
                .filter(id => id !== null);

            if (fileIds.length > 0) {
                const updateFileData: Record<string, string | null> = {};
                if (auth_token !== undefined) updateFileData.auth_token = auth_token;
                if (origin !== undefined) updateFileData.origin = origin;

                let updateFilesQuery = supabase
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
