# FRONTEND_ARCHITECTURE.md

## Два фронтенда, одна система токенов

1. Корпоративный сайт — статический HTML/CSS/JS в `landing/` (altaidynamics.kz). Деплой: отдельный статический проект (в репозитории механизм не описан; приложение деплоится Vercel-проектом `ad-pulse`).
2. Приложение — Next.js 15.5 App Router, TypeScript strict, Tailwind 3.4, Supabase (pulse.altaidynamics.kz).

Стек не менялся (запрет без разрешения владельца). Токены — CSS custom properties: сайт `landing/assets/tokens.css`, приложение `app/globals.css`; Tailwind-маппинг в `tailwind.config.ts`.

## Структура (лендинг)

- `index.html`, `en/index.html`, `kk/index.html` — статические копии главной с инлайн-текстом (работают без JS); `docs|security|support|privacy|cookies|terms|dpa/index.html`, `404.html`, `privacy.html` (редирект), `robots.txt`, `sitemap.xml`.
- `assets/fonts.css` (32 @font-face с unicode-range, генерируется), `tokens.css` (палитра, шкалы, движение), `styles.css` (база и классы правовых страниц), `site.css` (оболочка и композиции), `motion.css` (canvas-поле, reveals, drift), `i18n.js` (словари ru/en/kk + переключатель), `app.js` (тема, меню, cookie, форма, доки), `motion.js` (AD Motion Engine).
- `assets/field/` — Altai Field: `altai-field-core.svg` (Core), `altai-field-lite.json`, `altai-field-high.json` (Lite/High/Ultra), `README.md` (происхождение). Генерация: `scripts/gen-altai-field.mjs` (Node, без зависимостей).

## Локализация (§19)

Словари (не Google Translate) в `assets/i18n.js`; `[data-i18n]`/`[data-i18n-placeholder]`; переключение мгновенное + `history.replaceState` на путь локали; прямые ссылки `/en/`, `/kk/` — статические страницы; `<html lang>`; hreflang + canonical; выбор в localStorage `adpulse-lang`. Правовые тексты — только ru (переводы требуют юридической вычитки). RTL-совместимость — на уровне структуры (логические свойства), словарь RTL добавляется без переработки компонентов.

## Формы

Контактная форма → `POST https://pulse.altaidynamics.kz/api/support/public` (JSON `{name,email,subject,message,website}`; honeypot `website`; ответ `{ok, emailSent}` | `{error}`). Состояния loading/success/error, защита от двойной отправки, aria-live. Контракт не менялся.

## Темизация

Сайт: тёмная среда по умолчанию, светлая — переключателем (`data-theme`, localStorage `adpulse-theme`). Приложение: системная по умолчанию (prefers-color-scheme), сохранённый выбор, `data-theme="dark"`.

## Рендер-профили и производительность

См. MOTION.md и PERFORMANCE.md. Прогрессивное улучшение: контент и навигация работают без JS; SVG-поле без JS; Canvas — по профилю; отказ любого слоя не ломает страницу.

## Приложение: что изменено редизайном

- `app/globals.css`: токены Architectural Mono (светлая/тёмная темы), радиусы 4/6 px, фокус/ссылки, @font-face Inter/JetBrains Mono (публичные файлы в `public/fonts/`).
- `app/layout.tsx`: шрифты через CSS (не next/font), тема — системная по умолчанию.
- `tailwind.config.ts`: бренд-палитра, радиусы.
- 27 файлов компонентов/страниц: легаси-цвета (#2563eb и др.) сведены к токенам (`--accent`, `--link`, `--focus`, семантические статусы), в т.ч. email-шаблоны.
- Логика, API, миграции, middleware не менялись.

## Тесты

Playwright: unit (39), e2e (4 файла), smoke (2), visual (2 + эталоны). Конфиги в `tests/`. Подробности и результаты — QA_REPORT.md.
