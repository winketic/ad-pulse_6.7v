import { test, expect } from "playwright/test";
import { open, watchConsole, finishChecks } from "../helpers/smoke";

/**
 * Public (unauthenticated) pages. These must render for logged-OUT visitors,
 * so we drop the shared authenticated storageState here — otherwise middleware
 * bounces /login → /dashboard.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("public pages", () => {
  test("/login — sign-in form", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/login");

    await expect(page.getByRole("heading", { name: "AD Pulse" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();

    await finishChecks(page, testInfo, errors);
  });

  test("/register — application form", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/register");

    await expect(
      page.getByRole("heading", { name: "Оставить заявку" }),
    ).toBeVisible();
    await expect(page.getByRole("button")).toBeVisible();

    await finishChecks(page, testInfo, errors);
  });

  test("/forgot-password — reset request", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/forgot-password");

    await expect(
      page.getByRole("heading", { name: "Сброс пароля" }),
    ).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();

    await finishChecks(page, testInfo, errors);
  });

  test("/reset-password — renders without token", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/reset-password");

    // Header renders regardless of token/session state.
    await expect(page.getByRole("heading", { name: "AD Pulse" })).toBeVisible();

    await finishChecks(page, testInfo, errors);
  });

  test("/verify-email — awaiting confirmation", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await open(page, "/verify-email");

    await expect(
      page.getByRole("heading", { name: "Подтвердите почту" }),
    ).toBeVisible();

    await finishChecks(page, testInfo, errors);
  });

  test("/invite — staged token does not 500", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    // A clearly-invalid token: the page must degrade to an error state, never 500.
    const res = await open(
      page,
      "/invite?token_hash=smoke-test-staged-token&type=invite",
    );
    expect(res.status()).toBeLessThan(500);

    // Some header/heading must render (invalid-link UI still shows the shell).
    await expect(page.locator("h1")).toBeVisible();

    await finishChecks(page, testInfo, errors);
  });
});
