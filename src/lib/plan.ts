/**
 * Тариф с учётом срока. Пробный Pro по промокоду действует до planUntil, после — снова free.
 * creator не истекает никогда; план без planUntil (например, оплаченный без срока) — тоже.
 */
export type PlanUser = { plan?: string | null; planUntil?: Date | string | null };

/** Срок плана вышел, а в базе он ещё записан. */
export function planExpired(user: PlanUser) {
  if (!user.plan || user.plan === "free" || user.plan === "creator" || !user.planUntil) return false;
  const until = new Date(user.planUntil).getTime();
  return Number.isFinite(until) && until <= Date.now();
}

/** План, по которому считаем лимиты и водяной знак. */
export function effectivePlan(user: PlanUser) {
  return planExpired(user) ? "free" : user.plan || "free";
}
