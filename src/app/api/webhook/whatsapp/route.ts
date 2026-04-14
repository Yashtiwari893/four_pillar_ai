import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";
// import speech from "@google-cloud/speech";

import { sendWhatsAppMessage, sendWhatsAppTemplate } from "@/lib/whatsappSender";

// Import our Mistral STT function
import { transcribeAudio, TranscriptionResult } from "../../stt/mistral/route";

// Type definition for WhatsApp webhook payload
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

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Initialize Google Speech client
// const speechClient = new speech.SpeechClient({
//     credentials: {
//         client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
//         private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
//     },
// });

// Function to transcribe voice message to text using Mistral STT
async function transcribeVoiceMessage(mediaUrl: string): Promise<{ text: string; result: TranscriptionResult } | null> {
    try {
        console.log("Downloading audio from:", mediaUrl);

        // Download the audio file
        const response = await fetch(mediaUrl);
        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.status}`);
        }

        const audioBuffer = await response.arrayBuffer();
        console.log("Audio file size:", audioBuffer.byteLength, "bytes");

        console.log("Sending to Mistral Speech-to-Text API for transcription");

        // Use the imported transcribeAudio function
        const result = await transcribeAudio(audioBuffer, 'voice-message.ogg');

        const transcription = result.cleanedTranscript || result.rawTranscript;

        if (!transcription) {
            console.log("No transcription returned from Mistral STT API");
            return null;
        }

        console.log("Transcription successful:", transcription.substring(0, 100) + (transcription.length > 100 ? "..." : ""));
        console.log("Detected language:", result.language || 'unknown');

        return { text: transcription, result };
    } catch (error) {
        console.error("Voice transcription failed:", error);
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const payload: WhatsAppWebhookPayload = await req.json();

        console.log("Received WhatsApp webhook:", payload);

        // Validate required fields
        if (!payload.messageId || !payload.from || !payload.to) {
            return NextResponse.json(
                { error: "Missing required fields: messageId, from, or to" },
                { status: 400 }
            );
        }

        const { data: existingMessage, error: existingError } = await supabaseAdmin
            .from("whatsapp_messages")
            .select("message_id, auto_respond_sent")
            .eq("message_id", payload.messageId)
            .maybeSingle();

        if (existingError) {
            console.error("Database lookup error:", existingError);
            throw existingError;
        }

        const alreadyResponded = Boolean(existingMessage?.auto_respond_sent);
        if (alreadyResponded) {
            console.log("Skipping duplicate webhook - response already sent for message:", payload.messageId);
            return NextResponse.json({
                success: true,
                message: "Duplicate webhook ignored",
                duplicate: true,
                messageId: payload.messageId,
            });
        }

        const messagePayload = {
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
        };

        if (existingMessage) {
            const { error: updateError } = await supabaseAdmin
                .from("whatsapp_messages")
                .update(messagePayload)
                .eq("message_id", payload.messageId);

            if (updateError) {
                console.error("Database update error:", updateError);
                throw updateError;
            }
        } else {
            const { error: insertError } = await supabaseAdmin
                .from("whatsapp_messages")
                .insert(messagePayload);

            if (insertError) {
                console.error("Database insert error:", insertError);
                throw insertError;
            }
        }

        // Determine message text - handle both text and voice messages
        let messageText = payload.content?.text || payload.UserResponse;
        // Accept both 'audio' (some providers) and 'voice' (WhatsApp voice note) as voice messages
        const isVoiceMessage = payload.content?.contentType === "media" &&
            (payload.content?.media?.type === "audio" || payload.content?.media?.type === "voice");

        console.log("Message analysis:", {
            contentType: payload.content?.contentType,
            mediaType: payload.content?.media?.type,
            hasMediaUrl: !!payload.content?.media?.url,
            isVoiceMessage,
            alreadyResponded,
            event: payload.event
        });

        // Helper: send a one-time fallback only when voice transcription fails.
        async function sendFallbackForVoice() {
            try {
                // Get auth credentials for this business number
                const { data: mapping } = await supabaseAdmin
                    .from("phone_document_mapping")
                    .select("*")
                    .eq("phone_number", payload.to)
                    .maybeSingle();

                const authToken = mapping?.auth_token;
                const origin = mapping?.origin;

                // Mark original message as responded
                await supabaseAdmin
                    .from("whatsapp_messages")
                    .update({
                        auto_respond_sent: true,
                        response_sent_at: new Date().toISOString()
                    })
                    .eq("message_id", payload.messageId);

                if (authToken && origin) {
                    await sendWhatsAppMessage(
                        payload.from,
                        "I could not transcribe your voice note this time. Please resend it as text.",
                        authToken,
                        origin
                    );
                }

            } catch (err) {
                console.error("Error sending fallback for voice message:", err);
            }
        }

        if (isVoiceMessage && payload.content?.media?.url && !alreadyResponded) {
            console.log("Voice message detected, transcribing...");
            const transcriptionResult = await transcribeVoiceMessage(payload.content.media.url);
            if (transcriptionResult) {
                messageText = transcriptionResult.text;
                console.log("Using transcribed text for auto-response");

                // Update the database with transcribed text and transcription details
                await supabaseAdmin
                    .from("whatsapp_messages")
                    .update({
                        content_text: messageText,
                        raw_transcript: transcriptionResult.result.rawTranscript,
                        transcript_language: transcriptionResult.result.language,
                        transcript_method: 'mistral-stt'
                    })
                    .eq("message_id", payload.messageId);
            } else {
                console.log("Transcription failed, sending fallback reply for voice message");
                // Send fallback (text or template depending on 24h window)
                await sendFallbackForVoice();
                // Ensure we don't further process this message
                messageText = undefined;
            }
        }

        // Trigger auto-response for all user messages (text or transcribed voice)
        if (messageText && payload.event === "MoMessage" && !alreadyResponded) {
            console.log("Processing auto-response for message:", payload.messageId);
            console.log("Message will be 24-hour window processed:", true);

            const autoRespondUrl = new URL("/api/whatsapp/auto-respond", req.url);
            const internalToken = process.env.INTERNAL_WEBHOOK_TOKEN;
            void fetch(autoRespondUrl.toString(), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(internalToken ? { "x-internal-webhook-token": internalToken } : {}),
                },
                body: JSON.stringify({
                    from_number: payload.from,
                    to_number: payload.to,
                    message: messageText,
                    message_id: payload.messageId,
                    sender_name: payload.whatsapp?.senderName,
                }),
            }).catch((enqueueError) => {
                console.error("Failed to enqueue auto-response:", enqueueError);
            });
        } else if (alreadyResponded) {
            console.log("Skipping auto-response - already sent for message:", payload.messageId);
        }

        return NextResponse.json({
            success: true,
            message: "WhatsApp message received and stored",
            data: { message_id: payload.messageId },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("WEBHOOK_ERROR:", message, err);
        return NextResponse.json(
            { error: message, details: err },
            { status: 500 }
        );
    }
}

// Optional: Add GET endpoint for webhook verification (some services require this)
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    // Verify token (set this in your environment variables)
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "your_verify_token";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verified successfully");
        return new Response(challenge, { status: 200 });
    }

    return NextResponse.json(
        { error: "Verification failed" },
        { status: 403 }
    );
}
