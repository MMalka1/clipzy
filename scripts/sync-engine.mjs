// Копирует код движка из ../clipzy-engine в engine/ — оттуда сайт ставит его на машину Vercel Sandbox.
// Запуск: npm run sync-engine (после правок в движке, перед коммитом).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const src = path.resolve(import.meta.dirname, "..", "..", "clipzy-engine");
const dst = path.resolve(import.meta.dirname, "..", "engine");
if (!existsSync(path.join(src, "app.py"))) {
  console.error(`Не найден движок: ${src}`);
  process.exit(1);
}

// Только код и ресурсы: без .env (секреты), .venv и кэшей
const DIRS = ["fonts", "brand", "models", "sandbox"];
const FILE = /\.(py|txt)$/;

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
let count = 0;
for (const name of readdirSync(src)) {
  const from = path.join(src, name);
  if (statSync(from).isFile() && FILE.test(name) && name !== "requirements.txt") {
    cpSync(from, path.join(dst, name));
    count++;
  } else if (DIRS.includes(name)) {
    cpSync(from, path.join(dst, name), { recursive: true });
    count += readdirSync(from, { recursive: true }).length;
  }
}
console.log(`engine/: ${count} файлов из ${src}`);
