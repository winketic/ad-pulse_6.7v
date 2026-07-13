// Brand rebrand screenshots — mobile 390 + desktop 1440, all screens.
// Usage: node brandshot.tmp.mjs <before|after>
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const phase = process.argv[2] ?? "before";
const OUT = `C:/Users/zhaha/AppData/Local/Temp/claude/c--Users-zhaha-Projects-ad-pulse-6-7v/36d64335-7163-48d0-817f-bc1f6a6cee17/scratchpad/brand/${phase}`;
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const EMAIL = "ceo@altaidynamics.kz";

const env = {};
const raw = fs.readFileSync(".env.local", "utf8").replace(/^﻿/, "");
for (const line of raw.split(/\r?\n/)) {
  const m = line.replace(/^﻿/, "").match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const routes = [
  ["/login", "login", true],       // pre-auth
  ["/dashboard", "dashboard"],
  ["/dashboard/warehouse", "warehouse"],
  ["/dashboard/transactions", "transactions"],
  ["/dashboard/plans", "plans"],
  ["/dashboard/produce", "produce"],
  ["/dashboard/reports", "reports"],
  ["/dashboard/settings", "settings"],
];

async function shoot(width, tag) {
  const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (error) { console.error(error.message); process.exit(1); }
  const isMobile = width < 700;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height: isMobile ? 844 : 900 },
    deviceScaleFactor: isMobile ? 2 : 1.25,
    isMobile,
    hasTouch: isMobile,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("ad_pulse_tour_done", "1"));
  // establish session
  await page.goto(`${BASE}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle", timeout: 90000 });
  for (const [route, name, preauth] of routes) {
    if (preauth) continue; // login shot handled separately (needs logout)
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`) });
    console.log("shot:", `${name}-${tag}`);
  }
  // login (fresh context, no session)
  const ctx2 = await browser.newContext({ viewport: { width, height: isMobile ? 844 : 900 }, deviceScaleFactor: isMobile ? 2 : 1.25, isMobile, hasTouch: isMobile });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await p2.waitForTimeout(1000);
  await p2.screenshot({ path: path.join(OUT, `login-${tag}.png`) });
  console.log("shot:", `login-${tag}`);
  await browser.close();
}

await shoot(390, "m");
await shoot(1440, "d");
console.log("DONE", phase);
