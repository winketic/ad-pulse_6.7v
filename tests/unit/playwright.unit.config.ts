import { defineConfig } from "playwright/test";

/**
 * Pure unit tests — no browser, no dev server, no seeding, no database.
 * Deliberately separate from tests/playwright.config.ts, whose globalSetup
 * logs in and seeds E2E_TEST and whose webServer boots `next dev`: none of
 * that is needed (or wanted) to test a pure function.
 *
 *   npm run test:unit
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
});
