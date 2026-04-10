"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void supabaseBrowser.auth.getSession().then(({ data }) => {
            if (data.session) {
                router.replace("/");
            }
        });
    }, [router]);

    async function handleSignUp(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        const { error: signUpError } = await supabaseBrowser.auth.signUp({
            email,
            password,
        });

        setIsLoading(false);
        if (signUpError) {
            setError(signUpError.message);
            return;
        }

        router.replace("/");
    }

    async function handleSignIn(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({
            email,
            password,
        });

        setIsLoading(false);
        if (signInError) {
            setError(signInError.message);
            return;
        }

        router.replace("/");
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(120%_120%_at_100%_0%,#d6e8ff_0%,#f7fbff_50%,#f6f8fc_100%)] px-4 py-10">
            <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="mb-6 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white">
                        <Bot size={18} />
                    </div>
                    <div>
                        <p className="text-base font-semibold">11za RAG AI</p>
                        <p className="text-xs text-slate-500">Create your isolated workspace</p>
                    </div>
                </div>

                <form className="space-y-4" onSubmit={handleSignIn}>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="you@company.com"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="Minimum 6 characters"
                        />
                    </div>

                    {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

                    <div className="flex gap-2">
                        <Button type="submit" disabled={isLoading} className="flex-1">Sign in</Button>
                        <Button type="button" variant="outline" disabled={isLoading} className="flex-1" onClick={handleSignUp}>
                            Sign up
                        </Button>
                    </div>
                </form>
            </div>
        </main>
    );
}
