"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, LoaderCircle, Send } from "lucide-react";
import { useLocale } from "@/i18n/client";
import supportDict from "@/i18n/dict/support";

/** Форма обращения: номер обращения показываем сразу, ответ приходит на почту. */
export default function SupportForm({ defaultEmail }: { defaultEmail: string }) {
  const t = supportDict[useLocale()].support;
  const [email, setEmail] = useState(defaultEmail);
  const [topic, setTopic] = useState("help");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const [sentId, setSentId] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, topic, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t.failed);
      setSentId(data.id);
      setMessage("");
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
      setState("error");
    }
  }

  if (sentId !== null) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-line-strong bg-raised p-5" role="status">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal/20">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="pt-1 leading-relaxed">{t.sent(sentId)}</p>
      </div>
    );
  }

  const field = "w-full rounded-lg border border-line-strong bg-ink/0 px-3 py-2.5 text-[15px] outline-none focus:border-dim";
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="s-email" className="text-sm font-medium">
          {t.email}
        </label>
        <input
          id="s-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="s-email-hint"
          className={`mt-1.5 ${field}`}
        />
        <p id="s-email-hint" className="mt-1 text-xs text-faint">
          {t.emailHint}
        </p>
      </div>
      <div>
        <label htmlFor="s-topic" className="text-sm font-medium">
          {t.topic}
        </label>
        <select id="s-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={`mt-1.5 cursor-pointer ${field}`}>
          {Object.entries(t.topics).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {topic === "refund" && (
          <p className="mt-1.5 text-xs text-dim">
            {t.refundNote}{" "}
            <Link href="/terms" className="underline hover:text-fg">
              {t.refundLink}
            </Link>
            .
          </p>
        )}
      </div>
      <div>
        <label htmlFor="s-message" className="text-sm font-medium">
          {t.message}
        </label>
        <textarea
          id="s-message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.messageHint}
          className={`mt-1.5 resize-y ${field} placeholder:text-faint`}
        />
      </div>
      {error && (
        <p className="text-sm text-rec" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={state === "sending"}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-fg px-6 font-semibold text-ink transition-transform hover:-rotate-1 disabled:opacity-60"
      >
        {state === "sending" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="h-4 w-4" aria-hidden="true" />
        )}
        {state === "sending" ? t.sending : t.send}
      </button>
    </form>
  );
}
