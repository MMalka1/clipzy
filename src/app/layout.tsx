import type { Metadata, Viewport } from "next";
import { Caveat, JetBrains_Mono, Onest, Unbounded } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

// Акцентный шрифт: логотип, бегущая строка, отдельные стили субтитров
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["800"],
});

// Рукописные пометки на сайте
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

const META = {
  ru: {
    title: "Clipzy — рилсы с субтитрами из длинного видео",
    description:
      "Загрузите эфир, подкаст или интервью. Clipzy расшифрует речь, найдёт сильные моменты, кадрирует под 9:16 и наложит субтитры.",
  },
  en: {
    title: "Clipzy — captioned shorts from your long videos",
    description:
      "Upload a stream, podcast or interview. Clipzy transcribes it, finds the best moments, reframes to 9:16 and adds animated captions.",
  },
};

const OG_ALT = {
  ru: "Clipzy — режет длинные видео на рилсы с субтитрами",
  en: "Clipzy turns long videos into captioned vertical clips",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  // Картинка-превью ссылки — на языке посетителя (соцсети и мессенджеры шлют свой Accept-Language)
  const image = { url: `/og/${locale}.png`, width: 1200, height: 630, alt: OG_ALT[locale] };
  return {
    ...META[locale],
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    openGraph: { ...META[locale], images: [image], locale: locale === "ru" ? "ru_RU" : "en_US", type: "website" },
    twitter: { card: "summary_large_image", ...META[locale], images: [image.url] },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${onest.variable} ${jetbrains.variable} ${unbounded.variable} ${caveat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
