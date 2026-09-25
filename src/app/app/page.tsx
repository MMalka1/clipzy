import type { Metadata } from "next";
import editor from "@/i18n/dict/editor";
import { getLocale } from "@/i18n/server";
import Editor from "./Editor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: editor[await getLocale()].metaTitle };
}

export default function AppPage() {
  return <Editor />;
}
