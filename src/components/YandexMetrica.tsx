"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import CookieNotice from "./CookieNotice";

/**
 * Счётчик Яндекс Метрики — стандартный код (вебвизор, карта кликов, внешние ссылки, точный показатель отказов).
 * Первый просмотр отправляет сам счётчик; дальше Next меняет страницы без перезагрузки — о них сообщаем вручную.
 */
export default function YandexMetrica({ id }: { id: number }) {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const url = window.location.href;
    if (last.current !== null && last.current !== url) window.ym?.(id, "hit", url, { referer: last.current });
    last.current = url;
  }, [id, pathname]);

  return (
    <>
      <Script id="yandex-metrica" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
ym(${id}, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });`}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- пиксель Метрики для браузеров без JS */}
          <img src={`https://mc.yandex.ru/watch/${id}`} style={{ position: "absolute", left: "-9999px" }} alt="" />
        </div>
      </noscript>
      <CookieNotice />
    </>
  );
}
