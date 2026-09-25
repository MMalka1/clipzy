"use client";

import { Pipette } from "lucide-react";
import { useLocale } from "@/i18n/client";
import captions from "@/i18n/dict/captions";

/** Ряд цветовых кружков + свой цвет через системную пипетку. value=null — цвет по умолчанию. */
export default function ColorSwatches({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string;
  options: { name: string; value: string | null }[];
  value: string | null;
  onChange: (v: string | null) => void;
  size?: "sm" | "md";
}) {
  const customLabel = captions[useLocale()].customColor;
  const dim = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const custom = value !== null && !options.some((o) => o.value === value);

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.name}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.name}
            title={o.name}
            onClick={() => onChange(o.value)}
            className={`${dim} relative shrink-0 cursor-pointer rounded-full transition-transform hover:scale-110 ${
              on ? "ring-2 ring-fg ring-offset-2 ring-offset-ink" : "ring-1 ring-white/15"
            }`}
            style={
              o.value
                ? { background: o.value }
                : { background: "conic-gradient(#ffd60a, #22e5ff, #ff3dcf, #ff8a3d, #ffd60a)" }
            }
          >
            {!o.value && (
              <span className="absolute inset-[5px] rounded-full bg-ink text-[9px] font-bold leading-[14px] text-fg">
                A
              </span>
            )}
          </button>
        );
      })}
      <label
        title={customLabel}
        className={`${dim} relative flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed transition-colors ${
          custom ? "border-transparent ring-2 ring-fg ring-offset-2 ring-offset-ink" : "border-line-strong hover:border-dim"
        }`}
        style={custom ? { background: value! } : undefined}
      >
        {!custom && <Pipette className="h-3.5 w-3.5 text-dim" aria-hidden="true" />}
        <span className="sr-only">{customLabel}</span>
        <input
          type="color"
          value={value ?? "#ffd60a"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
