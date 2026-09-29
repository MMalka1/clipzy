"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useLocale } from "@/i18n/client";
import growth from "@/i18n/dict/growth";

const KEY = "cz_cookie_ok";
const listeners = new Set<() => void>();
let closed = false; // localStorage недоступен (приватный режим) — помним до перезагрузки

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function seen() {
  if (closed) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  closed = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // не сохранится — покажем снова после перезагрузки
  }
  listeners.forEach((l) => l());
}

/** Маленькое уведомление о cookie и Метрике. Показывается, только когда Метрика подключена. */
export default function CookieNotice() {
  const t = growth[useLocale()].cookies;
  // На сервере — «уже видел»: уведомление появляется только в браузере, без мигания при гидрации
  const hidden = useSyncExternalStore(subscribe, seen, () => true);
  if (hidden) return null;
  return (
    <div
      role="region"
      aria-label={t.label}
      className="fixed inset-x-3 bottom-3 z-[60] flex items-center gap-3 rounded-xl border border-line-strong bg-panel px-4 py-3 text-[13px] leading-snug text-dim shadow-2xl lg:right-auto lg:max-w-sm"
    >
      <p className="min-w-0 flex-1">
        {t.text}{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">
          {t.more}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="h-9 shrink-0 cursor-pointer rounded-lg bg-fg px-3 text-[13px] font-semibold text-ink transition-opacity hover:opacity-90"
      >
        {t.ok}
      </button>
    </div>
  );
}
