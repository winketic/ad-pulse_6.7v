/**
 * Тесты на чистую логику шлюза, где ошибка стоит дорого:
 * обход пути в медиа, валидация company_id, слияние чатов.
 *
 * Запуск: npm run test (сначала нужен npm run build — тесты идут по dist).
 */

import test from "node:test";
import assert from "node:assert/strict";

// config.ts читает переменные на этапе импорта и бросает, если их нет.
process.env.GATEWAY_TOKEN = "test-token";
process.env.APP_WEBHOOK_TOKEN = "test-webhook";
process.env.DATA_DIR = "./data-test";

const { mergeChats, assertCompanyId } = await import("../dist/store.js");
const { resolveMediaPath, mimetypeForFile } = await import("../dist/media.js");

const chat = (over) => ({
  jid: "77001112233@s.whatsapp.net",
  name: "Склад",
  isGroup: false,
  phone: "77001112233",
  lastMessageAt: 1000,
  unreadCount: 0,
  ...over,
});

test("assertCompanyId пропускает uuid и отвергает обход пути", () => {
  assert.equal(
    assertCompanyId("0bf25d38-1e5b-4219-ad1a-ec91cdec830d"),
    "0bf25d38-1e5b-4219-ad1a-ec91cdec830d"
  );
  assert.throws(() => assertCompanyId("../etc"));
  assert.throws(() => assertCompanyId("a/b"));
  assert.throws(() => assertCompanyId(""));
  assert.throws(() => assertCompanyId("x".repeat(65)));
});

test("resolveMediaPath не выпускает за пределы каталога компании", () => {
  const ok = resolveMediaPath("company1", "1700000000-abc.jpg");
  assert.ok(ok && ok.endsWith("1700000000-abc.jpg"));

  assert.equal(resolveMediaPath("company1", "../../etc/passwd"), null);
  assert.equal(resolveMediaPath("company1", "..%2f..%2f.env"), null);
  assert.equal(resolveMediaPath("../company", "a.jpg"), null);
  assert.equal(resolveMediaPath("company1", "a/b.jpg"), null);
  assert.equal(resolveMediaPath("company1", ""), null);
});

test("mimetypeForFile узнаёт расширения, остальное — octet-stream", () => {
  assert.equal(mimetypeForFile("a.jpg"), "image/jpeg");
  assert.equal(mimetypeForFile("a.ogg"), "audio/ogg");
  assert.equal(mimetypeForFile("a.bin"), "application/octet-stream");
});

test("mergeChats не затирает название пустым значением", () => {
  const merged = mergeChats([chat({ name: "Склад цеха" })], [chat({ name: "" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "Склад цеха");
});

test("mergeChats берёт максимальное время последнего сообщения", () => {
  const merged = mergeChats(
    [chat({ lastMessageAt: 5000 })],
    [chat({ lastMessageAt: 1000 })]
  );
  assert.equal(merged[0].lastMessageAt, 5000);
});

test("mergeChats добавляет новый чат и сортирует по активности", () => {
  const merged = mergeChats(
    [chat({ jid: "a@s.whatsapp.net", lastMessageAt: 1000 })],
    [
      chat({ jid: "b@s.whatsapp.net", lastMessageAt: 9000, name: "Свежий" }),
      chat({ jid: "c@s.whatsapp.net", lastMessageAt: 3000, name: "Средний" }),
    ]
  );
  assert.deepEqual(
    merged.map((c) => c.jid),
    ["b@s.whatsapp.net", "c@s.whatsapp.net", "a@s.whatsapp.net"]
  );
});

test("mergeChats сохраняет флаг пустой активности как null", () => {
  const merged = mergeChats([], [chat({ lastMessageAt: null })]);
  assert.equal(merged[0].lastMessageAt, null);
});
