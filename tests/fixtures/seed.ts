import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServiceClient,
  assertTestCompany,
  E2E_COMPANY_NAME,
  E2E_OTHER_COMPANY_ID,
  E2E_OTHER_COMPANY_NAME,
} from "./guards";

// ─── Meta (written to tests/.auth/e2e-meta.json, gitignored) ─────────────
export const META_PATH = path.join(__dirname, "..", ".auth", "e2e-meta.json");

export type Role = "admin" | "manager" | "warehouse" | "workshop";

export type E2EMeta = {
  companyId: string;
  users: Record<Role, { email: string; id: string }>;
  materials: {
    concrete: string; // Бетон (м³)
    rebar: string; // Арматура (м, kg_per_meter)
    wire: string; // Проволока (кг)
    lintel: string; // Перемычка 2ПБ-13 (шт, с нормами)
  };
  counterparties: Record<CounterpartyKey, string>; // key → counterparties.id
  // "Foreign" tenant for isolation tests — nobody logs in as it; tests only
  // smuggle its ids into E2E_TEST's own server actions and expect a refusal.
  other: { companyId: string; material: string; counterparty: string };
};

export const E2E_OTHER_MATERIAL_NAME = "Перемычка 2ПБ-13";
export const E2E_OTHER_COUNTERPARTY_NAME = "E2E Чужой контрагент";

// ─── Fixed identities for the test tenant ────────────────────────────────
const DOMAIN = "e2e.adpulse.local";
export const ROLE_USERS: Record<Role, { email: string; name: string; position: string }> = {
  admin: { email: `e2e-admin@${DOMAIN}`, name: "E2E Админ", position: "Директор" },
  manager: { email: `e2e-manager@${DOMAIN}`, name: "E2E Менеджер", position: "Менеджер" },
  warehouse: { email: `e2e-warehouse@${DOMAIN}`, name: "E2E Кладовщик", position: "Кладовщик" },
  workshop: { email: `e2e-workshop@${DOMAIN}`, name: "E2E Цех", position: "Мастер цеха" },
};

// Norms for the finished product (перемычка). Deliberately small so a single
// production run consumes a checkable, exact amount.
export const LINTEL_NORM_CONCRETE = 0.013; // м³ бетона на 1 шт
export const LINTEL_NORM_REBAR = 2.5; // м арматуры на 1 шт
export const REBAR_KG_PER_METER = 0.888; // 12мм: 1 м ≈ 0.888 кг

// ─── Material catalogue (created once) ───────────────────────────────────
const MATERIAL_DEFS = [
  { key: "concrete", name: "Бетон", unit: "м³", extra: {} },
  {
    key: "rebar",
    name: "Арматура",
    unit: "м",
    extra: { kg_per_meter: REBAR_KG_PER_METER },
  },
  { key: "wire", name: "Проволока", unit: "кг", extra: {} },
  {
    key: "lintel",
    name: "Перемычка 2ПБ-13",
    unit: "шт",
    extra: {
      norm_concrete: LINTEL_NORM_CONCRETE,
      norm_rebar: LINTEL_NORM_REBAR,
      rebar_material_name: "Арматура",
    },
  },
] as const;

// ─── Phase 6 pricing refs (counterparties + price_list) ──────────────────
// Non-empty refs are what switch the Движение form to the Phase 6 flow: the
// counterparty becomes a directory <select> and product expenses get a load
// index select with auto-pricing. Every price is distinct so a test can tell
// exactly which row was applied. Б × "20" is deliberately absent — the
// uncovered combination.
export type CounterpartyKey = "a" | "b";

export const E2E_COUNTERPARTIES: Record<CounterpartyKey, string> = {
  a: "E2E Контрагент А",
  b: "E2E Контрагент Б",
};

// load_index is text in the schema (migration 042), not integer.
export const E2E_PRICES: ReadonlyArray<{
  counterparty: CounterpartyKey;
  load_index: string;
  price: number;
}> = [
  { counterparty: "a", load_index: "8", price: 4500 },
  { counterparty: "a", load_index: "20", price: 5200 },
  { counterparty: "b", load_index: "8", price: 4700 },
];

const isoDay = (offset = 0) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().split("T")[0];

/**
 * Deterministic baseline transactions. After this set the balances are:
 *   Бетон 94 м³ · Арматура 5000 м · Проволока 802 кг · Перемычка 0 шт
 * Spread across today / this week / older so period filters have distinct
 * result sizes: today=2, week=4, all=6 rows.
 */
export function baselineTx(meta: E2EMeta, createdBy: string) {
  const { concrete, rebar, wire } = meta.materials;
  const row = (
    material_id: string,
    type: string,
    quantity: number,
    dayOffset: number,
    note: string | null = null,
    counterparty: string | null = null,
  ) => ({
    company_id: meta.companyId,
    material_id,
    type,
    quantity,
    note,
    counterparty,
    transaction_date: isoDay(dayOffset),
    created_by: createdBy,
    source: "manual",
  });

  return [
    row(concrete, "income", 100, -10),
    row(rebar, "income", 5000, -10),
    row(wire, "income", 800, -3, null, "ООО Метизы"),
    row(concrete, "expense", 5, -3),
    row(wire, "return", 2, 0),
    row(concrete, "defect", 1, 0, "Скол при распалубке"),
  ];
}

// ─── User + company provisioning (idempotent) ────────────────────────────

async function listAllUsers(sb: SupabaseClient) {
  const map = new Map<string, string>(); // email → id
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }
  return map;
}

/**
 * Ensure the E2E_TEST company, its 4 role users + profiles, materials and a
 * couple of plans exist. Safe to call repeatedly — creates what's missing,
 * reuses what's there. Returns the resolved meta and also writes it to disk.
 */
export async function ensureE2E(): Promise<E2EMeta> {
  const sb = getServiceClient();

  // 1) Company
  let companyId: string;
  const { data: existing } = await sb
    .from("companies")
    .select("id")
    .eq("name", E2E_COMPANY_NAME)
    .maybeSingle();
  if (existing) {
    companyId = existing.id;
  } else {
    // Note: this DB has no companies.setup_completed column (migration 017 not
    // applied). The dashboard's admin setup-gate select() fails open on that, so
    // the E2E admin still reaches /dashboard. Insert name only.
    const { data, error } = await sb
      .from("companies")
      .insert({ name: E2E_COMPANY_NAME })
      .select("id")
      .single();
    if (error) throw new Error(`create company: ${error.message}`);
    companyId = data.id;
  }
  assertTestCompany(companyId, companyId); // sanity: not SattyGroup / forbidden

  // 2) Users + profiles
  const emailToId = await listAllUsers(sb);
  const users = {} as E2EMeta["users"];
  for (const role of Object.keys(ROLE_USERS) as Role[]) {
    const def = ROLE_USERS[role];
    let uid = emailToId.get(def.email.toLowerCase());
    if (!uid) {
      const { data, error } = await sb.auth.admin.createUser({
        email: def.email,
        password: `E2e!${Math.random().toString(36).slice(2)}Aa9`,
        email_confirm: true,
        user_metadata: { full_name: def.name },
      });
      if (error || !data.user) throw new Error(`create user ${def.email}: ${error?.message}`);
      uid = data.user.id;
    }
    // Upsert profile (id = auth user id).
    const { error: pErr } = await sb.from("profiles").upsert(
      {
        id: uid,
        full_name: def.name,
        role,
        company_id: companyId,
        position: def.position,
      },
      { onConflict: "id" },
    );
    if (pErr) throw new Error(`upsert profile ${def.email}: ${pErr.message}`);
    users[role] = { email: def.email, id: uid };
  }

  // 3) Materials
  const materials = {} as E2EMeta["materials"];
  for (const def of MATERIAL_DEFS) {
    const { data: found } = await sb
      .from("materials")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", def.name)
      .maybeSingle();
    if (found) {
      materials[def.key] = found.id;
      // keep norms/kg_per_meter in sync in case they drifted
      await sb.from("materials").update(def.extra).eq("id", found.id);
    } else {
      const { data, error } = await sb
        .from("materials")
        .insert({ company_id: companyId, name: def.name, unit: def.unit, ...def.extra })
        .select("id")
        .single();
      if (error) throw new Error(`create material ${def.name}: ${error.message}`);
      materials[def.key] = data.id;
    }
  }

  // 3b) Counterparty directory (pricing rows are synced by ensurePricing below)
  const counterparties = await ensureCounterparties(sb, companyId);

  // 3c) Foreign tenant E2E_OTHER (fixed id) with one product + one counterparty
  const other = await ensureOtherTenant(sb, companyId);

  const meta: E2EMeta = { companyId, users, materials, counterparties, other };
  await ensurePricing(meta);

  // 4) Plans (2 active) — created once, referencing the lintel product.
  const { count: planCount } = await sb
    .from("production_plans")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if ((planCount ?? 0) === 0) {
    const plans = [
      { name: "План E2E — Партия 2ПБ-13", planned: 500, start: isoDay(-5), end: isoDay(20), assigned_to: users.workshop.id },
      { name: "План E2E — Срочный заказ", planned: 200, start: isoDay(-2), end: isoDay(5), assigned_to: users.manager.id },
    ];
    for (const p of plans) {
      const { data: plan, error } = await sb
        .from("production_plans")
        .insert({
          company_id: companyId,
          name: p.name,
          planned_quantity: p.planned,
          start_date: p.start,
          end_date: p.end,
          status: "active",
          created_by: users.admin.id,
          assigned_to: p.assigned_to,
        })
        .select("id")
        .single();
      if (error) throw new Error(`create plan: ${error.message}`);
      await sb.from("plan_materials").insert({
        plan_id: plan.id,
        material_id: materials.lintel,
        planned_quantity: p.planned,
      });
    }
  }

  // Keep known test assignments deterministic when the tenant already had
  // plans from an earlier seed run.
  await sb.from("production_plans").update({ assigned_to: users.workshop.id })
    .eq("company_id", companyId).eq("name", "План E2E — Партия 2ПБ-13");
  await sb.from("production_plans").update({ assigned_to: users.manager.id })
    .eq("company_id", companyId).eq("name", "План E2E — Срочный заказ");

  writeMeta(meta);
  return meta;
}

/**
 * Return the E2E_TEST tenant to a known transaction state: wipe every
 * material_transaction for the company and re-insert the deterministic
 * baseline. Guard-checked so it can only ever touch E2E_TEST.
 */
export async function resetTransactions(meta: E2EMeta): Promise<void> {
  assertTestCompany(meta.companyId, meta.companyId);
  const sb = getServiceClient();

  const { error: delErr } = await sb
    .from("material_transactions")
    .delete()
    .eq("company_id", meta.companyId);
  if (delErr) throw new Error(`reset delete: ${delErr.message}`);

  const { error: insErr } = await sb
    .from("material_transactions")
    .insert(baselineTx(meta, meta.users.admin.id));
  if (insErr) throw new Error(`reset insert: ${insErr.message}`);

  await ensurePricing(meta);
}

/**
 * Upsert the fixed counterparty directory and drop any stray E2E_TEST
 * counterparty, so the form's <select> always shows exactly А and Б.
 * Returns key → id. Guard-checked: E2E_TEST only.
 */
async function ensureCounterparties(
  sb: SupabaseClient,
  companyId: string,
): Promise<Record<CounterpartyKey, string>> {
  assertTestCompany(companyId, companyId);
  const names = Object.values(E2E_COUNTERPARTIES);

  const { data, error } = await sb
    .from("counterparties")
    .upsert(
      names.map((name) => ({ company_id: companyId, name })),
      { onConflict: "company_id,name" },
    )
    .select("id, name");
  if (error) throw new Error(`upsert counterparties: ${error.message}`);

  const idByName = new Map((data ?? []).map((r) => [r.name as string, r.id as string]));
  const resolved = Object.fromEntries(
    (Object.keys(E2E_COUNTERPARTIES) as CounterpartyKey[]).map((key) => {
      const id = idByName.get(E2E_COUNTERPARTIES[key]);
      if (!id) throw new Error(`counterparty ${E2E_COUNTERPARTIES[key]} not returned by upsert`);
      return [key, id];
    }),
  ) as Record<CounterpartyKey, string>;

  const { error: delErr } = await sb
    .from("counterparties")
    .delete()
    .eq("company_id", companyId)
    .not("id", "in", `(${Object.values(resolved).join(",")})`);
  if (delErr) throw new Error(`prune counterparties: ${delErr.message}`);

  return resolved;
}

/**
 * Ensure the E2E_OTHER tenant exists under its pinned id, with one product and
 * one counterparty. Refuses to adopt a company that merely shares the id or the
 * name — either mismatch means something unexpected owns it, so we stop rather
 * than write. Guard-checked against the exact allow-listed id.
 */
async function ensureOtherTenant(
  sb: SupabaseClient,
  e2eCompanyId: string,
): Promise<E2EMeta["other"]> {
  assertTestCompany(E2E_OTHER_COMPANY_ID, e2eCompanyId);

  const { data: byId, error: idErr } = await sb
    .from("companies")
    .select("id, name")
    .eq("id", E2E_OTHER_COMPANY_ID)
    .maybeSingle();
  if (idErr) throw new Error(`lookup E2E_OTHER: ${idErr.message}`);
  if (byId && byId.name !== E2E_OTHER_COMPANY_NAME) {
    throw new Error(`[GUARD] company ${E2E_OTHER_COMPANY_ID} exists as «${byId.name}», not E2E_OTHER`);
  }
  if (!byId) {
    const { data: byName } = await sb
      .from("companies")
      .select("id")
      .eq("name", E2E_OTHER_COMPANY_NAME)
      .maybeSingle();
    if (byName) {
      throw new Error(`[GUARD] E2E_OTHER exists under a different id (${byName.id})`);
    }
    const { error } = await sb
      .from("companies")
      .insert({ id: E2E_OTHER_COMPANY_ID, name: E2E_OTHER_COMPANY_NAME });
    if (error) throw new Error(`create E2E_OTHER: ${error.message}`);
  }

  const lintelDef = MATERIAL_DEFS.find((d) => d.key === "lintel");
  const { data: foundMat } = await sb
    .from("materials")
    .select("id")
    .eq("company_id", E2E_OTHER_COMPANY_ID)
    .eq("name", E2E_OTHER_MATERIAL_NAME)
    .maybeSingle();
  let material = foundMat?.id as string | undefined;
  if (!material) {
    const { data, error } = await sb
      .from("materials")
      .insert({
        company_id: E2E_OTHER_COMPANY_ID,
        name: E2E_OTHER_MATERIAL_NAME,
        unit: "шт",
        ...(lintelDef?.extra ?? {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(`create E2E_OTHER material: ${error.message}`);
    material = data.id as string;
  }

  const { data: cp, error: cpErr } = await sb
    .from("counterparties")
    .upsert(
      { company_id: E2E_OTHER_COMPANY_ID, name: E2E_OTHER_COUNTERPARTY_NAME },
      { onConflict: "company_id,name" },
    )
    .select("id")
    .single();
  if (cpErr) throw new Error(`upsert E2E_OTHER counterparty: ${cpErr.message}`);

  return { companyId: E2E_OTHER_COMPANY_ID, material, counterparty: cp.id as string };
}

/**
 * Return E2E_TEST's price_list to exactly E2E_PRICES: wipe the company's rows
 * and re-insert the fixed set. Idempotent; called from ensureE2E and on every
 * resetTransactions so no test can leak price state into the next.
 * Guard-checked: E2E_TEST only.
 */
export async function ensurePricing(meta: E2EMeta): Promise<void> {
  assertTestCompany(meta.companyId, meta.companyId);
  const sb = getServiceClient();

  const { error: delErr } = await sb
    .from("price_list")
    .delete()
    .eq("company_id", meta.companyId);
  if (delErr) throw new Error(`reset price_list: ${delErr.message}`);

  // Column is `price` here; `unit_price` exists only on material_transactions.
  const rows = E2E_PRICES.map((p) => ({
    company_id: meta.companyId,
    material_id: meta.materials.lintel,
    counterparty_id: meta.counterparties[p.counterparty],
    load_index: p.load_index,
    price: p.price,
  }));
  const { error: insErr } = await sb.from("price_list").insert(rows);
  if (insErr) throw new Error(`seed price_list: ${insErr.message}`);
}

// ─── Meta persistence ────────────────────────────────────────────────────
export function writeMeta(meta: E2EMeta): void {
  fs.mkdirSync(path.dirname(META_PATH), { recursive: true });
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

export function readMeta(): E2EMeta {
  if (!fs.existsSync(META_PATH)) {
    throw new Error(
      `E2E meta not found at ${META_PATH}. Run global-setup (npm run test:e2e) first.`,
    );
  }
  return JSON.parse(fs.readFileSync(META_PATH, "utf8"));
}
