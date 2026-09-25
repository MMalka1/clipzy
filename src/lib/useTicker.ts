"use client";

import { useEffect, useState } from "react";

/** Счётчик, который растёт каждые `ms` миллисекунд. При reduced-motion стоит на месте. */
export function useTicker(ms: number, enabled = true) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);

  return tick;
}
