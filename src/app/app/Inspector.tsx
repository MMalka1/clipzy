"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { LoaderCircle, Music, Upload } from "lucide-react";
import ColorSwatches from "@/components/ColorSwatches";
import PlanBadge, { isPaidPlan } from "@/components/PlanBadge";
import { ACCENTS, CAPTION_STYLES, type CaptionStyleId, TEXT_COLORS } from "@/lib/captions";
import { ASPECTS, type Aspect, MUSIC_TRACKS, uploadMusic } from "@/lib/engine";
import { useLocale } from "@/i18n/client";
import captions, { localizeColors } from "@/i18n/dict/captions";
import inspector from "@/i18n/dict/inspector";

export type Settings = {
  style: CaptionStyleId;
  accent: string | null;
  textColor: string | null;
  size: number;
  captionY: number;
  autoCrop: boolean;
  cropX: number;
  /** 1 — заполнить 9:16, 0 — весь кадр целиком на размытом фоне */
  frameScale: number;
  /** split — «экран пополам»: двое участников сверху и снизу (в 16:9 — рядом) */
  layout: "single" | "split";
  /** Формат готового видео: 9:16 (Reels/Shorts/TikTok), 1:1 (лента), 16:9 (YouTube) */
  aspect: Aspect;
  hookOn: boolean;
  removePauses: boolean;
  zoom: boolean;
  progressBar: boolean;
  emoji: boolean;
  removeFillers: boolean;
  /** Переходы: «вжух» на склейках и уходе хука */
  sfxWhoosh: boolean;
  /** Акценты: нарастание и удар на главном, «дзынь» на важных словах */
  sfxDing: boolean;
  /** Смысловые звуки: касса, «неверно», блеск, скретч, «поп» */
  sfxSmart: boolean;
  /** Громкость эффектов 0–100 */
  sfxVolume: number;
  music: string | null;
  musicName: string | null;
  musicVolume: number;
};

export const DEFAULT_SETTINGS: Settings = {
  style: "beat",
  accent: null,
  textColor: null,
  size: 24,
  captionY: 68,
  autoCrop: true,
  cropX: 50,
  frameScale: 1,
  layout: "single",
  aspect: "9:16",
  hookOn: true,
  removePauses: true,
  zoom: true,
  progressBar: true,
  emoji: false,
  removeFillers: true,
  sfxWhoosh: true,
  sfxDing: true,
  sfxSmart: true,
  sfxVolume: 70,
  music: null,
  musicName: null,
  musicVolume: 35,
};

export type LangOption = { id: string; label: string };

export default function Inspector({
  s,
  set,
  vars,
  hook,
  onHook,
  hasFace,
  speakers = 0,
  speakerMode = false,
  sourceAspect = 16 / 9,
  langs,
  lang,
  onLang,
  translating,
  langError,
  plan,
}: {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  vars: CSSProperties;
  hook: string;
  onHook: (v: string) => void;
  hasFace: boolean;
  /** Сколько постоянных участников нашёл движок */
  speakers?: number;
  /** Пропорция исходника (ширина/высота): вертикальное видео в горизонтальном кадре лучше показать целиком */
  sourceAspect?: number;
  /** Камера режет на того, кто говорит */
  speakerMode?: boolean;
  langs: LangOption[];
  lang: string;
  onLang: (id: string) => void;
  translating: boolean;
  langError: string;
  /** План пользователя; у гостя — undefined */
  plan?: string;
}) {
  const locale = useLocale();
  const t = inspector[locale];
  const c = captions[locale];
  return (
    <>
      {langs.length > 1 && (
        <Panel title={t.lang.title}>
          <div role="radiogroup" aria-label={t.lang.title} className="grid grid-cols-2 rounded-md border border-line-strong p-0.5">
            {langs.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={lang === l.id}
                disabled={translating}
                onClick={() => onLang(l.id)}
                className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded text-[13px] transition-colors disabled:cursor-wait ${
                  lang === l.id ? "bg-fg text-ink" : "text-dim hover:text-fg"
                }`}
              >
                {translating && lang !== l.id && l.id !== "orig" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                {l.label}
              </button>
            ))}
          </div>
          {langError && <p className="mt-2 text-xs text-rec">{langError}</p>}
          <p className="mt-2 text-xs leading-relaxed text-faint">
            {lang === "orig" ? t.lang.orig : t.lang.translated}
          </p>
        </Panel>
      )}
      <Panel title={t.style}>
        <div className="grid grid-cols-3 gap-1.5">
          {CAPTION_STYLES.map((st) => {
            const on = st.id === s.style;
            return (
              <button
                key={st.id}
                onClick={() => set({ style: st.id })}
                aria-pressed={on}
                className={`frame-bg flex h-[60px] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-md border transition-colors ${
                  on ? "border-signal" : "border-line hover:border-line-strong"
                }`}
              >
                <span className={`cap cap-${st.id} text-[11px]`} style={vars}>
                  <span className="cap-w past">{t.sample[0]}</span>
                  <span className="cap-w on">{t.sample[1]}</span>
                </span>
                <span className={`text-[10px] ${on ? "text-fg" : "text-dim"}`}>{c.styles[st.id] ?? st.name}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title={t.color.title}>
        <p className="mb-2.5 text-[13px] text-dim">{t.color.accent}</p>
        <ColorSwatches label={t.color.accentLabel} options={localizeColors(ACCENTS, c.accents)} value={s.accent} onChange={(v) => set({ accent: v })} size="sm" />
        <p className="mb-2.5 mt-4 text-[13px] text-dim">{t.color.text}</p>
        <ColorSwatches
          label={t.color.textLabel}
          options={localizeColors(TEXT_COLORS, c.textColors)}
          value={s.textColor}
          onChange={(v) => set({ textColor: v })}
          size="sm"
        />
      </Panel>

      <Panel title={t.text.title}>
        <Slider label={t.text.size} value={s.size} min={14} max={40} unit="px" onChange={(v) => set({ size: v })} />
        <Slider label={t.text.position} value={s.captionY} min={15} max={88} unit="%" onChange={(v) => set({ captionY: v })} />
      </Panel>

      <Panel title={t.frame.title}>
        <div role="radiogroup" aria-label={t.frame.format} className="mb-1.5 grid grid-cols-3 rounded-md border border-line-strong p-0.5">
          {ASPECTS.map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={s.aspect === a}
              onClick={() => set(formatPatch(s, a, sourceAspect))}
              className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded text-[13px] transition-colors ${
                s.aspect === a ? "bg-fg text-ink" : "text-dim hover:text-fg"
              }`}
            >
              <AspectIcon aspect={a} />
              {t.frame.formats[a]}
            </button>
          ))}
        </div>
        <p className="mb-3.5 text-xs text-faint">{t.frame.formatHints[s.aspect]}</p>
        {speakers >= 2 && (
          <div role="radiogroup" aria-label={t.frame.layout} className="mb-3 grid grid-cols-2 rounded-md border border-line-strong p-0.5">
            {(
              [
                ["single", t.frame.single],
                ["split", t.frame.split],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={s.layout === v}
                // Пополам друг над другом субтитры встают на стык окон, рядом (16:9) — вниз
                onClick={() =>
                  set(
                    v === "split"
                      ? { layout: v, captionY: s.aspect === "16:9" ? CAPTION_Y["16:9"] : 50 }
                      : { layout: v, captionY: s.captionY === 50 ? CAPTION_Y[s.aspect] : s.captionY },
                  )
                }
                className={`h-8 cursor-pointer rounded text-[13px] transition-colors ${
                  s.layout === v ? "bg-fg text-ink" : "text-dim hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {s.layout === "split" && speakers >= 2 ? (
          <p className="text-xs leading-relaxed text-faint">
            {s.aspect === "16:9" ? t.frame.splitHintSide : t.frame.splitHint}
          </p>
        ) : (
          <>
        <div role="radiogroup" aria-label={t.frame.scale} className="mb-3 grid grid-cols-2 rounded-md border border-line-strong p-0.5">
          {(
            [
              [1, t.frame.fill],
              [0, t.frame.fit],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={s.frameScale === v}
              // «Целиком»: картинка по центру — субтитры уводим ниже, на размытый фон
              onClick={() => set(v === 0 && s.captionY < 74 ? { frameScale: v, captionY: 76 } : { frameScale: v })}
              className={`h-8 cursor-pointer rounded text-[13px] transition-colors ${
                s.frameScale === v ? "bg-fg text-ink" : "text-dim hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Slider
          label={t.frame.showMore}
          value={Math.round((1 - s.frameScale) * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => set({ frameScale: 1 - v / 100 })}
        />
        <p className="mb-3.5 mt-2 text-xs leading-relaxed text-faint">
          {t.frame.showMoreHint}
        </p>
        <Toggle
          label={speakerMode ? t.frame.speaker : t.frame.face}
          hint={
            speakerMode
              ? t.frame.speakerHint
              : hasFace
                ? t.frame.faceFound
                : t.frame.faceMissing
          }
          checked={s.autoCrop}
          onChange={(v) => set({ autoCrop: v })}
        />
        {!s.autoCrop && (
          <div className="mt-3">
            <Slider label={t.frame.horizontal} value={s.cropX} min={0} max={100} unit="%" onChange={(v) => set({ cropX: v })} />
          </div>
        )}
          </>
        )}
      </Panel>

      <Panel title={t.extras.title}>
        <div className="space-y-3.5">
          <Toggle label={t.extras.hook} hint={t.extras.hookHint} checked={s.hookOn} onChange={(v) => set({ hookOn: v })} />
          {s.hookOn && (
            <>
              <label htmlFor="hook" className="sr-only">
                {t.extras.hookText}
              </label>
              <textarea
                id="hook"
                value={hook}
                onChange={(e) => onHook(e.target.value)}
                rows={2}
                maxLength={80}
                className="field-sizing-content w-full resize-none rounded-md border border-line-strong bg-raised px-2.5 py-2 text-sm outline-none focus:border-dim"
              />
            </>
          )}
          <Toggle label={t.extras.pauses} hint={t.extras.pausesHint} checked={s.removePauses} onChange={(v) => set({ removePauses: v })} />
          <Toggle
            label={t.extras.fillers}
            hint={t.extras.fillersHint}
            checked={s.removeFillers}
            onChange={(v) => set({ removeFillers: v })}
          />
          <Toggle
            label={t.extras.zoom}
            hint={t.extras.zoomHint}
            checked={s.zoom}
            onChange={(v) => set({ zoom: v })}
          />
          <Toggle label={t.extras.progress} hint={t.extras.progressHint} checked={s.progressBar} onChange={(v) => set({ progressBar: v })} />
          <Toggle label={t.extras.emoji} hint={t.extras.emojiHint} checked={s.emoji} onChange={(v) => set({ emoji: v })} />
        </div>
      </Panel>

      <Panel title={t.sound.title}>
        <div className="space-y-3.5">
          <Toggle label={t.sound.whoosh} hint={t.sound.whooshHint} checked={s.sfxWhoosh} onChange={(v) => set({ sfxWhoosh: v })} />
          <Toggle label={t.sound.ding} hint={t.sound.dingHint} checked={s.sfxDing} onChange={(v) => set({ sfxDing: v })} />
          <Toggle label={t.sound.smart} hint={t.sound.smartHint} checked={s.sfxSmart} onChange={(v) => set({ sfxSmart: v })} />
          {(s.sfxWhoosh || s.sfxDing || s.sfxSmart) && (
            <Slider label={t.sound.volume} value={s.sfxVolume} min={0} max={100} unit="%" onChange={(v) => set({ sfxVolume: v })} />
          )}
        </div>
        <MusicPicker s={s} set={set} />
      </Panel>

      <Panel title={t.watermark.title}>
        {isPaidPlan(plan) ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-dim">{t.watermark.off}</span>
            <PlanBadge plan={plan} />
          </div>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <span className="text-dim">{t.watermark.free}</span>
            <Link href="/#pricing" className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
              {t.watermark.remove}
            </Link>
          </div>
        )}
      </Panel>
    </>
  );
}

/** Обычное место субтитров в каждом формате (доля высоты, %) */
const CAPTION_Y: Record<Aspect, number> = { "9:16": 68, "1:1": 78, "16:9": 84 };

/** Смена формата: субтитры — на обычное место формата (если их не двигали), вертикальное видео в 16:9 — целиком */
function formatPatch(s: Settings, aspect: Aspect, sourceAspect: number): Partial<Settings> {
  const patch: Partial<Settings> = { aspect };
  const standard = Object.values(CAPTION_Y).includes(s.captionY) || s.captionY === 50;
  if (standard) patch.captionY = s.layout === "split" ? (aspect === "16:9" ? CAPTION_Y[aspect] : 50) : CAPTION_Y[aspect];
  if (sourceAspect < 1 && aspect === "16:9") patch.frameScale = 0;
  else if (sourceAspect < 1 && s.aspect === "16:9" && s.frameScale === 0) patch.frameScale = 1;
  return patch;
}

/** Маленький прямоугольник пропорции формата */
function AspectIcon({ aspect }: { aspect: Aspect }) {
  const [w, h] = aspect === "9:16" ? [7, 12] : aspect === "16:9" ? [13, 8] : [10, 10];
  return <span aria-hidden="true" className="inline-block rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line p-4">
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-fg after:transition-transform peer-checked:bg-signal peer-checked:after:translate-x-4 peer-checked:after:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-signal"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="flex justify-between text-sm">
        <span className="text-dim">{label}</span>
        <span className="font-mono text-xs tabular-nums text-fg">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="mt-2 w-full cursor-pointer accent-[#ffd60a]"
      />
    </label>
  );
}

function MusicPicker({ s, set }: { s: Settings; set: (patch: Partial<Settings>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const custom = s.music?.startsWith("custom:");
  const t = inspector[useLocale()].music;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const { id, name } = await uploadMusic(file);
      set({ music: `custom:${id}`, musicName: name });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) =>
    `flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors ${
      on ? "border-signal bg-signal/10 text-fg" : "border-line-strong text-dim hover:text-fg"
    }`;

  return (
    <div className="mt-5">
      <p className="mb-2.5 flex items-center gap-1.5 text-[13px] text-dim">
        <Music className="h-3.5 w-3.5" aria-hidden="true" /> {t.title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(!s.music)} onClick={() => set({ music: null })}>
          {t.none}
        </button>
        {MUSIC_TRACKS.map((tr) => (
          <button key={tr.id} className={chip(s.music === tr.id)} onClick={() => set({ music: tr.id })}>
            {t.tracks[tr.id] ?? tr.name}
          </button>
        ))}
        <button className={chip(Boolean(custom))} onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          <span className="max-w-[120px] truncate">{custom ? s.musicName : t.custom}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
      {err && <p className="mt-2 text-xs text-rec">{err}</p>}
      {s.music && (
        <div className="mt-3">
          <Slider label={t.volume} value={s.musicVolume} min={5} max={100} unit="%" onChange={(v) => set({ musicVolume: v })} />
          <p className="mt-2 text-xs text-faint">{t.volumeHint}</p>
        </div>
      )}
    </div>
  );
}
