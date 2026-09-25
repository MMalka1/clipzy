/** Свой путь на сайте: «/app», но не «//evil.com» и не «/\evil.com» — браузеры читают их как чужой адрес. */
export function isLocalPath(p: string) {
  return p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\");
}
