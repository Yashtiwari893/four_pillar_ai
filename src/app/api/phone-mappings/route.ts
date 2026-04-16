import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/authServer";

// GET: Retrieve phone-document mappings
export async function GET(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const { searchParams } = new URL(req.url);
        const phoneNumber = searchParams.get("phone_number");
        const fileId = searchParams.get("file_id");

        let query = supabaseAdmin
            .from("phone_document_view")
            .select("*")
            .order("created_at", { ascending: false });

        if (user) {
            query = query.or(`user_id.eq.${user.id},user_id.is.null`);
        }

        if (phoneNumber) {
            query = query.eq("phone_number", phoneNumber);
        }

        if (fileId) {
            query = query.eq("file_id", fileId);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            mappings: data,
            count: data?.length || 0,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("GET_MAPPINGS_ERROR:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST: Create new phone-document mapping
export async function POST(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const body = await req.json();
        const { phone_number, file_id } = body;

        if (!phone_number || !file_id) {
            return NextResponse.json(
                { error: "phone_number and file_id are required" },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
            .from("phone_document_mapping")
            .insert([{ phone_number, file_id, ...(user ? { user_id: user.id } : {}) }])
            .select();

        if (error) {
            // Handle duplicate constraint
            if (error.code === "23505") {
                return NextResponse.json(
                    { error: "This phone number is already mapped to this document" },
                    { status: 409 }
                );
            }
            throw error;
        }

        return NextResponse.json({
            success: true,
            mapping: data?.[0],
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("CREATE_MAPPING_ERROR:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// DELETE: Remove phone-document mapping
export async function DELETE(req: Request) {
    try {
        const user = await getUserFromRequest(req);

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const phoneNumber = searchParams.get("phone_number");

        if (!id && !phoneNumber) {
            return NextResponse.json(
                { error: "Mapping id or phone_number is required" },
                { status: 400 }
            );
        }

        let precheck = supabaseAdmin
            .from("phone_document_mapping")
            .select("id, phone_number")
            .limit(1);

        if (user) {
            precheck = precheck.or(`user_id.eq.${user.id},user_id.is.null`);
        }

        if (id) {
            precheck = precheck.eq("id", id);
        }

        if (phoneNumber) {
            precheck = precheck.eq("phone_number", phoneNumber);
        }

        const { data: existing, error: precheckError } = await precheck.maybeSingle();

        if (precheckError) {
            throw precheckError;
        }

        if (!existing) {
            return NextResponse.json(
                { error: "Bot profile not found" },
                { status: 404 }
            );
        }

        let deleteMappings = supabaseAdmin
            .from("phone_document_mapping")
            .delete();

        if (user) {
            deleteMappings = deleteMappings.or(`user_id.eq.${user.id},user_id.is.null`);
        }

        if (id) {
            deleteMappings = deleteMappings.eq("id", id);
        }

        if (phoneNumber) {
            deleteMappings = deleteMappings.eq("phone_number", phoneNumber);
        }

        const { error: mappingDeleteError } = await deleteMappings;
        if (mappingDeleteError) {
            throw mappingDeleteError;
        }

        // Keep integration tables in sync when deleting by phone profile.
        if (phoneNumber) {
            await supabaseAdmin
                .from("google_sheet_mappings")
                .delete()
                .eq("phone_number", phoneNumber);

            await supabaseAdmin
                .from("google_doc_mappings")
                .delete()
                .eq("phone_number", phoneNumber);

            await supabaseAdmin
                .from("chunks")
                .delete()
                .eq("phone_number", phoneNumber);
        }

        return NextResponse.json({
            success: true,
            message: "Bot profile deleted successfully",
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("DELETE_MAPPING_ERROR:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
