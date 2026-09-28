/**
 * Контакты поддержки: показываются в подвале и на странице /support.
 * Пустое поле не показывается. Обращения через форму на /support работают всегда.
 */
export const SUPPORT = {
  email: "", // почта поддержки, например support@…
  telegram: "clipzysupport", // username в Telegram без @ — личка поддержки
  bot: "", // username бота поддержки без @
};

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://clipzy-red.vercel.app").replace(/\/+$/, "");

/** Дата текущей редакции документов (политика, соглашение). */
export const LEGAL_DATE = "28 сентября 2026 г.";
