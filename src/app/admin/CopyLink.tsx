"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Готовая ссылка для рекламы: поле (выделяется по фокусу) и кнопка «Копировать». */
export default function CopyLink({ label, url, copy, copied }: { label: string; url: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // буфер обмена недоступен — ссылку можно выделить в поле
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-faint">{label}</span>
      <input
        readOnly
        value={url}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border border-line bg-ink px-2.5 font-mono text-xs outline-none focus:border-dim"
      />
      <button
        type="button"
        onClick={copyUrl}
        aria-label={done ? copied : copy}
        title={done ? copied : copy}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-strong hover:bg-raised"
      >
        {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
