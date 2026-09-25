"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Crown, LoaderCircle, LogOut, Film } from "lucide-react";
import Avatar, { UserAvatar, avatarsFor, initialOf, parseUserImage, presetImage } from "@/components/Avatar";
import { Note } from "@/components/Hand";
import LangSwitch from "@/components/LangSwitch";
import PlanBadge from "@/components/PlanBadge";
import { useLocale } from "@/i18n/client";
import profile from "@/i18n/dict/profile";
import { authClient } from "@/lib/auth-client";

type SessionUser = {
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  isAnonymous?: boolean | null;
  plan?: string;
};

/** Профиль: аватарка-наклейка (сохраняется сразу), имя, почта, план, язык, выход. */
export default function ProfileView() {
  const t = profile[useLocale()];
  const router = useRouter();
  const { data, isPending, refetch } = authClient.useSession();
  const user = data?.user as SessionUser | undefined;

  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-dim">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
      </p>
    );
  }

  if (!user || user.isAnonymous) {
    return (
      <section className="mx-auto mt-10 max-w-md rotate-[0.5deg] rounded-sm bg-panel px-7 py-9 text-center shadow-[0_20px_50px_-30px_rgba(60,40,10,0.5)]">
        <div className="flex justify-center gap-2">
          {["cat", "podcaster", "fox"].map((id, i) => (
            <Avatar key={id} id={id} size={56} className={i === 1 ? "-translate-y-2" : ""} />
          ))}
        </div>
        <h1 className="mt-6 text-xl font-bold">{t.guestTitle}</h1>
        <p className="mt-2 text-dim">{t.guestText}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login?mode=signup" className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-ink">
            {t.signUp}
          </Link>
          <Link href="/login?mode=signin" className="rounded-full border border-line-strong px-5 py-2.5 text-sm">
            {t.logIn}
          </Link>
        </div>
      </section>
    );
  }

  return <SignedIn user={user} onChanged={() => refetch()} onLogOut={async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }} />;
}

function SignedIn({ user, onChanged, onLogOut }: { user: SessionUser; onChanged: () => void; onLogOut: () => void }) {
  const t = profile[useLocale()];
  const parsed = parseUserImage(user.image);
  // Фото из Google/Telegram запоминаем, чтобы к нему можно было вернуться
  const [photo] = useState(parsed && "url" in parsed ? parsed.url : null);
  const [picked, setPicked] = useState<string | null>(user.image ?? null);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [name, setName] = useState(user.name ?? "");
  const [nameStatus, setNameStatus] = useState<"" | "saving" | "saved" | "error">("");

  async function saveImage(image: string | null) {
    setPicked(image);
    setStatus("saving");
    const { error } = await authClient.updateUser({ image });
    setStatus(error ? "error" : "saved");
    if (!error) onChanged();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!clean || clean === user.name) return;
    setNameStatus("saving");
    const { error } = await authClient.updateUser({ name: clean });
    setNameStatus(error ? "error" : "saved");
    if (!error) onChanged();
  }

  const pickedPreset = picked?.startsWith("preset:") ? picked.slice(7) : null;
  const showEmail = !user.email.endsWith(".invalid");

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-[240px_1fr] md:gap-14">
      {/* Карточка: большая наклейка, имя, план */}
      <aside className="md:sticky md:top-8 md:self-start">
        <div className="relative mx-auto w-fit">
          <div className="-rotate-3 rounded-full bg-white p-2 shadow-[0_18px_38px_-16px_rgba(60,40,10,0.45)]">
            <UserAvatar image={picked} name={user.name} email={user.email} size={176} title={user.name} />
          </div>
          {user.plan === "creator" && (
            <Crown
              className="absolute -right-2 -top-4 h-10 w-10 rotate-[18deg] fill-[#F9DC0C] text-[#0B0B0B]"
              strokeWidth={1.4}
              aria-label="creator"
            />
          )}
          <Note className="absolute -bottom-2 -left-10 -rotate-6 text-rec">{t.note}</Note>
        </div>
        <h1 className="mt-8 truncate text-center text-2xl font-extrabold tracking-[-0.03em]">{user.name}</h1>
        <div className="mt-2 flex justify-center">
          <PlanBadge plan={user.plan} />
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/app"
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-fg text-sm font-semibold text-ink transition-transform hover:-rotate-1"
          >
            <Film className="h-4 w-4" aria-hidden="true" /> {t.projects}
          </Link>
          <button
            onClick={onLogOut}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-line-strong text-sm transition-colors hover:bg-raised"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> {t.logOut}
          </button>
        </div>
      </aside>

      <div className="space-y-10">
        {/* Выбор аватарки */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold">{t.avatar}</h2>
            <p className="flex min-h-5 items-center gap-1.5 text-sm" role="status">
              {status === "saving" && <LoaderCircle className="h-4 w-4 animate-spin text-dim" aria-hidden="true" />}
              {status === "saved" && (
                <>
                  <Check className="h-4 w-4 text-fg" aria-hidden="true" /> {t.saved}
                </>
              )}
              {status === "error" && <span className="text-rec">{t.saveFailed}</span>}
              {!status && <span className="text-dim">{t.avatarHint}</span>}
            </p>
          </div>
          <div role="radiogroup" aria-label={t.avatar} className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {avatarsFor(user.plan).map((id) => {
              const on = pickedPreset === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t.avatarNames[id] ?? id}
                  title={t.avatarNames[id] ?? id}
                  onClick={() => saveImage(presetImage(id))}
                  className={`relative flex aspect-square cursor-pointer items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 hover:rotate-3 ${
                    on ? "ring-[3px] ring-rec ring-offset-2 ring-offset-ink" : ""
                  }`}
                >
                  <Avatar id={id} size={72} className="h-full w-full" />
                </button>
              );
            })}
            {/* Без наклейки: фото из аккаунта Google/Telegram или буква */}
            {photo && (
              <button
                type="button"
                role="radio"
                aria-checked={picked === photo}
                onClick={() => saveImage(photo)}
                className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-full ${
                  picked === photo ? "ring-[3px] ring-rec ring-offset-2 ring-offset-ink" : ""
                }`}
                title={t.photo}
                aria-label={t.photo}
              >
                <UserAvatar image={photo} size={72} className="h-full w-full" />
              </button>
            )}
            <button
              type="button"
              role="radio"
              aria-checked={!picked || (!pickedPreset && picked !== photo)}
              onClick={() => saveImage(null)}
              className={`relative flex aspect-square cursor-pointer items-center justify-center rounded-full ${
                !picked ? "ring-[3px] ring-rec ring-offset-2 ring-offset-ink" : ""
              }`}
              title={t.letter}
              aria-label={t.letter}
            >
              <Avatar size={72} initial={initialOf(user.name, user.email)} className="h-full w-full" />
            </button>
          </div>
        </section>

        {/* Данные аккаунта */}
        <section className="rounded-sm bg-panel px-6 py-7 shadow-[0_20px_50px_-34px_rgba(60,40,10,0.5)]">
          <form onSubmit={saveName}>
            <label htmlFor="profile-name" className="text-sm text-dim">
              {t.name}
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="profile-name"
                value={name}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameStatus("");
                }}
                placeholder={t.namePlaceholder}
                className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-ink px-3.5 text-[15px] outline-none focus:border-dim"
              />
              <button
                disabled={!name.trim() || name.trim() === user.name || nameStatus === "saving"}
                className="h-11 shrink-0 cursor-pointer rounded-lg bg-fg px-4 text-sm font-semibold text-ink disabled:cursor-default disabled:opacity-40"
              >
                {nameStatus === "saving" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : t.save}
              </button>
            </div>
            <p className="mt-1.5 min-h-5 text-sm" role="status">
              {nameStatus === "saved" && <span className="text-dim">{t.saved}</span>}
              {nameStatus === "error" && <span className="text-rec">{t.saveFailed}</span>}
            </p>
          </form>

          <dl className="mt-3 space-y-4 border-t border-line pt-5 text-[15px]">
            {showEmail && (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-dim">{t.email}</dt>
                <dd className="flex items-center gap-2">
                  <span className="truncate">{user.email}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${user.emailVerified ? "bg-raised text-dim" : "bg-rec/10 text-rec"}`}>
                    {user.emailVerified ? t.verified : t.notVerified}
                  </span>
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-dim">{t.plan}</dt>
              <dd>
                <PlanBadge plan={user.plan} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-dim">{t.language}</dt>
              <dd>
                <LangSwitch />
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
