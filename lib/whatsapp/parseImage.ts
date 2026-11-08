import { chatCompletion } from "@/lib/llm";

export async function parseImageTransaction(
  mediaUrl: string,
  accessToken: string
): Promise<string> {
  // Скачивание идёт через шлюз, токен передаёт вызывающий код.
  const imgRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!imgRes.ok) {
    throw new Error(`Failed to download image [${imgRes.status}]`);
  }

  const imgBuffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const base64 = Buffer.from(imgBuffer).toString("base64");

  const answer = await chatCompletion(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Это фото накладной или складской операции. Прочитай и ответь ОДНИМ предложением на русском: "[тип] [материал] [количество] [единица]".
Типы: привезли/поступило (приход), использовали/ушло (расход), вернули (возврат), брак/дефект (брак).
Если не накладная или не читается — ответь ровно: не удалось распознать`,
          },
          { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
        ],
      },
    ],
    { maxTokens: 300, temperature: 0, scope: "parseImage", timeoutMs: 60_000 }
  );

  return answer ?? "";
}
