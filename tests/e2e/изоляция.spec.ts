import { randomUUID } from "node:crypto";
import { test, expect, type Page, type TestInfo } from "playwright/test";
import {
  meta,
  balanceOf,
  latestTx,
  txCount,
  txCountForCompany,
  openTxModal,
  gotoTx,
  txForm,
} from "../helpers/e2e";
import { resetTransactions, type E2EMeta } from "../fixtures/seed";

/**
 * Cross-tenant isolation of the Движение server actions.
 *
 * createTransaction / createProductionTransaction take ids from the request
 * body. The FK on counterparty_id/material_id and the INSERT RLS policy (which
 * only checks the row's own company_id) both accept another company's ids, so
 * assertOwnCounterparty and assertWholeUnitQuantity are the only thing between
 * a forged body and a cross-tenant write. These tests forge exactly that body.
 *
 * How: the real form submits, and page.route rewrites the server-action POST
 * on the wire before it reaches the server — the server sees an arbitrary body
 * from a genuinely authenticated E2E_TEST admin, the same as a hand-crafted
 * request. Client-side checks are bypassed; only server checks remain.
 *
 * What this can and can't catch: removing either assert (or its call) makes
 * the forged write succeed → red. Removing only the explicit
 * `.eq("company_id")` inside an assert is NOT observable here: SELECT RLS on
 * materials/counterparties still hides the foreign row, so the assert still
 * refuses. That filter is the documented second line of defence.
 *
 * The foreign tenant is E2E_OTHER (pinned id, seeded) — never a real company.
 */

let M: E2EMeta;

test.beforeAll(() => {
  M = meta();
});

test.beforeEach(async () => {
  await resetTransactions(M);
});

// A successful action inserts the row before it finishes streaming its RSC
// response, so a DB poll can pass while route.fetch is still in flight. Let
// in-flight forged requests complete before the page is torn down.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

type ActionArg = Record<string, unknown>;

/**
 * Rewrite the first argument of the next server-action POST from this page.
 * Records each forged call's HTTP status in the test's annotations, so the
 * report shows how the server answered.
 */
async function forgeNextAction(
  page: Page,
  testInfo: TestInfo,
  patch: (arg: ActionArg) => ActionArg,
) {
  await page.route("**/dashboard/transactions**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) {
      return route.fallback();
    }
    const args = JSON.parse(req.postData() ?? "[]") as unknown[];
    const forged = [patch(args[0] as ActionArg), ...args.slice(1)];
    const response = await route.fetch({ postData: JSON.stringify(forged) });
    testInfo.annotations.push({
      type: "server-action-status",
      description: String(response.status()),
    });
    await route.fulfill({ response });
  });
}

/** Snapshot of everything a forged write could have changed. */
async function writeState() {
  return {
    e2e: await txCount(),
    other: await txCountForCompany(M.other.companyId),
  };
}

/** Submit a regular expense of concrete with counterparty А through the form. */
async function submitConcreteExpense(page: Page) {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("expense");
  await f.material.selectOption(M.materials.concrete);
  await f.quantity.fill("1");
  await f.counterpartyRef.selectOption(M.counterparties.a);
  await f.submit.click();
}

const refused = (page: Page, message: string | RegExp) =>
  page.getByText(
    typeof message === "string" ? `Не сохранено: ${message}` : message,
  );

// ─── Контроль: перехват действительно доходит до сервера ─────────────────

test("контроль: перехват без подмены сохраняет запись как обычно", async ({
  page,
}, testInfo) => {
  const before = await writeState();
  await forgeNextAction(page, testInfo, (arg) => ({ ...arg }));

  await submitConcreteExpense(page);

  await expect.poll(async () => (await writeState()).e2e).toBe(before.e2e + 1);
  const tx = await latestTx(M.materials.concrete, "expense");
  expect(tx?.counterparty_id).toBe(M.counterparties.a);
});

// ─── Контрагент ──────────────────────────────────────────────────────────

test("чужой counterparty_id → «Контрагент не найден», записи нет", async ({
  page,
}, testInfo) => {
  const before = await writeState();
  await forgeNextAction(page, testInfo, (arg) => ({
    ...arg,
    counterparty_id: M.other.counterparty,
  }));

  await submitConcreteExpense(page);

  await expect(refused(page, "Контрагент не найден")).toBeVisible();
  expect(await writeState()).toEqual(before);
});

test("несуществующий counterparty_id → тот же отказ", async ({ page }, testInfo) => {
  const before = await writeState();
  await forgeNextAction(page, testInfo, (arg) => ({
    ...arg,
    counterparty_id: randomUUID(),
  }));

  await submitConcreteExpense(page);

  await expect(refused(page, "Контрагент не найден")).toBeVisible();
  expect(await writeState()).toEqual(before);
});

// ─── Материал ────────────────────────────────────────────────────────────

test("чужой material_id → «Материал не найден», записи нет", async ({
  page,
}, testInfo) => {
  const before = await writeState();
  await forgeNextAction(page, testInfo, (arg) => ({
    ...arg,
    material_id: M.other.material,
  }));

  await submitConcreteExpense(page);

  await expect(refused(page, "Материал не найден")).toBeVisible();
  expect(await writeState()).toEqual(before);
});

test("несуществующий material_id → тот же отказ", async ({ page }, testInfo) => {
  const before = await writeState();
  await forgeNextAction(page, testInfo, (arg) => ({
    ...arg,
    material_id: randomUUID(),
  }));

  await submitConcreteExpense(page);

  await expect(refused(page, "Материал не найден")).toBeVisible();
  expect(await writeState()).toEqual(before);
});

test("производство: чужая марка → «Материал не найден», сырьё не списано", async ({
  page,
}, testInfo) => {
  const before = await writeState();
  const concreteBefore = await balanceOf(M.materials.concrete);
  await forgeNextAction(page, testInfo, (arg) => ({
    ...arg,
    material_id: M.other.material,
  }));

  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("production");
  await f.material.selectOption(M.materials.lintel);
  await f.quantity.fill("2");
  await f.submit.click();

  // Production keeps the modal open and shows the server error inside it.
  // Two layers refuse here with the SAME text: assertWholeUnitQuantity in the
  // action, and the create_production_transaction RPC itself (migration 023).
  // Verified by mutation: with the action's assert removed this still passes,
  // so it proves the path is closed, not which layer closed it.
  await expect(page.getByText("Материал не найден")).toBeVisible();
  expect(await writeState()).toEqual(before);
  expect(await balanceOf(M.materials.concrete)).toBe(concreteBefore);
});

// ─── Мусор вместо uuid ───────────────────────────────────────────────────

test("некорректный uuid в counterparty_id → отказ, записи нет", async ({
  page,
}, testInfo) => {
  const before = await writeState();
  await forgeNextAction(page, testInfo, (arg) => ({
    ...arg,
    counterparty_id: "not-a-uuid",
  }));

  await submitConcreteExpense(page);

  // Refused either way; the exact wording is reported, not pinned here.
  const toast = refused(page, /^Не сохранено:/);
  await expect(toast).toBeVisible();
  testInfo.annotations.push({ type: "refusal-text", description: await toast.innerText() });
  expect(await writeState()).toEqual(before);
});
