import type { Metadata } from "next";
import PromoBanner from "@/components/PromoBanner";
import editor from "@/i18n/dict/editor";
import { getLocale } from "@/i18n/server";
import Editor from "./Editor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: editor[await getLocale()].metaTitle };
}

export default function AppPage() {
  return (
    <>
      <Editor />
      {/* Промокод из ссылки — карточкой внизу: вёрстку редактора (во весь экран) не сдвигает */}
      <PromoBanner variant="float" />
    </>
  );
}
