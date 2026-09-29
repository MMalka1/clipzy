/** Свой путь на сайте: «/app», но не «//evil.com» и не «/\evil.com» — браузеры читают их как чужой адрес. */
export function isLocalPath(p: string) {
  // Табы, переводы строк и обратные слэши браузер выбрасывает или читает как «/»: «/<таб>/evil.com» стал бы «//evil.com»
  if (!p.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(p)) return false;
  try {
    return new URL(p, "http://x").origin === "http://x";
  } catch {
    return false;
  }
}
