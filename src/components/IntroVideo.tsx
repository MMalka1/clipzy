"use client";

import { useEffect, useRef } from "react";

/** Короткий ролик «как это работает»: без звука, по кругу. Кто просил меньше движения — видит обложку. */
export default function IntroVideo({ label }: { label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Крутим, только пока ролик на экране: не тратим батарею и трафик
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !reduce.matches) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src="/demo/clipzy-intro.mp4"
      poster="/demo/clipzy-intro.jpg"
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={label}
      className="block aspect-[1280/946] w-full bg-[#efe9dc] object-cover"
    />
  );
}
