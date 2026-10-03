"use client";

import { useState } from "react";

/**
 * Заставка-логотип «clip → clipzy» на бумаге: крутится, пока движок работает, чтобы ожидание не выглядело зависанием.
 * wide — 16:9 (экран обработки), tall — 9:16 (сборка клипа). Кто просил меньше движения — видит готовый логотип.
 * Появляется только после действия в редакторе (не на сервере), поэтому matchMedia можно читать сразу.
 */
export default function LogoSting({ variant, className = "" }: { variant: "wide" | "tall"; className?: string }) {
  const [still] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  return (
    <video
      src={`/demo/logo-${variant}.mp4`}
      poster={`/demo/logo-${variant}.jpg`}
      muted
      loop
      playsInline
      autoPlay={!still}
      preload={still ? "none" : "auto"}
      aria-hidden="true"
      className={`pointer-events-none bg-[#e7dfd3] object-cover ${className}`}
    />
  );
}
