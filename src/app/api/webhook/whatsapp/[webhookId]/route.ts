import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAutoResponse } from "@/lib/autoResponder";
import { transcribeAudio, type TranscriptionResult } from "../../../stt/mistral/route";
import { sendWhatsAppMessage } from "@/lib/whatsappSender";

type WhatsAppWebhookPayload = {
    messageId: string;
    channel: string;
    from: string;
    to: string;
    receivedAt: string;
    content: {
        contentType: string;
        text?: string;
        media?: {
            type: string;
            url: string;
        };
    };
    whatsapp?: {
        senderName?: string;
    };
    timestamp: string;
    event: string;
    isin24window?: boolean;
    isResponded?: boolean;
    UserResponse?: string;
};

async function transcribeVoiceMessage(mediaUrl: string): Promise<{ text: string; result: TranscriptionResult } | null> {
    try {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.status}`);
        }

        const audioBuffer = await response.arrayBuffer();
        const result = await transcribeAudio(audioBuffer, "voice-message.ogg");
        const transcription = result.cleanedTranscript || result.rawTranscript;

        if (!transcription) {
            return null;
        }

        return { text: transcription, result };
    } catch (error) {
        console.error("Voice transcription failed:", error);
        return null;
    }
}

function getWebhookToken(req: Request) {
    const url = new URL(req.url);
    return req.headers.get("x-webhook-token") || req.headers.get("x-11za-webhook-token") || url.searchParams.get("token");
}

async function resolveWebhookMapping(webhookId: string) {
    const { data, error } = await supabaseAdmin
        .from("phone_document_mapping")
        .select("id, user_id, phone_number, auth_token, origin, webhook_secret, webhook_enabled, webhook_last_verified_at, webhook_last_received_at")
        .eq("webhook_id", webhookId)
        .maybeSingle();

    if (error || !data) {
        return { mapping: null, error };
    }

    return { mapping: data, error: null };
}

async function handleIncomingWebhook(req: Request, webhookId: string) {
    const payload: WhatsAppWebhookPayload = await req.json();

    if (!payload.messageId || !payload.from || !payload.to) {
        return NextResponse.json({ error: "Missing required fields: messageId, from, or to" }, { status: 400 });
    }

    const { mapping, error } = await resolveWebhookMapping(webhookId);
    if (error || !mapping) {
        return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    if (mapping.webhook_enabled === false) {
        return NextResponse.json({ error: "Webhook disabled" }, { status: 403 });
    }

    const providedToken = getWebhookToken(req);
    if (mapping.webhook_secret && providedToken !== mapping.webhook_secret) {
        return NextResponse.json({ error: "Invalid webhook token" }, { status: 401 });
    }

    if (payload.to !== mapping.phone_number) {
        return NextResponse.json({ error: "Webhook number mismatch" }, { status: 400 });
    }

    const { data, error: insertError } = await supabaseAdmin
        .from("whatsapp_messages")
        .upsert(
            {
                message_id: payload.messageId,
                channel: payload.channel,
                from_number: payload.from,
                to_number: payload.to,
                received_at: payload.receivedAt,
                content_type: payload.content?.contentType,
                content_text: payload.content?.text || payload.UserResponse,
                sender_name: payload.whatsapp?.senderName,
                event_type: payload.event,
                is_in_24_window: payload.isin24window || false,
                is_responded: payload.isResponded || false,
                raw_payload: payload,
                user_id: mapping.user_id,
            },
            { onConflict: "message_id", ignoreDuplicates: false }
        )
        .select();

    if (insertError) {
        throw insertError;
    }

    await supabaseAdmin
        .from("phone_document_mapping")
        .update({
            webhook_last_received_at: new Date().toISOString(),
        })
        .eq("webhook_id", webhookId);

    const existingMessage = data?.[0];
    const alreadyResponded = existingMessage?.auto_respond_sent;
    let messageText = payload.content?.text || payload.UserResponse;
    const isVoiceMessage = payload.content?.contentType === "media" &&
        (payload.content?.media?.type === "audio" || payload.content?.media?.type === "voice");

    if (isVoiceMessage && payload.content?.media?.url && !alreadyResponded) {
        const transcriptionResult = await transcribeVoiceMessage(payload.content.media.url);
        if (transcriptionResult) {
            messageText = transcriptionResult.text;
            await supabaseAdmin
                .from("whatsapp_messages")
                .update({
                    content_text: messageText,
                    raw_transcript: transcriptionResult.result.rawTranscript,
                    transcript_language: transcriptionResult.result.language,
                    transcript_method: "mistral-stt",
                })
                .eq("message_id", payload.messageId);
        } else {
            await supabaseAdmin
                .from("whatsapp_messages")
                .update({
                    auto_respond_sent: true,
                    response_sent_at: new Date().toISOString(),
                })
                .eq("message_id", payload.messageId);

            if (mapping.auth_token && mapping.origin) {
                await sendWhatsAppMessage(
                    payload.from,
                    "Hi! 👋 I received your voice note but could not transcribe it right now. Please resend as text or try again in a bit.",
                    mapping.auth_token,
                    mapping.origin
                );
            }

            return NextResponse.json({ success: true, message: "Voice transcription failed, fallback sent" });
        }
    }

    if (messageText && payload.event === "MoMessage" && !alreadyResponded) {
        const result = await generateAutoResponse(
            payload.from,
            payload.to,
            messageText,
            payload.messageId,
            payload.whatsapp?.senderName
        );

        if (result.success) {
            await supabaseAdmin
                .from("whatsapp_messages")
                .update({
                    auto_respond_sent: true,
                    response_sent_at: new Date().toISOString(),
                })
                .eq("message_id", payload.messageId);
        }
    }

    return NextResponse.json({ success: true, message: "Webhook processed", data: data?.[0] });
}

export async function POST(req: Request, { params }: { params: Promise<{ webhookId: string }> }) {
    try {
        const { webhookId } = await params;
        return await handleIncomingWebhook(req, webhookId);
    } catch (error) {
        console.error("WEBHOOK_DYNAMIC_ERROR:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function GET(req: Request, { params }: { params: Promise<{ webhookId: string }> }) {
    const { webhookId } = await params;
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token") || getWebhookToken(req);
    const challenge = searchParams.get("hub.challenge");

    const { mapping } = await resolveWebhookMapping(webhookId);
    if (!mapping) {
        return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    if (mode === "subscribe" && token && mapping.webhook_secret && token === mapping.webhook_secret) {
        await supabaseAdmin
            .from("phone_document_mapping")
            .update({ webhook_last_verified_at: new Date().toISOString() })
            .eq("webhook_id", webhookId);

        return new Response(challenge, { status: 200 });
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}
