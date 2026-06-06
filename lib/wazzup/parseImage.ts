export async function parseImageTransaction(
  mediaUrl: string,
  accessToken: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  // Download image from Wazzup CDN (requires Bearer token)
  const imgRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!imgRes.ok) {
    throw new Error(`Failed to download image [${imgRes.status}]`);
  }

  const imgBuffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const base64 = Buffer.from(imgBuffer).toString("base64");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Это фото накладной или складской операции. Прочитай и ответь ОДНИМ предложением на русском: "[тип] [материал] [количество] [единица]".
Типы: привезли/поступило (приход), использовали/ушло (расход), вернули (возврат), брак/дефект (брак).
Если не накладная или не читается — ответь ровно: не удалось распознать`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${contentType};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GPT Vision API error [${res.status}]: ${body}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
