# Карта проекта AD Pulse

Навигация по репозиторию для людей и агентов. Цель: не читать все файлы, чтобы понять, где что лежит и с чего начать.

## С чего начать

1. Этот файл.
2. `graphify-out/wiki/index.md` — каталог графа: статьи по подсистемам, имена функций, исходные файлы.
3. `graphify-out/GRAPH_REPORT.md` — хабы, связи между подсистемами, вопросы, на которые граф отвечает.
4. Конкретные файлы из таблицы ниже.

Перед чтением десятков файлов спросить граф:

```bash
.graphify-venv/bin/graphify query "как входящее WhatsApp-сообщение превращается в транзакцию" --budget 1500
.graphify-venv/bin/graphify path "WhatsAppSession" "material_transactions"
.graphify-venv/bin/graphify explain "createServiceClient"
```

Граф пересобирается после каждого коммита (post-commit hook, только AST, без LLM). Вручную: `.graphify-venv/bin/graphify update .`. Артефакты лежат локально и в git не входят.

## Продукт и стек

AD Pulse — мультитенантный B2B SaaS для учёта материалов на производстве. Клиенты: бетон, арматура, стройматериалы.

Стек: Next.js 15 (App Router, TypeScript), Supabase (PostgreSQL, Auth, RLS), Tailwind CSS, Vercel. WhatsApp подключается через собственный шлюз на Baileys (отдельный сервис на VPS, не на Vercel). Уведомления идут через Telegram-бота, письма через Resend.

## Поток «сообщение → транзакция»

1. [`whatsapp-gateway/src/session.ts`](whatsapp-gateway/src/session.ts) держит Baileys-сессию компании и отправляет события вебхуком.
2. [`app/api/whatsapp/webhook/[token]/route.ts`](<app/api/whatsapp/webhook/[token]/route.ts>) принимает вебхук, сверяет токен и берёт только чаты с `is_watched = true`.
3. [`lib/whatsapp/parseAndSave.ts`](lib/whatsapp/parseAndSave.ts) выбирает разбор: текст в [`parser.ts`](lib/whatsapp/parser.ts), фото в [`parseImage.ts`](lib/whatsapp/parseImage.ts), голос в [`transcribeVoice.ts`](lib/whatsapp/transcribeVoice.ts).
4. Парсер возвращает поля и уверенность: `high` идёт в транзакцию сразу, `low` ждёт подтверждения на `/dashboard/whatsapp`.
5. Запись в `material_transactions` с `source = 'whatsapp'` идёт через [`lib/supabase/service.ts`](lib/supabase/service.ts).

## Подсистемы

| Что | Где смотреть | Когда трогать |
|---|---|---|
| Маршрутизация и роли | [`middleware.ts`](middleware.ts), [`lib/auth/role-permissions.ts`](lib/auth/role-permissions.ts) | Новая защищённая страница, изменение прав ролей |
| Supabase-клиенты | [`utils/supabase`](utils/supabase), [`lib/supabase`](lib/supabase) | Создание клиента, middleware, service role, инвайты |
| Вход и регистрация | [`app/login`](app/login), [`app/register`](app/register), [`app/verify-email`](app/verify-email), [`app/forgot-password`](app/forgot-password), [`app/reset-password`](app/reset-password), [`app/invite`](app/invite), [`app/auth/confirm`](app/auth/confirm) | Письма, приглашения, редиректы, подтверждение email |
| Онбординг компании | [`app/onboarding/setup/page.tsx`](app/onboarding/setup/page.tsx) | Первичная настройка: материалы, команда |
| Каркас дашборда | [`app/(dashboard)/layout.tsx`](<app/(dashboard)/layout.tsx>), [`components/layout/DashboardShell.tsx`](components/layout/DashboardShell.tsx) | Навигация, вкладки, мобильное меню |
| Главная | [`app/(dashboard)/dashboard/page.tsx`](<app/(dashboard)/dashboard/page.tsx>) | Остатки, последние операции, активные планы |
| Материалы | [`app/(dashboard)/dashboard/materials`](<app/(dashboard)/dashboard/materials>), [`components/materials/MaterialsClient.tsx`](components/materials/MaterialsClient.tsx) | Справочник, нормы ГОСТ, кг/метр |
| Транзакции | [`app/(dashboard)/dashboard/transactions`](<app/(dashboard)/dashboard/transactions>), [`components/transactions/TransactionsClient.tsx`](components/transactions/TransactionsClient.tsx) | Приход, расход, брак, возврат, цены |
| Планы | [`app/(dashboard)/dashboard/plans`](<app/(dashboard)/dashboard/plans>), [`components/plans`](components/plans) | План/факт, отклонения, назначение исполнителя |
| Склад | [`app/(dashboard)/dashboard/warehouse`](<app/(dashboard)/dashboard/warehouse>), [`components/warehouse/WarehouseClient.tsx`](components/warehouse/WarehouseClient.tsx) | Остатки, корректировки, уровни |
| Выпуск продукции | [`app/(dashboard)/dashboard/produce/page.tsx`](<app/(dashboard)/dashboard/produce/page.tsx>), [`components/produce`](components/produce) | Быстрый выпуск с числовой клавиатурой |
| Отчёты | [`app/(dashboard)/dashboard/reports/page.tsx`](<app/(dashboard)/dashboard/reports/page.tsx>), [`components/reports/ReportsClient.tsx`](components/reports/ReportsClient.tsx) | Экспорт в Excel, срезы |
| Настройки | [`app/(dashboard)/dashboard/settings`](<app/(dashboard)/dashboard/settings>), [`components/settings`](components/settings) | Компания, команда, пороги остатков, интеграции |
| WhatsApp: входящие | [`app/(dashboard)/dashboard/whatsapp`](<app/(dashboard)/dashboard/whatsapp>), [`app/(dashboard)/dashboard/whatsapp/connect`](<app/(dashboard)/dashboard/whatsapp/connect>) | Подтверждение разбора, QR-подключение, чаты |
| API WhatsApp | [`app/api/whatsapp`](app/api/whatsapp) | Сессия, список чатов, вебхук |
| Парсер и медиа | [`lib/whatsapp`](lib/whatsapp) | Правила разбора текста, фото, голоса |
| WhatsApp-шлюз | [`whatsapp-gateway/src`](whatsapp-gateway/src) | VPS-сервис: сессии, медиа, вебхуки |
| Telegram | [`app/api/telegram`](app/api/telegram), [`lib/telegram/send.ts`](lib/telegram/send.ts) | Алерты, подключение по коду |
| Админка | [`app/admin`](app/admin), [`app/api/admin`](app/api/admin) | Заявки на регистрацию, платформенный обзор, оплаты |
| Регистрация self-serve | [`app/register`](app/register), [`app/welcome`](app/welcome), [`lib/billing/provision.ts`](lib/billing/provision.ts) | Пилот 30 дней, создание компании без админа |
| Биллинг | [`app/(dashboard)/dashboard/billing`](<app/(dashboard)/dashboard/billing>), [`lib/billing`](lib/billing), [`app/api/billing`](app/api/billing), [`app/admin/billing`](app/admin/billing) | Тарифы, счета, Freedom Pay, вебхук, напоминания |
| Поддержка | [`app/(dashboard)/dashboard/support`](<app/(dashboard)/dashboard/support>), [`app/support`](app/support), [`lib/support`](lib/support) | Форма в кабинете и публичная, письма на altai.dx@gmail.com |
| Устройства входа | [`app/api/auth/session`](app/api/auth/session), [`components/settings/DevicesCard.tsx`](components/settings/DevicesCard.tsx) | IP и браузеры, письмо о новом входе |
| Импорт материалов | [`app/api/materials/import`](app/api/materials/import), [`lib/materials/parseImport.ts`](lib/materials/parseImport.ts) | Загрузка справочника из Excel |
| Схема БД | [`supabase/migrations`](supabase/migrations) | Новая таблица, колонка, RLS, индекс |
| Тесты | [`tests`](tests) | Unit, e2e, smoke, visual |
| CI и деплой | [`.github/workflows/ci.yml`](.github/workflows/ci.yml), [`docs/ci.md`](docs/ci.md), [`vercel.json`](vercel.json) | Проверки, окружения, выкладка |

## Схема БД

Правила: каждый запрос фильтруется по `company_id` из сессии, RLS на всех таблицах, views над RLS-таблицами с `security_invoker = on`, миграции применяются вручную и база общая для staging и production.

Ключевые таблицы:

- `materials`: справочник, `norm_concrete`, `norm_rebar`, `rebar_material_name`, `kg_per_meter`.
- `material_transactions`: движение, `counterparty`, `source`, `whatsapp_message_id`.
- `production_plans` и `plan_materials`: план/факт, `assigned_to`.
- `profiles`: `company_id`, `role`.
- `companies`: `whatsapp_enabled`, `stock_alerts_enabled`, `telegram_chat_id`, `setup_completed`.
- `material_thresholds`: порог остатка по материалу.
- `audit_log`: триггеры на планы, материалы, транзакции, начиная с миграции 031.
- `whatsapp_sessions`, `whatsapp_chats` (054), `whatsapp_messages`: шлюз и журнал.

RLS-хелперы: `private.get_my_company_id()`, `public.find_company_by_code()`. Последняя миграция: `058_fix_wazzup_view_security.sql`.

## WhatsApp-шлюз

HTTP API (Bearer `GATEWAY_TOKEN`): `GET /health`, `POST /sessions`, `GET /sessions/:companyId`, `GET /sessions/:companyId/chats`, `POST /sessions/:companyId/logout`, `GET /media/:companyId/:file`.

Файлы: [`server.ts`](whatsapp-gateway/src/server.ts) (HTTP), [`manager.ts`](whatsapp-gateway/src/manager.ts), [`store.ts`](whatsapp-gateway/src/store.ts) (сессии на диске), [`session.ts`](whatsapp-gateway/src/session.ts) (Baileys), [`webhook.ts`](whatsapp-gateway/src/webhook.ts) (outbox с ретраями), [`media.ts`](whatsapp-gateway/src/media.ts), [`config.ts`](whatsapp-gateway/src/config.ts), [`logger.ts`](whatsapp-gateway/src/logger.ts).

Переменные: `WHATSAPP_GATEWAY_URL`, `WHATSAPP_GATEWAY_TOKEN`, `WHATSAPP_WEBHOOK_TOKEN`. Риск: Baileys это неофициальный доступ, возможен бан номера, нужен выделенный номер.

## Тесты

- Unit: [`tests/unit`](tests/unit), чистые функции без браузера и БД.
- E2E: [`tests/e2e`](tests/e2e) с [`tests/fixtures/seed.ts`](tests/fixtures/seed.ts) и [`tests/helpers/e2e.ts`](tests/helpers/e2e.ts).
- Smoke и visual: [`tests/smoke`](tests/smoke), [`tests/visual`](tests/visual).
- CI гоняет `tsc --noEmit`, `lint`, `test:unit`.

## Деплой

`main` уходит на pulse.altaidynamics.kz после push, автодеплой Vercel включён. `staging` даёт preview-алиас. Прод-фиксы идут через `main`, фичи через `staging` с последующим черри-пиком.

## Граф знаний

Что лежит в `graphify-out/`:

- `graph.json` — полный граф: 1127 узлов, 2503 связи. Источник для `query`, `path`, `explain`.
- `GRAPH_REPORT.md` — хабы, неожиданные связи, список сообществ.
- `wiki/index.md` и статьи — каталог для чтения агентом.
- `graph.html` — интерактивный граф в браузере.
- `.graphify_labels.json` — русские названия сообществ.

Обновление:

```bash
.graphify-venv/bin/graphify update .                 # после правок кода, без LLM
.graphify-venv/bin/graphify cluster-only .           # пересобрать сообщества и отчёт
GRAPHIFY_BACKEND=none .graphify-venv/bin/graphify export wiki --graph graphify-out/graph.json --labels graphify-out/.graphify_labels.json
```

Если `graphify-out/` нет (новый клон или удалили папку), собрать с нуля:

```bash
uv venv .graphify-venv
UV_CACHE_DIR=.graphify-cache/uv uv pip install --python .graphify-venv/bin/python "graphifyy[leiden,sql]"
GRAPHIFY_BACKEND=none .graphify-venv/bin/graphify extract . --code-only
GRAPHIFY_BACKEND=none .graphify-venv/bin/graphify cluster-only .
GRAPHIFY_BACKEND=none .graphify-venv/bin/graphify export wiki --graph graphify-out/graph.json --labels graphify-out/.graphify_labels.json
```

`GRAPHIFY_BACKEND=none` отключает попытку неймина сообществ через `claude -p`: без ключа она всё равно падает, зато тратит время. Названия сообществ после полной пересборки будут по хабам, если не подставить `.graphify_labels.json`.

Что не попадает в граф (см. [`.graphifyignore`](.graphifyignore)): `node_modules`, `.next`, `.transcribe` (локальный whisper.cpp), `reports`, `test-results`, конфиги (`package.json`, `tsconfig.json`, `.github`), сам `graphify-out`.

Ограничение: семантический разбор markdown и PDF отключён, ключа LLM нет. Граф строится по AST кода, поэтому статья wiki про подсистему не заменяет чтение бизнес-логики в файле.
