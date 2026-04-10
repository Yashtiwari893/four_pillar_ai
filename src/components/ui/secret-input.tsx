"use client";

import { InputHTMLAttributes, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

type SecretInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    autoHideMs?: number;
};

export function SecretInput({
    className,
    autoHideMs = 15000,
    disabled,
    ...props
}: SecretInputProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (!isVisible || autoHideMs <= 0) return;

        const timer = window.setTimeout(() => {
            setIsVisible(false);
        }, autoHideMs);

        return () => window.clearTimeout(timer);
    }, [isVisible, autoHideMs]);

    const tooltipText = useMemo(
        () => (isVisible ? "Hide API Key" : "Show API Key"),
        [isVisible]
    );

    return (
        <div className="relative">
            <input
                {...props}
                disabled={disabled}
                type={isVisible ? "text" : "password"}
                className={cn(
                    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-11 text-sm outline-none focus:border-slate-400 disabled:opacity-60",
                    className
                )}
            />
            <button
                type="button"
                title={tooltipText}
                aria-label={tooltipText}
                disabled={disabled}
                onClick={() => setIsVisible((prev) => !prev)}
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
    );
}
