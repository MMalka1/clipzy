import type { Metadata } from "next";
import Link from "next/link";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import growth from "@/i18n/dict/growth";
import { getLocale } from "@/i18n/server";

export const metadata: Metadata = { title: "Оплата — Clipzy", robots: { index: false } };

/** Сюда Platega возвращает, если оплата не прошла. */
export default async function PayFail() {
  const t = growth[await getLocale()].pay;
  return (
    <main className="paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <LangSwitch />
      </header>
      <div className="mx-auto w-full max-w-xl flex-1 px-5 pt-10">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.03em]">{t.failTitle}</h1>
        <p className="mt-4 text-[18px] leading-relaxed text-dim">{t.failText}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/#pricing" className="inline-flex h-12 items-center rounded-xl bg-signal px-6 font-bold text-[#17140f] shadow-[0_3px_0_#17140f]">
            {t.retry}
          </Link>
          <Link href="/support" className="inline-flex h-12 items-center rounded-xl border-2 border-fg px-6 font-semibold">
            {t.support}
          </Link>
        </div>
      </div>
    </main>
  );
}
