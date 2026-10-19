import { test, expect } from "playwright/test";
import { escapeHtml } from "../../lib/utils/escapeHtml";

test("escapes markup characters before embedding user text in HTML", () => {
  expect(escapeHtml(`<b>Acme & "Sons"</b>`)).toBe("&lt;b&gt;Acme &amp; &quot;Sons&quot;&lt;/b&gt;");
  expect(escapeHtml("O'Reilly")).toBe("O&#39;Reilly");
});
