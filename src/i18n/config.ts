/** Языки сайта. Выбор хранится в cookie «lang»; без неё — по языку браузера. */
export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "lang";

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

/** Словарь: русский — эталон, английский обязан повторять его форму (TypeScript проверит пропуски). */
export type Dict<T> = { ru: T; en: T };
