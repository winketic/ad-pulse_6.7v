/**
 * Тесты дискового outbox: недоставленные вебхуки не должны теряться.
 * Идут по dist — сначала npm run build (это делает pretest).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

process.env.GATEWAY_TOKEN = "test-token";
process.env.APP_WEBHOOK_TOKEN = "test-webhook";
process.env.DATA_DIR = "./data-test";

const { persistFailed, pendingCount, flushOutbox } = await import("../dist/outbox.js");

const OUTBOX = path.join("./data-test", "outbox");

async function reset() {
  await fs.rm(OUTBOX, { recursive: true, force: true });
}

const payload = (id) => ({
  event: "message.add",
  provider: "adpulse-gateway",
  data: [{ message_id: id }],
  meta: { idempotency_key: id, timestamp: 0 },
});

test("недоставленный вебхук сохраняется и виден в счётчике", async () => {
  await reset();
  await persistFailed(payload("m1"));
  assert.equal(await pendingCount(), 1);
  await persistFailed(payload("m2"));
  assert.equal(await pendingCount(), 2);
  await reset();
});

test("успешная отправка очищает очередь", async () => {
  await reset();
  await persistFailed(payload("m1"));
  await persistFailed(payload("m2"));

  const sent = [];
  const result = await flushOutbox(async (p) => {
    sent.push(p.data[0].message_id);
    return true;
  });

  assert.equal(result.sent, 2);
  assert.equal(result.remaining, 0);
  assert.deepEqual(sent, ["m1", "m2"]);
  await reset();
});

test("при неудаче очередь сохраняется и не зацикливается", async () => {
  await reset();
  await persistFailed(payload("m1"));
  await persistFailed(payload("m2"));

  let attempts = 0;
  const result = await flushOutbox(async () => {
    attempts++;
    return false;
  });

  // Останавливаемся на первой неудаче — приложение ещё лежит.
  assert.equal(attempts, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.remaining, 2);
  await reset();
});

test("битый файл не заклинивает очередь", async () => {
  await reset();
  await fs.mkdir(OUTBOX, { recursive: true });
  await fs.writeFile(path.join(OUTBOX, "1000-broken.json"), "{не json", "utf8");
  await persistFailed(payload("m1"));

  const result = await flushOutbox(async () => true);
  assert.equal(result.sent, 1);
  assert.equal(result.remaining, 0);
  await reset();
});

test("очередь не растёт бесконечно", async () => {
  await reset();
  for (let i = 0; i < 505; i++) await persistFailed(payload(`m${i}`));
  const count = await pendingCount();
  assert.ok(count <= 500, `ожидали не больше 500, получили ${count}`);
  await reset();
});
