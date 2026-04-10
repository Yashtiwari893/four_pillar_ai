"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const { data } = await supabaseBrowser.auth.getSession();
    const session = data.session;

    const headers = new Headers(init?.headers || {});

    // Public mode: attach token only when available.
    if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
    }

    return fetch(input, {
        ...init,
        headers,
    });
}
