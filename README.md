# Clipzy — сайт

Режет длинные видео (эфиры, подкасты, интервью) на рилсы с субтитрами. Это сайт на Next.js: лендинг, вход, профиль и редактор.
Тяжёлая работа — расшифровка речи, слежение за лицом, сборка видео — идёт в отдельном **движке** (`clipzy-engine`, Python + FFmpeg + видеокарта).
Движок на Vercel не запускается: он работает на компьютере с видеокартой, а сайт обращается к нему по адресу из `NEXT_PUBLIC_ENGINE_URL`.

## Локально

```bash
npm install
npm run dev
```

Настройки — в `.env.local` (в репозиторий не попадает). Аккаунты локально хранятся в файле SQLite `data/auth.db`.

## Vercel

1. **Импорт.** Vercel → Add New → Project → этот репозиторий. Фреймворк определится сам (Next.js).
2. **База.** Storage → Create → Neon (Postgres) → подключить к проекту. Vercel сам добавит `DATABASE_URL`.
   Таблицы аккаунтов создаются при первом входе, отдельно ничего запускать не нужно.
3. **Переменные окружения** (Settings → Environment Variables):

| Переменная | Что это |
| --- | --- |
| `BETTER_AUTH_SECRET` | Случайная строка от 32 символов (ключ подписи сессий). |
| `BETTER_AUTH_URL` | Адрес сайта, например `https://clipzy.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | Тот же адрес — для картинок-превью ссылок |
| `ENGINE_SECRET` | Тот же секрет, что в `clipzy-engine/.env` |
| `NEXT_PUBLIC_ENGINE_URL` | Публичный HTTPS-адрес движка (например, через Cloudflare Tunnel) |
| `DATABASE_URL` | Добавляет Neon (шаг 2) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Вход через Google (необязательно) |
| `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT` | Вход через Telegram (необязательно) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Письма: подтверждение почты и сброс пароля |

4. **Redeploy.** Deployments → ⋯ у последнего деплоя → Redeploy: переменные окружения (особенно `NEXT_PUBLIC_*`) подхватываются только при новой сборке.
5. **Движок.** В `clipzy-engine/.env` добавьте `CLIPZY_SITE_ORIGINS=https://<ваш-домен>.vercel.app`, чтобы движок принимал запросы с сайта.

Пока движок недоступен, сайт работает (лендинг, вход, профиль), а редактор показывает «Движок обработки не запущен».
