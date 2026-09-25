import type { Metadata } from "next";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import profile from "@/i18n/dict/profile";
import { getLocale } from "@/i18n/server";
import ProfileView from "./ProfileView";

export async function generateMetadata(): Promise<Metadata> {
  return { title: profile[await getLocale()].metaTitle };
}

export default function ProfilePage() {
  return (
    <main className="paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <LangSwitch />
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-4">
        <ProfileView />
      </div>
    </main>
  );
}
