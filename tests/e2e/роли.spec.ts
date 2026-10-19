import { test, expect, type Browser } from "playwright/test";
import { baseURL } from "../helpers/env";
import { meta, openTxModal, roleState, txForm } from "../helpers/e2e";
import type { E2ERole } from "../helpers/env";

async function rolePage(browser: Browser, role: E2ERole) {
  const context = await browser.newContext({ baseURL: baseURL(), storageState: roleState(role) });
  return { context, page: await context.newPage() };
}

test("кладовщик не открывает отчёты и видит складскую навигацию", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "warehouse");
  try {
    await page.goto("/dashboard/reports");
    await expect(page).toHaveURL(/\/dashboard\/warehouse$/);
    await expect(page.getByRole("heading", { name: "Склад" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("цех видит только назначенный ему план", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "workshop");
  try {
    await page.goto("/dashboard/plans");
    await expect(page.getByText("План E2E — Партия 2ПБ-13")).toBeVisible();
    await expect(page.getByText("План E2E — Срочный заказ")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Новый план" })).toHaveCount(0);
    await page.goto("/dashboard/materials");
    await expect(page).toHaveURL(/\/dashboard\/plans$/);
  } finally {
    await context.close();
  }
});

test("цеховой пользователь не может подменить расход на приход в запросе", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "workshop");
  try {
    await page.goto("/dashboard/transactions");
    await openTxModal(page);
    const form = txForm(page);
    await form.type.selectOption("expense");
    await form.material.selectOption(meta().materials.concrete);
    await form.quantity.fill("1");

    await page.route("**/dashboard/transactions**", async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || !request.headers()["next-action"]) return route.fallback();
      const args = JSON.parse(request.postData() ?? "[]") as unknown[];
      const input = args[0] as Record<string, unknown>;
      const response = await route.fetch({
        postData: JSON.stringify([{ ...input, type: "income" }, ...args.slice(1)]),
      });
      await route.fulfill({ response });
    });

    await form.submit.click();
    await expect(page.getByText("Не сохранено: Нет прав для этого типа операции")).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await context.close();
  }
});

test("менеджер сохраняет доступ к отчётам", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "manager");
  try {
    await page.goto("/dashboard/reports");
    await expect(page).toHaveURL(/\/dashboard\/reports$/);
    await expect(page.getByRole("heading", { name: "Отчёты" })).toBeVisible();
  } finally {
    await context.close();
  }
});
