import { test, expect } from "playwright/test";
import {
  open,
  watchConsole,
  finishChecks,
  expectDashboardNav,
} from "../helpers/smoke";

/**
 * Authenticated dashboard pages. Uses the shared storageState created in
 * global-setup (demo director, read-only). Every case asserts: page renders,
 * a page-specific key element is visible, the viewport's primary navigation is
 * present, no unexpected console errors, and no horizontal scroll on mobile.
 *
 * Read-only by contract — these tests never submit forms or write data.
 */
test.describe("dashboard pages", () => {
  test("/dashboard — overview hero, activity, nav", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard");

    // Hero output metric + activity feed. Both the mobile and desktop layouts
    // render these (one hidden via `lg:` classes), so target the visible copy
    // for the current viewport.
    await expect(
      page
        .getByText(/Выпуск сегодня|Движение сегодня/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("heading", { name: "Активность" })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });

  test("/dashboard/produce — quick output entry", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard/produce");

    await expect(
      page.getByRole("heading", { name: "Выпуск", exact: true }).first(),
    ).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });

  test("/dashboard/warehouse — stock balances", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard/warehouse");

    await expect(
      page.getByRole("heading", { name: "Склад" }).first(),
    ).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });

  test("/dashboard/transactions — movement list", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard/transactions");

    await expect(
      page.getByRole("heading", { name: "Движение материалов" }),
    ).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });

  test("/dashboard/plans — plan cards", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard/plans");

    await expect(
      page.getByRole("heading", { name: "Производственные планы" }),
    ).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });

  test("/dashboard/plans/[id] — plan detail", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard/plans");

    const firstPlan = page.locator('a[href^="/dashboard/plans/"]').first();
    const count = await page.locator('a[href^="/dashboard/plans/"]').count();
    test.skip(count === 0, "demo company has no plans to open");

    const href = await firstPlan.getAttribute("href");
    await open(page, href!);

    // Detail renders the plan name as the H1.
    await expect(page.locator("h1").first()).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });

  test("/dashboard/reports — report blocks", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard/reports");

    await expect(
      page.getByRole("heading", { name: "Отчёты" }),
    ).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });

  test("/dashboard/settings — profile/company/team tabs", async ({
    page,
  }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/dashboard/settings");

    await expect(
      page.getByRole("heading", { name: "Настройки" }),
    ).toBeVisible();
    // Tab bar present (профиль / компания / команда).
    await expect(page.getByRole("button", { name: "Профиль" })).toBeVisible();

    await expectDashboardNav(page, testInfo);
    await finishChecks(page, testInfo, errors);
  });
});
