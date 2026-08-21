import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv, baseURL } from "../helpers/env";

/**
 * Hard safety rails for every data-mutating test path.
 *
 * The Supabase database is SHARED between staging and production, so the ONLY
 * thing standing between an autotest and real customer data is discipline about
 * which company_id we touch. These guards make that discipline mechanical:
 * nothing writes unless the target is provably the E2E_TEST company, and
 * nothing ever runs against production URLs.
 */

// Real customer company — must NEVER be written to by any test. Full id, plus a
// prefix check so a truncated/wrong env value still trips the guard.
export const SATTYGROUP_COMPANY_ID = "ab426af3-ba63-4137-b7c6-368b425f934e";
const FORBIDDEN_PREFIXES = ["ab426af3"];

// The dedicated test tenant. Everything that writes lives here.
export const E2E_COMPANY_NAME = "E2E_TEST";

/** Throw if the base URL looks like production. */
export function assertNotProd(url = baseURL()): void {
  if (/pulse\.altaidynamics\.kz/i.test(url) || /--prod|production/i.test(url)) {
    throw new Error(
      `[GUARD] Refusing to run against production URL: ${url}. ` +
        `Use local dev or a staging preview.`,
    );
  }
}

/**
 * Throw unless `companyId` is the known E2E_TEST company. Blocks SattyGroup by
 * both full id and prefix, and blocks any id that doesn't match the E2E tenant
 * resolved at seed time.
 */
export function assertTestCompany(
  companyId: string | null | undefined,
  expectedE2EId: string,
): void {
  if (!companyId) throw new Error("[GUARD] company_id is empty");
  if (companyId === SATTYGROUP_COMPANY_ID) {
    throw new Error("[GUARD] Attempt to touch SattyGroup — aborting.");
  }
  if (FORBIDDEN_PREFIXES.some((p) => companyId.startsWith(p))) {
    throw new Error(`[GUARD] company_id ${companyId} is on the forbidden list.`);
  }
  if (!expectedE2EId) throw new Error("[GUARD] E2E company id not resolved");
  if (companyId !== expectedE2EId) {
    throw new Error(
      `[GUARD] company_id ${companyId} is not the E2E_TEST company ` +
        `(${expectedE2EId}). Writes are only allowed in E2E_TEST.`,
    );
  }
}

/** Service-role client (bypasses RLS) — seeding/verification only, never shipped. */
export function getServiceClient(): SupabaseClient {
  assertNotProd();
  const { url, serviceKey } = loadEnv();
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
