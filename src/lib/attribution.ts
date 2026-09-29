/**
 * Откуда пришёл посетитель: метки рекламы (utm_*), реферальная метка ref и промокод из ссылки.
 * Первое касание с метками — в cookie cz_src на 90 дней (уже записанную не трогаем),
 * промокод — ещё и в cz_promo (новый заменяет старый).
 * Разбирают cookie и браузер, и сервер (хук регистрации, /api/track), поэтому модуль общий.
 */
export const SRC_COOKIE = "cz_src";
export const PROMO_COOKIE = "cz_promo";
/** Браузер: промокод из ссылки только что запомнили или забыли — баннер перечитывает cookie. */
export const PROMO_EVENT = "cz:promo";

type Src = { s?: string; m?: string; c?: string; ref?: string; promo?: string };

/** Значение метки: буквы, цифры и «_ . -», не длиннее 64 знаков. Остальное — «_». */
function clean(v: unknown) {
  if (typeof v !== "string") return "";
  return v
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_.-]+/gu, "_")
    .slice(0, 64);
}

/** Промокод: латиница, цифры и дефис, 3–32 знака, в верхнем регистре. Иначе null. */
export function normalizeCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  return /^[A-Z0-9-]{3,32}$/.test(code) ? code : null;
}

/** Значение cookie из заголовка Cookie (на сервере) или document.cookie (в браузере). */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Источник для базы: «utm_source/utm_medium/utm_campaign», иначе «ref:метка» или «promo:КОД».
 * null — пришёл без меток. Cookie может подделать кто угодно, поэтому значения чистим и здесь.
 */
export function sourceFromCookie(header: string | null | undefined): string | null {
  const raw = readCookie(header, SRC_COOKIE);
  if (!raw) return null;
  let src: Src;
  try {
    src = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!src || typeof src !== "object") return null;
  const [s, m, c, ref] = [clean(src.s), clean(src.m), clean(src.c), clean(src.ref)];
  if (s || m || c) return [s || "-", m, c].join("/").replace(/\/+$/, "");
  if (ref) return `ref:${ref}`;
  const promo = normalizeCode(src.promo);
  return promo ? `promo:${promo}` : null;
}

/** Промокод из cookie cz_promo (или null). */
export function promoFromCookie(header: string | null | undefined): string | null {
  return normalizeCode(readCookie(header, PROMO_COOKIE));
}

function setCookie(name: string, value: string, days: number) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 86400}; samesite=lax${secure}`;
}

/**
 * Браузер: запоминаем метки из адреса страницы. Считаем первым касанием первый заход С МЕТКАМИ:
 * если человек сначала зашёл напрямую, а потом по рекламе — заслуга рекламы.
 */
export function captureAttribution() {
  const q = new URLSearchParams(location.search);
  const promo = normalizeCode(q.get("promo"));
  const src: Src = { s: clean(q.get("utm_source")), m: clean(q.get("utm_medium")), c: clean(q.get("utm_campaign")), ref: clean(q.get("ref")) };
  if (promo) src.promo = promo;
  const cookies = document.cookie;
  if (Object.values(src).some(Boolean) && !readCookie(cookies, SRC_COOKIE)) {
    setCookie(SRC_COOKIE, JSON.stringify(Object.fromEntries(Object.entries(src).filter(([, v]) => v))), 90);
  }
  if (promo && promo !== readCookie(cookies, PROMO_COOKIE)) {
    setCookie(PROMO_COOKIE, promo, 30);
    window.dispatchEvent(new Event(PROMO_EVENT));
  }
}

/** Браузер: промокод включён или больше не подходит — баннер про него не нужен. */
export function forgetPromo() {
  document.cookie = `${PROMO_COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.dispatchEvent(new Event(PROMO_EVENT));
}
