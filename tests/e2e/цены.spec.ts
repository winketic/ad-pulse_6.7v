import { test, expect, type Page } from "playwright/test";
import { meta, latestTx, openTxModal, gotoTx, txForm } from "../helpers/e2e";
import {
  resetTransactions,
  E2E_COUNTERPARTIES,
  E2E_PRICES,
  type E2EMeta,
} from "../fixtures/seed";

/**
 * Phase 6 pricing flow on Движение: counterparty directory, load index on
 * product shipments, auto-price from price_list.
 *
 * Relies on the seed (tests/fixtures/seed.ts): counterparties А/Б and three
 * price rows for «Перемычка 2ПБ-13» — А×8, А×20, Б×8. Б×20 is the deliberately
 * uncovered combination. Without those refs the form silently falls back to
 * the pre-Phase-6 behaviour, which is why this flow had no coverage before.
 *
 * Writes into E2E_TEST only. The e2e project runs with one worker, so this file
 * never races движение.spec.ts over the shared tenant.
 */

let M: E2EMeta;

test.beforeAll(() => {
  M = meta();
});

test.beforeEach(async () => {
  await resetTransactions(M);
});

const LINTEL = "Перемычка 2ПБ-13";

const priceOf = (counterparty: "a" | "b", loadIndex: string): number => {
  const row = E2E_PRICES.find(
    (p) => p.counterparty === counterparty && p.load_index === loadIndex,
  );
  if (!row) throw new Error(`no seeded price for ${counterparty}×${loadIndex}`);
  return row.price;
};

/** "5200" → /5\s?200/ — formatMoney may group thousands with a (narrow) nbsp. */
const moneyRe = (n: number) =>
  new RegExp(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s?"));

/** Open the modal on a finished-product shipment (расход перемычки). */
async function openLintelExpense(page: Page, qty = 3) {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("expense");
  await f.material.selectOption(M.materials.lintel);
  await f.quantity.fill(String(qty));
  return f;
}

// ─── Справочник и индекс ─────────────────────────────────────────────────

test("контрагент — селект из справочника, а не свободный текст", async ({ page }) => {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);

  await expect(f.counterpartyRef).toBeVisible();
  await expect(f.counterpartyRef.locator("option")).toHaveText([
    "— не указан —",
    E2E_COUNTERPARTIES.a,
    E2E_COUNTERPARTIES.b,
  ]);
  await expect(f.counterparty).toHaveCount(0);
});

test("индекс нагрузки — только на расходе готовой продукции", async ({ page }) => {
  const f = await openLintelExpense(page);

  // Расход перемычки: индексы из прайса этой марки, по возрастанию
  await expect(f.loadIndex).toBeVisible();
  await expect(f.loadIndex.locator("option")).toHaveText([
    "— без индекса —",
    `${LINTEL}-8`,
    `${LINTEL}-20`,
  ]);

  // Расход сырья — индекса нет
  await f.material.selectOption(M.materials.concrete);
  await expect(f.loadIndex).toHaveCount(0);

  // Приход готовой продукции — индекса нет
  await f.type.selectOption("income");
  await f.material.selectOption(M.materials.lintel);
  await expect(f.loadIndex).toHaveCount(0);
});

// ─── Автоподстановка цены ────────────────────────────────────────────────

test("связка из прайса подставляет цену и показывает «По прайсу»", async ({ page }) => {
  const f = await openLintelExpense(page);
  const expected = priceOf("a", "20");

  await f.counterpartyRef.selectOption(M.counterparties.a);
  await f.loadIndex.selectOption("20");

  await expect(f.price).toHaveValue(String(expected));
  await expect(f.priceHint).toHaveText(moneyRe(expected));
  await expect(f.priceMissing).toHaveCount(0);
});

test("связки нет в прайсе — жёлтая плашка, ноль не подставляется", async ({ page }) => {
  const f = await openLintelExpense(page);

  await f.counterpartyRef.selectOption(M.counterparties.b);
  await f.loadIndex.selectOption("20"); // Б×20 — не покрыта

  await expect(f.priceMissing).toBeVisible();
  await expect(f.price).toHaveValue("");
  await expect(f.priceHint).toHaveCount(0);
});

test("цена, введённая руками, не перетирается автоподстановкой", async ({ page }) => {
  const f = await openLintelExpense(page);

  await f.counterpartyRef.selectOption(M.counterparties.a);
  await f.loadIndex.selectOption("8");
  await expect(f.price).toHaveValue(String(priceOf("a", "8")));

  await f.price.fill("9999");
  // Любое изменение, не касающееся связки, не должно вернуть цену прайса
  await f.quantity.fill("5");

  await expect(f.price).toHaveValue("9999");
  await expect(f.priceHint).toHaveCount(0);
});

test("смена индекса или контрагента снова включает автоподстановку", async ({ page }) => {
  const f = await openLintelExpense(page);

  await f.counterpartyRef.selectOption(M.counterparties.a);
  await f.loadIndex.selectOption("8");
  await f.price.fill("9999");

  // Смена индекса после ручного ввода → цена новой связки
  await f.loadIndex.selectOption("20");
  await expect(f.price).toHaveValue(String(priceOf("a", "20")));
  await expect(f.priceHint).toBeVisible();

  // Снова руками, затем смена контрагента (через покрытую связку Б×8)
  await f.loadIndex.selectOption("8");
  await f.price.fill("2222");
  await f.counterpartyRef.selectOption(M.counterparties.b);
  await expect(f.price).toHaveValue(String(priceOf("b", "8")));
  await expect(f.priceHint).toBeVisible();
});

// ─── Сохранение ──────────────────────────────────────────────────────────

test("сохранённая отгрузка содержит load_index, counterparty_id и цену прайса", async ({
  page,
}) => {
  const f = await openLintelExpense(page, 3);
  const expected = priceOf("a", "20");

  await f.counterpartyRef.selectOption(M.counterparties.a);
  await f.loadIndex.selectOption("20");
  await expect(f.price).toHaveValue(String(expected));
  await f.submit.click();

  await expect
    .poll(async () => (await latestTx(M.materials.lintel, "expense"))?.load_index)
    .toBe("20");
  const tx = await latestTx(M.materials.lintel, "expense");
  expect(tx?.counterparty_id).toBe(M.counterparties.a);
  expect(tx?.counterparty).toBe(E2E_COUNTERPARTIES.a);
  expect(Number(tx?.unit_price)).toBe(expected);
  expect(Number(tx?.quantity)).toBe(3);
});

// ─── Известный баг (п.5 плана) ───────────────────────────────────────────

// BUG: переключение с покрытой связки на непокрытую оставляет в поле цену
// ПРЕЖНЕЙ связки. Рядом жёлтое «введи вручную», но цифра выглядит валидной —
// при сохранении уходит чужая цена. Ожидаемое поведение (решение владельца):
// если связки нет в прайсе и цену не трогали руками — поле очищается, плашка
// остаётся. fixme снимается отдельным коммитом вместе с фиксом.
test.fixme("переход на непокрытую связку очищает автоподставленную цену", async ({
  page,
}) => {
  const f = await openLintelExpense(page);

  await f.counterpartyRef.selectOption(M.counterparties.a);
  await f.loadIndex.selectOption("20");
  await expect(f.price).toHaveValue(String(priceOf("a", "20")));

  await f.counterpartyRef.selectOption(M.counterparties.b); // Б×20 — не покрыта

  await expect(f.priceMissing).toBeVisible();
  await expect(f.price).toHaveValue("");
});
