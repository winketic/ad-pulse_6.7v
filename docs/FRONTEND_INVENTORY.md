# FRONTEND_INVENTORY.md

Полный перечень фронтенда репозитория `ad-pulse_6.7v-main` по состоянию на 2026-11-26.
Основание: рекурсивный аудит (git status, glob маршрутов, чтение ключевых файлов, запуск сборки).

Метод: маршруты собраны через `app/**/page.tsx`, `app/**/route.ts`, `app/**/layout.tsx`, `app/**/error.tsx`, `app/**/loading.tsx`; компоненты через `components/**/*.tsx`; назначение страниц сверено с AGENTS.md, CLAUDE.md и заголовками файлов.

Сокращения в колонке «ДС» (дизайн-система Altai Dynamics):
- `нет` — элемент в прежнем визуальном стиле (синий акцент #2563eb, радиусы 6–12 px, Geist), рестайлинг требуется;
- `частично` — токенизирован частично;
- `да` — приведён к новой ДС;
- `не применимо` — визуального слоя нет (API, конфиги).

---

## 1. База: стек и исходное состояние

| Факт | Значение | Источник |
|---|---|---|
| Framework | Next.js 15.5.28, App Router | package.json |
| React | 19.3.1 | package.json |
| UI | Tailwind CSS 3.4.1 | package.json |
| Данные | Supabase (Postgres + Auth + RLS) | AGENTS.md |
| Тесты | Playwright 1.60 (unit, e2e, smoke, visual) | package.json, tests/ |
| Деплой приложения | Vercel, проект `ad-pulse`, pulse.altaidynamics.kz | .vercel/project.json |
| Статический сайт | папка `landing/`, altaidynamics.kz (механизм деплоя в репозитории не описан — отдельный Vercel-проект, в vercel.json ссылок нет) | структура репозитория |
| Базовая сборка | `npm run build` — exit 0 (2026-11-26, лог /tmp/adpulse-baseline-build.log) | запуск |

Рабочее дерево на момент аудита не чистое: изменены `landing/**` (9 файлов), `.gitignore`; не отслеживаются `.agents/`, PLAN_PRODAZH_AD_PULSE.md, docs/ad-pulse-sales-guide-ru.md, outreach/, research/, reports/, несколько snapshot-файлов Playwright. Эти изменения не откатывались и не коммитились.

---

## 2. Страницы Next.js приложения

### 2.1 Публичные и auth-страницы

| Маршрут | Файл | Назначение | ДС |
|---|---|---|---|
| `/` | app/page.tsx | redirect на /dashboard; middleware отправляет неавторизованных на /login | нет |
| `/login` | app/login/page.tsx | вход в приложение | нет |
| `/register` | app/register/page.tsx | self-serve регистрация: email + пароль + компания, автопилот 30 дней | нет |
| `/forgot-password` | app/forgot-password/page.tsx | запрос сброса пароля | нет |
| `/reset-password` | app/reset-password/page.tsx | установка нового пароля по ссылке из письма | нет |
| `/verify-email` | app/verify-email/page.tsx | подтверждение почты | нет |
| `/invite` | app/invite/page.tsx | приём приглашения в компанию | нет |
| `/welcome` | app/welcome/page.tsx | активация после self-serve регистрации | нет |
| `/support` | app/support/page.tsx | публичная форма поддержки → POST /api/support/public, письмо altai.dx@gmail.com | нет |
| `/docs` | app/docs/page.tsx | Swagger UI поверх public/api-docs/openapi.json (открыт в middleware) | нет |
| `/onboarding` | app/onboarding/page.tsx | мастер первого входа: имя, должность, пароль, приветствие (4 шага) | нет |
| `/onboarding/setup` | app/onboarding/setup/page.tsx | мастер настройки: материалы, приглашения, завершение (3 шага) | нет |
| `/auth/confirm` | app/auth/confirm/route.ts | обработка token_hash из писем (redirect) | не применимо |

### 2.2 Кабинет (защищён middleware)

| Маршрут | Файл | Назначение | ДС |
|---|---|---|---|
| `/dashboard` | app/(dashboard)/dashboard/page.tsx | обзор компании | нет |
| `/dashboard/materials` | app/(dashboard)/dashboard/materials/page.tsx | справочник материалов, CRUD, нормы ГОСТ | нет |
| `/dashboard/warehouse` | app/(dashboard)/dashboard/warehouse/page.tsx | склад, приход/расход, остатки | нет |
| `/dashboard/transactions` | app/(dashboard)/dashboard/transactions/page.tsx | журнал движения с пагинацией | нет |
| `/dashboard/plans` | app/(dashboard)/dashboard/plans/page.tsx | производственные планы, план/факт | нет |
| `/dashboard/plans/[id]` | app/(dashboard)/dashboard/plans/[id]/page.tsx | карточка плана | нет |
| `/dashboard/reports` | app/(dashboard)/dashboard/reports/page.tsx | отчёты за период, экспорт Excel | нет |
| `/dashboard/whatsapp` | app/(dashboard)/dashboard/whatsapp/page.tsx | статус WhatsApp-интеграции | нет |
| `/dashboard/whatsapp/connect` | app/(dashboard)/dashboard/whatsapp/connect/page.tsx | QR-подключение номера, список чатов | нет |
| `/dashboard/produce` | app/(dashboard)/dashboard/produce/page.tsx | выпуск продукции (FAB-сценарий) | нет |
| `/dashboard/billing` | app/(dashboard)/dashboard/billing/page.tsx | тарифы, счета, оплата | нет |
| `/dashboard/support` | app/(dashboard)/dashboard/support/page.tsx | поддержка из кабинета | нет |
| `/dashboard/settings` | app/(dashboard)/dashboard/settings/page.tsx | настройки компании, пользователи, интеграции, безопасность | нет |

### 2.3 Админка (только platform owner, гейт в middleware)

| Маршрут | Файл | Назначение | ДС |
|---|---|---|---|
| `/admin/platform` | app/admin/platform/page.tsx | обзор компаний платформы | нет |
| `/admin/approve/[id]` | app/admin/approve/[id]/page.tsx | одобрение заявки компании | нет |
| `/admin/billing` | app/admin/billing/page.tsx | отметить оплату, отменить счёт, выдать пилот | нет |
| `/admin/registrations` | app/admin/registrations/page.tsx | журнал регистраций | нет |

### 2.4 Специальные файлы

| Файл | Назначение | ДС |
|---|---|---|
| app/layout.tsx | корневой layout: Geist-шрифты, BrandSplash, PublicThemeToggle, ToastProvider, тема из localStorage | нет |
| app/(dashboard)/layout.tsx | layout кабинета (DashboardShell) | нет |
| app/error.tsx, app/global-error.tsx, app/not-found.tsx | страницы ошибок и 404 | нет |
| app/(dashboard)/error.tsx, app/(dashboard)/dashboard/settings/error.tsx | error boundaries | нет |
| 10 файлов `loading.tsx` | скелетоны загрузки страниц кабинета | нет |
| app/robots.ts, app/sitemap.ts, app/manifest.ts | SEO/PWA | не применимо |
| app/globals.css | текущие токены («Индустриальный терминал», синий акцент) | нет |

---

## 3. API-маршруты (контракты не меняются)

| Маршрут | Файл | Назначение |
|---|---|---|
| /api/auth/session | app/api/auth/session/route.ts | проверка сессии |
| /api/auth/email-change/request, /verify | app/api/auth/email-change/* | смена email |
| /api/admin/approve, /api/admin/reject | app/api/admin/* | админ-действия по заявкам |
| /api/support/public | app/api/support/public/route.ts | публичная форма поддержки (CORS + honeypot) |
| /api/billing/fp-result | app/api/billing/fp-result/route.ts | колбэк Freedom Pay |
| /api/cron/billing, /api/cron/keepalive | app/api/cron/* | расписания Vercel Cron |
| /api/materials/import | app/api/materials/import/route.ts | импорт материалов |
| /api/telegram/webhook, /api/telegram/setup | app/api/telegram/* | Telegram-бот |
| /api/whatsapp/session, /chats, /webhook/[token] | app/api/whatsapp/* | шлюз WhatsApp |

Все маршруты возвращают JSON, визуального слоя не имеют; редизайну не подлежат.

---

## 4. Компоненты (36 файлов)

| Файл | Назначение | ДС |
|---|---|---|
| components/Logo.tsx | логотип | нет |
| components/BrandSplash.tsx | заставка PWA | нет |
| components/ThemeToggle.tsx, PublicThemeToggle.tsx | переключатели темы | нет |
| components/SessionBeacon.tsx | фоновая проверка сессии | не применимо |
| components/OnboardingTour.tsx | туры driver.js | нет |
| components/BalanceCard.tsx | карточка остатка | нет |
| components/ApproveButton.tsx | кнопка одобрения заявки | нет |
| components/layout/DashboardShell.tsx | каркас кабинета, навигация, FAB | нет |
| components/ui/Modal.tsx, Toast.tsx, AnimatedNumber.tsx, RefreshButton.tsx, OfflineRetryBanner.tsx, ChangedFooter.tsx, NoCompanyState.tsx | UI-примитивы и состояния | нет |
| components/dashboard/BalanceTableRealtime.tsx | таблица остатков realtime | нет |
| components/materials/MaterialsClient.tsx, ImportButton.tsx | справочник материалов, импорт | нет |
| components/warehouse/WarehouseClient.tsx | складской интерфейс | нет |
| components/transactions/TransactionsClient.tsx | журнал движения | нет |
| components/plans/PlansClient.tsx, PlanDetailClient.tsx | планы | нет |
| components/reports/ReportsClient.tsx | отчёты | нет |
| components/produce/ProduceClient.tsx, NumericKeypad.tsx | выпуск, цифровая клавиатура | нет |
| components/settings/SettingsClient.tsx, SettingsTabs.tsx, ProfileCard.tsx, CompanySettings.tsx, UserManagement.tsx, MaterialThresholds.tsx, TelegramCard.tsx, WhatsAppCard.tsx, DevicesCard.tsx, FireBanner.tsx, StarfieldBanner.tsx | настройки компании и интеграции | нет |

Дополнительно в админ- и onboarding-маршрутах есть локальные компоненты (PlatformCompaniesClient, AdminBillingClient, AdminRegistrationsClient, PublicSupportForm, actions-файлы) — они входят в покрытие своих страниц.

---

## 5. Статический сайт `landing/` (altaidynamics.kz)

| Файл | URL | Назначение | ДС |
|---|---|---|---|
| landing/index.html | / | маркетинговая страница AD Pulse: hero, модули, шаги, тарифы, сравнение, FAQ, CTA, footer | нет |
| landing/404.html | /404 | страница 404 | нет |
| landing/docs/index.html | /docs/ | документация | нет |
| landing/support/index.html | /support/ | форма поддержки | нет |
| landing/security/index.html | /security/ | безопасность | нет |
| landing/privacy/index.html, landing/privacy.html | /privacy/ | политика конфиденциальности | нет |
| landing/cookies/index.html | /cookies/ | политика cookies | нет |
| landing/terms/index.html | /terms/ | пользовательское соглашение | нет |
| landing/dpa/index.html | /dpa/ | DPA | нет |
| landing/assets/styles.css (271 стр.), landing/assets/app.js (177 стр.) | ресурсы | тема, меню, язык (Google Translate), cookie, форма поддержки, поиск в доках | нет |
| landing/logo.svg, logo-altai.png, favicon.png, icon-192.png, icon-512.png | ресурсы | фирменные знаки | существующий знак сохраняется |

Локализация лендинга сейчас — Google Translate (внешняя зависимость), словарей нет. Заменяется на словари en/ru/kk.

---

## 6. Тесты

| Набор | Файлы | Что проверяет |
|---|---|---|
| unit | tests/unit/*.spec.ts (6) | биллинг, buildTxInput, escapeHtml, importParse, role-permissions |
| e2e | tests/e2e/*.spec.ts (4) | движение, изоляция компаний, роли, цены |
| smoke | tests/smoke/*.spec.ts (2) | dashboard, публичные страницы |
| visual | tests/visual/*.spec.ts (2 + snapshots) | движение, раскладка; эталоны в tests/visual/*-snapshots/ |

Конфиги: tests/playwright.config.ts (проекты desktop-chrome, desktop-safari, ios-iphone, ios-ipad, android-phone, android-tablet, e2e), tests/unit/playwright.unit.config.ts. BaseURL: PLAYWRIGHT_BASE_URL или http://localhost:3000.

---

## 7. Итог аудита

- Элементов с визуальным слоем: 28 страниц + 3 error/not-found + 10 loading + 36 компонентов + 10 страниц landing. Все в статусе «нет» (прежний стиль) на момент аудита.
- Известные дефекты из AGENTS.md: listCompanyUsers иногда крашит настройки; ApproveButton не протестирован; SMTP периодически не работает.
- Задокументированные расхождения: лендинг показывал тарифы в USD (Start $30 / Start+ $64.9 / Fabric $69.5 / Network $125.1), биллинг и PLAN_PRODAZH_AD_PULSE.md §7.1 — тарифы в ₸ (Старт 14 900 / Завод 29 900 / Сеть 54 900). Лендинг приведён к §7.1.

## 8. Повторный аудит (2026-11-26, после редизайна)

Сверка с разделом 1–6 настоящего файла.

| Группа | Статус после редизайна | Примечание |
|---|---|---|
| Страницы лендинга (10) | ДС: да | новая оболочка, токены, шрифты, OG/canonical; правовые тексты — только ru |
| Страницы приложения (28) | ДС: частично | токены, радиусы 4/6 px, шрифты, легаси-цвета сведены к токенам; покомпонентный композиционный разбор — следующая итерация |
| Error/not-found/loading (13) | ДС: частично | стилизуются токенами глобально; отдельной вёрстки не было |
| Компоненты (36+) | ДС: частично | 24+ файла переведены на токены; роль-бейджи оставлены семантическими |
| API (15) | не применимо | контракты не менялись |
| Новые ресурсы | — | tokens/site/motion/i18n/field (см. FRONTEND_ARCHITECTURE.md) |

Неохваченные элементы не обнаружены: все маршруты из первоначального списка существуют и прошли либо редизайн, либо проверку сборкой. Функциональные регрессии: не выявлено (unit 39/39, public smoke PASS; dashboard smoke см. QA_REPORT.md).
