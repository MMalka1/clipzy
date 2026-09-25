"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/client";

/** Запомнить выбор на год; <html lang> — сразу, чтобы движок и подсказки взяли новый язык. */
function saveLocale(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = l;
}

/** Переключатель RU / EN: запоминает выбор на год и перерисовывает страницу без перезагрузки. */
/** compact — одна кнопка с текущим языком (для узкой шапки на телефоне): нажали — переключили. */
export default function LangSwitch({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(l: Locale) {
    if (l === locale) return;
    saveLocale(l);
    start(() => router.refresh());
  }

  if (compact) {
    const next = LOCALES.find((l) => l !== locale)!;
    return (
      <button
        type="button"
        onClick={() => choose(next)}
        aria-label={locale === "ru" ? "Switch to English" : "Переключить на русский"}
        className={`flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong font-mono text-[11px] uppercase text-dim transition-colors hover:text-fg ${
          pending ? "opacity-60" : ""
        } ${className}`}
      >
        {locale}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={locale === "ru" ? "Язык сайта" : "Site language"}
      className={`inline-flex shrink-0 items-center rounded-full border border-line-strong p-0.5 font-mono text-[11px] ${
        pending ? "opacity-60" : ""
      } ${className}`}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === locale}
          lang={l}
          onClick={() => choose(l)}
          className={`h-6 cursor-pointer rounded-full px-2 uppercase transition-colors ${
            l === locale ? "bg-fg text-ink" : "text-dim hover:text-fg"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
