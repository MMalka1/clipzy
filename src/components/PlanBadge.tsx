"use client";

import { Crown } from "lucide-react";
import { useLocale } from "@/i18n/client";
import common from "@/i18n/dict/common";

/** Метка плана. У creator — корона и фирменный жёлтый. */
export default function PlanBadge({ plan, anon = false, className = "" }: { plan?: string; anon?: boolean; className?: string }) {
  const t = common[useLocale()].plan;
  if (plan === "creator") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-[#F9DC0C] px-1.5 py-0.5 font-mono text-[11px] font-semibold lowercase leading-none text-[#0B0B0B] ${className}`}
      >
        <Crown className="h-3 w-3 fill-current" aria-hidden="true" />
        creator
      </span>
    );
  }
  const text = anon ? t.guest : !plan || plan === "free" ? t.free : plan.toUpperCase();
  return <span className={`rounded-md border border-line px-2 py-1 font-mono text-[11px] text-dim ${className}`}>{text}</span>;
}

/** Без лимитов и без водяного знака — всё, кроме Free и гостя. */
export function isPaidPlan(plan?: string | null, anon?: boolean) {
  return !anon && Boolean(plan) && plan !== "free";
}
