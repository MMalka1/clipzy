"use client";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/i18n/client";
import landing from "@/i18n/dict/landing";

export default function WaitlistForm({ tone = "dark" }: { tone?: "dark" | "accent" }) {
  const t = landing[useLocale()].waitlist;
  const accent = tone === "accent";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.failed);
      setState("ok");
      setMessage(data.already ? t.already : t.added);
      setEmail("");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : t.failed);
    }
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={submit} className={`flex h-13 rounded-xl p-1 ${
          accent ? "bg-ink text-fg shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)]" : "border border-line-strong bg-panel focus-within:border-dim"
        }`}>
        <label htmlFor="wl-email" className="sr-only">
          {t.emailLabel}
        </label>
        <input
          id="wl-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.placeholder}
          className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-faint"
        />
        <button
          disabled={state === "loading"}
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60 ${
            accent ? "bg-[#0b0b0b] text-signal" : "bg-fg text-ink"
          }`}
        >
          {state === "loading" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <>
              {t.submit} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </form>
      <p
        role="status"
        className={`mt-3 flex min-h-5 items-center gap-1.5 text-sm ${
          state === "error" ? (accent ? "font-medium text-[#b3261e]" : "text-rec") : accent ? "text-ink/70" : "text-dim"
        }`}
      >
        {state === "ok" && <Check className={`h-4 w-4 ${accent ? "text-ink" : "text-signal"}`} aria-hidden="true" />}
        {message}
      </p>
    </div>
  );
}
