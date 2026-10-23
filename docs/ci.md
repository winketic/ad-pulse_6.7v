# CI (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Триггеры
- `push` в `main` и `staging`;
- любой `pull_request`.

## Jobs

### `quality` (блокирующий)
Ubuntu, Node 20, кэш npm по `package-lock.json`, затем `npm ci` и три шага:
`npx tsc --noEmit` → `npm run lint` → `npm run test:unit`.
Падение любого шага делает job (и весь workflow) красным.

- `tsc` проверяет только код приложения: `tests/` исключён в `tsconfig.json`.
- Юнит-тесты — `tests/unit/playwright.unit.config.ts`: чистые функции без браузера,
  dev-сервера и БД, поэтому `playwright install` в CI не нужен и не выполняется.

### `audit` (не блокирует мерж)
`npm audit --omit=dev --audit-level=high`, `continue-on-error: true`.
Сейчас в проекте известные уязвимости (`next`, `xlsx` и транзитивные), поэтому job
не должен блокировать мерж, но его вывод остаётся видимым в логах шага.
Флаг снимается после обновления Next.js и замены `xlsx`.

## Локальная проверка
```bash
npm ci
npx tsc --noEmit
npm run lint
npm run test:unit
```

Секреты и деплой в CI не используются; права workflow — `contents: read`.
