# AD Pulse — AGENTS.md

## Что это за проект
AD Pulse — мультитенантный B2B SaaS для учёта материалов на производстве.
Целевые клиенты: производственные компании (бетон, арматура, стройматериалы).
Ключевая фича: автоматический парсинг WhatsApp сообщений через собственный шлюз на Baileys.

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
- Миграции применяются ВРУЧНУЮ в Supabase Dashboard (SQL Editor) — ассистент только готовит SQL и выводит его на проверку
- База ОБЩАЯ для staging и production — миграция применяется один раз и действует на оба окружения; код должен переживать окно до/после применения (select("*") вместо явного списка новых колонок, fail-open для опциональных настроек)
- **Views над таблицами с RLS обязаны иметь `security_invoker = on`.** По умолчанию
  view выполняется от имени владельца и обходит RLS: проверено на практике — анонимный
  запрос с публичным anon-ключом читал сообщения всех компаний. После `create view`
  всегда: `alter view ... set (security_invoker = on);`

### Схема БД — актуальные поля (сверх базовой схемы 001)
- materials: norm_concrete, norm_rebar (нормы списания на 1 шт продукции), rebar_material_name (какой металл списывать: 'Арматура'/'Проволока', NULL = 'Арматура'), kg_per_meter (кг→м конвертация: если задано — ввод в кг, хранение в метрах)
- production_plans: assigned_to (uuid → profiles, исполнитель плана)
- material_transactions: counterparty (text), source ('manual'|'whatsapp'), whatsapp_message_id
- companies: whatsapp_enabled, stock_alerts_enabled (гейт алертов критического остатка), telegram_chat_id, telegram_connected, setup_completed
- audit_log: журнал изменений (company_id, table_name, record_id, action, changed_by, old_data/new_data jsonb) — пишется SECURITY DEFINER триггерами на production_plans, materials, material_transactions; changed_by = auth.uid(), NULL для service role. ВАЖНО: записи, созданные до миграции 031, аудита не имеют
- material_thresholds: min_quantity per material (пороги алертов остатка)
- telegram_rate_limits: анти-brute-force кодов подключения

### Парсинг сообщений
- Файл: /lib/whatsapp/parser.ts
- Два уровня уверенности: high (все поля) → авто-транзакция, low → ручное подтверждение
- source поле в transactions: 'manual' | 'whatsapp'

## Собственный WhatsApp-шлюз (Baileys)

Отдельный сервис в `/whatsapp-gateway` (Node + Baileys, деплой на VPS, **не на Vercel**).
Клиент подключает свой номер по QR, видит список своих чатов с названиями и отмечает нужные.

- Сессии, чаты, медиа, вебхуки: `whatsapp-gateway/src/session.ts`
- API шлюза (Bearer `GATEWAY_TOKEN`): `GET /health`, `POST /sessions`, `GET /sessions/:companyId`,
  `GET /sessions/:companyId/chats`, `POST /sessions/:companyId/logout`, `GET /media/:companyId/:file`
- Роуты приложения: `/api/whatsapp/session`, `/api/whatsapp/chats`, `/api/whatsapp/webhook/[token]`
- UI: `/dashboard/whatsapp/connect`
- Таблицы (миграция 054): `whatsapp_sessions`, `whatsapp_chats`;
  журнал сообщений — таблица `whatsapp_messages` (`chat_name`, `chat_type`, `provider`)
- Фильтрация: обрабатываются только чаты с `whatsapp_chats.is_watched = true`.
  Новый чат появляется в списке выключенным — иначе мусор попадал бы в учёт
- Медиа: шлюз отдаёт `/media/...` по токену; `parseAndSave` берёт `gatewayMediaToken()`
  (OAuth-провайдера больше нет — все сообщения идут через шлюз)
- Env приложения: `WHATSAPP_GATEWAY_URL`, `WHATSAPP_GATEWAY_TOKEN`, `WHATSAPP_WEBHOOK_TOKEN`;
  LLM-разбор — `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` (gemma4 на alem.ai)
- Риск: Baileys — неофициальный доступ (ToS WhatsApp), возможен бан номера.
  Подключать выделенный номер, не основной канал снабжения

## Структура папок
/app
  /(dashboard)     — защищённые страницы (требуют авторизацию)
  /api/whatsapp    — шлюз WhatsApp
/components        — переиспользуемые компоненты
/lib
  /supabase        — client.ts, server.ts, service.ts
  /whatsapp        — gateway.ts, parser.ts, parseAndSave.ts
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
NEXT_PUBLIC_APP_URL=https://pulse.altaidynamics.kz
TELEGRAM_BOT_TOKEN
ADMIN_TELEGRAM_CHAT_ID=1700146125
RESEND_API_KEY
EMAIL_FROM=onboarding@resend.dev
SUPABASE_ACCESS_TOKEN — только в окружении shell (для Supabase MCP в .mcp.json), не коммитить

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
- Telegram бот @adpulse_alerts_bot (токен в TELEGRAM_BOT_TOKEN, только в env)
  - Подключение по 8-символьному коду компании
  - Алерты: брак, критический остаток, перерасход
  - Уведомления администратору о новых заявках
  - Admin chat_id: 1700146125
- Собственный шлюз WhatsApp (Baileys) на VPS: QR-подключение, чаты, медиа
- Парсер WhatsApp сообщений (текст + медиа)

#### Регистрация и биллинг
- /register — self-serve: email + пароль + компания → компания, профиль админа
  и пилот 30 дней создаются автоматически (`billing_provision_signup`, миграция 059).
  Админ не одобряет, получает только уведомление
- /welcome — активация, если в проекте включено подтверждение почты
- /dashboard/billing — тарифы (Старт 14 900 / Завод 29 900 / Сеть 54 900,
  WhatsApp +14 900, год −20%), счета, оплата. Цены — PLAN_PRODAZH_AD_PULSE.md §7.1
- /admin/billing — отметить оплату, отменить счёт, выдать пилот
- Просрочка: trialing/active → past_due после периода → blocked через 7 дней.
  Запись в materials/material_transactions/production_plans отсекается
  RESTRICTIVE-политиками (`private.company_can_write`). Компании без подписки
  пишут всегда — fail-open
- Эквайринг: Freedom Pay Gateway Sync API (`lib/billing/freedompay.ts`),
  колбэк `/api/billing/fp-result`, подпись pg_sig. Пока нет мерчанта — счёт
  на email, режим `manual`
- Cron `/api/cron/billing` — статусы и напоминания (Resend), идемпотентно
  через `billing_events.dedupe_key`
- /admin/registrations остаётся журналом: self-serve заявки пишутся со
  статусом `auto`
- Поддержка: /dashboard/support и публичная /support → письмо на
  altai.dx@gmail.com (Reply-To автора), запись в `support_requests`
- Устройства входа: `user_devices`, письмо о новом IP/браузере, вкладка
  «Безопасность» в настройках
- Env: `FREEDOMPAY_MERCHANT_ID`, `FREEDOMPAY_SECRET_KEY`, `FREEDOMPAY_TEST_MODE`,
  `CRON_SECRET`, `BILLING_*`. Подробно — docs/BILLING.md

#### PWA и мобильное
- manifest.json, иконки, theme-color #05050a
- Адаптивная нижняя навигация: 4 пункта + центральный FAB «Выпуск»
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

### Окружения и деплой
- production: ветка main → pulse.altaidynamics.kz. **Автодеплой Vercel из GitHub включён:`
  достаточно `git push origin main`** — сборка запускается сама (проверено 2026-11-08).
- `vercel --prod` нужен только если надо выложить без пуша. Не делайте оба действия
  подряд: получится два одинаковых деплоя.
- staging: ветка staging → preview-алиас ad-pulse-git-staging-*.vercel.app
- Прод-фиксы делаются на main → деплой → черри-пик на staging; фичи наоборот: staging → проверка → черри-пик на main

## Важные решения
- Supabase free tier пока для пилота, Pro когда появятся клиенты
- PWA (адаптивный веб) вместо нативного мобильного приложения на первом этапе
- Собственный WhatsApp-шлюз на Baileys — каждый клиент привязывает свой номер по QR

## Карта проекта и граф знаний

Для `/graphify` используйте проектный навык `.agents/skills/graphify/SKILL.md`.

Для вопросов о коде сначала откройте карту проекта, затем выполните точечный запрос к графу перед поиском по исходникам. Перед каждым `query`, `path` или `explain` напишите в чате точный вопрос, который отправляете графу. Для `path` и `explain` сформулируйте вопрос по указанным узлам.

1. `docs/PROJECT_MAP.md` — что где лежит, поток «сообщение → транзакция», таблица подсистем.
2. `graphify-out/wiki/index.md` — каталог графа: статья на подсистему с функциями и файлами.
3. `graphify-out/GRAPH_REPORT.md` — хабы и неожиданные связи.

Из корня проекта используйте CLI из `.graphify-venv/bin/graphify`, в том числе для команд `graphify` из инструкции навыка:

```bash
.graphify-venv/bin/graphify query "вопрос" --budget 1500
.graphify-venv/bin/graphify path "A" "B"
.graphify-venv/bin/graphify explain "ИмяФункции"
```

После коммита с изменениями кода граф обновляет локальный Git-хук. Для ручного обновления используйте `.graphify-venv/bin/graphify update .` (AST, без LLM). Артефакты в `graphify-out/` локальные, в git не входят.

Для нового клона установите CLI, соберите граф и подключите локальный Git-хук:

```bash
uv venv .graphify-venv
uv pip install --python .graphify-venv/bin/python graphifyy==0.9.106
.graphify-venv/bin/graphify update .
.graphify-venv/bin/graphify hook install
```
