import { expect, type Page, type TestInfo } from "playwright/test";

/**
 * Console/page-error noise we deliberately tolerate on a smoke run. These are
 * either dev-mode chatter (Next.js Fast Refresh, React DevTools hint), optional
 * third-party resources, or benign browser warnings — none indicate the page
 * itself failed to render. Everything else is treated as a failure.
 */
const CONSOLE_NOISE: RegExp[] = [
  /favicon/i,
  /manifest\.json/i,
  /\[Fast Refresh\]/i,
  /Download the React DevTools/i,
  /ResizeObserver loop/i,
  /sentry/i,
  /Failed to load resource: the server responded with a status of 40[34]/i,
  /net::ERR_/i,
  /driver\.js/i,
  // Next.js dev-only HMR/webpack chunk artifacts — stale chunk references while
  // a route recompiles on-demand. Never occur in a production build.
  /__webpack_modules__/,
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Loading CSS chunk/i,
];

/**
 * Attach console + pageerror listeners and return a live array of "real"
 * errors. Call at the very start of a test (before navigation) and assert the
 * array is empty at the end.
 */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  const keep = (text: string) => !CONSOLE_NOISE.some((r) => r.test(text));

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (keep(text)) errors.push(`[console] ${text}`);
  });
  page.on("pageerror", (err) => {
    const text = err.message || String(err);
    if (keep(text)) errors.push(`[pageerror] ${text}`);
  });

  return errors;
}

/** True when the current Playwright project is a mobile/tablet viewport. */
export function isMobile(testInfo: TestInfo): boolean {
  return Boolean(testInfo.project.metadata?.mobile);
}

/**
 * Navigate and assert the response is a real render (HTTP < 400), then wait for
 * the DOM to settle. Returns the navigation response for further checks.
 */
export async function open(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(res, `no response for ${path}`).not.toBeNull();
  expect(
    res!.status(),
    `${path} returned HTTP ${res!.status()}`,
  ).toBeLessThan(400);
  return res!;
}

/** Fail if the page overflows horizontally (mobile/tablet viewports only). */
export async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(
    sw,
    `horizontal overflow — scrollWidth=${sw} > clientWidth=${cw}`,
  ).toBeLessThanOrEqual(cw + 1);
}

/**
 * Assert the primary navigation is present for the current viewport:
 * - mobile → bottom nav + central "Выпуск" FAB
 * - desktop → top nav (logo) + primary "Выпуск" action
 */
export async function expectDashboardNav(page: Page, testInfo: TestInfo) {
  if (isMobile(testInfo)) {
    // FAB carries a stable aria-label and lives only in the mobile bottom nav.
    await expect(
      page.getByRole("link", { name: "Записать выпуск" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("link", { name: "AD Pulse" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Выпуск", exact: true }).first(),
    ).toBeVisible();
  }
}

/** Standard end-of-test assertions shared by every smoke case. */
export async function finishChecks(
  page: Page,
  testInfo: TestInfo,
  errors: string[],
) {
  if (isMobile(testInfo)) {
    await expectNoHorizontalScroll(page);
  }
  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
}
