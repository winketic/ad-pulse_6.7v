import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServiceClient,
  assertTestCompany,
  E2E_COMPANY_NAME,
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
};

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

  const meta: E2EMeta = { companyId, users, materials };

  // 4) Plans (2 active) — created once, referencing the lintel product.
  const { count: planCount } = await sb
    .from("production_plans")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if ((planCount ?? 0) === 0) {
    const plans = [
      { name: "План E2E — Партия 2ПБ-13", planned: 500, start: isoDay(-5), end: isoDay(20) },
      { name: "План E2E — Срочный заказ", planned: 200, start: isoDay(-2), end: isoDay(5) },
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
