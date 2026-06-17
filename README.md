# AD Pulse

Мультитенантный B2B SaaS для учёта производственных материалов с автоматическим парсингом WhatsApp-сообщений.

Целевая аудитория — производственные компании (бетон, арматура, стройматериалы), которым нужно отслеживать движение материалов без громоздких ERP-систем.

---

## Что умеет

**Учёт материалов**
- Справочник материалов с единицами измерения и нормами ГОСТ
- Четыре типа транзакций: приход, расход, брак (с причиной), возврат
- Остатки в реальном времени
- Производственные планы с план/факт анализом и отклонениями
- Экспорт отчётов в Excel

**WhatsApp → транзакции автоматически**
- Интеграция через Wazzup Partner API (Label, мультитенант OAuth)
- Парсер входящих сообщений извлекает материал, количество, тип операции
- Два уровня уверенности: `high` → авто-транзакция, `low` → ручное подтверждение

**Уведомления**
- Telegram-бот: алерты о браке, критическом остатке, перерасходе
- Настраиваемые пороги остатков по каждому материалу

**Администрирование**
- Регистрация через заявку → одобрение администратором → invite-email
- Четыре роли: `admin`, `manager`, `warehouse`, `workshop`
- Управление командой внутри компании

**Безопасность**
- Изоляция данных по `company_id` на уровне RLS (Supabase Row Level Security)
- URL-токен авторизация webhook endpoint
- PKCE OAuth flow для Wazzup
- Смена email только после подтверждения текущей почты 6-значным кодом

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API Routes |
| База данных | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Email | Resend |
| Уведомления | Telegram Bot API |
| WhatsApp | Wazzup Partner API v2 |
| Деплой | Vercel |

---

## Архитектура мультитенантности

Каждая компания — изолированный тенант. `company_id` всегда берётся из профиля через `auth.uid()`, а не из клиентского запроса. RLS политики на каждой таблице используют `SECURITY DEFINER` функцию `private.get_my_company_id()` как второй уровень защиты.

```
auth.uid() → profiles.company_id → RLS на всех таблицах
```

Webhook маршрутизирует входящие WhatsApp-сообщения к нужному тенанту через `channel_id → wazzup_tokens.channel_ids`.

---

## Роли

| Роль | Доступ |
|---|---|
| `admin` | Полный доступ, управление командой и настройками |
| `manager` | Планы, отчёты, все данные компании |
| `warehouse` | Приход, расход, остатки |
| `workshop` | Только расход и планы своего цеха |

---

## Локальный запуск

```bash
npm install
```

Создай `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
TELEGRAM_BOT_TOKEN=
ADMIN_TELEGRAM_CHAT_ID=
WAZZUP_WEBHOOK_TOKEN=
```

```bash
npm run dev
```

Миграции применяются через Supabase Dashboard → SQL Editor (`/supabase/migrations/` в порядке нумерации).

---

## Страницы

| URL | Описание |
|---|---|
| `/dashboard` | Главная: остатки, последние транзакции, активные планы |
| `/dashboard/materials` | Справочник материалов (CRUD) |
| `/dashboard/transactions` | Движение: приход, расход, возврат, брак |
| `/dashboard/plans` | Производственные планы |
| `/dashboard/reports` | Отчёты с экспортом в Excel |
| `/dashboard/whatsapp` | Входящие WhatsApp-сообщения и авто-транзакции |
| `/dashboard/settings` | Профиль, компания, команда, интеграции |

---

## Структура проекта

```
/app
  /(dashboard)       — защищённые страницы (middleware auth)
  /api/wazzup        — Wazzup OAuth + webhook /[token]
  /api/auth          — смена email, etc.
  /api/telegram      — Telegram webhook
/components
  /settings          — Settings page components
  /ui                — общие UI компоненты
/lib
  /supabase          — client, server, service clients
  /wazzup            — auth, parser, parseAndSave, subscribe
/supabase
  /migrations        — SQL миграции (нумерованные, применять по порядку)
/types               — TypeScript типы
```

---

## Деплой

Приложение задеплоено на Vercel. База данных — Supabase.

После каждого деплоя с новым `WAZZUP_WEBHOOK_TOKEN` нужно переподписаться на webhook через Settings → «Обновить webhook».

**Supabase Auth Redirect URLs** должен содержать:
```
https://your-domain.com/**
```

---

## Создание первого пользователя

```sql
-- Создать компанию
INSERT INTO companies (name) VALUES ('Моя компания') RETURNING id;

-- Привязать пользователя к компании (замените UUIDs)
UPDATE profiles
SET company_id = '<company-uuid>', role = 'admin'
WHERE id = '<user-uuid>';
```
