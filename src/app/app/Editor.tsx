"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Clock,
  Film,
  Image as ImageIcon,
  Info,
  Link2,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import AuthModal from "@/components/AuthModal";
import LangSwitch from "@/components/LangSwitch";
import { Wordmark } from "@/components/Logo";
import UserMenu from "@/components/UserMenu";
import Waveform, { fakePeaks } from "@/components/Waveform";
import { buildSegment, captionVars, formatTime, segmentText } from "@/lib/captions";
import {
  type Highlight,
  type EngineUser,
  type Job,
  type Panel,
  type Phrase,
  type RecentJob,
  type SfxEvent,
  type Aspect,
  type RenderState,
  assetUrl,
  clipSfx,
  engineHealth,
  musicUrl,
  EngineError,
  deleteJob,
  engineSession,
  getJob,
  getRender,
  listJobs,
  sourceUrl,
  renderFileUrl,
  startRender,
  trackAt,
  CANVAS,
  panelRect,
  retarget,
  trackFrac,
  translateJob,
  uploadVideo,
  createJobFromUrl,
  makeCover,
  zoomAt,
} from "@/lib/engine";
import { extractPeaks } from "@/lib/peaks";
import Inspector, { DEFAULT_SETTINGS, type Settings } from "./Inspector";
import Preview, { previewWidth } from "./Preview";
import PlanBadge, { isPaidPlan } from "@/components/PlanBadge";
import { useLocale } from "@/i18n/client";
import editor from "@/i18n/dict/editor";

type Stage = "upload" | "uploading" | "processing" | "editor";
type Range = { start: number; end: number };

const FALLBACK_PEAKS = fakePeaks(480, 5);
const PAUSE_MIN = 0.45; // как в движке
const PAUSE_PAD = 0.12;

// Этапы обработки по порядку; подписи — в словаре (editor.stages)
const STAGES = ["upload", "download", "audio", "transcribe", "highlights", "face"] as const satisfies readonly (
  | Job["stage"]
  | "upload"
)[];

/** Какие куски исходника останутся в рилсе — та же логика, что keep_intervals в движке. */
function keepIntervals(phrases: Phrase[], range: Range, removePauses: boolean, removeFillers: boolean): Range[] {
  const ws = phrases.flatMap((p) => p.words).filter((w) => w.end > range.start && w.start < range.end);
  const flags = ws.map((w) => removeFillers && Boolean(w.filler));
  const keep = ws.filter((_, i) => !flags[i]);
  if (!keep.length || (!removePauses && !flags.some(Boolean))) return [range];
  const fillers = ws.filter((_, i) => flags[i]);

  let a =
    removePauses || flags[0] ? Math.max(range.start, keep[0].start - (removePauses ? PAUSE_PAD : 0.04)) : range.start;
  const out: Range[] = [];
  for (let i = 0; i + 1 < keep.length; i++) {
    const cur = keep[i];
    const nxt = keep[i + 1];
    let cut: [number, number] | null = null;
    if (fillers.some((f) => cur.end <= f.start && f.start < nxt.start)) cut = [cur.end + 0.04, nxt.start - 0.04];
    else if (removePauses && nxt.start - cur.end > PAUSE_MIN) cut = [cur.end + PAUSE_PAD, nxt.start - PAUSE_PAD];
    if (cut && cut[1] - cut[0] > 0.05) {
      out.push({ start: a, end: cut[0] });
      a = cut[1];
    }
  }
  const last = keep[keep.length - 1];
  const trail = removePauses || flags[flags.length - 1];
  out.push({
    start: a,
    end: trail ? Math.min(range.end, last.end + (removePauses ? PAUSE_PAD + 0.15 : 0.08)) : range.end,
  });
  return out.filter((r) => r.end - r.start > 0.05);
}

/** Время исходника → время готового рилса. */
function mapTime(t: number, intervals: Range[]) {
  let acc = 0;
  for (const r of intervals) {
    if (t < r.start) return acc;
    if (t <= r.end) return acc + (t - r.start);
    acc += r.end - r.start;
  }
  return acc;
}

export default function Editor() {
  const t = editor[useLocale()];
  const [stage, setStage] = useState<Stage>("upload");
  const [engineOk, setEngineOk] = useState<boolean | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [uploadP, setUploadP] = useState(0);
  // Видео по ссылке: адрес, подтверждение прав и флаг «исходник у движка»
  const [link, setLink] = useState("");
  const [linkRights, setLinkRights] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [slowHint, setSlowHint] = useState(false);
  const [recent, setRecent] = useState<RecentJob[]>([]);
  const [user, setUser] = useState<EngineUser | null>(null);
  // Окно регистрации: причина и что сделать после входа
  const [authAsk, setAuthAsk] = useState<{ reason: string; then?: "export" } | null>(null);
  const [noteHidden, setNoteHidden] = useState(false);

  const [peaks, setPeaks] = useState<number[]>(FALLBACK_PEAKS);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selected, setSelected] = useState<number | "all">("all");
  const [hooks, setHooks] = useState<Record<string, string>>({});
  // Язык субтитров: оригинал или перевод (фразы перевода — отдельно, со своими правками)
  const [lang, setLang] = useState("orig");
  const [translated, setTranslated] = useState<Record<string, Phrase[]>>({});
  const [translating, setTranslating] = useState(false);
  const [langError, setLangError] = useState("");
  const [tab, setTab] = useState<"clips" | "text">("clips");
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(1);
  const [render, setRender] = useState<RenderState | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const previewBox = useRef<HTMLDivElement>(null);

  const set = useCallback((patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch })), []);
  const vars = useMemo(() => captionVars(s.accent, s.textColor), [s.accent, s.textColor]);

  // Проверяем, запущен ли движок
  const loadEngine = useCallback(() => {
    engineHealth().then(async (h) => {
      setEngineOk(Boolean(h?.ok));
      if (!h?.ok) return;
      try {
        const sess = await engineSession();
        setUser(sess.user);
        setRecent(await listJobs());
      } catch {
        // список проектов не критичен
      }
    });
  }, []);
  const checkEngine = useCallback(() => {
    setEngineOk(null);
    loadEngine();
  }, [loadEngine]);
  useEffect(loadEngine, [loadEngine]);

  useEffect(() => {
    return () => {
      if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  async function acceptFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError(t.errNotVideo);
      return;
    }
    setError("");
    setFromLink(false);
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setStage("uploading");
    setUploadP(0);
    extractPeaks(file).then((p) => p && setPeaks(p));
    try {
      const { id } = await uploadVideo(file, setUploadP);
      setStage("processing");
      pollJob(id);
    } catch (e) {
      setStage("upload");
      setVideoUrl(null);
      const msg = e instanceof Error ? e.message : t.errUpload;
      if (e instanceof EngineError && e.status === 403 && user?.anon) setAuthAsk({ reason: msg });
      else setError(msg);
    }
  }

  /** Видео по ссылке: движок скачивает сам, дальше — как обычный файл */
  async function acceptLink(e: React.FormEvent) {
    e.preventDefault();
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError(t.errLinkFormat);
      return;
    }
    if (!linkRights) {
      setError(t.errLinkRights);
      return;
    }
    setError("");
    setVideoUrl(null);
    setFileName(url);
    setFromLink(true);
    setStage("processing");
    try {
      const { id } = await createJobFromUrl(url, linkRights);
      pollJob(id, true);
    } catch (err) {
      setStage("upload");
      const msg = err instanceof Error ? err.message : t.errLinkAdd;
      if (err instanceof EngineError && err.status === 403 && user?.anon) setAuthAsk({ reason: msg });
      else setError(msg);
    }
  }

  function openReady(j: Job) {
    const hl = j.highlights ?? [];
    setJob(j);
    setNoteHidden(false);
    setPhrases(j.phrases ?? []);
    setHighlights(hl);
    setHooks(Object.fromEntries(hl.map((h) => [`orig:${h.id}`, h.title])));
    setLang("orig");
    setTranslated({});
    setSelected(hl.length ? hl[0].id : "all");
    if (j.peaks?.length) setPeaks(j.peaks);
    setStage("editor");
  }

  async function openRecent(r: RecentJob) {
    setError("");
    try {
      const j = await getJob(r.id);
      setVideoUrl(sourceUrl(r.id));
      setFileName(j.name);
      openReady(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errOpen);
    }
  }

  async function removeRecent(r: RecentJob) {
    if (!window.confirm(t.deleteConfirm(r.name))) return;
    try {
      await deleteJob(r.id);
      setRecent((list) => list.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errDelete);
    }
  }

  /** fromEngine — видео скачал движок: исходник для превью берём у него */
  function pollJob(id: string, fromEngine = false) {
    const started = Date.now();
    const tick = async () => {
      try {
        const j = await getJob(id);
        setJob(j);
        if (j.name) setFileName(j.name); // у видео по ссылке название приходит после скачивания
        setSlowHint(j.stage === "transcribe" && j.progress < 0.1 && Date.now() - started > 12000);
        if (j.status === "error") {
          setError(j.error || t.errProcessing);
          setStage("upload");
          return;
        }
        if (j.status === "ready") {
          if (fromEngine) setVideoUrl(sourceUrl(j.id));
          openReady(j);
          return;
        }
      } catch {
        // движок мог ненадолго не ответить — пробуем ещё
      }
      setTimeout(tick, 1000);
    };
    tick();
  }

  /* ——— Текущий клип ——— */
  const clip = selected === "all" ? undefined : highlights.find((h) => h.id === selected);
  const range: Range = clip ? { start: clip.start, end: clip.end } : { start: 0, end: duration || job?.duration || 0 };
  const clipPhrases = useMemo(
    () => phrases.filter((p) => p.end > range.start && p.start < range.end),
    [phrases, range.start, range.end],
  );
  const intervals = useMemo(
    () => keepIntervals(clipPhrases, { start: range.start, end: range.end }, s.removePauses, s.removeFillers),
    [clipPhrases, range.start, range.end, s.removePauses, s.removeFillers],
  );
  const outTotal = mapTime(range.end, intervals);
  const outNow = mapTime(time, intervals);

  // Фразы субтитров: оригинал или перевод; вырезки паузы/паразитов всегда считаются по оригиналу
  const captionPhrases = useMemo(() => {
    const src = lang === "orig" ? phrases : (translated[lang] ?? phrases);
    return src.filter((p) => p.end > range.start && p.start < range.end);
  }, [lang, phrases, translated, range.start, range.end]);

  // Паразиты не показываем в субтитрах, если их вырезаем
  const shownPhrases = useMemo(
    () =>
      s.removeFillers
        ? captionPhrases
            .map((p) => ({ ...p, words: p.words.filter((w) => !w.filler) }))
            .filter((p) => p.words.length > 0)
        : captionPhrases,
    [captionPhrases, s.removeFillers],
  );
  const activeIdx = shownPhrases.findIndex(
    (p) => time >= p.words[0].start && time < p.words[p.words.length - 1].end + 0.3,
  );
  const active = activeIdx >= 0 ? shownPhrases[activeIdx] : undefined;
  const activeWord = active ? active.words.findIndex((w) => time >= w.start && time < w.end) : -1;
  const speaking = clipPhrases.some((p) =>
    p.words.some((w) => !w.filler && time >= w.start - 0.05 && time < w.end + 0.1),
  );
  const hookKey = `${lang}:${selected}`;
  const hookText = hooks[hookKey] ?? "";

  const faceX = clip?.faceX ?? job?.faceX ?? null;
  const faceY = clip?.faceY ?? job?.faceY ?? null;
  // Кадр 9:16 и точка, в которую наезжает зум, — та же математика, что в render.py
  const canvas = CANVAS[s.aspect];
  const { objectPosition, focus, frame, faceOut } = useMemo(() => {
    const sw = job?.width ?? 1920;
    const sh = job?.height ?? 1080;
    const r = canvas.w / canvas.h;
    // Окно исходника: от «заполнить кадр» до «целиком» — та же формула, что frame_window в render.py
    const k = s.frameScale;
    const fillW = sw / sh > r ? sh * r : sw;
    const fillH = sw / sh > r ? sh : sw / r;
    const cw = fillW + (sw - fillW) * (1 - k);
    const ch = fillH + (sh - fillH) * (1 - k);
    const frame =
      cw / ch >= r
        ? { w: 1, h: Math.min(1, (canvas.w * ch) / cw / canvas.h) }
        : { w: Math.min(1, (canvas.h * cw) / ch / canvas.w), h: 1 };
    const auto = s.autoCrop && faceX != null;
    const points = job?.track?.points ?? [];
    const follow = s.autoCrop && points.length > 1 && sw - cw > 2;
    const cx = auto ? Math.min(Math.max(faceX! * sw - cw / 2, 0), sw - cw) : ((sw - cw) * s.cropX) / 100;
    // Слежение: кадр ведёт спикера; путь считался для окна 9:16 — пересчитываем под текущее окно
    const p = follow ? retarget(trackAt(time, points), trackFrac(sw, sh), cw / sw) : sw - cw < 1 ? 0.5 : cx / (sw - cw);
    const fx = auto && !follow ? Math.min(Math.max((faceX! * sw - cx) / cw, 0.15), 0.85) : 0.5;
    // По вертикали окно держит лицо, если есть запас (вертикальное видео в горизонтальном кадре)
    const cy = faceY != null && sh - ch > 2 ? Math.min(Math.max(faceY * sh - ch * 0.42, 0), sh - ch) : (sh - ch) / 2;
    const py = sh - ch > 0.5 ? cy / (sh - ch) : 0.5;
    const fyRaw = ((faceY ?? 0.38) * sh - cy) / ch;
    const fy = k < 0.999 ? Math.min(Math.max(fyRaw, 0.05), 0.95) : Math.min(Math.max(fyRaw, 0.2), 0.7);
    // Где лицо в готовом кадре — по нему хук обходит лицо (как в render.py)
    const faceOut = faceY == null ? null : (1 - frame.h) / 2 + fyRaw * frame.h;
    return { objectPosition: `${p * 100}% ${py * 100}%`, focus: `${fx * 100}% ${fy * 100}%`, frame, faceOut };
  }, [s.autoCrop, s.cropX, s.frameScale, faceX, faceY, job?.width, job?.height, job?.track, time, canvas]);

  /* ——— Звук превью: эффекты через WebAudio, музыка через <audio> ——— */
  const audioCtx = useRef<AudioContext | null>(null);
  const sfxBuffers = useRef<Record<string, AudioBuffer>>({});
  const musicRef = useRef<HTMLAudioElement>(null);
  const sfxLoading = useRef<Set<string>>(new Set());

  /** Подгружаем сэмплы нужных звуков (один раз на звук) */
  const loadSfx = useCallback((names: string[]) => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    for (const name of names) {
      if (sfxLoading.current.has(name)) continue;
      sfxLoading.current.add(name);
      fetch(assetUrl(name))
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => {
          sfxBuffers.current[name] = buf;
        })
        .catch(() => sfxLoading.current.delete(name));
    }
  }, []);

  const ensureAudio = useCallback(() => {
    if (audioCtx.current) {
      audioCtx.current.resume();
      return;
    }
    audioCtx.current = new AudioContext();
  }, []);

  /** offset — сколько секунд сэмпла пропустить (начало «нарастания» до старта клипа) */
  const playSfx = useCallback((name: string, gainValue: number, offset = 0) => {
    const ctx = audioCtx.current;
    const buf = sfxBuffers.current[name];
    if (!ctx || !buf || offset >= buf.duration) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start(0, Math.max(0, offset));
  }, []);

  // Музыка: играет вместе с видео
  useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    if (playing && s.music) m.play().catch(() => {});
    else m.pause();
  }, [playing, s.music]);

  // …и плавно становится тише, когда человек говорит
  useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    const base = (s.musicVolume / 100) * 0.5;
    const target = speaking ? base * 0.22 : base; // как duck в движке
    m.volume = Math.min(1, Math.max(0, m.volume + (target - m.volume) * 0.35));
  }, [speaking, s.musicVolume, time]);

  /* ——— Воспроизведение: цикл по клипу, пропуск вырезанного, эффекты ——— */
  const hookOn = s.hookOn && hookText.trim().length > 0;
  // Звуки клипа в шкале готового рилса — та же функция, что в движке (clipSfx ↔ render.clip_sfx)
  const events = useMemo(
    () =>
      clipSfx(
        (job?.plan?.sfx ?? []) as SfxEvent[],
        { transitions: s.sfxWhoosh, accents: s.sfxDing, meaning: s.sfxSmart, volume: s.sfxVolume, hook: hookOn },
        { start: range.start, end: range.end },
        outTotal,
        (t) => mapTime(t, intervals),
        (t) => intervals.some((r) => t >= r.start && t <= r.end),
      ),
    [job?.plan?.sfx, s.sfxWhoosh, s.sfxDing, s.sfxSmart, s.sfxVolume, hookOn, range.start, range.end, outTotal, intervals],
  );
  useEffect(() => {
    if (playing) loadSfx([...new Set(events.map((e) => e.type))]);
  }, [playing, events, loadSfx]);

  const outPlan = useMemo(() => {
    const toOut = <T extends { start: number; end: number }>(items: T[]) =>
      items
        .filter((it) => it.end > range.start && it.start < range.end)
        .map((it) => ({ ...it, start: mapTime(it.start, intervals), end: mapTime(it.end, intervals) }))
        .filter((it) => it.end - it.start > 0.05);
    return { shots: toOut(job?.plan?.shots ?? []), accents: toOut(job?.plan?.accents ?? []) };
  }, [job?.plan, intervals, range.start, range.end]);
  const zoom = s.zoom ? zoomAt(outNow, outPlan.shots, outPlan.accents) : 1;
  // «Экран пополам» — только если движок нашёл двоих участников
  const speakers = job?.speakers;
  // Окна участников — как split_panels в движке: в 16:9 рядом (половина ширины), иначе друг над другом
  const split = useMemo<[Panel, Panel] | null>(() => {
    if (s.layout !== "split" || !speakers || speakers.length < 2) return null;
    const sw = job?.width ?? 1920;
    const sh = job?.height ?? 1080;
    const side = canvas.w > canvas.h;
    const aspect = side ? canvas.w / 2 / canvas.h : canvas.w / (canvas.h / 2);
    return [panelRect(speakers[0], sw, sh, aspect), panelRect(speakers[1], sw, sh, aspect)];
  }, [s.layout, speakers, canvas, job?.width, job?.height]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = videoRef.current?.currentTime ?? 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && intervals.length) {
        let t = v.currentTime;
        const last = intervals[intervals.length - 1];
        if (t >= last.end || t < intervals[0].start - 0.5) {
          v.currentTime = t = intervals[0].start;
        } else if (!intervals.some((r) => t >= r.start && t <= r.end)) {
          const next = intervals.find((r) => r.start > t);
          if (next) v.currentTime = t = next.start;
        }
        if (t > prev && t - prev < 0.5) {
          // События — в шкале готового рилса: сравниваем с выходным временем
          const a = mapTime(prev, intervals);
          const b = mapTime(t, intervals);
          for (const e of events) {
            // в самом начале клипа звучат и звуки, начало которых раньше нуля (хук, обрезанное «нарастание»)
            if ((e.t > a || (a <= 0 && e.t <= 0)) && e.t <= b) playSfx(e.type, e.gain, Math.max(0, a - e.t));
          }
        }
        prev = t;
        setTime(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, intervals, events, playSfx]);

  // Масштаб оверлеев превью под фактический размер кадра
  useEffect(() => {
    const el = previewBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / previewWidth(canvas)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage, canvas]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      ensureAudio();
      // Пауза сразу после запуска (двойной клик, смена клипа) прерывает play() — это не ошибка
      v.play().catch(() => {});
    } else v.pause();
  }, [ensureAudio]);

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, duration || t));
    setTime(v.currentTime);
  }

  function selectClip(id: number | "all") {
    setSelected(id);
    const h = highlights.find((x) => x.id === id);
    seek(h ? h.start : 0);
  }

  function seekFromPointer(clientX: number) {
    const el = timelineRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    const t = ((clientX - r.left) / r.width) * duration;
    if (clip && (t < clip.start || t > clip.end)) setSelected("all");
    seek(t);
  }

  useEffect(() => {
    if (stage !== "editor") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === "Space" && !["TEXTAREA", "INPUT", "BUTTON"].includes(tag)) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, togglePlay]);

  function editPhrase(id: number, text: string) {
    const edit = (list: Phrase[]) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const next = buildSegment(p.id, text, p.start, p.end);
        next.words = next.words.map((w, i) =>
          p.words[i]?.text === w.text ? { ...w, filler: p.words[i].filler, key: p.words[i].key } : w,
        );
        return { ...next, emoji: p.emoji };
      });
    if (lang === "orig") setPhrases(edit);
    else setTranslated((t) => ({ ...t, [lang]: edit(t[lang] ?? []) }));
  }

  /* ——— Перевод субтитров ——— */
  const srcLang = job?.language ?? "ru";
  const langOptions = [
    { id: "orig", label: t.langOriginal(srcLang.toUpperCase()) },
    ...(srcLang !== "ru" ? [{ id: "ru", label: t.langRu }] : []),
    ...(srcLang !== "en" ? [{ id: "en", label: t.langEn }] : []),
  ];

  async function chooseLang(id: string) {
    if (id === "orig" || translated[id]) {
      setLang(id);
      return;
    }
    if (!job) return;
    setTranslating(true);
    setLangError("");
    try {
      const res = await translateJob(job.id, id);
      setTranslated((t) => ({ ...t, [id]: res.phrases }));
      setHooks((h) => ({
        ...Object.fromEntries(Object.entries(res.titles).map(([k, v]) => [`${id}:${k}`, v])),
        ...h,
      }));
      setLang(id);
    } catch (e) {
      setLangError(e instanceof Error ? e.message : t.errTranslate);
    } finally {
      setTranslating(false);
    }
  }

  /* ——— Экспорт ——— */
  const [coverBusy, setCoverBusy] = useState(false);

  /** Обложка: кадр под курсором, хук (или первая фраза клипа) крупно — сразу скачивается JPG */
  async function downloadCover() {
    if (!job) return;
    if (user?.anon) {
      setAuthAsk({ reason: t.authToCover });
      return;
    }
    videoRef.current?.pause();
    setCoverBusy(true);
    try {
      const title = (hookOn && hookText.trim()) || (captionPhrases[0] ? segmentText(captionPhrases[0]) : "");
      const blob = await makeCover(job.id, {
        t: videoRef.current?.currentTime ?? range.start,
        title,
        accent: s.accent,
        cropX: s.cropX,
        faceX: s.autoCrop ? faceX : null,
        faceY,
        frameScale: s.frameScale,
        layout: split ? "split" : "single",
        aspect: s.aspect,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(fileName || "clipzy").replace(/\.[^.]+$/, "")}-cover.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t.coverError);
    } finally {
      setCoverBusy(false);
    }
  }

  async function exportClip() {
    if (!job) return;
    if (user?.anon) {
      setAuthAsk({ reason: t.authToExport, then: "export" });
      return;
    }
    videoRef.current?.pause();
    setRender({ id: "", status: "queued", progress: 0 });
    try {
      const { id } = await startRender(job.id, {
        start: range.start,
        end: range.end,
        phrases: captionPhrases.map((p) => ({ words: p.words })),
        style: s.style,
        size: s.size,
        captionY: s.captionY,
        accent: s.accent,
        textColor: s.textColor,
        cropX: s.cropX,
        faceX: s.autoCrop ? faceX : null,
        faceY,
        frameScale: s.frameScale,
        layout: split ? "split" : "single",
        aspect: s.aspect,
        hook: s.hookOn && hookText.trim() ? hookText.trim() : null,
        removePauses: s.removePauses,
        zoom: s.zoom,
        progressBar: s.progressBar,
        emoji: s.emoji,
        removeFillers: s.removeFillers,
        sfxWhoosh: s.sfxWhoosh,
        sfxDing: s.sfxDing,
        sfxSmart: s.sfxSmart,
        sfxVolume: s.sfxVolume,
        music: s.music,
        musicVolume: s.musicVolume,
      });
      const poll = async () => {
        const r = await getRender(id).catch(() => null);
        if (r) setRender(r);
        if (!r || r.status === "queued" || r.status === "rendering") setTimeout(poll, 700);
      };
      poll();
    } catch (e) {
      if (e instanceof EngineError && e.status === 403) {
        setRender(null);
        setAuthAsk({ reason: e.message, then: "export" });
        return;
      }
      setRender({ id: "", status: "error", progress: 0, error: e instanceof Error ? e.message : t.errGeneric });
    }
  }

  async function afterAuth() {
    const next = authAsk?.then;
    setAuthAsk(null);
    const sess = await engineSession(true);
    setUser(sess.user);
    listJobs().then(setRecent).catch(() => {});
    if (next === "export") exportClip();
  }

  function reset() {
    videoRef.current?.pause();
    setStage("upload");
    setVideoUrl(null);
    setJob(null);
    setPhrases([]);
    setHighlights([]);
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setRender(null);
    setPeaks(FALLBACK_PEAKS);
    setFromLink(false);
    setLink("");
    checkEngine();
  }

  /* ——— Экран загрузки ——— */
  if (stage === "upload") {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar user={user} />
        {authAsk && <AuthModal reason={authAsk.reason} onClose={() => setAuthAsk(null)} onSuccess={afterAuth} />}
        <div className="flex flex-1 items-center justify-center px-5 py-16">
          <div className="w-full max-w-xl">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[40px]">{t.newProject}</h1>
              <EngineBadge ok={engineOk} />
            </div>
            <p className="mt-2 text-dim">{t.newProjectHint}</p>

            {engineOk === false ? (
              <div className="mt-8 rounded-xl border border-line-strong bg-panel p-6">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-signal" aria-hidden="true" />
                  <div>
                    <p className="font-medium">{t.engineOffTitle}</p>
                    <p className="mt-1 text-sm leading-relaxed text-dim">
                      {t.engineOffOpen} <span className="font-mono text-fg">clipzy-engine</span> {t.engineOffRun}{" "}
                      <span className="font-mono text-fg">start-engine.bat</span>
                      {t.engineOffTail}
                    </p>
                    <button
                      onClick={checkEngine}
                      className="mt-4 flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 text-sm transition-colors hover:bg-raised"
                    >
                      <RotateCw className="h-4 w-4" aria-hidden="true" /> {t.checkAgain}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!engineOk}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (engineOk) acceptFile(e.dataTransfer.files[0]);
                }}
                className={`mt-8 flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  dragOver ? "border-signal bg-signal/5" : "border-line-strong bg-panel hover:border-dim"
                }`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-raised">
                  <Upload className="h-5 w-5 text-fg" aria-hidden="true" />
                </span>
                <span className="mt-4 font-medium">{t.dropVideo}</span>
                <span className="mt-1 font-mono text-xs text-faint">{t.dropFormats}</span>
              </button>
            )}
            {engineOk && (
              <form onSubmit={acceptLink} className="mt-5">
                <div className="flex items-center gap-3 text-xs text-faint">
                  <span className="h-px flex-1 bg-line" />
                  {t.orPasteLink}
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="mt-4 flex gap-2">
                  <label htmlFor="video-link" className="sr-only">
                    {t.linkLabel}
                  </label>
                  <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-panel px-3 focus-within:border-dim">
                    <Link2 className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                    <input
                      id="video-link"
                      type="url"
                      inputMode="url"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder={t.linkPlaceholder}
                      className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
                    />
                  </div>
                  <button
                    disabled={!link.trim()}
                    className="h-11 shrink-0 cursor-pointer rounded-lg bg-signal px-4 text-sm font-semibold text-on-signal transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t.linkSubmit}
                  </button>
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-dim">
                  <input
                    type="checkbox"
                    checked={linkRights}
                    onChange={(e) => setLinkRights(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#f9dc0c]"
                  />
                  {t.linkRights}
                </label>
              </form>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
            <p role="status" className="mt-4 flex min-h-5 items-start gap-2 text-sm text-rec">
              {error && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {error}
            </p>

            {engineOk && recent.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.recentProjects}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {recent.map((r) => (
                    <li key={r.id} className="group flex items-center transition-colors hover:bg-panel">
                      <button
                        onClick={() => openRecent(r)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-4 text-left"
                      >
                        <Film className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-[15px]">{r.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-faint">
                          {formatTime(r.duration)} · {t.clipsCount(r.clips)}
                        </span>
                        <Clock className="hidden h-3.5 w-3.5 shrink-0 text-faint sm:block" aria-hidden="true" />
                        <span className="hidden shrink-0 font-mono text-[11px] text-faint sm:inline">
                          {new Date(r.created * 1000).toLocaleDateString(t.dateLocale, { day: "numeric", month: "short" })}
                        </span>
                      </button>
                      <button
                        onClick={() => removeRecent(r)}
                        aria-label={t.deleteProjectAria(r.name)}
                        title={t.deleteProject}
                        className="mx-2 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint opacity-60 transition hover:bg-raised hover:text-rec group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ——— Загрузка и обработка ——— */
  if (stage === "uploading" || stage === "processing") {
    // Файл: «Загрузка файла» → …; ссылка: «Скачивание по ссылке» → …
    const stages = STAGES.filter((key) => key !== (fromLink ? "upload" : "download"));
    const found = stages.findIndex((key) => key === job?.stage);
    const first = stage === "uploading" || (fromLink && (!job || job.stage === "download"));
    const current = first ? 0 : Math.max(found, 1);
    const firstP = fromLink ? (job?.stage === "download" ? (job?.progress ?? 0) : 0) : uploadP;
    const overall = first ? firstP * 0.1 : 0.1 + (job?.progress ?? 0) * 0.9;
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar user={user} />
        <div className="flex flex-1 items-center justify-center px-5">
          <div className="w-full max-w-sm">
            <p className="font-mono text-xs text-faint">{t.processing(Math.round(overall * 100))}</p>
            <h2 className="mt-2 truncate text-xl font-medium">{fileName}</h2>
            <ol className="mt-8 space-y-4">
              {stages.map((key, i) => {
                const done = i < current;
                const now = i === current;
                const pct =
                  now && (key === "upload" || key === "download")
                    ? firstP
                    : now && key === "transcribe"
                      ? Math.max(0, ((job?.progress ?? 0) - 0.08) / 0.8)
                      : null;
                return (
                  <li key={key} className="flex items-center gap-3 text-[15px]">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                        done ? "border-signal bg-signal text-ink" : "border-line-strong text-faint"
                      }`}
                    >
                      {done ? (
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                      ) : now ? (
                        <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className={done || now ? "text-fg" : "text-faint"}>{t.stages[key]}</span>
                    {pct !== null && (
                      <span className="ml-auto font-mono text-xs tabular-nums text-dim">{Math.round(pct * 100)}%</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="mt-8 h-0.5 overflow-hidden bg-line">
              <div className="h-full bg-signal transition-[width] duration-500" style={{ width: `${overall * 100}%` }} />
            </div>
            {slowHint && (
              <p className="mt-5 flex gap-2 text-sm leading-relaxed text-dim">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
                {t.slowHint}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ——— Редактор ——— */
  const playhead = duration ? time / duration : 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
        <Link href="/" aria-label={t.home} className="transition-opacity hover:opacity-85">
          <Wordmark className="h-[18px]" />
        </Link>
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <Film className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
        <span className="truncate text-sm">{fileName}</span>
        <span className="hidden font-mono text-xs text-faint sm:inline">
          {formatTime(duration)} · {job?.language?.toUpperCase()} · {job?.device === "cuda" ? "GPU" : "CPU"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={reset}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] transition-colors hover:bg-raised"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t.newVideo}</span>
          </button>
          <button
            onClick={downloadCover}
            disabled={coverBusy}
            title={t.coverHint}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] transition-colors hover:bg-raised disabled:cursor-wait disabled:opacity-60"
          >
            {coverBusy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{t.cover}</span>
            <span className="sr-only sm:hidden">{t.cover}</span>
          </button>
          <button
            onClick={exportClip}
            disabled={render?.status === "queued" || render?.status === "rendering"}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-signal px-3 text-[13px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {clip ? t.exportClip : t.exportVideo}
          </button>
          <LangSwitch compact className="sm:hidden" />
          <div className="hidden sm:block">
            <LangSwitch />
          </div>
          <UserMenu compact />
        </div>
      </header>

      {job?.speech && t.speechNotes[job.speech] && !noteHidden && (
        <div
          role="status"
          className={`flex items-start gap-3 border-b px-4 py-3 text-sm ${
            job.speech === "unclear" ? "border-line bg-panel" : "border-signal/30 bg-signal/[0.07]"
          }`}
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
          <p className="text-dim">
            <span className="font-medium text-fg">{t.speechNotes[job.speech].title}.</span> {t.speechNotes[job.speech].text}
          </p>
          <button onClick={() => setNoteHidden(true)} className="ml-auto cursor-pointer text-faint hover:text-fg" aria-label={t.hide}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_300px]">
        {/* Клипы и текст */}
        <section aria-label={t.clipsAndText} className="order-3 flex min-h-0 flex-col border-line lg:order-1 lg:border-r">
          <div role="tablist" className="flex h-11 shrink-0 border-b border-line max-lg:border-t">
            {(
              [
                ["clips", t.tabClips(highlights.length)],
                ["text", t.tabText],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`relative flex-1 cursor-pointer font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  tab === k ? "text-fg" : "text-faint hover:text-dim"
                }`}
              >
                {label}
                {tab === k && <span className="absolute inset-x-4 bottom-0 h-0.5 bg-signal" />}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "clips" ? (
              <ul>
                {highlights.map((h, i) => {
                  const on = h.id === selected;
                  return (
                    <li key={h.id}>
                      <button
                        onClick={() => selectClip(h.id)}
                        className={`relative flex w-full cursor-pointer gap-3 border-b border-line px-4 py-3.5 text-left transition-colors ${
                          on ? "bg-panel" : "hover:bg-panel/60"
                        }`}
                      >
                        {on && <span className="absolute inset-y-0 left-0 w-0.5 bg-signal" aria-hidden="true" />}
                        <span className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[15px] leading-snug ${on ? "text-fg" : "text-dim"}`}>
                            {hooks[`${lang}:${h.id}`] || hooks[`orig:${h.id}`] || h.title}
                          </span>
                          <span className="mt-1 block font-mono text-[11px] text-faint">
                            {formatTime(h.start)}–{formatTime(h.end)} · {Math.round(h.end - h.start)} {t.sec}
                          </span>
                        </span>
                        <span
                          title={t.hookScore}
                          className={`h-fit shrink-0 rounded px-1 font-mono text-[11px] ${
                            on ? "bg-signal text-ink" : "bg-raised text-dim"
                          }`}
                        >
                          {h.score}
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    onClick={() => selectClip("all")}
                    className={`relative flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors ${
                      selected === "all" ? "bg-panel text-fg" : "text-dim hover:bg-panel/60"
                    }`}
                  >
                    {selected === "all" && <span className="absolute inset-y-0 left-0 w-0.5 bg-signal" />}
                    <Sparkles className="h-4 w-4 text-faint" aria-hidden="true" />
                    {t.wholeVideo}
                  </button>
                </li>
                {highlights.length === 0 && (
                  <li className="px-4 py-6 text-sm leading-relaxed text-dim">
                    {job?.speech === "no_speech" || job?.speech === "no_audio" ? t.noClipsNoSpeech : t.noClipsShort}
                  </li>
                )}
              </ul>
            ) : (
              captionPhrases.map((p) => {
                const on = active?.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`relative flex gap-3 border-b border-line px-4 py-2.5 transition-colors ${on ? "bg-panel" : ""}`}
                  >
                    {on && <span className="absolute inset-y-0 left-0 w-0.5 bg-signal" aria-hidden="true" />}
                    <button
                      onClick={() => seek(p.start + 0.01)}
                      className={`shrink-0 cursor-pointer pt-[3px] font-mono text-[11px] transition-colors hover:text-signal ${
                        on ? "text-fg" : "text-faint"
                      }`}
                      aria-label={t.jumpTo(formatTime(p.start))}
                    >
                      {formatTime(p.start)}
                    </button>
                    <label className="sr-only" htmlFor={`ph-${p.id}`}>
                      {t.phraseText(formatTime(p.start))}
                    </label>
                    <div className="min-w-0 flex-1">
                      <textarea
                        id={`ph-${p.id}`}
                        value={segmentText(p)}
                        onChange={(e) => editPhrase(p.id, e.target.value)}
                        rows={1}
                        className={`field-sizing-content w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none focus:text-fg ${
                          on ? "text-fg" : "text-dim"
                        }`}
                      />
                      {p.words.some((w) => (w.p ?? 1) < 0.45 && !w.filler) && (
                        <p className="mt-0.5 text-[11px] text-signal/80">
                          {t.checkWords}{" "}
                          {p.words
                            .filter((w) => (w.p ?? 1) < 0.45 && !w.filler)
                            .map((w) => w.text)
                            .join(", ")}
                        </p>
                      )}
                      {s.removeFillers && p.words.some((w) => w.filler) && (
                        <p className="mt-0.5 text-[11px] text-faint">
                          {t.willCut}{" "}
                          {p.words
                            .filter((w) => w.filler)
                            .map((w, i) => (
                              <s key={i} className="mr-1 decoration-rec">
                                {w.text}
                              </s>
                            ))}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Превью */}
        <section aria-label={t.preview} className="order-1 flex min-h-0 items-center justify-center bg-[#080808] p-6 lg:order-2">
          <div
            ref={previewBox}
            className={
              s.aspect === "16:9"
                ? "aspect-video w-full max-w-[880px] max-lg:max-w-full"
                : s.aspect === "1:1"
                  ? "aspect-square h-full max-h-[620px] min-h-[360px] max-lg:h-[440px] max-lg:max-w-full"
                  : "aspect-[9/16] h-full max-h-[680px] min-h-[420px] max-lg:h-[560px] max-lg:max-w-full"
            }
          >
            {videoUrl && (
              <Preview
                videoRef={videoRef}
                videoUrl={videoUrl}
                playing={playing}
                onToggle={togglePlay}
                onPlaying={setPlaying}
                onLoaded={() => {
                  const d = videoRef.current?.duration ?? 0;
                  setDuration(Number.isFinite(d) && d > 0 ? d : (job?.duration ?? 0));
                  if (videoRef.current && clip) videoRef.current.currentTime = clip.start;
                }}
                onTime={(t) => !playing && setTime(t)}
                phrase={active}
                activeWord={activeWord}
                zoom={split ? 1 : zoom}
                focus={focus}
                frame={frame}
                faceY={split ? (canvas.w > canvas.h ? 0.52 : 0.26) : faceOut}
                split={split}
                canvas={canvas}
                style={s.style}
                vars={vars}
                size={s.size}
                captionY={s.captionY}
                objectPosition={objectPosition}
                hook={hookOn && outNow < 3.2 ? hookText.trim() : null}
                progress={s.progressBar && outTotal > 0 ? outNow / outTotal : null}
                emoji={s.emoji}
                scale={scale}
                watermark={!isPaidPlan(user?.plan, user?.anon)}
              />
            )}
          </div>
        </section>

        {/* Настройки */}
        <aside aria-label={t.settings} className="order-2 overflow-y-auto border-line lg:order-3 lg:border-l">
          <Inspector
            s={s}
            set={set}
            vars={vars}
            hook={hookText}
            onHook={(v) => setHooks((h) => ({ ...h, [hookKey]: v }))}
            hasFace={faceX != null}
            speakers={job?.speakers?.length ?? 0}
            speakerMode={job?.track?.mode === "speaker"}
            sourceAspect={job?.width && job?.height ? job.width / job.height : 16 / 9}
            langs={job?.speech === "no_speech" || job?.speech === "no_audio" ? [] : langOptions}
            lang={lang}
            onLang={chooseLang}
            translating={translating}
            langError={langError}
            plan={user?.anon ? undefined : user?.plan}
          />
        </aside>
      </div>

      {/* Таймлайн всего ролика */}
      <div className="shrink-0 border-t border-line bg-panel px-3 pb-3 pt-2 sm:px-4">
        <div className="mb-2 flex items-center gap-3">
          <button
            onClick={togglePlay}
            aria-label={playing ? t.pause : t.play}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-raised"
          >
            {playing ? (
              <Pause className="h-4 w-4 fill-fg" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4 fill-fg" aria-hidden="true" />
            )}
          </button>
          <span className="font-mono text-xs tabular-nums">
            {formatTime(outNow, true)} <span className="text-faint">/ {formatTime(outTotal)}</span>
          </span>
          {outTotal < range.end - range.start - 0.3 && (
            <span className="hidden rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-dim sm:inline">
              {t.cutBadge((range.end - range.start - outTotal).toFixed(1))}
            </span>
          )}
          <span className="ml-auto hidden font-mono text-[11px] text-faint sm:inline">{t.spaceHint}</span>
        </div>
        <div
          ref={timelineRef}
          role="slider"
          tabIndex={0}
          aria-label={t.playhead}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e.clientX)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seek(time + 1);
            if (e.key === "ArrowLeft") seek(time - 1);
          }}
          className="relative cursor-pointer touch-none select-none"
        >
          <Waveform
            peaks={peaks}
            highlight={clip && duration ? [[clip.start / duration, clip.end / duration]] : undefined}
            className="h-12 w-full text-line-strong"
          />
          <div className="relative mt-1 h-5">
            {highlights.map((h, i) => (
              <button
                key={h.id}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => selectClip(h.id)}
                title={hooks[`${lang}:${h.id}`] || hooks[`orig:${h.id}`] || h.title}
                className={`absolute top-0 h-full cursor-pointer overflow-hidden rounded-[3px] border px-1 text-left font-mono text-[10px] leading-[18px] transition-colors ${
                  h.id === selected ? "border-signal bg-signal/20 text-fg" : "border-line bg-raised text-faint hover:text-dim"
                }`}
                style={{
                  left: `${(h.start / (duration || 1)) * 100}%`,
                  width: `max(18px, calc(${((h.end - h.start) / (duration || 1)) * 100}% - 2px))`,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute -top-1 bottom-0 w-px bg-fg" style={{ left: `${playhead * 100}%` }}>
            <div className="absolute -left-[4px] -top-0.5 h-2 w-[9px] rounded-sm bg-fg" />
          </div>
        </div>
      </div>

      {s.music && <audio ref={musicRef} src={musicUrl(s.music)} loop preload="auto" hidden />}
      {authAsk && <AuthModal reason={authAsk.reason} onClose={() => setAuthAsk(null)} onSuccess={afterAuth} />}
      {render && <ExportDialog render={render} aspect={s.aspect} onClose={() => setRender(null)} onRetry={exportClip} />}
    </div>
  );
}

function ExportDialog({
  render,
  aspect,
  onClose,
  onRetry,
}: {
  render: RenderState;
  /** Формат клипа — чтобы плеер был нужной формы */
  aspect: Aspect;
  onClose: () => void;
  onRetry: () => void;
}) {
  const t = editor[useLocale()];
  const busy = render.status === "queued" || render.status === "rendering";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.exportTitle}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line-strong bg-panel p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            {busy ? t.rendering : render.status === "done" ? t.done : t.failed}
          </h2>
          {!busy && (
            <button onClick={onClose} aria-label={t.close} className="cursor-pointer text-faint hover:text-fg">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {busy && (
          <>
            <p className="mt-1 text-sm text-dim">{t.renderSpec}</p>
            <div className="mt-6 h-1 overflow-hidden rounded bg-line">
              <div className="h-full bg-signal transition-[width] duration-300" style={{ width: `${render.progress * 100}%` }} />
            </div>
            <p className="mt-2 text-right font-mono text-xs text-faint">{Math.round(render.progress * 100)}%</p>
          </>
        )}

        {render.status === "done" && (
          <>
            <video
              src={renderFileUrl(render.id)}
              controls
              autoPlay
              playsInline
              className={`mx-auto mt-4 max-h-[52vh] max-w-full rounded-lg bg-black ${
                aspect === "16:9" ? "aspect-video" : aspect === "1:1" ? "aspect-square" : "aspect-[9/16]"
              }`}
            />
            <a
              href={renderFileUrl(render.id)}
              download
              className="mt-5 flex h-11 items-center justify-center gap-2 rounded-lg bg-signal font-semibold text-ink transition-opacity hover:opacity-90"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> {t.downloadMp4(render.duration?.toFixed(0) ?? "")}
            </a>
          </>
        )}

        {render.status === "error" && (
          <>
            <p className="mt-3 max-h-40 overflow-auto rounded-md bg-raised p-3 font-mono text-xs leading-relaxed text-dim">
              {render.error}
            </p>
            <button
              onClick={onRetry}
              className="mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong text-sm hover:bg-raised"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" /> {t.retry}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EngineBadge({ ok }: { ok: boolean | null }) {
  const t = editor[useLocale()];
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[11px] text-dim">
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok === null ? "animate-pulse bg-faint" : ok ? "bg-[#34d399]" : "bg-rec"}`}
        aria-hidden="true"
      />
      {ok === null ? t.engineChecking : ok ? t.engineOnline : t.engineOffline}
    </span>
  );
}

function TopBar({ user }: { user: EngineUser | null }) {
  const t = editor[useLocale()];
  return (
    <header className="flex h-14 items-center justify-between border-b border-line px-5">
      <Link href="/" aria-label={t.home} className="flex items-center gap-2.5 text-sm text-dim transition-colors hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <Wordmark className="h-5" />
      </Link>
      <div className="flex items-center gap-3">
        {user && (
          <PlanBadge plan={user.plan} anon={user.anon} className="hidden sm:inline-flex" />
        )}
        <LangSwitch compact className="sm:hidden" />
        <LangSwitch className="hidden sm:inline-flex" />
        <UserMenu compact />
      </div>
    </header>
  );
}
