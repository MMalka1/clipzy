import type { Dict } from "../config";
import { CAPTION_STYLES } from "@/lib/captions";

const STYLE_COUNT = CAPTION_STYLES.length;

/** Тексты лендинга (главная), живой примерки стилей и формы раннего доступа. */
const ru = {
  logoHome: "Clipzy — на главную",
  navMain: "Основная навигация",
  navFooter: "Нижняя навигация",
  nav: {
    example: "Пример",
    features: "Что умеет",
    pricing: "Цены",
    faq: "Вопросы",
  },
  tryIt: "Попробовать",
  editor: "Редактор",
  // ролики с «вшитыми» субтитрами на языке страницы: /demo/reel-1{suffix}.mp4
  reelSuffix: "",

  hero: {
    badge: "бета, пока бесплатно",
    title: "Режет ваши эфиры на рилсы.",
    titleMarker: "Сам.",
    aside: "ну, почти сам: хук можно поправить",
    lead: "Загружаете запись эфира, подкаста или интервью. Clipzy находит сильные куски, вырезает «э-э» и паузы, ставит субтитры в такт голосу и отдаёт вертикальные ролики.",
    cta: "Нарезать своё видео",
    ctaNote: "Первое видео без регистрации",
    reel1Label: "Пример рилса: стиль «Бит» с хуком",
    reel3Label: "Пример рилса: стиль «Стикеры»",
    reelsNote: "не макеты: это собрал движок Clipzy",
  },

  intro: {
    label: "Ролик: длинное видео режется на три вертикальных рилса с субтитрами",
    note: "10 секунд — и понятно, что делает Clipzy",
    aside: "без звука, чтобы не пугать",
  },

  example: {
    title: "Вот как это выглядит",
    lead: "Обычная запись подкаста: широкий кадр, два человека за столом. Руками никто ничего не монтировал.",
    sourceAlt: "Исходное видео: широкий кадр, две ведущие за столом",
    before: "было: подкаст, 16:9",
    reelLabel: "Готовый рилс из этого подкаста",
    after: "стало: рилс 9:16, 13 сек",
    checks: [
      "вырезал вертикальный кадр вокруг лица",
      "сам перевёл кадр на вторую ведущую",
      "подсветил слова по одному, с плавным наездом",
      "поставил водяной знак по краям (так во Free)",
    ],
    footnote:
      "Для примеров взяли бесплатные ролики с Pexels. Звука в них нет, поэтому текст субтитров написали сами.",
  },

  letter: {
    title: "Почему Clipzy",
    paragraphs: [
      "Знакомая история: записали хороший эфир на час, а в соцсети из него не ушло ни одного ролика. Потому что нарезать, расставить субтитры и подогнать под вертикальный кадр — это вечер работы на каждый клип.",
      "Clipzy забирает эту рутину: расшифровку, нарезку, субтитры, кадр. Монтажёра он не заменяет. Он убирает скучную часть, чтобы у вас оставалось время на идеи.",
      "Сейчас это бета. Если что-то работает криво, напишите. Я читаю каждое сообщение.",
    ],
    signature: "автор Clipzy",
  },

  features: {
    title: "Что он умеет",
    items: [
      ["Субтитры в такт голосу", "Каждое слово подсвечивается ровно тогда, когда его произносят."],
      ["Вырезает «э-э» и паузы", "«Ну», «типа», «как бы» и тишина уходят сами. Ролик становится плотнее."],
      ["Держит лицо в кадре", "Если человек ходит по кадру, вертикальный кадр плавно едет за ним."],
      ["Находит сильные куски", "Выбирает законченные мысли и пишет хук на первые три секунды."],
      [`${STYLE_COUNT} стилей и любой цвет`, "От строгого до «как у блогеров». Цвет подсветки подбирается под ваш бренд."],
      ["Звук сам", "Щелчок на смене плана, лёгкий звон на важном слове. Музыка стихает, когда говорят."],
      ["Перевод субтитров", "Русское видео с английскими субтитрами или наоборот. В такт речи."],
      ["Весь кадр, если нужно", "Когда в кадре двое, можно отдалить картинку. Края заполнит размытый фон."],
    ] as [string, string][],
  },

  styles: {
    title: "Потыкайте стили",
  },

  pricing: {
    title: "Сколько стоит",
    plans: [
      { name: "Попробовать", price: "0 $", note: "3 видео в день, водяной знак по краям" },
      { name: "Pro", price: "15 $ / мес", note: "без водяного знака, 300 минут в месяц, все стили" },
      { name: "Studio", price: "39 $ / мес", note: "без лимита минут, свой шрифт и логотип, всё сразу пачкой" },
    ],
    asideNote: "кстати:",
    aside: "Studio можно купить навсегда за 149 $, без подписки.",
    cta: "Начать бесплатно",
  },

  faq: {
    title: "Частые вопросы",
    items: [
      ["Нужно что-то ставить?", "Нет. Всё работает в браузере, на компьютере и на телефоне."],
      ["Какие видео подходят?", "Любые, где говорит человек: эфиры, подкасты, интервью, кружки, вебинары."],
      ["А если распознает с ошибками?", "Текст правится перед скачиванием, как обычный документ. Тайминг не сбивается."],
      ["Чем лучше Opus Clip?", "Нормально понимает русский, принимает оплату из России и умеет вырезать слова-паразиты."],
      ["Можно оплатить из России?", "Да, российскими картами. И зарубежными тоже."],
      ["Кому принадлежат видео?", "Вам. Мы не показываем их никому и не учим на них нейросети."],
    ] as [string, string][],
  },

  early: {
    title: "Ранний доступ",
    before: "Когда откроем оплату, первым в списке дадим Studio навсегда за ",
    price: "49 $",
    after: " вместо 149. Оставьте почту, напишем один раз.",
  },

  playground: {
    // повторяет текст демо-рилса
    phrases: [
      ["Первые", "сто", "видео"],
      ["почти", "всегда", "плохие"],
      ["и", "это", "нормально"],
    ],
    videoLabel: "Пример: субтитры поверх видео",
    styleNote: "1. стиль",
    styleAria: "Стиль субтитров",
    colorNote: "2. цвет подсветки",
    colorAria: "Цвет подсветки",
    hint: "В готовом ролике то же самое, только слова подсвечиваются ровно в тот момент, когда их говорят.",
  },

  waitlist: {
    emailLabel: "Электронная почта",
    placeholder: "you@mail.ru",
    submit: "Записаться",
    failed: "Не получилось, попробуйте ещё раз",
    already: "Эта почта уже в списке.",
    added: "Вы в списке. Напишем, когда откроем доступ.",
    badEmail: "Проверьте адрес почты",
  },
};

const en: typeof ru = {
  logoHome: "Clipzy home",
  navMain: "Main navigation",
  navFooter: "Footer navigation",
  nav: {
    example: "Example",
    features: "Features",
    pricing: "Pricing",
    faq: "FAQ",
  },
  tryIt: "Try it",
  editor: "Editor",
  reelSuffix: "-en",

  hero: {
    badge: "beta, free for now",
    title: "Turns your streams into reels.",
    titleMarker: "On its own.",
    aside: "okay, almost: you might tweak the hook",
    lead: "Drop in a stream, a podcast or an interview. Clipzy finds the strong moments, cuts the “um”s and dead air, adds captions that follow the voice, and hands you vertical clips.",
    cta: "Clip your own video",
    ctaNote: "First video, no sign-up",
    reel1Label: "Example reel: “Beat” style with a hook",
    reel3Label: "Example reel: “Stickers” style",
    reelsNote: "not mockups: the Clipzy engine made these",
  },

  intro: {
    label: "Video: a long recording gets cut into three vertical reels with captions",
    note: "10 seconds, and you get what Clipzy does",
    aside: "muted, so it won't startle you",
  },

  example: {
    title: "Here's what it looks like",
    lead: "A plain podcast recording: wide shot, two people at a table. Nobody edited a thing by hand.",
    sourceAlt: "Source video: wide shot, two hosts at a table",
    before: "before: podcast, 16:9",
    reelLabel: "The finished reel cut from this podcast",
    after: "after: 9:16 reel, 13 sec",
    checks: [
      "cropped a vertical frame around the face",
      "switched to the second host by itself",
      "lit up the words one by one, with a slow push-in",
      "put a watermark on the edges (that's the Free plan)",
    ],
    footnote:
      "The examples use free stock clips from Pexels. They have no audio, so we wrote the caption text ourselves.",
  },

  letter: {
    title: "Why Clipzy",
    paragraphs: [
      "You know how it goes: you record a great hour-long stream, and not a single clip from it ever makes it to social. Because cutting, captioning and reframing for vertical eats a whole evening per clip.",
      "Clipzy takes that grind off your plate: transcript, cuts, captions, framing. It won't replace an editor. It handles the boring part, so you have time left for ideas.",
      "Right now it's a beta. If something works weird, write to me. I read every message.",
    ],
    signature: "— the person behind Clipzy",
  },

  features: {
    title: "What it does",
    items: [
      ["Captions that keep time", "Every word lights up right as it's spoken."],
      ["Cuts the “um”s and pauses", "“Um”, “like”, “you know” and dead air just go away. The clip gets tighter."],
      ["Keeps the face in frame", "If someone walks around, the vertical frame glides after them."],
      ["Finds the strong moments", "Picks complete thoughts and writes a hook for the first three seconds."],
      [`${STYLE_COUNT} styles, any color`, "From clean and serious to full-on creator vibes. Match the highlight to your brand."],
      ["Sound, handled", "A click on each cut, a soft chime on the key word. Music ducks when someone talks."],
      ["Caption translation", "Russian video with English captions, or the other way round. Still in sync with the speech."],
      ["The whole shot, if you need it", "Two people in frame? Zoom out, and a blurred background fills the edges."],
    ],
  },

  styles: {
    title: "Go on, poke the styles",
  },

  pricing: {
    title: "What it'll cost",
    plans: [
      { name: "Free", price: "$0", note: "3 videos a day, watermark on the edges" },
      { name: "Pro", price: "$15 / mo", note: "no watermark, 300 minutes a month, every style" },
      { name: "Studio", price: "$39 / mo", note: "unlimited minutes, your own font and logo, batch everything at once" },
    ],
    asideNote: "by the way:",
    aside: "Studio will also come as a one-time $149 purchase. No subscription.",
    cta: "Start for free",
  },

  faq: {
    title: "Questions people ask",
    items: [
      ["Do I need to install anything?", "Nope. It all runs in the browser, on your computer or your phone."],
      ["What kind of videos work?", "Anything with someone talking: streams, podcasts, interviews, talking-head clips, webinars."],
      ["What if it mishears something?", "Fix the text before you download, like editing a doc. The timing stays put."],
      ["How is it different from Opus Clip?", "It cuts filler words, not just silences. And it speaks Russian as well as English, if you make content in both."],
      ["How do I pay?", "You don't, yet. Clipzy is in beta and free for now. Paid plans are on the way: join the early-access list below and we'll let you know."],
      ["Who owns my videos?", "You do. We don't show them to anyone and we don't train AI on them."],
    ],
  },

  early: {
    title: "Early access",
    before: "When we switch on payments, everyone on this list gets Studio forever for ",
    price: "$49",
    after: " instead of $149. Leave your email, we'll write exactly once.",
  },

  playground: {
    phrases: [
      ["First", "hundred", "videos"],
      ["almost", "always", "bad"],
      ["and", "that's", "fine"],
    ],
    videoLabel: "Example: captions over a video",
    styleNote: "1. style",
    styleAria: "Caption style",
    colorNote: "2. highlight color",
    colorAria: "Highlight color",
    hint: "The finished clip looks just like this, except each word lights up the moment it's spoken.",
  },

  waitlist: {
    emailLabel: "Email",
    placeholder: "you@example.com",
    submit: "Join",
    failed: "That didn't work, please try again",
    already: "This email is already on the list.",
    added: "You're on the list. We'll email you when access opens.",
    badEmail: "Please check the email address",
  },
};

const landing: Dict<typeof ru> = { ru, en };
export default landing;
