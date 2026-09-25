"use client";

import { useEffect, useRef } from "react";

/**
 * Вертикальный ролик в белой «фото»-рамке. Играет без звука, только пока виден на экране.
 * children — слой поверх видео (например, живые субтитры).
 */
export default function DemoReel({
  src,
  poster,
  label,
  className = "",
  children,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
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
  }, []);

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
    </figure>
  );
}
