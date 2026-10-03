"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Пока банк не подтвердил оплату — перечитываем страницу каждые 4 секунды (не дольше 3 минут). */
export default function Refresh() {
  const router = useRouter();
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      if (Date.now() - start > 180_000) clearInterval(id);
      else router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
