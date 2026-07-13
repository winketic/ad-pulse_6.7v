// Desktop screenshot: node shotd.tmp.mjs /route out-name [width] [email]
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const OUT = "C:/Users/zhaha/AppData/Local/Temp/claude/c--Users-zhaha-Projects-ad-pulse-6-7v/36d64335-7163-48d0-817f-bc1f6a6cee17/scratchpad/desktop";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const route = process.argv[2] ?? "/dashboard";
const name = process.argv[3] ?? "shot";
const width = parseInt(process.argv[4] ?? "1280", 10);
const email = process.argv[5] ?? "ceo@altaidynamics.kz";

const env = {};
const raw = fs.readFileSync(".env.local", "utf8").replace(/^﻿/, "");
for (const line of raw.split(/\r?\n/)) {
  const m = line.replace(/^﻿/, "").match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error) { console.error(error.message); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem("ad_pulse_tour_done", "1"));
await page.goto(`${BASE}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle", timeout: 90000 });
await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`) });
console.log("shot:", `${name}-${width}`, "as", email);
await browser.close();
