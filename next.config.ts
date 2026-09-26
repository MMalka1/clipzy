import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Кнопка «N» Next.js в режиме разработки перекрывала таймлайн редактора. Ошибки сборки всё равно показываются.
  devIndicators: false,
  // Код движка (engine/) копируется на машину Vercel Sandbox из функции /api/engine — кладём его в её сборку
  outputFileTracingIncludes: {
    "/api/engine": ["./engine/**/*"],
  },
};

export default nextConfig;
