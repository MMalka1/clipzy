// Превью выбирает звуковые эффекты так же, как движок: clipSfx3() против эталонов sfx_logic.clip_sfx().
// Эталоны: engine/sfx/fixtures.json (делает tools/sfx_fixtures.py в движке, сюда копирует npm run sync-engine).
// Запуск: npm run test:sfx
import { readFileSync } from "node:fs";
import path from "node:path";
import { clipSfx3 } from "../src/lib/sfx.ts";

const file = path.resolve(import.meta.dirname, "..", "engine", "sfx", "fixtures.json");
const { kit, cases } = JSON.parse(readFileSync(file, "utf8"));
const TOL = 1e-3;
let failed = 0;
for (const c of cases) {
  const got = clipSfx3(c.ctx, kit, c.settings);
  const want = c.expected;
  const bad = [];
  if (got.length !== want.length) bad.push(`звуков ${got.length}, ждали ${want.length}`);
  for (let i = 0; i < Math.min(got.length, want.length); i++) {
    const g = got[i];
    const w = want[i];
    if (g.type !== w.type || g.fam !== w.fam) bad.push(`#${i}: ${g.type} вместо ${w.type}`);
    for (const k of ["a", "t", "gain", "rate"]) {
      if (Math.abs(g[k] - w[k]) > TOL) bad.push(`#${i} ${k}: ${g[k]} вместо ${w[k]}`);
    }
  }
  if (bad.length) {
    failed++;
    console.log(`✗ ${c.name}\n   ${bad.slice(0, 6).join("\n   ")}`);
  } else {
    console.log(`✓ ${c.name} (${got.length})`);
  }
}
if (failed) {
  console.error(`\n${failed} из ${cases.length} не совпали`);
  process.exit(1);
}
console.log(`\nВсе ${cases.length} совпали`);
