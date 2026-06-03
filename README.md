# AD Pulse — Учёт материалов

Система учёта складских материалов с поддержкой WhatsApp-уведомлений через Wazzup.

**Стек:** Next.js 14 · Supabase (Postgres + Auth + RLS) · Tailwind CSS · TypeScript

---

## Быстрый старт

### Клонирование

```bash
git clone <repo-url>
cd ad-pulse_6.7v
npm install
```

### Переменные окружения

Скопируйте пример и заполните значения:

```bash
cp .env.local.example .env.local
```

| Переменная | Где взять | Обязательная |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Project Settings → API → Project API keys → `publishable` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → Project API keys → `service_role` | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL вашего приложения (локально: `http://localhost:3000`, на Vercel: `https://your-app.vercel.app`) | ✅ |
| `WAZZUP_CLIENT_ID` | Партнёрский кабинет Wazzup → OAuth Apps | WhatsApp only |
| `WAZZUP_PARTNER_EMAIL` | Email партнёрского аккаунта Wazzup | WhatsApp only |
| `WAZZUP_PARTNER_PASSWORD` | Пароль партнёрского аккаунта Wazzup | WhatsApp only |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` — секретный ключ. Никогда не добавляйте его в клиентский код и не публикуйте в репозитории.

### База данных

Выполните миграции в Supabase SQL Editor (в порядке нумерации):

```
supabase/migrations/001_initial.sql
supabase/migrations/002_add_transaction_date.sql
supabase/migrations/003_wazzup.sql
supabase/migrations/004_whatsapp.sql
```

### Локальный запуск

```bash
npm run dev
# → http://localhost:3000
```

---

## Деплой на Vercel

### 1. Установите Vercel CLI

```bash
npm install -g vercel
vercel login
```

### 2. Настройте переменные окружения в Vercel

Через Dashboard: **vercel.com → Project → Settings → Environment Variables**

Добавьте все переменные из таблицы выше. Для `NEXT_PUBLIC_APP_URL` используйте URL вашего Vercel-деплоя, например `https://ad-pulse.vercel.app`.

Или через CLI (каждую переменную отдельно):

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add NEXT_PUBLIC_APP_URL
```

### 3. Деплой

```bash
vercel --prod
```

После деплоя обновите `NEXT_PUBLIC_APP_URL` на полученный URL и задеплойте повторно:

```bash
vercel env add NEXT_PUBLIC_APP_URL  # введите https://your-app.vercel.app
vercel --prod
```

### 4. Настройте Supabase Auth Redirect

В Supabase Dashboard → **Authentication → URL Configuration** добавьте в **Redirect URLs**:

```
https://your-app.vercel.app/**
```

---

## Создание первого пользователя

### Через Supabase Dashboard

1. Откройте **Supabase Dashboard → Authentication → Users**
2. Нажмите **Add user → Create new user**
3. Введите email и пароль
4. Откройте **Table Editor → profiles** — там появится строка с новым пользователем
5. Установите роль `admin` в поле `role`
6. Войдите в приложение по адресу `/login`

### Через SQL (массовое создание)

```sql
-- Создать компанию
INSERT INTO companies (name) VALUES ('Моя компания') RETURNING id;

-- Привязать существующего пользователя к компании (замените UUIDs)
UPDATE profiles
SET company_id = '<company-uuid>', role = 'admin'
WHERE id = '<user-uuid>';
```

---

## Структура ролей

| Роль | Описание |
|---|---|
| `admin` | Полный доступ, управление пользователями |
| `manager` | Редактирование компании, транзакции, планы |
| `warehouse` | Только движение материалов |
| `workshop` | Просмотр планов |

---

## Страницы приложения

| URL | Описание |
|---|---|
| `/dashboard` | Главная: остатки, последние транзакции, активные планы |
| `/dashboard/materials` | Справочник материалов |
| `/dashboard/transactions` | Движение: приход, расход, возврат, брак |
| `/dashboard/plans` | Производственные планы |
| `/dashboard/reports` | Отчёты с экспортом в Excel |
| `/dashboard/whatsapp` | Входящие WhatsApp-сообщения и авто-транзакции |
| `/dashboard/settings` | Профиль, компания, пользователи, Wazzup |

---

## Технические детали

- **Auth:** Supabase Auth (email/password)
- **База данных:** Supabase Postgres с Row Level Security (RLS)
- **Файлы:** хранятся в Supabase Storage (если подключено)
- **WhatsApp:** интеграция через Wazzup webhooks (`/api/wazzup/webhook`)
- **Регион Vercel:** `fra1` (Frankfurt) — ближайший к СНГ

---

## Команды

```bash
npm run dev      # разработка
npm run build    # production сборка
npm run start    # запуск production сборки локально
npm run lint     # линтер
```
