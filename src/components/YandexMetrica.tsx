"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CookieNotice from "./CookieNotice";

// Страницы с секретами в адресе (токен сброса пароля) и служебные — Метрике не показываем вовсе
const PRIVATE = ["/reset-password", "/admin"];

/** Адрес для Метрики: путь и только рекламные метки — без токенов и прочих параметров. */
function cleanUrl() {
  const u = new URL(window.location.href);
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (/^(utm_[a-z]+|ref|promo)$/.test(k)) keep.set(k, v);
  const q = keep.toString();
  return u.origin + u.pathname + (q ? `?${q}` : "");
}

/**
 * Счётчик Яндекс Метрики: карта кликов и точный показатель отказов. Вебвизор выключен (он записывал бы тексты
 * видео пользователей в редакторе), внешние ссылки — тоже (ссылка скачивания клипа несёт токен доступа).
 * Переходы внутри сайта (Next меняет страницы без перезагрузки) отправляем сами — с очищенным адресом.
 */
export default function YandexMetrica({ id }: { id: number }) {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  const hidden = PRIVATE.some((p) => pathname.startsWith(p));
  const [firstPrivate] = useState(hidden); // сайт открыли сразу на служебной странице — счётчик не грузим

  useEffect(() => {
    if (hidden) return;
    const url = cleanUrl();
    // Первый просмотр отправляет сам счётчик при init; дальше — переходы внутри сайта
    if (last.current !== null && last.current !== url) window.ym?.(id, "hit", url, { referer: last.current });
    last.current = url;
  }, [id, pathname, hidden]);

  if (firstPrivate) return null;
  return (
    <>
      <Script id="yandex-metrica" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
ym(${id}, "init", { clickmap: true, trackLinks: false, accurateTrackBounce: true, webvisor: false });`}
      </Script>
      <CookieNotice />
    </>
  );
}
