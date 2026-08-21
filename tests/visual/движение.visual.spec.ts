import { test, expect } from "playwright/test";
import { gotoTx, openTxModal, txForm } from "../helpers/e2e";
import { roleStatePath } from "../helpers/env";
import {
  isMobile,
  expectNoHorizontalScroll,
  expectInViewport,
  expectNotTruncated,
  freezeVolatile,
  stableShot,
} from "../helpers/visual";

// Read-only. Runs on all 6 device projects against the E2E_TEST baseline that
// global-setup seeds. Uses the admin actor so every control is visible.
test.use({ storageState: roleStatePath("admin") });

// ─── List ────────────────────────────────────────────────────────────────

test("список: без горизонтального скролла, снапшот", async ({ page }, testInfo) => {
  await gotoTx(page);

  // Layout invariants (deterministic, independent of the data/day)
  await expectNoHorizontalScroll(page);
  await expectInViewport(
    page.getByRole("button", { name: "Добавить запись" }).first(),
    "«Добавить запись» button",
  );

  // Mobile shows cards, desktop shows the table — never both
  if (isMobile(testInfo)) {
    await expect(page.locator("table")).toBeHidden();
  } else {
    await expect(page.locator("table")).toBeVisible();
    // Material name cell must not clip
    await expectNotTruncated(
      page.getByRole("cell", { name: "Проволока" }).first(),
      "material name cell",
    );
  }

  await freezeVolatile(page);
  await stableShot(page, "list.png");
});

// ─── Modal ───────────────────────────────────────────────────────────────

test("модалка: поля в пределах вьюпорта, не перекрывают навигацию, снапшот", async ({
  page,
}) => {
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);

  await expectNoHorizontalScroll(page);
  await expectInViewport(f.quantity, "quantity field");
  await expectInViewport(f.submit, "submit button");

  // Action buttons must sit fully inside the viewport height (not clipped
  // below the fold / behind the keyboard-safe area).
  const submitBox = await f.submit.boundingBox();
  const vp = page.viewportSize();
  if (submitBox && vp) {
    expect(
      submitBox.y + submitBox.height,
      "submit button clipped at the bottom edge",
    ).toBeLessThanOrEqual(vp.height + 1);
  }
  await expect(page.getByRole("button", { name: "Отмена" })).toBeVisible();

  // Screenshot just the form (the only <form> on the page) — no volatile list
  // behind it. The date field renders today's date → mask it.
  await stableShot(page.locator("form"), "modal.png", { mask: [f.date] });
});

// ─── Production preview inside the modal ─────────────────────────────────

test("модалка: превью автосписания в производстве, снапшот", async ({ page }) => {
  const { meta } = await import("../helpers/e2e");
  const M = meta();
  await gotoTx(page);
  await openTxModal(page);
  const f = txForm(page);
  await f.type.selectOption("production");
  await f.material.selectOption(M.materials.lintel);
  await f.quantity.fill("10");

  const preview = page.getByText(/Спишется: бетон/);
  await expect(preview).toBeVisible();
  await expectInViewport(preview, "production preview");
  await expectNoHorizontalScroll(page);

  await stableShot(page.locator("form"), "modal-production.png", { mask: [f.date] });
});

// ─── Filter chips: single row ────────────────────────────────────────────

test("фильтры-чипы: в одну строку, без горизонтального скролла страницы", async ({
  page,
}) => {
  await gotoTx(page);

  const income = page.getByRole("button", { name: "Приход", exact: true });
  const defect = page.getByRole("button", { name: "Брак", exact: true });
  const [a, b] = await Promise.all([income.boundingBox(), defect.boundingBox()]);
  expect(a && b, "type chips not found").toBeTruthy();
  if (a && b) {
    // Same row → their tops line up (chips scroll horizontally within their own
    // container, but the page itself must never scroll sideways).
    expect(Math.abs(a.y - b.y), "type chips wrapped onto two rows").toBeLessThanOrEqual(2);
  }
  await expectNoHorizontalScroll(page);
});

// ─── Mobile: expanded row card ───────────────────────────────────────────

test("мобильный разворот строки: детали в пределах вьюпорта, снапшот", async ({
  page,
}, testInfo) => {
  test.skip(!isMobile(testInfo), "expand is a mobile-only interaction");
  await gotoTx(page);

  // Tap the first data row (a baseline "Проволока" or "Бетон" movement)
  await page.getByRole("button").filter({ hasText: /[+−]\d/ }).first().click();
  const detail = page.getByText(/Добавил:/).first();
  await expect(detail).toBeVisible();
  await expectInViewport(detail, "expanded detail");
  await expectNoHorizontalScroll(page);

  await freezeVolatile(page);
  await stableShot(page, "expanded.png");
});
