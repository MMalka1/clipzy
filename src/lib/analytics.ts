/**
 * Цели воронки: в Яндекс Метрику (если счётчик подключён) и в свою таблицу событий — её показывает /admin.
 * Регистрации и промокоды сервер записывает сам (хук Better Auth), здесь — то, что видно только в браузере.
 */
export const GOALS = ["upload", "processed", "export", "download", "waitlist", "pricing"] as const;
export type Goal = (typeof GOALS)[number];

export const isGoal = (v: unknown): v is Goal => GOALS.includes(v as Goal);

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

/** Номер счётчика Метрики или 0, если она не подключена. */
export const YM_ID = /^\d+$/.test(process.env.NEXT_PUBLIC_YM_ID ?? "") ? Number(process.env.NEXT_PUBLIC_YM_ID) : 0;

/** Отметить цель. Никогда не бросает ошибку: статистика не должна мешать работе. */
export function track(name: Goal) {
  if (typeof window === "undefined") return;
  try {
    if (YM_ID && window.ym) window.ym(YM_ID, "reachGoal", name);
  } catch {
    // Метрика заблокирована или ещё не загрузилась
  }
  try {
    const body = JSON.stringify({ name });
    // sendBeacon доходит, даже если человек сразу уходит со страницы (например, по ссылке «Скачать»)
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    // без статистики — так без статистики
  }
}
