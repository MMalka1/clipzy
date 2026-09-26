"""Английские версии сообщений движка. Сайт шлёт язык в заголовке X-Lang; по умолчанию — русский.

Сообщения в коде остаются русскими (эталон), перевод подставляется на выходе:
в ответах об ошибках (HTTPException) и в поле error у проекта и рендера.
"""

import re

EN = {
    "Сессия истекла — обновите страницу": "Your session expired — refresh the page",
    "Проект не найден": "Project not found",
    "Гостю доступно одно видео. Зарегистрируйтесь — это бесплатно — и загружайте до 3 видео в день.":
        "Guests get one video. Sign up — it's free — to upload up to 3 videos a day.",
    "С этого устройства уже пробовали. Зарегистрируйтесь, чтобы продолжить.":
        "This device has already used its free try. Sign up to continue.",
    "Не удалось прочитать видео: файл повреждён или этот формат не поддерживается. Попробуйте MP4 или MOV.":
        "Couldn't read the video: the file is damaged or the format isn't supported. Try MP4 or MOV.",
    "В файле нет видео — только звук. Загрузите видеофайл.": "This file has no video, only audio. Upload a video file.",
    "Не хватило памяти видеокарты. Закройте игры и тяжёлые программы и попробуйте снова.":
        "The GPU ran out of memory. Close games and heavy apps and try again.",
    "Файл больше 4 ГБ": "The file is larger than 4 GB",
    "Видео закрыто. Откройте доступ по ссылке или загрузите файл.":
        "The video is private. Make it viewable by link or upload the file.",
    "У видео возрастное ограничение — скачать по ссылке нельзя. Загрузите файл.":
        "The video is age-restricted and can't be fetched by link. Upload the file.",
    "Видео недоступно в этой стране. Загрузите файл.": "The video isn't available in this country. Upload the file.",
    "Сайт не отдал видео без входа в аккаунт. Загрузите файл.":
        "The site won't give the video without signing in. Upload the file.",
    "Видео недоступно или удалено.": "The video is unavailable or was removed.",
    "Не удалось скачать видео по ссылке. Попробуйте ещё раз или загрузите файл.":
        "Couldn't download the video from the link. Try again or upload the file.",
    "Видео больше 4 ГБ — загрузите файл поменьше.": "The video is larger than 4 GB — upload a smaller file.",
    "Это плейлист — вставьте ссылку на одно видео.": "That's a playlist — paste a link to a single video.",
    "Трансляция ещё идёт. Дождитесь записи и вставьте ссылку снова.":
        "The stream is still live. Wait for the recording and paste the link again.",
    "Видео длиннее 3 часов. Загрузите нужный кусок файлом.":
        "The video is longer than 3 hours. Upload the part you need as a file.",
    "Подтвердите, что это ваше видео или у вас есть права на него.":
        "Confirm that this is your video or that you have the rights to use it.",
    "Нужна ссылка на видео с YouTube, VK Видео или Rutube.": "Paste a link to a video on YouTube, VK Video or Rutube.",
    "Проект ещё обрабатывается": "The project is still processing",
    "Неверный путь проекта": "Invalid project path",
    "Исходник не найден": "Source video not found",
    "Нужен аудиофайл: MP3, WAV, M4A, OGG или FLAC": "Upload an audio file: MP3, WAV, M4A, OGG or FLAC",
    "Файл больше 100 МБ": "The file is larger than 100 MB",
    "Видео ещё не обработано": "The video hasn't been processed yet",
    "Этот перевод недоступен": "This translation isn't available",
    "В видео нет речи — переводить нечего": "There's no speech in the video — nothing to translate",
    "Не удалось перевести — проверьте интернет и попробуйте ещё раз":
        "Translation failed — check your internet connection and try again",
    "Зарегистрируйтесь — это бесплатно — чтобы скачать клип.": "Sign up — it's free — to download the clip.",
    "Неверный отрезок": "Invalid clip range",
    "Цвет в формате #RRGGBB": "Use a #RRGGBB color",
    "Формат видео: 9:16, 16:9 или 1:1": "Video format must be 9:16, 16:9 or 1:1",
    "Рендер не найден": "Render not found",
    "Файл ещё не готов": "The file isn't ready yet",
    "Обработка прервалась. Загрузите видео ещё раз.": "Processing was interrupted. Upload the video again.",
    "Дождитесь, пока закончится предыдущий экспорт.": "Wait for the previous export to finish.",
    "Обработка прерывалась несколько раз. Попробуйте видео покороче.":
        "Processing was interrupted several times. Try a shorter video.",
}

# Сообщения с числами и вставками
PATTERNS = [
    (re.compile(r"^Во Free — (\d+) видео в сутки\. Следующее — через (\d+) ч\. Или перейдите на Pro без лимитов\.$"),
     lambda m: f"Free includes {m[1]} videos a day. Next one in {m[2]} h — or go Pro for no limits."),
    (re.compile(r"^Не удалось обработать видео: (.*)$", re.S), lambda m: f"Couldn't process the video: {m[1]}"),
    (re.compile(r"^Файл больше ([\d.]+) ГБ$"), lambda m: f"The file is larger than {m[1]} GB"),
    (re.compile(r"^Во Free — (\d+) экспортов в сутки\. Завтра лимит обновится\.$"),
     lambda m: f"Free includes {m[1]} exports a day. The limit resets tomorrow."),
    (re.compile(r"^Видео длиннее (\d+) минут\. В бесплатном режиме загрузите кусок покороче\.$"),
     lambda m: f"The video is longer than {m[1]} minutes. In free mode, upload a shorter part."),
]


def lang_of(headers) -> str:
    return "en" if (headers.get("x-lang") or "").lower().startswith("en") else "ru"


def tr(text, lang: str):
    """Сообщение на языке пользователя. Незнакомое — как есть."""
    if lang != "en" or not isinstance(text, str):
        return text
    if text in EN:
        return EN[text]
    for rx, fmt in PATTERNS:
        m = rx.match(text)
        if m:
            return fmt(m)
    return text
