# QA_REPORT.md

Дата: 2026-11-26. Среда: macOS, Chromium (Playwright 1255), Chrome for Testing (Lighthouse 13.6.0).

## Выполненные проверки

| Команда/проверка | Результат |
|---|---|
| `npm run build` (3 прогона: база, после токенов, после рестайла) | PASS, exit 0 |
| `npm run lint` | PASS — 0 errors, 4 предсуществующих warnings (no-img-element ×2, unused vars ×2 в тестах) |
| `npm run test:unit` | PASS — 39/39 |
| `npm run test:smoke` | PASS частично — публичные страницы 15/15; dashboard: FAIL (fixture-тенант перенаправлен в онбординг-мастер, состояние данных, не код) |
| `npm run test:visual:update` | PASS частично — 21 снапшот обновлён; движение/настройки: FAIL по той же причине (онбординг вместо страницы) |
| Lighthouse desktop (лендинг) | Performance 99, A11y 100, BP 100, SEO 100; LCP 0.9 с, CLS 0, TBT 0 |
| Lighthouse mobile (лендинг, Lantern slow-4G) | Performance 82, A11y 100, BP 100, SEO 100; LCP 4.8 с (Lantern), CLS 0 |
| Эмуляция сети Playwright CDP (1.6 Мбит/с, 150 мс RTT, CPU 4×) | LCP-кандидаты 813/1034 мс |
| Программные проверки Playwright | локали ru/en/kk, переключение языка, мобильное меню, темы, шрифты, Altai Field (canvas, пиксели, профили LITE→HIGH→ULTRA, reduced motion, IntersectionObserver), OG/JSON-LD/robots/sitemap — PASS |
| Покрытие казахского алфавита (fontTools) | Inter, Noto Serif — полное; Playfair, JetBrains Mono — частичное; Bodoni — без кириллицы |

## Найденные и исправленные дефекты

1. **Генератор Altai Field**: неверная пара рёбер в case 13 таблицы marching squares (точки экстраполировались за грань → 6 тыс. разрывов контуров); перепутаны пары case 5/10; однонаправленное связывание сегментов не выдерживало несогласованную ориентацию (заменено на карту смежности); карта смежности создавала новые ссылки на сегменты (обход «по своим следам»).
2. **Лендинг**: двойной canvas (статический в HTML + создаваемый JS) — оставлен один, создаётся JS; контраст `--muted-2` #6E6E6E (3.7:1) → #7F7F7F (4.75:1) — Lighthouse A11y 96→100; @import-цепочка CSS → параллельные `<link>` + preload hero-шрифтов/SVG.
3. **Тесты**: `tests/unit/billing.spec.ts` — динамический import() не работает в transform-раннере Playwright, возвращён require() с точечным eslint-disable (lint 1 error → 0).

## Дефекты, известные до начала работ (из AGENTS.md)

- listCompanyUsers иногда крашит настройки — не воспроизводился, не чинился (не связан с редизайном).
- ApproveButton — тестирование pending.
- SMTP периодически не работает — инфраструктура.

## FAIL / NOT TESTED (честная матрица)

- Dashboard smoke + visual (движение, настройки): FAIL по среде — fixture-тенант в состоянии «онбординг не завершён», страницы перенаправляются в мастер; код редизайна к этому отношения не имеет (middleware/onboarding не менялись). Требует починки fixture-данных (Supabase, вне моих полномочий).
- Живая отправка контактной формы: NOT TESTED — создала бы реальный тикет в общей базе; контракт проверен чтением `app/api/support/public/route.ts`.
- Казахская копия: требует проверки носителем (перевод мой).
- Пиксельный визуальный аудит: NOT TESTED — модель сессии не читает изображения; скриншоты сохранены (tests/test-results/, /tmp/*.png), ревизия после подключения image-модели.
- Firefox/Safari, физические устройства (Raspberry Pi и т.д.), CPU 20×, 200% zoom, keyboard-only обход: NOT TESTED (см. PERFORMANCE.md).
- Полевые CWV (INP): нет трафика — только лаборатория.

## Скриншоты

- /tmp/landing-phase2.png (первый прогон токенов), tests/test-results/*.png (Playwright, включая failure-контексты smoke/visual), /tmp/lh-*.json (отчёты Lighthouse).

## Вывод

Критических дефектов нет. Сборка, линт и юнит-тесты зелёные; публичный контур проверен; два FAIL относятся к состоянию тестовых данных и независимой проверке не подвергались. Независимый QA-аудит не проводился — отсутствие явно обозначается.

## Хвосты для владельца (не делались без подтверждения)

- `landing/cookies/index.html`: строка таблицы про cookie `googtrans` устарела (Google Translate удалён, cookie больше не ставится). Правовой документ не редактировался — правка за владельцем.
- Обновление fixture-данных Supabase для dashboard smoke/visual-тестов (тенант в состоянии онбординга).
- Проверка казахской копии носителем; юридическая вычитка при переводе правовых страниц на en/kk.
