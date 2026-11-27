# PERFORMANCE.md — бюджеты и измерения

## Бюджеты (§15)

- CWV: LCP ≤2.5 с, INP ≤200 мс, CLS ≤0.1 (полевые данные — появятся с трафиком; пока только лаборатория).
- Начальная передача: критический JS ≤150 КБ gzip, CSS ≤50 КБ gzip, критический шрифт ≤150 КБ, hero-графика ≤250 КБ, страница ~500 КБ.
- Lighthouse: Performance/Accessibility/Best Practices/SEO 95–100.

## Методология

Лаборатория: Lighthouse 13.6.0 (headless Chrome for Testing 1255) + программные проверки Playwright. Полевых данных нет — замеры не выдаются за полевые. CPU throttling и Lantern-модель Lighthouse не заменяют реальные устройства (см. матрицу ниже).

## Измерения (лендинг, 2026-11-26)

Lighthouse desktop (127.0.0.1:8123, production-аналогичная статика):
- Performance 99, Accessibility 100, Best Practices 100, SEO 100.
- FCP 0.4 с, LCP 0.9 с, TBT 0 мс, CLS 0, Speed Index 0.4 с.

Lighthouse mobile (симуляция slow-4G, Lantern):
- Performance 82, Accessibility 100, Best Practices 100, SEO 100.
- FCP 1.4 с, LCP 4.8 с (Lantern), CLS 0, TBT 0–30 мс.

Реальное эмулирование сети (Playwright CDP: 1.6 Мбит/с, RTT 150 мс, CPU 4×): LCP-кандидаты на 813 мс и 1034 мс. Расхождение с Lantern (4.8 с) задокументировано: модель пессимистично сериализует 12 self-hosted запросов (HTML, 5 CSS, 4 шрифта, 2 JS, 1 SVG) с RTT 150 мс; реальный браузер загружает их параллельно. Сделанные оптимизации: preload hero-SVG и критического заголовочного шрифта, параллельные `<link>` вместо @import-цепочки, font-display swap, unicode-range-подмножества.

Размеры ресурсов лендинга: core.svg 36 КБ, lite.json 100 КБ (по запросу), high.json 288 КБ (по запросу, только High/Ultra), i18n.js ~22 КБ, site.css ~12 КБ, styles.css ~9 КБ, fonts.css ~3 КБ, шрифты 32 файла (браузер грузит только нужные подмножества; критический путь ≈143 КБ: Inter latin 400/600 + Bodoni latin 700 для en, Playfair cyrillic 700 для ru, Noto Serif для kk).

## Матрица устройств (§25) — статус на 2026-11-26

| Сценарий | Статус |
|---|---|
| Chromium desktop/mobile | PASS (программно, Playwright) |
| Firefox, Safari/WebKit | NOT TESTED |
| Raspberry Pi 4/5, Celeron, UHD Graphics, бюджетный Android | NOT TESTED |
| CPU throttling 6× (реальный эмулятор CDP) | PASS (LCP ~1.0 с, рендер стабилен) |
| CPU throttling 20× | NOT TESTED |
| Ограниченная сеть (1.6 Мбит/с, 150 мс) | PASS |
| WebGL disabled | PASS по построению (WebGL не используется) |
| OffscreenCanvas unavailable | PASS по построению (не используется) |
| WebGL context loss | N/A (WebGL нет) |
| Reduced motion | PASS |
| Background tab | PASS (цикл останавливается) |
| Rapid navigation / повторный mount-unmount | NOT TESTED |
| Множественные viewport 320–2560 | NOT TESTED полностью; проверены 390, 1440; программные проверки адаптивных брейкпоинтов PASS |
| Увеличенный текст (200%) | NOT TESTED |
| Keyboard-only | NOT TESTED (skip-link и focus-visible реализованы, обход не прогонялся) |

## Известные ограничения

- INP не измерялся лабораторно (нужен полевой трафик; TBT ≈0 мс — косвенный индикатор).
- Lantern-LCP мобильного симулятора выше бюджета; реальный эмулированный LCP в бюджете. Плановое улучшение для Lantern: консолидация CSS в один файл (потребует сборки лендинга).
- Приложение (pulse.altaidynamics.kz): First Load JS 184 КБ (включая Sentry) — выше целевых 150 КБ; это существующая база, редизайн её не увеличил. Lighthouse по приложению не гонялся (требует авторизации).
