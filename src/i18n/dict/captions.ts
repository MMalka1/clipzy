import type { Dict } from "../config";
import type { CaptionStyleId } from "@/lib/captions";

/** Названия стилей субтитров и цветов — общие для лендинга и редактора. */
const ru = {
  styles: {
    beat: "Бит",
    box: "Плашка",
    outline: "Контур",
    karaoke: "Караоке",
    minimal: "Минимал",
    neon: "Неон",
    comic: "Комикс",
    typewriter: "Стикеры",
    marker: "Маркер",
    podcast: "Подкаст",
    glass: "Стекло",
    retro: "Ретро",
    pop: "Одно слово",
    mrbeast: "Жирный",
    gradient: "Градиент",
  } satisfies Record<CaptionStyleId, string>,
  // по значению цвета (null — «как в стиле»)
  accents: {
    default: "Как в стиле",
    "#FFD60A": "Жёлтый",
    "#B6FF3B": "Лайм",
    "#22E5FF": "Бирюзовый",
    "#FF3DCF": "Розовый",
    "#FF7A1A": "Оранжевый",
    "#FF3B30": "Красный",
    "#9B6BFF": "Фиолетовый",
    "#FFFFFF": "Белый",
  } as Record<string, string>,
  textColors: {
    default: "Белый",
    "#FFF3D6": "Кремовый",
    "#FFE14D": "Жёлтый",
    "#C8FFE9": "Мятный",
  } as Record<string, string>,
  customColor: "Свой цвет",
};

const en: typeof ru = {
  styles: {
    beat: "Beat",
    box: "Box",
    outline: "Outline",
    karaoke: "Karaoke",
    minimal: "Minimal",
    neon: "Neon",
    comic: "Comic",
    typewriter: "Stickers",
    marker: "Marker",
    podcast: "Podcast",
    glass: "Glass",
    retro: "Retro",
    pop: "One word",
    mrbeast: "Bold",
    gradient: "Gradient",
  },
  accents: {
    default: "Style default",
    "#FFD60A": "Yellow",
    "#B6FF3B": "Lime",
    "#22E5FF": "Cyan",
    "#FF3DCF": "Pink",
    "#FF7A1A": "Orange",
    "#FF3B30": "Red",
    "#9B6BFF": "Purple",
    "#FFFFFF": "White",
  },
  textColors: {
    default: "White",
    "#FFF3D6": "Cream",
    "#FFE14D": "Yellow",
    "#C8FFE9": "Mint",
  },
  customColor: "Custom color",
};

const captions: Dict<typeof ru> = { ru, en };
export default captions;

/** Подписи для палитры: [{ name, value }] с переводом имени. */
export function localizeColors(
  list: { name: string; value: string | null }[],
  names: Record<string, string>,
): { name: string; value: string | null }[] {
  return list.map((c) => ({ ...c, name: names[c.value ?? "default"] ?? c.name }));
}
