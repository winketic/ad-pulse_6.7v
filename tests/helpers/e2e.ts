import { expect, type Page } from "playwright/test";
import { getServiceClient, assertTestCompany } from "../fixtures/guards";
import { readMeta, type E2EMeta } from "../fixtures/seed";
import { roleStatePath, type E2ERole } from "./env";

// ─── Meta + DB access (service role — verification/cleanup only) ──────────

export function meta(): E2EMeta {
  return readMeta();
}

export function roleState(role: E2ERole): string {
  return roleStatePath(role);
}

/** Non-deleted balance for a material in E2E_TEST (income+return − expense−defect). */
export async function balanceOf(materialId: string): Promise<number> {
  const m = meta();
  assertTestCompany(m.companyId, m.companyId);
  const sb = getServiceClient();
  const { data } = await sb
    .from("material_transactions")
    .select("type, quantity")
    .eq("company_id", m.companyId)
    .eq("material_id", materialId)
    .is("deleted_at", null);
  return (data ?? []).reduce((s, t) => {
    const q = Number(t.quantity);
    return s + (t.type === "income" || t.type === "return" ? q : -q);
  }, 0);
}

type TxRow = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  counterparty: string | null;
  unit_price: number | null;
  deleted_at: string | null;
  transaction_date: string;
  created_at: string;
};

/** Newest matching transaction row (for asserting what the UI actually wrote). */
export async function latestTx(
  materialId: string,
  type?: string,
): Promise<TxRow | null> {
  const m = meta();
  const sb = getServiceClient();
  let q = sb
    .from("material_transactions")
    .select("id, type, quantity, note, counterparty, unit_price, deleted_at, transaction_date, created_at")
    .eq("company_id", m.companyId)
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (type) q = q.eq("type", type);
  const { data } = await q;
  return (data?.[0] as TxRow) ?? null;
}

/** Count all (optionally by type) non-deleted transactions in E2E_TEST. */
export async function txCount(type?: string): Promise<number> {
  const m = meta();
  const sb = getServiceClient();
  let q = sb
    .from("material_transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", m.companyId)
    .is("deleted_at", null);
  if (type) q = q.eq("type", type);
  const { count } = await q;
  return count ?? 0;
}

// ─── Движение modal UI helpers ───────────────────────────────────────────

/**
 * Navigate to Движение and wait until it's interactive. `next dev` hydrates
 * client components a beat after the HTML lands; interacting before that races
 * missing buttons. Anchoring on the heading + primary action makes every test
 * deterministic instead of relying on retries.
 */
export async function gotoTx(page: Page, query = "") {
  // Re-navigate until the page renders: `next dev` can transiently 500 a route
  // on a cold hit under load. waitUntil:"load" also gives the client bundle time
  // to hydrate (a server-rendered button paints before its onClick attaches).
  await expect(async () => {
    await page.goto(`/dashboard/transactions${query}`);
    await expect(
      page.getByRole("heading", { name: "Движение материалов" }),
    ).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Добавить запись" }).first()).toBeVisible();
}

/**
 * Open the "add transaction" modal. Retries the click until the modal actually
 * appears: in `next dev` the header button can paint a beat before hydration
 * wires its handler, so a single early click is a silent no-op.
 */
export async function openTxModal(page: Page) {
  const btn = page.getByRole("button", { name: "Добавить запись" }).first();
  const heading = page.getByRole("heading", { name: "Добавить запись движения" });
  await expect(btn).toBeVisible();
  await expect(async () => {
    await btn.click();
    await expect(heading).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/** Stable locators for the modal's fields. Only 2 <select>s exist on the page. */
export function txForm(page: Page) {
  return {
    type: page.locator("select").first(),
    material: page.locator("select").nth(1),
    quantity: page.getByPlaceholder("0.0000"),
    date: page.locator('input[type="date"]'),
    price: page.getByPlaceholder("0", { exact: true }),
    counterparty: page.getByPlaceholder("Название компании"),
    defectReason: page.getByPlaceholder("Опишите причину появления брака..."),
    note: page.getByPlaceholder("Дополнительная информация..."),
    // Modal submit is the LAST "Добавить запись" button (header one is first).
    submit: page.getByRole("button", { name: "Добавить запись" }).last(),
  };
}

/** The mobile bottom nav / desktop header — for overlap checks. */
export function bottomNav(page: Page) {
  return page.locator("nav.fixed.bottom-0");
}
