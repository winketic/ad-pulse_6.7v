import { test } from "playwright/test";
import { roleStatePath } from "../helpers/env";
import {
  expectNoHorizontalScroll,
  expectNoOverflowingElements,
} from "../helpers/visual";

/**
 * Инварианты раскладки по всем страницам дашборда.
 *
 * Снапшотов здесь намеренно нет. Эталон, снятый с уже кривого экрана, остаётся
 * зелёным навсегда — именно так весь визуальный набор был зелёным, пока кружки
 * выбора цвета на 320px уезжали за край и не нажимались. Числовая проверка
 * падает в тот момент, когда элемент пересёк правую границу, и не зависит от
 * платформы: эталоны `-win32` не работают нигде, кроме Windows, а этот файл
 * одинаково гоняется на Linux, macOS и в CI.
 *
 * Прогоняется на всех шести профилях устройств — каждый со своим вьюпортом,
 * так что десктоп, телефон и планшет покрыты одним и тем же кодом.
 */

test.use({ storageState: roleStatePath("admin") });

const СТРАНИЦЫ = [
  ["Сводка", "/dashboard"],
  ["Быстрый выпуск", "/dashboard/produce"],
  ["Склад", "/dashboard/warehouse"],
  ["Движение", "/dashboard/transactions"],
  ["Планы", "/dashboard/plans"],
  ["Отчёты", "/dashboard/reports"],
  ["Настройки", "/dashboard/settings"],
] as const;

for (const [название, путь] of СТРАНИЦЫ) {
  test(`${название}: ничего не выходит за край экрана`, async ({ page }) => {
    await page.goto(путь, { waitUntil: "networkidle" });

    await expectNoHorizontalScroll(page);
    await expectNoOverflowingElements(page, название);
  });
}

/**
 * Отдельно — 320px. Это уже не «телефон», а самый узкий экран, который реально
 * встречается (старый SE, сложенный складной). Ни один из профилей устройств
 * так узко не заходит, а ломается всё обычно именно здесь.
 *
 * Гоняем один раз, на desktop-chrome: вьюпорт мы задаём руками, и повторять
 * одну и ту же проверку шесть раз смысла нет.
 */
test.describe("узкий экран 320px", () => {
  test.use({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });

  for (const [название, путь] of СТРАНИЦЫ) {
    test(`${название} на 320px`, async ({ page }, testInfo) => {
      // На уровне describe колбэк не получает testInfo, поэтому условие здесь.
      test.skip(
        testInfo.project.name !== "desktop-chrome",
        "вьюпорт задан явно — достаточно одного прогона",
      );
      await page.goto(путь, { waitUntil: "networkidle" });

      await expectNoHorizontalScroll(page);
      await expectNoOverflowingElements(page, `${название} @320`);
    });
  }
});
