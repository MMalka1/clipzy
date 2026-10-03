import type { Dict } from "../config";

/** Общие мелочи интерфейса: метки планов. */
const ru = {
  plan: {
    guest: "Гость · 1 видео",
    free: "Free · 1 видео в день",
  },
};

const en: typeof ru = {
  plan: {
    guest: "Guest · 1 video",
    free: "Free · 1 video a day",
  },
};

const common: Dict<typeof ru> = { ru, en };
export default common;
