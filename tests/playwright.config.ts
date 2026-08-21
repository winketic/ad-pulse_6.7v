import { defineConfig, devices } from "playwright/test";
import path from "node:path";
import { baseURL, STORAGE_STATE, roleStatePath } from "./helpers/env";

const BASE_URL = baseURL();
const isLocal = /localhost|127\.0\.0\.1/.test(BASE_URL);

// Device projects run the read-only suites (smoke + visual). Functional writes
// live in the single `e2e` project so DB mutations are serialized on one
// browser and never race the visual snapshots.
const DEVICE_MATCH = ["**/smoke/**/*.spec.ts", "**/visual/**/*.spec.ts"];
const E2E_MATCH = ["**/e2e/**/*.spec.ts"];

const device = (
  name: string,
  base: (typeof devices)[string],
  extra: Record<string, unknown>,
  mobile: boolean,
) => ({
  name,
  testMatch: DEVICE_MATCH,
  use: { ...base, ...extra, storageState: STORAGE_STATE },
  metadata: { mobile },
});

export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // next dev compiles routes on-demand and the DB is Supabase free tier — a
  // first hit can transiently 500/404 under load; retries heal that.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 4,
  outputDir: path.join(__dirname, "test-results"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(__dirname, "playwright-report"), open: "never" }],
  ],
  timeout: 45_000,
  expect: { timeout: 7_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    // ── Device projects: smoke + visual (read-only) ──────────────────────
    device("desktop-chrome", devices["Desktop Chrome"], { viewport: { width: 1440, height: 900 } }, false),
    device("desktop-safari", devices["Desktop Safari"], { viewport: { width: 1440, height: 900 } }, false),
    device("ios-iphone", devices["iPhone 14 Pro"], {}, true),
    device("ios-ipad", devices["iPad Pro 11"], {}, true),
    device("android-phone", devices["Pixel 7"], {}, true),
    device("android-tablet", devices["Galaxy Tab S4"], {}, true),

    // ── Functional E2E: single browser, serialized writes into E2E_TEST ──
    {
      name: "e2e",
      testMatch: E2E_MATCH,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: roleStatePath("admin"),
      },
      metadata: { mobile: false },
    },
  ],

  webServer: isLocal
    ? {
        command: "npm run dev",
        url: BASE_URL,
        cwd: path.join(__dirname, ".."),
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
