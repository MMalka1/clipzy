import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  createPayment,
  getPayment,
  grantPaidPlan,
  markPaymentPaid,
  recordEvent,
  revokePaidPlan,
  setPaymentStatus,
  setPaymentTx,
} from "./db";

/**
 * Оплата через Platega (СБП). Схема: создаём у себя платёж → Platega даёт ссылку на оплату → после оплаты шлёт
 * callback на /api/pay/callback → мы ещё раз спрашиваем статус у Platega напрямую и только тогда включаем тариф.
 * Ключи — в переменных окружения PLATEGA_MERCHANT_ID и PLATEGA_SECRET (в Vercel), в коде их нет.
 */
const API = process.env.PLATEGA_API || "https://app.platega.io"; // PLATEGA_API — только для проверки на заглушке

/** Что можно купить. Studio и «навсегда» откроем, когда будут свой шрифт, логотип и выгрузка пачкой. */
export const OFFERS = {
  pro: { plan: "pro", days: 30, amount: 990, title: "Clipzy Pro на 30 дней" },
} as const;
export type OfferKey = keyof typeof OFFERS;

export const paymentsEnabled = () => Boolean(process.env.PLATEGA_MERCHANT_ID && process.env.PLATEGA_SECRET);

function auth() {
  return { "X-MerchantId": process.env.PLATEGA_MERCHANT_ID ?? "", "X-Secret": process.env.PLATEGA_SECRET ?? "" };
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "https://clipzy-red.vercel.app").replace(/\/+$/, "");
}

/** Создаёт платёж и возвращает ссылку на страницу оплаты Platega. */
export async function startPayment(userId: string, key: OfferKey): Promise<string> {
  const offer = OFFERS[key];
  const id = randomUUID();
  await createPayment({ id, userId, plan: offer.plan, days: offer.days, amount: offer.amount });
  const res = await fetch(`${API}/transaction/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth() },
    body: JSON.stringify({
      paymentMethod: Number(process.env.PLATEGA_METHOD || 2), // 2 — СБП / QR
      paymentDetails: { amount: offer.amount, currency: "RUB" },
      description: offer.title,
      return: `${siteUrl()}/pay/success?p=${id}`,
      failedUrl: `${siteUrl()}/pay/fail`,
      payload: id,
      metadata: { userId },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as { transactionId?: string; redirect?: string } | null;
  if (!res.ok || !data?.redirect) {
    throw new Error(`Platega ответила ${res.status}`);
  }
  if (data.transactionId) await setPaymentTx(id, data.transactionId);
  return data.redirect;
}

const same = (a: string | null, b: string) => {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b);
  return x.length === y.length && y.length > 0 && timingSafeEqual(x, y);
};

/** Callback пришёл от Platega: она присылает наши же MerchantId и ключ в заголовках. */
export function callbackAuthentic(h: Headers) {
  return paymentsEnabled() && same(h.get("x-merchantid"), process.env.PLATEGA_MERCHANT_ID!) && same(h.get("x-secret"), process.env.PLATEGA_SECRET!);
}

type Tx = { id: string; status: string; payload?: string; paymentDetails?: { amount?: number; currency?: string } };

async function transaction(txId: string): Promise<Tx> {
  const res = await fetch(`${API}/transaction/${encodeURIComponent(txId)}`, { headers: auth(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Platega: статус транзакции ${res.status}`);
  return res.json();
}

/**
 * Обработка callback. Тексту callback не верим: статус, сумму и наш id платежа берём из ответа Platega на прямой запрос.
 * Повторные callback безопасны — тариф продлевается только при переходе платежа из pending в paid.
 */
export async function handleCallback(body: { id?: string }) {
  if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return;
  const tx = await transaction(body.id);
  const payment = tx.payload ? await getPayment(tx.payload) : null;
  if (!payment || (payment.tx_id && payment.tx_id !== tx.id)) {
    console.error("[pay] callback по неизвестному платежу:", tx.id);
    return;
  }
  if (tx.status === "CONFIRMED") {
    const amount = Number(tx.paymentDetails?.amount);
    if (amount !== payment.amount || (tx.paymentDetails?.currency ?? "RUB") !== "RUB") {
      console.error(`[pay] сумма не совпала: ждали ${payment.amount}, пришло ${amount}`, tx.id);
      return;
    }
    if (await markPaymentPaid(payment.id)) {
      const until = await grantPaidPlan(payment.user_id, payment.plan, payment.days);
      if (!until) console.error("[pay] оплата прошла, но тариф не продлён (создатель или бессрочный план):", payment.user_id);
      await recordEvent("payment", payment.user_id, null).catch(() => {});
    }
  } else if (tx.status === "CANCELED") {
    await setPaymentStatus(payment.id, "canceled");
  } else if (tx.status === "CHARGEBACKED") {
    if (await setPaymentStatus(payment.id, "chargeback")) await revokePaidPlan(payment.user_id);
  }
}
