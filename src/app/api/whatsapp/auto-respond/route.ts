import { NextResponse } from "next/server";
import { generateAutoResponse } from "@/lib/autoResponder";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Manual endpoint to generate auto-response
 * Useful for testing without triggering the webhook
 */
export async function POST(req: Request) {
    try {
        const requiredInternalToken = process.env.INTERNAL_WEBHOOK_TOKEN;
        const providedInternalToken = req.headers.get("x-internal-webhook-token");
        if (requiredInternalToken && providedInternalToken !== requiredInternalToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { from_number, to_number, message, message_id } = body;

        if (!from_number || !to_number || !message) {
            return NextResponse.json(
                { error: "from_number, to_number, and message are required" },
                { status: 400 }
            );
        }

        if (message_id) {
            const { data: inbound, error: inboundError } = await supabaseAdmin
                .from("whatsapp_messages")
                .select("message_id, auto_respond_sent")
                .eq("message_id", message_id)
                .maybeSingle();

            if (inboundError) {
                console.error("AUTO_RESPOND_INBOUND_LOOKUP_ERROR:", inboundError);
            }

            if (inbound?.auto_respond_sent) {
                return NextResponse.json({
                    success: true,
                    duplicate: true,
                    message: "Response already sent for this message",
                });
            }

            const { data: existingOutbound, error: outboundError } = await supabaseAdmin
                .from("whatsapp_messages")
                .select("message_id")
                .eq("event_type", "MtMessage")
                .contains("raw_payload", { source_message_id: message_id })
                .limit(1)
                .maybeSingle();

            if (outboundError) {
                console.error("AUTO_RESPOND_OUTBOUND_LOOKUP_ERROR:", outboundError);
            }

            if (existingOutbound) {
                await supabaseAdmin
                    .from("whatsapp_messages")
                    .update({
                        auto_respond_sent: true,
                        response_sent_at: new Date().toISOString(),
                    })
                    .eq("message_id", message_id);

                return NextResponse.json({
                    success: true,
                    duplicate: true,
                    message: "Duplicate auto-response skipped",
                });
            }
        }

        const result = await generateAutoResponse(
            from_number,
            to_number,
            message,
            message_id || `manual-${Date.now()}`
        );

        if (!result.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: result.error,
                    noDocuments: result.noDocuments,
                },
                { status: result.noDocuments ? 404 : 500 }
            );
        }

        return NextResponse.json({
            success: true,
            response: result.response,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("AUTO_RESPOND_ERROR:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
