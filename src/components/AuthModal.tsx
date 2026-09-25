"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import auth from "@/i18n/dict/auth";
import AuthForm, { type Providers } from "./AuthForm";

/** Регистрация прямо в редакторе — чтобы не потерять открытый проект. */
export default function AuthModal({
  reason,
  onClose,
  onSuccess,
}: {
  reason: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [providers, setProviders] = useState<Providers | null>(null);
  const t = auth[useLocale()].modal;

  useEffect(() => {
    fetch("/api/auth-providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({ google: false, telegram: false, telegramBot: null }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.label}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-5 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line-strong bg-ink p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal/15">
            <Sparkles className="h-4 w-4 text-signal" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <p className="font-medium">{t.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-dim">{reason}</p>
          </div>
          <button onClick={onClose} aria-label={t.close} className="cursor-pointer text-faint hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </div>
        {providers && <AuthForm providers={providers} onSuccess={onSuccess} callbackURL="/app" />}
      </div>
    </div>
  );
}
