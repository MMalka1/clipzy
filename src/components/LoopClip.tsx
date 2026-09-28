"use client";

import { useEffect, useRef } from "react";

/**
 * Фон карточки-демо: живой ролик без звука, играет только на экране. Стоп-кадр говорящего человека
 * почти всегда ловит его на полуслове, поэтому в движении, а обложка — спокойный кадр.
 * С reduced-motion — только обложка.
 */
export default function LoopClip({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.3 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src="/demo/loop.mp4"
      poster="/demo/loop-still.jpg"
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      className={className}
    />
  );
}
