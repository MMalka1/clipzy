"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleUser, Crown, Film, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/i18n/client";
import auth from "@/i18n/dict/auth";
import { UserAvatar } from "./Avatar";
import PlanBadge from "./PlanBadge";

/** «Войти» для гостей и незалогиненных, имя и меню — для зарегистрированных. */
export default function UserMenu({ compact = false }: { compact?: boolean }) {
  const { data, isPending } = authClient.useSession();
  const t = auth[useLocale()].menu;
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (isPending) return <span className="h-8 w-16" aria-hidden="true" />;
  const user = data?.user as
    | { name: string; email: string; image?: string | null; isAnonymous?: boolean | null; plan?: string }
    | undefined;

  if (!user || user.isAnonymous) {
    return (
      <Link
        href="/login?mode=signin"
        className={`flex items-center rounded-md text-sm text-dim transition-colors hover:text-fg ${compact ? "h-8 px-2" : "h-9 px-3"}`}
      >
        {t.logIn}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t.account}
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-transform hover:rotate-6"
      >
        <UserAvatar image={user.image} name={user.name} email={user.email} size={32} />
        {user.plan === "creator" && (
          <Crown
            className="absolute -right-1.5 -top-2 h-4 w-4 rotate-[18deg] fill-[#F9DC0C] text-[#0B0B0B]"
            strokeWidth={1.6}
            aria-label="creator"
          />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-line-strong bg-panel p-1.5 shadow-2xl">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <UserAvatar image={user.image} name={user.name} email={user.email} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              {!user.email.endsWith(".invalid") && <p className="truncate text-xs text-faint">{user.email}</p>}
              <PlanBadge plan={user.plan} className="mt-1.5 inline-flex" />
            </div>
          </div>
          <div className="h-px bg-line" />
          <Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-raised">
            <CircleUser className="h-4 w-4 text-faint" /> {t.profile}
          </Link>
          <Link href="/app" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-raised">
            <Film className="h-4 w-4 text-faint" /> {t.projects}
          </Link>
          <button
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
              router.refresh();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-raised"
          >
            <LogOut className="h-4 w-4 text-faint" /> {t.logOut}
          </button>
        </div>
      )}
    </div>
  );
}
