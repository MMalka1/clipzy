"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/client";
import supportDict from "@/i18n/dict/support";

/**
 * Документы и поддержка — на каждой странице, где нет большого подвала (вход, редактор, профиль).
 * Платёжный провайдер требует, чтобы соглашение и политика были доступны постоянно.
 */
export default function LegalLinks({ className = "" }: { className?: string }) {
  const t = supportDict[useLocale()].footer;
  return (
    <nav aria-label={t.docs} className={`flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-dim ${className}`}>
      <Link href="/terms" className="hover:text-fg hover:underline">
        {t.terms}
      </Link>
      <Link href="/privacy" className="hover:text-fg hover:underline">
        {t.privacy}
      </Link>
      <Link href="/support" className="hover:text-fg hover:underline">
        {t.support}
      </Link>
    </nav>
  );
}
