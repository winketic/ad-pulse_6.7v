# AD Pulse — CLAUDE.md

## Что это за проект
AD Pulse — мультитенантный B2B SaaS для учёта материалов на производстве.
Целевые клиенты: производственные компании (бетон, арматура, стройматериалы).
Ключевая фича: автоматический парсинг WhatsApp сообщений через Wazzup API.

## Стек
- Next.js 14 (App Router, TypeScript)
- Supabase (PostgreSQL + Auth + RLS)
- Tailwind CSS
- Vercel (деплой)

## Критичные правила

### Мультитенантность
- КАЖДЫЙ запрос к БД должен фильтроваться по company_id
- company_id всегда берётся из профиля текущего пользователя через Supabase Auth
- Никогда не доверяй company_id из query params или body — только из сессии
- RLS политики в Supabase — второй уровень защиты, не единственный

### База данных
- Все миграции хранятся в /supabase/migrations/
- Никогда не меняй схему напрямую — только через новый файл миграции
- Формат имени: 00X_описание.sql

### API роуты Wazzup
- /api/wazzup/webhook — публичный endpoint (без авторизации), отвечает 200 OK немедленно
- /api/wazzup/connect — требует авторизацию Supabase
- /api/wazzup/callback — публичный (редирект от Wazzup после OAuth)
- Wazzup client_id: 2083-9002

### Парсинг сообщений
- Файл: /lib/wazzup/parser.ts
- Два уровня уверенности: high (все поля) → авто-транзакция, low → ручное подтверждение
- source поле в transactions: 'manual' | 'whatsapp'

## Структура папок
/app
  /(dashboard)     — защищённые страницы (требуют авторизацию)
  /api/wazzup      — Wazzup интеграция
/components        — переиспользуемые компоненты
/lib
  /supabase        — client.ts, server.ts, service.ts
  /wazzup          — auth.ts, parser.ts, parseAndSave.ts
/supabase
  /migrations      — SQL миграции
/types             — TypeScript типы

## Роли пользователей
- admin — полный доступ, управление пользователями
- manager — планы, отчёты, все данные
- warehouse — склад, приход/расход
- workshop — только расход и планы своего цеха

## Переменные окружения (.env.local)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=https://ad-pulse-eight.vercel.app
TELEGRAM_BOT_TOKEN=8940872486:AAHsPkkyS4JnW_k51UX4XSluoXqoLJWGcLU
ADMIN_TELEGRAM_CHAT_ID=1700146125
RESEND_API_KEY
EMAIL_FROM=onboarding@resend.dev

## Текущий статус разработки

### Что реализовано (июнь 2026)

#### Авторизация
- /login, /forgot-password, /reset-password, /verify-email, /invite
- /auth/confirm — обработка token_hash из писем
- Middleware защита всех /dashboard/* роутов
- Шаблоны писем на русском (сброс пароля, подтверждение, приглашение)

#### Учёт материалов
- Справочник материалов (CRUD) с единицами измерения и нормами ГОСТ
- Движение: приход, расход, брак (с причиной), возврат
- Остатки в реальном времени
- Производственные планы с план/факт и отклонениями
- Отчёты с экспортом в Excel
- Пагинация транзакций

#### Интеграции
- Telegram бот @adpulse_alerts_bot (токен в TELEGRAM_BOT_TOKEN)
  - Подключение по 8-символьному коду компании
  - Алерты: брак, критический остаток, перерасход
  - Уведомления администратору о новых заявках
  - Admin chat_id: 1700146125
- Wazzup OAuth (client_id: 4578-6962) — ожидаем одобрения redirect_uri
- Webhook /api/wazzup/webhook — готов к приёму сообщений
- Парсер WhatsApp сообщений (текст + медиа)

#### Регистрация и администрирование
- /register — форма заявки для новых клиентов
- /admin/registrations — список заявок (только altai.dx@gmail.com)
- /admin/approve/[id] — одобрение заявки → создание компании → invite email
- При новой заявке — уведомление в Telegram администратору

#### PWA и мобильное
- manifest.json, иконки, theme-color #05050a
- Адаптивная нижняя навигация (6 пунктов, иконки #00f5c4)
- Логотип SVG во всех точках входа

#### Email (Resend)
- RESEND_API_KEY в Vercel env
- EMAIL_FROM: onboarding@resend.dev
- Supabase SMTP: smtp.resend.com:465, user: resend
- Лимит Supabase free tier: 2 письма/час

### Известные баги (требуют фикса)
- listCompanyUsers иногда крашит настройки
- Кнопка одобрить в /admin/approve — ApproveButton компонент создан, тестирование pending
- SMTP периодически не работает — fallback на встроенный Supabase email

### Ждём от внешних сервисов
- Wazzup: одобрение redirect_uri https://ad-pulse-eight.vercel.app/api/wazzup/callback

## Важные решения
- Supabase free tier пока для пилота, Pro когда появятся клиенты
- PWA (адаптивный веб) вместо нативного мобильного приложения на первом этапе
- Wazzup Label (мультитенант OAuth) — каждый клиент подключает свой WhatsApp