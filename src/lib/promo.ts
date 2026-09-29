import "server-only";
import { normalizeCode } from "./attribution";
import { type PromoCode, claimPromoCode, getPromoCode, recordEvent, releasePromoCode, setTrialPlan } from "./db";
import { type PlanUser, effectivePlan } from "./plan";

/**
 * Промокоды на пробный Pro. Активировать можно на свой аккаунт (не гостевой), если сейчас Free,
 * и только один промокод за всю жизнь аккаунта.
 */
export type PromoError = "anon" | "plan" | "already" | "unknown" | "expired" | "used";
export type Redeemed = { ok: true; plan: string; until: Date } | { ok: false; error: PromoError };

/** Что не так с кодом (null — действует). */
function problem(c: PromoCode | null): "unknown" | "expired" | "used" | null {
  if (!c) return "unknown";
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now()) return "expired";
  if (c.maxUses !== null && c.used >= c.maxUses) return "used";
  return null;
}

/** Для баннера: действует ли код и что даёт. Больше ничего наружу не отдаём. */
export async function promoInfo(raw: unknown): Promise<{ valid: boolean; days: number; plan: string | null }> {
  const code = normalizeCode(raw);
  const c = code ? await getPromoCode(code) : null;
  return c && !problem(c) ? { valid: true, days: c.days, plan: c.plan } : { valid: false, days: 0, plan: null };
}

export async function redeemPromo(
  user: PlanUser & { id: string; isAnonymous?: boolean | null; source?: string | null },
  raw: unknown,
): Promise<Redeemed> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, error: "unknown" };
  if (user.isAnonymous) return { ok: false, error: "anon" };
  if (effectivePlan(user) !== "free") return { ok: false, error: "plan" };
  const bad = problem(await getPromoCode(code));
  if (bad) return { ok: false, error: bad };

  const claim = await claimPromoCode(code, user.id);
  if (claim === "already") return { ok: false, error: "already" };
  if (claim === "gone") return { ok: false, error: problem(await getPromoCode(code)) ?? "used" };

  const until = new Date(Date.now() + claim.days * 86400_000);
  let set = false;
  try {
    set = await setTrialPlan(user.id, claim.plan, until);
  } finally {
    // План не включился (ошибка базы или план уже не free) — возвращаем активацию: код не должен сгореть зря
    if (!set) await releasePromoCode(code, user.id).catch((e) => console.error("[promo] не вернули активацию:", e));
  }
  if (!set) return { ok: false, error: "plan" };
  await recordEvent("promo", user.id, user.source ?? null).catch((e) => console.error("[promo] событие не записано:", e));
  return { ok: true, plan: claim.plan, until };
}
