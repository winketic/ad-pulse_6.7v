# AD Pulse — автотесты

Playwright. Три слоя, все под `/tests`, прод-код не трогается (кроме `package.json`
скриптов и исключения `tests` из `tsconfig`).

| Слой | Папка | Что проверяет | Устройства | Пишет в БД |
|------|-------|---------------|-----------|-----------|
| **Смоук** | `smoke/` | страница открылась, ключевой элемент виден, нет горизонт. скролла | 6 | нет |
| **Функционал (E2E)** | `e2e/` | действия реально работают: создание, валидация, автосписание, права, фильтры, удаление | 1 (chrome) | **да — только E2E_TEST** |
| **Визуал** | `visual/` | ничего не обрезано/не наезжает, скриншот-регрессия по пикселям | 6 | нет |

Пейджи добавляются по одному файлу на страницу в `e2e/` и `visual/`. Эталон —
**Движение** (`e2e/движение.spec.ts`, `visual/движение.visual.spec.ts`).

## Структура

```
tests/
  playwright.config.ts      6 device-проектов (smoke+visual) + 1 проект e2e (chrome)
  global-setup.ts           сидинг E2E_TEST + логин всех актёров → storageState + прогрев
  fixtures/
    guards.ts               прод-гард + запрет писать куда-либо кроме E2E_TEST (блок СаттиГрупп)
    seed.ts                 создание/сброс E2E_TEST: компания, 4 роли, материалы, планы, baseline
  helpers/
    env.ts                  ключи из .env.local, baseURL, пути storageState по ролям
    e2e.ts                  DB-проверки (balanceOf/latestTx), gotoTx, модалка Движения
    visual.ts               overflow/viewport/overlap-проверки, freezeVolatile, stableShot
    smoke.ts                общие смоук-проверки
  smoke/    public.smoke.spec.ts, dashboard.smoke.spec.ts
  e2e/      движение.spec.ts
  visual/   движение.visual.spec.ts  (+ *-snapshots/ — эталонные PNG, КОММИТЯТСЯ)
  .auth/    storageState + e2e-meta.json  (gitignored)
```

## Изоляция данных (критично)

- Все записи идут **только** в отдельную компанию **`E2E_TEST`** (создаётся автоматически).
  Отдельный демо-админ и по одному пользователю на каждую роль (admin/manager/warehouse/workshop),
  эмейлы `e2e-*@e2e.adpulse.local`.
- `guards.ts` физически запрещает трогать что-либо кроме E2E_TEST:
  `assertTestCompany()` падает, если `company_id` = **СаттиГрупп** (`ab426af3-…`, по id и префиксу)
  или ≠ id компании E2E_TEST. `assertNotProd()` падает на прод-URL.
- Перед **каждым** функциональным тестом `resetTransactions()` возвращает E2E_TEST к
  детерминированному baseline (материалы/планы/пользователи стабильны, транзакции
  пересоздаются). Прогоны повторяемы и идемпотентны.
- Функционал сериализован (один браузер, `mode: "serial"`) — тесты не гонят друг другу остатки.
  Визуал — read-only, поэтому крутится параллельно на 6 устройствах.

### Baseline E2E_TEST

Материалы: **Бетон** (м³), **Арматура** (м, `kg_per_meter=0.888`), **Проволока** (кг),
**Перемычка 2ПБ-13** (шт, нормы: бетон 0.013 / арматура 2.5). Остатки после сидинга:
Бетон 94 · Арматура 5000 · Проволока 802. Транзакции разложены на сегодня/неделю/раньше,
чтобы сегменты периода давали разные выборки (today=2, week=4, all=6).

## Устройства (проекты)

`desktop-chrome` (Chromium 1440×900), `desktop-safari` (WebKit 1440×900),
`ios-iphone` (WebKit, iPhone 14 Pro), `ios-ipad` (WebKit, iPad Pro 11),
`android-phone` (Chromium, Pixel 7), `android-tablet` (Chromium, Galaxy Tab S4).
Функционал гоняется на одном `e2e` (Chromium 1440×900) — корректность не зависит от девайса.

## Запуск

Нужен работающий сервер (по умолчанию `http://localhost:3000`; если не запущен —
Playwright сам поднимет `npm run dev`). **Не гонять против прода** — гард уронит.

```bash
npm run test:e2e            # функционал Движения (chrome)
npm run test:visual         # визуал Движения на 6 устройствах (сверяет с эталоном)
npm run test:visual:update  # ПЕРЕсоздать эталонные скриншоты (после намеренных правок UI)
npm run test:smoke          # смоук на 6 устройствах
npm run test                # всё сразу
npm run test:report         # открыть HTML-отчёт
```

Локальная итерация: `PW_REUSE_AUTH=1` переиспользует уже выпущенные сессии (сидинг
всё равно отрабатывает), экономя ~2 минуты на повторных прогонах. Для «чистого»
прогона переменную не ставить — global-setup выпускает свежие токены.

### Против staging-превью

```bash
PLAYWRIGHT_BASE_URL="https://ad-pulse-git-staging-xxxx.vercel.app" npm run test:e2e
```

База Supabase общая для локали и staging, поэтому E2E_TEST и логин работают в обоих.

## Визуал: как устроена стабильность скриншотов

- `stableShot()` — анимации выключены, каретка скрыта, `maxDiffPixelRatio 0.02`.
- Модалка снимается как `<form>` (без ленты позади), дата-поле маскируется.
- Списки прогоняются через `freezeVolatile()` — нормализует время (`00:00`), даты и
  подписи дней («30 июля» → «00 мсц»), поэтому эталон не зависит от текущей даты.
  Количества (`+800`, `−5`) намеренно **не** трогаются — они детерминированы.
- Эталоны привязаны к ОС/браузеру (`*-<project>-win32.png`) и **коммитятся**.
  Регрессия ловится по пикселям; правки UI — через `test:visual:update` с ревью диффа.

## Логин (без пароля, без записи в прод)

`global-setup.ts` для каждого актёра: service-role `generateLink` (magiclink) →
`verifyOtp` → токены → штатный хэш-флоу `/login` (приложение само пишет куки) →
`storageState`. Тур подавляется флагом `localStorage`. Пароли не нужны и не хранятся.

## Требования к окружению

`.env.local` (или env): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Браузеры: `npx playwright install chromium webkit`.
