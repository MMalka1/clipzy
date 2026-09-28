"use client";

import { useLayoutEffect } from "react";

/**
 * Появление блоков при прокрутке: элементам с data-reveal ставит data-shown, когда они въезжают в экран,
 * а у [data-loop] переключает data-inview — анимации вне экрана стоят на паузе.
 * То, что видно уже при загрузке, получает data-shown="load" и показывается сразу, без анимации.
 * Фокус с клавиатуры на ещё не показанном блоке показывает его сразу — рамка фокуса не бывает невидимой.
 * При reduced-motion не делает ничего: без класса .motion на <html> все стили — финальный статичный кадр.
 */
export default function RevealObserver() {
  useLayoutEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.classList.remove("motion"); // остался от прошлого показа страницы — меряем в финальном виде
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])")];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.dataset.shown = "load";
    }
    root.classList.add("motion"); // только после того, как видимое уже отмечено
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.shown = "";
            io.unobserve(e.target);
          }
        }),
      { threshold: 0, rootMargin: "0px 0px -15% 0px" },
    );
    els.forEach((el) => {
      if (!("shown" in el.dataset)) io.observe(el);
    });
    const loops = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.toggleAttribute("data-inview", e.isIntersecting)),
      { rootMargin: "100px 0px" },
    );
    document.querySelectorAll("[data-loop]").forEach((el) => loops.observe(el));
    const onFocusIn = (e: FocusEvent) => {
      let el = (e.target as Element | null)?.closest<HTMLElement>("[data-reveal]") ?? null;
      while (el) {
        if (!("shown" in el.dataset)) {
          el.dataset.shown = "";
          io.unobserve(el);
        }
        el = el.parentElement?.closest<HTMLElement>("[data-reveal]") ?? null;
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      io.disconnect();
      loops.disconnect();
      root.classList.remove("motion");
    };
  }, []);
  return null;
}
