import { expect, type Locator, type Page, type TestInfo } from "playwright/test";

/** True when the current Playwright project is a mobile/tablet viewport. */
export function isMobile(testInfo: TestInfo): boolean {
  return Boolean(testInfo.project.metadata?.mobile);
}

/** Fail if the page overflows horizontally (scrollWidth must equal innerWidth). */
export async function expectNoHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(
    sw,
    `horizontal overflow — scrollWidth=${sw} > innerWidth=${iw}`,
  ).toBeLessThanOrEqual(iw + 1);
}

/** Assert a locator's box sits fully inside the viewport (nothing clipped off-edge). */
export async function expectInViewport(locator: Locator, label = "element") {
  const box = await locator.boundingBox();
  expect(box, `${label}: no bounding box (not rendered?)`).not.toBeNull();
  const vp = locator.page().viewportSize();
  if (!box || !vp) return;
  expect(box.x, `${label} clipped on the left (x=${box.x})`).toBeGreaterThanOrEqual(-1);
  expect(
    box.x + box.width,
    `${label} overflows right edge (right=${Math.round(box.x + box.width)} > ${vp.width})`,
  ).toBeLessThanOrEqual(vp.width + 1);
}

/**
 * Assert that nothing escapes the viewport horizontally.
 *
 * Deliberately not a screenshot: a baseline snapped from an already-broken
 * screen is green forever, while this fails the moment an element crosses the
 * right edge. It is what caught the banner-colour swatches being unreachable
 * on a 320px phone — a bug the whole snapshot suite had been green on.
 *
 * Skips two legitimate cases:
 *   · position:fixed — off-canvas drawers and nav live outside the flow;
 *   · anything inside a horizontally scrollable ancestor — a wide table in an
 *     overflow-x:auto wrapper is a deliberate design choice, not a defect.
 */
export async function expectNoOverflowingElements(page: Page, label = "page") {
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.right <= vw + 2) return;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed") return;
      if (cs.overflowX === "auto" || cs.overflowX === "scroll") return;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (as.overflowX === "auto" || as.overflowX === "scroll") return;
      }
      const cls =
        typeof el.className === "string" && el.className
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      out.push(`${el.tagName.toLowerCase()}${cls} (+${Math.round(box.right - vw)}px)`);
    });
    return [...new Set(out)].slice(0, 5);
  });
  expect(
    offenders,
    `${label}: элементы выходят за правый край экрана — ${offenders.join("; ")}`,
  ).toEqual([]);
}

/** Assert two boxes do not overlap (e.g. modal action row must clear the nav). */
export async function expectNotOverlapping(a: Locator, b: Locator, label = "elements") {
  const [ba, bb] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  if (!ba || !bb) return; // one not visible → nothing to overlap
  const overlap =
    ba.x < bb.x + bb.width &&
    ba.x + ba.width > bb.x &&
    ba.y < bb.y + bb.height &&
    ba.y + ba.height > bb.y;
  expect(overlap, `${label} overlap: ${JSON.stringify({ ba, bb })}`).toBe(false);
}

/** Assert text isn't visually truncated (scrollWidth ≤ clientWidth) for a single-line node. */
export async function expectNotTruncated(locator: Locator, label = "text") {
  const clipped = await locator.evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  );
  expect(clipped, `${label} is truncated (text overflows its container)`).toBe(false);
}

/**
 * Normalize volatile text (clock times, dates, Russian day labels) to fixed
 * tokens so data-view screenshots stay stable across days. Test-only DOM edit —
 * touches nothing the app persists. Run right before a screenshot.
 */
export async function freezeVolatile(page: Page) {
  await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const monthRe =
      /(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)\w*/gi;
    // Only normalize text nodes that carry a clock/date/day-label — leaves the
    // deterministic quantities ("+800", "−5") untouched. Walk text nodes (not
    // elements) so labels like "30 июля" inside a non-leaf <td> are caught too.
    const volatile =
      /\d{1,2}:\d{2}|\d{2}\.\d{2}(\.\d{4})?|\d{1,2}\s(янв|фев|мар|апр|ма|июн|июл|авг|сен|окт|ноя|дек)/i;
    const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walk.nextNode()) nodes.push(walk.currentNode as Text);
    for (const n of nodes) {
      const v = n.nodeValue ?? "";
      if (volatile.test(v)) {
        monthRe.lastIndex = 0;
        n.nodeValue = v.replace(/\d/g, "0").replace(monthRe, "мсц");
      }
    }
  });
}

/**
 * Deterministic screenshot. Disables animations, hides the caret, masks the
 * given volatile regions (clocks, relative dates) and tolerates sub-pixel
 * font-rendering noise. Baselines are per-project/platform and committed.
 */
export async function stableShot(
  target: Page | Locator,
  name: string,
  opts: { mask?: Locator[] } = {},
) {
  await expect(target).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    mask: opts.mask,
    maxDiffPixelRatio: 0.02,
  });
}
