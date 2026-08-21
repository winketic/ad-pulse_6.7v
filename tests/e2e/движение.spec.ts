import { test, expect, type Page } from "playwright/test";
import {
  meta,
  balanceOf,
  latestTx,
  openTxModal,
  gotoTx,
  txForm,
  roleState,
} from "../helpers/e2e";
import { resetTransactions, type E2EMeta } from "../fixtures/seed";

// Writes into E2E_TEST only — serialize so tests never race each other's
// balances, and reset to the known baseline before each one.
test.describe.configure({ mode: "serial" });

let M: E2EMeta;

test.beforeAll(() => {
  M = meta();
});

test.beforeEach(async () => {
  await resetTransactions(M);
});

const TX = "/dashboard/transactions";

/** Fill + submit a regular (non-production) transaction through the modal. */
async function addRegular(
  page: Page,
  o: {
    type: "income" | "expense" | "return" | "defect";
    materialId: string;
    qty: number | string;
    price?: number;
    counterparty?: string;
    defectReason?: string;
    note?: string;
  },
) {
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption(o.type);
  await f.material.selectOption(o.materialId);
  await f.quantity.fill(String(o.qty));
  if (o.defectReason) await f.defectReason.fill(o.defectReason);
  if (o.note) await f.note.fill(o.note);
  if (o.counterparty) await f.counterparty.fill(o.counterparty);
  if (o.price != null) await f.price.fill(String(o.price));
  await f.submit.click();
}

// ─── Modal ───────────────────────────────────────────────────────────────

test("модалка открывается и закрывается", async ({ page }) => {
  await gotoTx(page);
  await openTxModal(page);
  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(
    page.getByRole("heading", { name: "Добавить запись движения" }),
  ).toBeHidden();
});

// ─── Create each type ────────────────────────────────────────────────────

test("приход создаёт запись и увеличивает остаток", async ({ page }) => {
  await gotoTx(page);
  const before = await balanceOf(M.materials.concrete);
  await addRegular(page, { type: "income", materialId: M.materials.concrete, qty: 10 });
  await expect(page.getByText("Запись добавлена")).toBeVisible();
  await expect.poll(() => balanceOf(M.materials.concrete)).toBe(before + 10);
  const tx = await latestTx(M.materials.concrete, "income");
  expect(tx?.quantity).toBe(10);
});

test("расход создаёт запись и уменьшает остаток", async ({ page }) => {
  await gotoTx(page);
  const before = await balanceOf(M.materials.wire);
  await addRegular(page, { type: "expense", materialId: M.materials.wire, qty: 7 });
  await expect.poll(() => balanceOf(M.materials.wire)).toBe(before - 7);
});

test("возврат создаёт запись (плюс к остатку)", async ({ page }) => {
  await gotoTx(page);
  const before = await balanceOf(M.materials.concrete);
  await addRegular(page, { type: "return", materialId: M.materials.concrete, qty: 3 });
  await expect.poll(() => balanceOf(M.materials.concrete)).toBe(before + 3);
  expect((await latestTx(M.materials.concrete, "return"))?.quantity).toBe(3);
});

test("брак: причина обязательна; сохраняется в примечании", async ({ page }) => {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("defect");
  await f.material.selectOption(M.materials.concrete);
  await f.quantity.fill("2");
  // Без причины submit заблокирован
  await expect(f.submit).toBeDisabled();
  await f.defectReason.fill("Трещина при транспортировке");
  await expect(f.submit).toBeEnabled();
  await f.submit.click();
  await expect.poll(async () => (await latestTx(M.materials.concrete, "defect"))?.note ?? "")
    .toContain("Трещина при транспортировке");
});

// ─── Production: auto-deduction by norms ─────────────────────────────────

test("производство: автосписание бетона и арматуры по нормам", async ({ page }) => {
  await gotoTx(page);
  const concreteBefore = await balanceOf(M.materials.concrete);
  const rebarBefore = await balanceOf(M.materials.rebar);

  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("production");
  await f.material.selectOption(M.materials.lintel);
  await f.quantity.fill("10");

  // Live preview of what will be deducted (10 × 0.013 = 0.13 бетон, 10 × 2.5 = 25 арматура)
  await expect(page.getByText(/Спишется: бетон 0\.13/)).toBeVisible();
  await expect(page.getByText(/25\.00/)).toBeVisible();

  await f.submit.click();

  // Product +10, concrete −0.13, rebar −25
  await expect.poll(() => balanceOf(M.materials.lintel)).toBe(10);
  await expect.poll(() => balanceOf(M.materials.concrete)).toBeCloseTo(concreteBefore - 0.13, 4);
  await expect.poll(() => balanceOf(M.materials.rebar)).toBeCloseTo(rebarBefore - 25, 4);
});

// ─── Validation ──────────────────────────────────────────────────────────

test("валидация: пустое количество блокирует отправку", async ({ page }) => {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.material.selectOption(M.materials.concrete);
  await expect(f.submit).toBeDisabled();
});

test("валидация: количество ≤ 0 блокирует отправку", async ({ page }) => {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.material.selectOption(M.materials.concrete);
  await f.quantity.fill("0");
  await expect(f.submit).toBeDisabled();
  await f.quantity.fill("-5");
  await expect(f.submit).toBeDisabled();
});

test("валидация: количество выше максимума показывает ошибку", async ({ page }) => {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.material.selectOption(M.materials.concrete);
  await f.quantity.fill("1000000000"); // > 999 999 999
  await expect(page.getByText(/Максимальное количество/)).toBeVisible();
  await expect(f.submit).toBeDisabled();
});

// Bug #1 guard (migration 039): производство сверх остатка сырья не должно
// уводить остаток в минус. Клиент заранее предупреждает (мягко), сервер —
// авторитетно отклоняет с понятным текстом и НИЧЕГО не пишет.
test("производство сверх остатка блокируется, минус не проходит", async ({ page }) => {
  await gotoTx(page);
  const concreteBefore = await balanceOf(M.materials.concrete); // 94 из baseline
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("production");
  await f.material.selectOption(M.materials.lintel);
  await f.quantity.fill("100000"); // нужно 1300 бетона, есть 94

  // Мягкое клиентское предупреждение в превью (сохранить всё равно можно)
  await expect(page.getByText(/Не хватит бетона/)).toBeVisible();

  // Сервер отклоняет с понятной ошибкой (не техно-крэш)
  await f.submit.click();
  await expect(page.getByText(/Недостаточно бетона: нужно .* есть/)).toBeVisible();

  // Остаток не ушёл в минус — записей не создано
  await expect.poll(() => balanceOf(M.materials.concrete)).toBe(concreteBefore);
  expect(await balanceOf(M.materials.concrete)).toBeGreaterThanOrEqual(0);
});

// ─── kg → m conversion ───────────────────────────────────────────────────

test("конвертация кг→м: ввод в кг сохраняется в метрах", async ({ page }) => {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("income");
  await f.material.selectOption(M.materials.rebar); // Арматура, kg_per_meter = 0.888
  // Метка поля должна показывать (кг)
  await expect(page.getByText("Количество").locator("..").getByText("(кг)")).toBeVisible();
  await f.quantity.fill("100"); // 100 кг → 100 / 0.888 = 112.6126 м
  await expect(page.getByText("= 112.61 м")).toBeVisible();
  await f.submit.click();

  await expect.poll(async () => {
    const tx = await latestTx(M.materials.rebar, "income");
    return tx ? Math.round(tx.quantity * 100) / 100 : null;
  }).toBe(112.61);
  const tx = await latestTx(M.materials.rebar, "income");
  expect(tx?.note ?? "").toContain("введено: 100 кг");
});

// ─── Price: hint chip + live total ───────────────────────────────────────

test("цена: живой итог, подсказка последней цены и чип «поставить»", async ({ page }) => {
  await gotoTx(page);
  // First sale sets a price
  await openTxModal(page);
  let f = txForm(page);
  await f.type.selectOption("income");
  await f.material.selectOption(M.materials.concrete);
  await f.quantity.fill("4");
  await f.price.fill("5000");
  await expect(page.getByText(/Итого:\s*20\s?000\s*тг/)).toBeVisible(); // 4 × 5000
  await f.submit.click();
  await expect.poll(async () => (await latestTx(M.materials.concrete, "income"))?.unit_price).toBe(5000);

  // Reopen same material+type → last-price hint + chip
  await openTxModal(page);
  f = txForm(page);
  await f.type.selectOption("income");
  await f.material.selectOption(M.materials.concrete);
  const chip = page.getByRole("button", { name: /поставить 5\s?000/ });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(f.price).toHaveValue("5000");
});

// ─── Counterparty ────────────────────────────────────────────────────────

test("контрагент сохраняется и виден в списке", async ({ page }) => {
  await gotoTx(page);
  await addRegular(page, {
    type: "income",
    materialId: M.materials.concrete,
    qty: 6,
    counterparty: "ООО Ромашка",
  });
  await expect.poll(async () => (await latestTx(M.materials.concrete, "income"))?.counterparty)
    .toBe("ООО Ромашка");
  await expect(page.getByRole("cell", { name: "ООО Ромашка" })).toBeVisible();
});

// ─── Delete + roles ──────────────────────────────────────────────────────

test("админ удаляет транзакцию; тоггл показывает удалённые", async ({ page }) => {
  await gotoTx(page);
  await addRegular(page, { type: "income", materialId: M.materials.concrete, qty: 12 });
  await expect(page.getByText("Запись добавлена")).toBeVisible();
  await expect.poll(() => balanceOf(M.materials.concrete)).toBe(94 + 12);

  page.on("dialog", (d) => d.accept());
  // Scope the delete to the specific +12 row — clicking a global `.first()`
  // could hit an optimistic (temp) row that has no delete control yet.
  const row = page.getByRole("row").filter({ hasText: "+12" });
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByTitle("Удалить транзакцию").click();

  await expect(page.getByText("Транзакция удалена")).toBeVisible();
  await expect.poll(() => balanceOf(M.materials.concrete)).toBe(94); // recomputed
  const tx = await latestTx(M.materials.concrete, "income");
  expect(tx?.deleted_at).not.toBeNull();

  // Admin toggle reveals the soft-deleted row
  await expect(page.getByRole("button", { name: /Показать удалённые/ })).toBeVisible();
});

test.describe("роль workshop", () => {
  test.use({ storageState: roleState("workshop") });

  test("цех может создавать, но не видит удаление", async ({ page }) => {
    await gotoTx(page);
    await addRegular(page, { type: "expense", materialId: M.materials.wire, qty: 4 });
    await expect.poll(() => balanceOf(M.materials.wire)).toBe(802 - 4);
    // No delete affordance for non-admins
    await expect(page.getByTitle("Удалить транзакцию")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Показать удалённые/ })).toHaveCount(0);
  });
});

// ─── Filters ─────────────────────────────────────────────────────────────

test("фильтр по типу показывает только выбранный тип", async ({ page }) => {
  await gotoTx(page);
  // Period "Всё" so all baseline types are in view
  await page.getByRole("button", { name: "Всё" }).click();
  await page.getByRole("button", { name: "Приход", exact: true }).click();
  const body = page.locator("table tbody");
  await expect(body).toContainText("Приход");
  await expect(body).not.toContainText("Расход");
});

test("фильтр по материалу через URL-параметр + сброс чипом", async ({ page }) => {
  await gotoTx(page, `?material_id=${M.materials.wire}`);
  await page.getByRole("button", { name: "Всё" }).click();
  const body = page.locator("table tbody");
  await expect(body).toContainText("Проволока");
  await expect(body).not.toContainText("Бетон");
  // Material chip clears the filter
  await page.getByRole("button", { name: /Проволока/ }).click();
  await expect(page.locator("table tbody")).toContainText("Бетон");
});

test("сегменты периода: Сегодня ⊂ Неделя ⊂ Всё", async ({ page }) => {
  await gotoTx(page);
  const rows = () => page.locator("table tbody tr").filter({ hasNotText: "Сегодня" });

  await page.getByRole("button", { name: "Сегодня" }).click();
  const todayCount = await page.locator("table tbody tr").count();

  await page.getByRole("button", { name: "Неделя" }).click();
  const weekCount = await page.locator("table tbody tr").count();

  await page.getByRole("button", { name: "Всё" }).click();
  const allCount = await page.locator("table tbody tr").count();

  expect(weekCount).toBeGreaterThan(todayCount);
  expect(allCount).toBeGreaterThan(weekCount);
  void rows;
});

test("группировка по дням: заголовок дня виден", async ({ page }) => {
  await gotoTx(page);
  await page.getByRole("button", { name: "Всё" }).click();
  await expect(page.getByText("Сегодня").first()).toBeVisible();
});

// ─── Mobile row expand ───────────────────────────────────────────────────

test.describe("мобильный разворот строки", () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test("тап по строке раскрывает детали", async ({ page }) => {
    await gotoTx(page);
    await addRegular(page, {
      type: "income",
      materialId: M.materials.concrete,
      qty: 8,
      counterparty: "ООО Тест-Разворот",
    });
    // Mobile compact list: tap the specific +8 row to expand
    await page.getByRole("button").filter({ hasText: "+8" }).first().click();
    // The counterparty label + value live together in the mobile detail <p>;
    // the (display:none) desktop table also holds the bare value, so match the
    // combined "Контрагент: …" text to stay unambiguous.
    await expect(page.getByText(/Контрагент:\s*ООО Тест-Разворот/)).toBeVisible();
  });
});

// ─── Balance recompute reflected on warehouse ────────────────────────────

test("остаток пересчитывается и виден на складе", async ({ page }) => {
  await gotoTx(page);
  await addRegular(page, { type: "income", materialId: M.materials.concrete, qty: 10 });
  await expect.poll(() => balanceOf(M.materials.concrete)).toBe(104);
  await page.goto("/dashboard/warehouse");
  // Warehouse renders both a desktop table and mobile cards (one hidden via
  // `lg:` classes) — target the copy visible for this viewport.
  await expect(
    page.getByText("Бетон").filter({ visible: true }).first(),
  ).toBeVisible();
});
