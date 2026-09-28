"use client";

import { useEffect, useRef } from "react";

/**
 * Вертикальный ролик в белой «фото»-рамке. Играет без звука, только пока виден на экране.
 * children — слой поверх видео (например, живые субтитры). slate — подпись снизу, как на полароиде.
 * onTime — текущее время ролика каждый кадр, пока он играет (для сцен, привязанных к видео).
 */
export default function DemoReel({
  src,
  poster,
  label,
  className = "",
  slate,
  onTime,
  children,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
  slate?: string;
  onTime?: (t: number) => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !calm) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [src]); // сменили язык — новый ролик, наблюдаем заново

  useEffect(() => {
    const v = ref.current;
    if (!v || !onTime) return;
    let raf = 0;
    const loop = () => {
      onTime(v.currentTime);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => cancelAnimationFrame(raf);
    // Запасной канал: timeupdate приходит ~4 раза в секунду, даже когда кадры не рисуются
    const tick = () => !v.paused && onTime(v.currentTime); // перемотка на паузе — не «игра»
    v.addEventListener("playing", start);
    v.addEventListener("pause", stop);
    v.addEventListener("timeupdate", tick);
    if (!v.paused) start();
    return () => {
      stop();
      v.removeEventListener("playing", start);
      v.removeEventListener("pause", stop);
      v.removeEventListener("timeupdate", tick);
    };
  }, [onTime, src]);

  return (
    <figure className={`photo relative rounded-[22px] ${className}`}>
      <div className="relative overflow-hidden rounded-[15px] bg-black">
        <video
          ref={ref}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={label}
          className="block aspect-[9/16] w-full object-cover"
        />
        {children}
      </div>
      {slate && (
        <figcaption className="px-1.5 pt-2 font-mono text-[10px] uppercase leading-none tracking-wider text-[#5c5549]">
          {slate}
        </figcaption>
      )}
    </figure>
  );
}
