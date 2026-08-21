import fs from "node:fs";
import { chromium, type FullConfig } from "playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  loadEnv,
  baseURL,
  DEMO_EMAIL,
  STORAGE_STATE,
  roleStatePath,
  type E2ERole,
} from "./helpers/env";
import { assertNotProd } from "./fixtures/guards";
import { ensureE2E, resetTransactions, ROLE_USERS } from "./fixtures/seed";

/**
 * Global setup — runs once before the whole suite.
 *
 *   1. Seed the isolated E2E_TEST tenant to a known state.
 *   2. Mint a reusable authenticated storageState for every actor:
 *        · director@altai-demo.kz  → smoke suite (read-only, other tenant)
 *        · e2e-{admin,manager,warehouse,workshop} → E2E_TEST functional/visual
 *   3. Warm (pre-compile) the dashboard routes so the parallel suite doesn't
 *      race `next dev`'s on-demand compilation.
 *
 * Login is passwordless: a service-role magiclink is exchanged for a session,
 * then handed to the app's own /login hash flow so the browser writes the exact
 * cookies middleware expects. No customer data is ever touched.
 */
export default async function globalSetup(_config: FullConfig) {
  const { url, anonKey, serviceKey } = loadEnv();
  const base = baseURL();
  assertNotProd(base);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1) Seed E2E_TEST ───────────────────────────────────────────────────
  const meta = await ensureE2E();
  await resetTransactions(meta);
  // eslint-disable-next-line no-console
  console.log(`✓ seeded E2E_TEST (${meta.companyId})`);

  // Fast path for local iteration: reuse already-minted storage states. Set
  // PW_REUSE_AUTH=1 to skip re-logging-in every actor (seeding still runs).
  const allStates = [
    STORAGE_STATE,
    ...(Object.keys(ROLE_USERS) as E2ERole[]).map(roleStatePath),
  ];
  if (process.env.PW_REUSE_AUTH === "1" && allStates.every((p) => fs.existsSync(p))) {
    // eslint-disable-next-line no-console
    console.log("✓ reusing existing storage states (PW_REUSE_AUTH=1)");
    return;
  }

  const browser = await chromium.launch();

  /** Mint one storageState by logging `email` in via the /login hash flow. */
  async function mintState(email: string, statePath: string) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(`generateLink(${email}): ${linkErr?.message ?? "no token"}`);
    }
    const { data: session, error: otpErr } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (otpErr || !session.session) {
      throw new Error(`verifyOtp(${email}): ${otpErr?.message ?? "no session"}`);
    }

    const ctx = await browser.newContext({ baseURL: base });
    const page = await ctx.newPage();
    const { access_token, refresh_token } = session.session;
    await page.goto(
      `/login#access_token=${access_token}&refresh_token=${refresh_token}&type=magiclink`,
    );
    try {
      await page.waitForURL("**/dashboard", { timeout: 30_000 });
    } catch (e) {
      throw new Error(
        `Login for ${email} didn't reach /dashboard (base=${base}). ` +
          `Server up? ${(e as Error).message}`,
      );
    }
    // Suppress the onboarding tour overlay for the whole suite.
    await page.evaluate(() => {
      try {
        localStorage.setItem("ad_pulse_tour_done", "1");
      } catch {
        /* ignore */
      }
    });
    await ctx.storageState({ path: statePath });
    return { ctx, page };
  }

  // ── 2) Smoke suite actor (kept working) ────────────────────────────────
  const director = await mintState(DEMO_EMAIL, STORAGE_STATE);
  await director.ctx.close();

  // ── 3) E2E_TEST role actors ────────────────────────────────────────────
  const roles = Object.keys(ROLE_USERS) as E2ERole[];
  let warmCtx: Awaited<ReturnType<typeof mintState>> | null = null;
  for (const role of roles) {
    const email = ROLE_USERS[role].email;
    const res = await mintState(email, roleStatePath(role));
    if (role === "admin") warmCtx = res;
    else await res.ctx.close();
  }

  // ── 4) Warm dashboard routes (admin context) ───────────────────────────
  if (warmCtx) {
    const warmPaths = [
      "/dashboard",
      "/dashboard/produce",
      "/dashboard/warehouse",
      "/dashboard/transactions",
      "/dashboard/plans",
      "/dashboard/reports",
      "/dashboard/settings",
    ];
    for (const p of warmPaths) {
      try {
        await warmCtx.page.goto(p, { waitUntil: "domcontentloaded", timeout: 45_000 });
      } catch {
        /* slow first compile just means the test retries — non-fatal */
      }
    }
    await warmCtx.ctx.close();
  }

  await browser.close();
  // eslint-disable-next-line no-console
  console.log("✓ storage states minted: director + admin/manager/warehouse/workshop");
}
