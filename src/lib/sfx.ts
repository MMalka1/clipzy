/**
 * Какие звуковые эффекты и где звучат в готовом рилсе — копия sfx_logic.clip_sfx() из движка, строка в строку.
 * Правила и набор звуков присылает движок вместе с проектом (job.sfxKit), поэтому превью звучит как видео.
 * Совпадение проверяет `npm run test:sfx` (engine/sfx/fixtures.json).
 *
 * Файл без импортов и enum — Node запускает его в тесте напрямую.
 */

export type SfxStyle = "off" | "clean" | "punchy";
export type SfxSettings = { style: SfxStyle; meme: boolean; volume: number };

type Preset = {
  per: number;
  minGap: number;
  gap: Record<string, number>;
  hitsMax: number;
  popEvery: number;
  riser: boolean;
  rel: Record<string, number>;
};

export type SfxRules = {
  hookIn: number;
  hookEnd: number;
  hookOutLead: number;
  hookMinTotal: number;
  hookOutMinTotal: number;
  accentIn: number;
  startGuard: number;
  quiet: [number, number];
  endGuard: number;
  tailMax: number;
  voiceDefault: number;
  voiceClamp: [number, number];
  voiceRefOffset: number;
  duckDb: number;
  maxGain: number;
  periodicTol: number;
  cutMinStep: number;
  tickMinCount: number;
  tickLead: number;
  voicedPad: number;
  top: { tags: string[]; score: number; minHook: number; min: number };
  riser: { len: number; clear: number; minStart: number };
  prio: Record<string, number>;
  fam: Record<string, string>;
  jitter: Record<string, [number, number]>;
  presets: Record<string, Preset>;
  meme: {
    per: number;
    max: number;
    pauseMin: number;
    pauseLead: number;
    scratchLead: number;
    bellLast: number;
    emoji: Record<string, string>;
  };
};

export type SfxSample = { fam: string; peak: number; dur: number; refDb: number; sha: string };
export type SfxKit = { v: number; rules: SfxRules; samples: Record<string, SfxSample>; families: Record<string, string[]> };

/** События клипа в шкале готового рилса (секунды) */
export type SfxCtx = {
  total: number;
  /** Слова, которые остались в клипе: [начало, конец] */
  words: [number, number][];
  shots: { start: number; end: number; zoom: number }[];
  accents: { start: number; end: number; score?: number; tag?: string | null }[];
  speakerCuts: number[];
  emoji: { t: number; emo: string }[];
  cues: { a0: number; a1: number; kind: string; first: boolean; gapBefore: number; gapAfter: number }[];
  hook: boolean;
  seed: number;
  voiceDb: number | null;
};

/** a — момент «попадания», t — начало сэмпла (может быть < 0), rate — скорость (высота) воспроизведения */
export type ClipSfx3 = { a: number; t: number; type: string; fam: string; gain: number; rate: number };

type Cand = { kind: string; a: number; prio: number; fam: string; i: number; riser?: boolean };

const HOOK = ["hook_in", "hook_out"];

export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const round = (x: number, digits: number) => {
  const k = 10 ** digits;
  return Math.floor(x * k + 0.5) / k;
};

/** Паузы до и после слова-метки — по словам, оставшимся в клипе (как в render.clip_sfx) */
export function cueGaps(words: [number, number][], a0: number, a1: number, total: number) {
  let prevEnd = 0;
  let nextStart = total;
  for (const w of words) {
    if (w[1] <= a0 + 1e-3) prevEnd = Math.max(prevEnd, w[1]);
    if (w[0] >= a1 - 1e-3) nextStart = Math.min(nextStart, w[0]);
  }
  return { gapBefore: Math.max(0, a0 - prevEnd), gapAfter: Math.max(0, nextStart - a1) };
}

export function clipSfx3(ctx: SfxCtx, kit: SfxKit, settings: SfxSettings): ClipSfx3[] {
  const R = kit.rules;
  const vol = Math.min(Math.max(settings.volume, 0), 100);
  const total = ctx.total || 0;
  const P = R.presets[settings.style];
  if (!P || vol <= 0 || total <= 0) return [];
  const M = R.meme;
  const prio = R.prio;
  const fams = kit.families;
  const samples = kit.samples;
  const memeOn = !!settings.meme;
  const words = ctx.words ?? [];
  const hook = !!ctx.hook && total > R.hookMinTotal;

  const voiced = (a: number) => words.some((w) => w[0] + R.voicedPad < a && a < w[1] - R.voicedPad);
  const tail = (fam: string) => {
    let m = 0;
    for (const n of fams[fam] ?? []) m = Math.max(m, samples[n].dur - samples[n].peak);
    return Math.min(m, R.tailMax);
  };

  const cands: Cand[] = [];
  const add = (kind: string, a: number, p: number, fam?: string) =>
    cands.push({ kind, a, prio: p, fam: fam ?? R.fam[kind], i: cands.length });

  // ——— кандидаты ———
  if (hook) {
    add("hook_in", R.hookIn, prio.hook_in);
    if (total >= R.hookOutMinTotal) add("hook_out", R.hookEnd - R.hookOutLead, prio.hook_out);
  }

  const top = R.top;
  const topMin = hook ? top.minHook : top.min;
  for (const acc of ctx.accents ?? []) {
    const a = acc.start + R.accentIn;
    const score = acc.score ?? 0;
    const s5 = Math.min(score, 5);
    if ((top.tags.includes(acc.tag ?? "") || score >= top.score) && a >= topMin) add("hit", a, prio.hit + s5);
    add("zoomin", a, prio.zoomin + s5);
  }

  const shots = ctx.shots ?? [];
  for (let k = 1; k < shots.length; k++) {
    if (shots[k].zoom > shots[k - 1].zoom + R.cutMinStep) {
      const a = shots[k].start;
      if (!voiced(a)) add("cut", a, prio.cut);
    }
  }

  for (const a of ctx.speakerCuts ?? []) add("speaker", a, prio.speaker);

  let j = 0;
  for (const e of ctx.emoji ?? []) {
    const fam = memeOn ? M.emoji[e.emo] : undefined;
    if (fam) add("meme", e.t, prio.meme, fam);
    if (fam || j % P.popEvery === 0) add("pop", e.t, prio.pop);
    if (!fam) j += 1;
  }

  const cues = ctx.cues ?? [];
  const lists = cues.filter((c) => c.kind === "list");
  if (lists.length >= R.tickMinCount) {
    for (const c of lists) add("tick", c.a0 - Math.min(R.tickLead, c.gapBefore), prio.tick);
  }
  if (memeOn) {
    for (const c of cues) {
      const kind = c.kind;
      if (kind === "list") continue;
      if (kind === "scratch") {
        if (c.first && c.gapBefore >= M.pauseMin) add("meme", c.a0 - M.scratchLead, prio.meme, "scratch");
      } else if (c.gapAfter >= M.pauseMin && (kind !== "bell" || c.a0 >= total - M.bellLast)) {
        add("meme", c.a1 + M.pauseLead, prio.meme, kind);
      }
    }
  }

  // ——— отбор ———
  const order = [...cands].sort((x, y) => y.prio - x.prio || x.a - y.a || x.i - y.i);
  const budget = Math.ceil(total / P.per);
  const memeBudget = Math.min(M.max, Math.ceil(total / M.per));
  const rs = R.riser;
  const chosen: Cand[] = [];
  let nMain = 0;
  let nMeme = 0;
  let nHits = 0;
  let riserAt: number | null = null;
  for (const c0 of order) {
    const { a, kind } = c0;
    if (!fams[c0.fam]?.length) continue;
    if (kind !== "hook_in" && a < R.startGuard) continue;
    if (hook && !HOOK.includes(kind) && R.quiet[0] <= a && a < R.quiet[1]) continue;
    if (a + tail(c0.fam) > total - R.endGuard) continue;
    const g = P.gap[kind];
    if (g !== undefined && chosen.some((x) => x.kind === kind && Math.abs(x.a - a) < g)) continue;
    if (chosen.some((x) => Math.abs(x.a - a) < P.minGap)) continue;
    if (riserAt !== null && riserAt - rs.clear <= a && a < riserAt) continue;
    if (kind === "hit" && nHits >= P.hitsMax) continue;
    if (kind === "meme") {
      if (nMeme >= memeBudget) continue;
      let prev: Cand | null = null;
      let next: Cand | null = null;
      for (const x of chosen) {
        if (x.kind !== "meme") continue;
        if (x.a < a && (prev === null || x.a > prev.a)) prev = x;
        if (x.a > a && (next === null || x.a < next.a)) next = x;
      }
      if ((prev && prev.fam === c0.fam) || (next && next.fam === c0.fam)) continue;
    } else if (!HOOK.includes(kind) && nMain >= budget) continue;
    const c: Cand = { ...c0 };
    if (kind === "hit") {
      nHits += 1;
      if (
        P.riser &&
        riserAt === null &&
        fams.riser?.length &&
        a - rs.len >= rs.minStart &&
        !chosen.some((x) => a - rs.clear <= x.a && x.a < a)
      ) {
        c.riser = true;
        riserAt = a;
      }
    }
    if (kind === "meme") nMeme += 1;
    else if (!HOOK.includes(kind)) nMain += 1;
    chosen.push(c);
  }

  // ——— без «метронома» ———
  const seq = chosen.filter((x) => !HOOK.includes(x.kind)).sort((x, y) => x.a - y.a || x.i - y.i);
  const tol = R.periodicTol;
  for (let i = 0; i + 3 < seq.length; i++) {
    const gaps = [0, 1, 2].map((d) => seq[i + d + 1].a - seq[i + d].a);
    const m = (gaps[0] + gaps[1] + gaps[2]) / 3;
    if (m > 0 && gaps.every((gp) => Math.abs(gp - m) <= tol * m)) {
      seq.splice(seq[i + 1].prio < seq[i + 2].prio ? i + 1 : i + 2, 1);
    }
  }
  const final = [...chosen.filter((x) => HOOK.includes(x.kind)), ...seq].sort((x, y) => x.a - y.a || x.i - y.i);

  // ——— сэмплы по кругу, лёгкий разброс высоты и громкости ———
  const [lo, hi] = R.voiceClamp;
  const voiceRef = Math.min(Math.max(ctx.voiceDb ?? R.voiceDefault, lo), hi) + R.voiceRefOffset;
  const volDb = (vol - 70) / 4;
  const seed = Math.trunc(ctx.seed || 0);
  const counters: Record<string, number> = {};
  const out: ClipSfx3[] = [];

  const emit = (a: number, fam: string, relKey: string, duck: number) => {
    const names = fams[fam] ?? [];
    if (!names.length) return;
    const n = names.length;
    const k = counters[fam] ?? 0;
    counters[fam] = k + 1;
    const name = names[((fnv1a(`${seed}|${fam}`) % n) + k) % n];
    const h = fnv1a(`${seed}|${fam}|${k}`);
    const [st, db] = R.jitter[fam] ?? [0, 0];
    const semis = (((h >>> 8) % 1001) / 1000 * 2 - 1) * st;
    const jdb = (((h >>> 18) % 1001) / 1000 * 2 - 1) * db;
    const rate = 2 ** (semis / 12);
    const s = samples[name];
    const gdb = voiceRef + P.rel[relKey] - s.refDb + jdb + duck + volDb;
    const gain = Math.min(10 ** (gdb / 20), R.maxGain);
    out.push({ a: round(a, 4), t: round(a - s.peak / rate, 4), type: name, fam, gain: round(gain, 5), rate: round(rate, 5) });
  };

  for (const c of final) {
    const { a, kind } = c;
    const duck = voiced(a) ? R.duckDb : 0;
    if (kind === "hit") {
      if (c.riser) emit(a, "riser", "riser", R.duckDb);
      emit(a, "zoomin", "zoomin", duck);
      emit(a, "hit", "hit", 0);
    } else if (kind === "hook_in") {
      emit(a, "hit", "hook_in", 0);
    } else {
      emit(a, c.fam, kind, c.fam === "hit" ? 0 : duck);
    }
  }
  return out.sort((x, y) => x.t - y.t || x.a - y.a);
}
