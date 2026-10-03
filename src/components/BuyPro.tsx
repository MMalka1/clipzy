"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/client";
import growth from "@/i18n/dict/growth";

/**
 * Кнопка покупки Pro. Не вошли — ведём на вход и возвращаем сюда с ?buy=pro, тогда оплата открывается сама.
 * Ссылку на оплату даёт сервер (/api/pay) — ключи Platega в браузер не попадают.
 */
export default function BuyPro({ className = "" }: { className?: string }) {
  const t = growth[useLocale()].pay;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const auto = useRef(false);

  async function buy() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: "pro" }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/?buy=pro#pricing")}`);
        return;
      }
      if (!res.ok || !data?.url) throw new Error(data?.error || t.failed);
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
      setBusy(false);
    }
  }

  // Вернулись после входа с ?buy=pro — сразу открываем оплату (один раз)
  useEffect(() => {
    if (auto.current || new URLSearchParams(window.location.search).get("buy") !== "pro") return;
    auto.current = true;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    buy(); // вернулись со входа — запускаем оплату один раз
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className="inline-flex h-14 cursor-pointer items-center justify-center rounded-xl bg-signal px-7 text-[17px] font-bold text-[#17140f] shadow-[0_3px_0_#17140f] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? t.going : t.buy}
      </button>
      <p className="text-center text-sm text-dim">{t.note}</p>
      {error && (
        <p role="alert" className="text-center text-sm text-rec">
          {error}
        </p>
      )}
    </div>
  );
}
