"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/** Запоминает метки рекламы и промокод из адреса (см. lib/attribution.ts). Ничего не рисует. */
export default function Attribution() {
  useEffect(() => {
    try {
      captureAttribution();
    } catch {
      // cookie запрещены — сайт работает и без меток
    }
  }, []);
  return null;
}
