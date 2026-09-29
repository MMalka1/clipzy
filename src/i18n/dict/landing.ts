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
  skip: "К содержимому",
  tryIt: "Попробовать",
  tryItLong: "Попробовать бесплатно",
  editor: "Редактор",
  // ролики с «вшитыми» субтитрами на языке страницы: /demo/reel-1{suffix}.mp4
  reelSuffix: "",
  // Страницы под поисковые запросы (/narezka-podkasta и др.) — только на русском; в EN показываем пометку
  seoNote: "",

  hero: {
    badge: "бета, пока бесплатно",
    title: "Режет ваши эфиры на рилсы.",
    titleMarker: "Сам.",
    aside: "ну, почти сам: хук можно поправить",
    lead: "Загружаете запись эфира, подкаста или интервью. Clipzy находит сильные куски, вырезает «э-э» и паузы, ставит субтитры в такт голосу и отдаёт вертикальные ролики.",
    cta: "Нарезать своё видео",
    ctaSecondary: "Сначала посмотреть пример",
    trust: ["Попробовать — без регистрации", "Прямо в браузере", "Файл или ссылка с YouTube, VK Видео, Rutube"],
    reel1Label: "Пример рилса: стиль «Бит» с хуком",
    reel3Label: "Пример рилса: стиль «Стикеры»",
    slate1: "стиль «Бит» + хук · 9:16",
    slate3: "стиль «Стикеры» · 9:16",
    reelsNote: "не макеты: это собрал движок Clipzy",
  },

  // Две бегущие ленты-скотча: только то, что движок умеет на самом деле
  tape: {
    a: [
      "эфир → рилсы",
      "подкаст → 9:16",
      "интервью → шортсы",
      "«э-э» → в корзину",
      `${STYLE_COUNT} стилей субтитров`,
      "9:16 · 1:1 · 16:9",
      "русский и английский",
    ],
    b: [
      "лицо всегда в кадре",
      "хук на первые 3 секунды",
      "«вжух» на склейках",
      "обложка с хуком",
      "двое в кадре → экран пополам",
      "3 видео в день бесплатно",
      "прямо в браузере",
    ],
  },

  intro: {
    label: "Ролик: длинное видео режется на три вертикальных рилса с субтитрами",
    note: "10 секунд — и понятно, что делает Clipzy",
    aside: "без звука, чтобы не пугать",
  },

  manual: {
    title: "а руками было бы так:",
    steps: [
      "расшифровать час разговора",
      "найти, что вообще резать",
      "вырезать «э-э» и паузы",
      "перекадрировать под 9:16",
      "расставить субтитры по словам",
      "подложить звуки",
    ],
    tail: "…и так с каждым клипом",
  },

  beforeAfter: {
    title: "Было → стало",
    mark: "стало",
    lead: "Слева — запись подкаста как есть. Справа — рилс, который Clipzy сделал из неё сам: кадр на лице, субтитры, заголовок.",
    before: "ДО · эфир 16:9",
    after: "ПОСЛЕ · рилс 9:16",
    hint: "← тяните →",
    aria: "Сравнить: до и после",
  },
  example: {
    title: "Вот как это выглядит",
    mark: "выглядит",
    lead: "Обычная запись подкаста: широкий кадр, две ведущие за столом. Руками никто ничего не монтировал. Жёлтая рамка — кадр, который выбрал движок.",
    watch: "на 9-й секунде рамка переедет сама",
    cropTag: "кадр 9:16",
    face: "лицо",
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
      "Знакомо: записали отличный эфир на час, а в соцсети из него не ушло ни одного ролика. Потому что нарезать, подписать и подогнать под вертикаль — это вечер на каждый клип.",
      "Clipzy забирает скучную часть. Монтажёра он не заменит, но время на идеи оставит.",
      "Сейчас бета. Если что-то работает криво, напишите — я читаю каждое сообщение.",
    ],
    signature: "автор Clipzy",
    cta: "Написать в Telegram",
  },

  features: {
    title: "Что он умеет",
    mark: "умеет",
    swipe: "листайте вбок →",
    demos: {
      karaoke: { title: "Субтитры в такт голосу", text: "Каждое слово загорается ровно тогда, когда его произносят." },
      fillers: {
        title: "Вырезает «э-э» и паузы",
        text: "«Ну», «типа», «как бы» и паузы длиннее 0,45 с уходят сами. Ролик плотнее, а смысл на месте.",
        label: "расшифровка",
        raw: [
          ["Ну,", true],
          ["э-э,", true],
          ["первые сто видео,", false],
          ["типа,", true],
          ["почти всегда плохие.", false],
        ] as [string, boolean][],
        clean: "Первые сто видео почти всегда плохие.",
        count: "−3 паразита",
        note: "это схема, а не запись",
      },
      hook: {
        title: "Находит сильные куски",
        text: "Берёт законченные мысли, а не обрывки, и пишет хук на первые 3 секунды — чтобы не пролистали.",
        plate: "Почему первые видео плохие",
        note: "настоящий хук из ролика наверху",
      },
      split: {
        title: "Двое в кадре? Пополам.",
        text: "Один сверху, другой снизу, субтитры на стыке. А если нужно — весь кадр на размытом фоне.",
        caption: ["и", "когда", "пошли", "просмотры?"],
        note: "на стоп-кадре, для наглядности",
      },
    },
    items: [
      ["Держит лицо в кадре", "Человек ходит — вертикальный кадр плавно едет за ним. В кадре двое — переключается на того, кто говорит."],
      [`${STYLE_COUNT} стилей и любой цвет`, "От строгого до «как у блогеров». Подсветку можно подогнать под ваш бренд."],
      ["Звук сам", "«Вжух» на склейке, «дзынь» на важном слове. Музыка стихает, когда говорят."],
      ["Перевод субтитров", "Русское видео с английскими субтитрами или наоборот. В такт речи."],
      ["9:16, 1:1 и 16:9", "Reels, Shorts, TikTok, VK Клипы, лента или YouTube — один клип в любом формате. И обложка с хуком."],
      ["Правится как документ", "Движок ослышался? Поправьте слово перед скачиванием — тайминг не собьётся."],
    ] as [string, string][],
  },

  styles: {
    title: "Потыкайте стили",
    mark: "стили",
  },

  pricing: {
    title: "Сколько стоит",
    mark: "стоит",
    lead: "Пока бета — работает бесплатный план. Pro и Studio включим, когда откроем оплату. Цены будут такие:",
    plans: [
      { name: "Попробовать", price: "0\u00a0₽", note: "3 видео в день, водяной знак по краям", status: "работает сейчас", now: true, featured: false },
      { name: "Pro", price: "990\u00a0₽ / мес", note: "без водяного знака, 300 минут в месяц, все стили", status: "после беты", now: false, featured: true },
      {
        name: "Studio",
        price: "2\u00a0490\u00a0₽ / мес",
        note: "без лимита минут, свой шрифт и логотип, всё сразу пачкой. Или навсегда за 9\u00a0900\u00a0₽ — без подписки",
        status: "после беты",
        now: false,
        featured: false,
      },
    ],
    proNote: "если выкладываете часто",
    receipt: {
      head: "прайс · пока бета",
      foot: ["попробовать можно без регистрации", "цены в рублях"],
      stamp: ["навсегда", "9\u00a0900\u00a0₽", "без подписки"] as [string, string, string],
    },
    cta: "Начать бесплатно",
  },

  faq: {
    title: "Частые вопросы",
    mark: "вопросы",
    items: [
      ["Нужно что-то ставить?", "Нет. Всё работает в браузере — на компьютере и на телефоне."],
      ["А регистрация нужна?", "Чтобы попробовать — нет. Чтобы скачать клип — да, но она бесплатная и без карты."],
      [
        "Какие видео подходят?",
        "Любые, где говорит человек: эфиры, подкасты, интервью, кружки, вебинары. Файлом (MP4, MOV, WEBM) или ссылкой с YouTube, VK Видео или Rutube.",
      ],
      [
        "Сколько ждать?",
        "Пока бета, движок считает на обычном процессоре, так что расшифровка займёт несколько минут. Если сервер спал, ему нужно около минуты, чтобы проснуться.",
      ],
      [
        "Чем отличается от Opus Clip?",
        "Clipzy делали с прицелом на русскую речь: он её понимает, вырезает «э-э», «ну» и «типа» и переводит субтитры с русского на английский и обратно.",
      ],
      ["Как платить?", "Пока никак: в бете работает бесплатный план. Когда откроем Pro и Studio — в рублях, по СБП."],
      ["Кому принадлежат видео?", "Вам. Мы никому их не показываем и не учим на них нейросети."],
    ] as [string, string][],
  },

  early: {
    title: "Ранний доступ",
    before: "Когда откроем оплату, первым в списке дадим Studio навсегда за ",
    price: "3\u00a0900\u00a0₽",
    after: " вместо 9\u00a0900\u00a0₽. Оставьте почту, напишем один раз.",
  },

  final: {
    slate: [
      ["сцена", "ваш эфир"],
      ["дубль", "последний"],
      ["рилсов", "сколько найдём"],
    ] as [string, string][],
    title: "Есть запись, которая пылится?",
    text: "Киньте её в Clipzy — посмотрим, сколько рилсов в ней прячется.",
    cta: "Нарезать своё видео",
    note: "Попробовать — без регистрации и без карты",
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
    autoHint: "листает сам, пока не ткнёте",
    surprise: "Удиви меня",
    cta: "Попробовать на своём видео",
  },

  waitlist: {
    emailLabel: "Электронная почта",
    placeholder: "you@mail.ru",
    submit: "Записаться",
    failed: "Не получилось, попробуйте ещё раз",
    already: "Эта почта уже в списке.",
    added: "Вы в списке. Напишем, когда откроем доступ.",
    badEmail: "Проверьте адрес почты",
    stamp: "в списке!",
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
  skip: "Skip to content",
  tryIt: "Try it",
  tryItLong: "Try it free",
  editor: "Editor",
  reelSuffix: "-en",
  seoNote: "This page is in Russian only. The main page and the editor are available in English.",

  hero: {
    badge: "beta, free for now",
    title: "Turns your streams into reels.",
    titleMarker: "On its own.",
    aside: "okay, almost: you might tweak the hook",
    lead: "Drop in a stream, a podcast or an interview. Clipzy finds the strong moments, cuts the “um”s and dead air, adds captions that follow the voice, and hands you vertical clips.",
    cta: "Clip your own video",
    ctaSecondary: "See an example first",
    trust: ["Try it without signing up", "Right in your browser", "A file, or a YouTube / VK Video / Rutube link"],
    reel1Label: "Example reel: “Beat” style with a hook",
    reel3Label: "Example reel: “Stickers” style",
    slate1: "“Beat” style + hook · 9:16",
    slate3: "“Stickers” style · 9:16",
    reelsNote: "not mockups: the Clipzy engine made these",
  },

  tape: {
    a: [
      "stream → reels",
      "podcast → 9:16",
      "interview → shorts",
      "“um” → trash",
      `${STYLE_COUNT} caption styles`,
      "9:16 · 1:1 · 16:9",
      "Russian & English",
    ],
    b: [
      "face stays in frame",
      "a hook for the first 3 seconds",
      "whoosh on every cut",
      "a cover with the hook",
      "two people → split screen",
      "3 free videos a day",
      "right in your browser",
    ],
  },

  intro: {
    label: "Video: a long recording gets cut into three vertical reels with captions",
    note: "10 seconds, and you get what Clipzy does",
    aside: "muted, so it won't startle you",
  },

  manual: {
    title: "and by hand, it'd go like this:",
    steps: [
      "transcribe an hour of talk",
      "find what's worth cutting",
      "cut the “um”s and pauses",
      "reframe for 9:16",
      "time the captions word by word",
      "add sound effects",
    ],
    tail: "…for every single clip",
  },

  beforeAfter: {
    title: "Before → after",
    mark: "after",
    lead: "Left: the podcast recording as it is. Right: the reel Clipzy made from it on its own — face in frame, captions, a hook.",
    before: "BEFORE · 16:9 stream",
    after: "AFTER · 9:16 reel",
    hint: "← drag →",
    aria: "Compare before and after",
  },
  example: {
    title: "Here's what it looks like",
    mark: "looks like",
    lead: "A plain podcast recording: wide shot, two hosts at a table. Nobody edited a thing by hand. The yellow frame is the crop the engine picked.",
    watch: "at 0:09 the frame jumps on its own",
    cropTag: "9:16 crop",
    face: "face",
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
      "You know how it goes: you record a great hour-long stream, and not a single clip makes it to social. Because cutting, captioning and reframing for vertical eats an evening per clip.",
      "Clipzy takes the boring part. It won't replace an editor, but it'll leave you time for ideas.",
      "It's a beta. If something works weird, write to me. I read every message.",
    ],
    signature: "— the person behind Clipzy",
    cta: "Message me on Telegram",
  },

  features: {
    title: "What it does",
    mark: "does",
    swipe: "swipe sideways →",
    demos: {
      karaoke: { title: "Captions that keep time", text: "Every word lights up right as it's spoken." },
      fillers: {
        title: "Cuts the “um”s and pauses",
        text: "“Um”, “uh”, “you know” and any pause over 0.45 s just go. Tighter clip, same point.",
        label: "transcript",
        raw: [
          ["Um,", true],
          ["uh,", true],
          ["your first hundred videos are,", false],
          ["you know,", true],
          ["almost always bad.", false],
        ],
        clean: "Your first hundred videos are almost always bad.",
        count: "−3 fillers",
        note: "a diagram, not a recording",
      },
      hook: {
        title: "Finds the strong moments",
        text: "Complete thoughts, not scraps. Plus a hook for the first 3 seconds, so nobody scrolls past.",
        plate: "Why your first videos are bad",
        note: "the real hook from the reel up top",
      },
      split: {
        title: "Two people in frame? Split it.",
        text: "One on top, one below, captions where they meet. Or the whole shot on a blurred background.",
        caption: ["so", "when", "did", "the", "views", "come?"],
        note: "shown on a still, for clarity",
      },
    },
    items: [
      ["Keeps the face in frame", "Someone walks around, the vertical frame glides after them. Two people? It switches to whoever's talking."],
      [`${STYLE_COUNT} styles, any color`, "From clean and serious to full-on creator vibes. Match the highlight to your brand."],
      ["Sound, handled", "A whoosh on each cut, a ding on the key word. Music ducks when someone talks."],
      ["Caption translation", "Russian video with English captions, or the other way round. Still in sync with the speech."],
      ["9:16, 1:1 and 16:9", "Reels, Shorts, TikTok, your feed or YouTube: one clip, any shape. Plus a cover with the hook."],
      ["Edit it like a doc", "Misheard a word? Fix it before you download. The timing stays put."],
    ],
  },

  styles: {
    title: "Go on, poke the styles",
    mark: "poke",
  },

  pricing: {
    title: "What it'll cost",
    mark: "cost",
    lead: "It's a beta, so the free plan is what's on. Pro and Studio switch on when we open payments. Here's what they'll cost:",
    plans: [
      { name: "Free", price: "$0", note: "3 videos a day, watermark on the edges", status: "live now", now: true, featured: false },
      { name: "Pro", price: "$15 / mo", note: "no watermark, 300 minutes a month, every style", status: "after the beta", now: false, featured: true },
      {
        name: "Studio",
        price: "$39 / mo",
        note: "unlimited minutes, your own font and logo, batch everything at once. Or $149 once, no subscription",
        status: "after the beta",
        now: false,
        featured: false,
      },
    ],
    proNote: "if you post a lot",
    receipt: {
      head: "price list · still in beta",
      foot: ["try it with no sign-up", "prices in US dollars"],
      stamp: ["forever", "$149", "no subscription"],
    },
    cta: "Start for free",
  },

  faq: {
    title: "Questions people ask",
    mark: "ask",
    items: [
      ["Do I need to install anything?", "Nope. It all runs in the browser, on your computer or your phone."],
      ["Do I need an account?", "Not to try it. To download a clip, yes, but it's free and there's no card involved."],
      [
        "What kind of videos work?",
        "Anything with someone talking: streams, podcasts, interviews, talking-head clips, webinars. As a file (MP4, MOV, WEBM) or a YouTube, VK Video or Rutube link.",
      ],
      [
        "How long does it take?",
        "During the beta the engine runs on a regular CPU, so transcription takes a few minutes. If the server was asleep, give it about a minute to wake up.",
      ],
      [
        "How is it different from Opus Clip?",
        "It's built for Russian as well as English: it understands both, cuts filler words in both, and translates captions from one to the other.",
      ],
      ["How do I pay?", "You don't, yet: the beta runs on the free plan. Pro and Studio open after the beta, and we'll email everyone on the early-access list."],
      ["Who owns my videos?", "You do. We don't show them to anyone and we don't train AI on them."],
    ],
  },

  early: {
    title: "Early access",
    before: "When we switch on payments, everyone on this list gets Studio forever for ",
    price: "$49",
    after: " instead of $149. Leave your email, we'll write exactly once.",
  },

  final: {
    slate: [
      ["scene", "your stream"],
      ["take", "final"],
      ["reels", "as many as we find"],
    ],
    title: "Got a recording gathering dust?",
    text: "Toss it into Clipzy and let's see how many reels are hiding in there.",
    cta: "Clip your own video",
    note: "Try it with no sign-up and no card",
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
    autoHint: "flipping by itself until you tap",
    surprise: "Surprise me",
    cta: "Try it on your own video",
  },

  waitlist: {
    emailLabel: "Email",
    placeholder: "you@example.com",
    submit: "Join",
    failed: "That didn't work, please try again",
    already: "This email is already on the list.",
    added: "You're on the list. We'll email you when access opens.",
    badEmail: "Please check the email address",
    stamp: "you're in!",
  },
};

const landing: Dict<typeof ru> = { ru, en };
export default landing;
