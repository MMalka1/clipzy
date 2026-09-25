import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Кнопка «N» Next.js в режиме разработки перекрывала таймлайн редактора. Ошибки сборки всё равно показываются.
  devIndicators: false,
};

export default nextConfig;
