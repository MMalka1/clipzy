import type { Dict } from "../config";

/** Общие мелочи интерфейса: метки планов. */
const ru = {
  plan: {
    guest: "Гость · 1 видео",
    free: "Free · 3 видео в день",
  },
};

const en: typeof ru = {
  plan: {
    guest: "Guest · 1 video",
    free: "Free · 3 videos a day",
  },
};

const common: Dict<typeof ru> = { ru, en };
export default common;
