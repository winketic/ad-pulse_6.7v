import { createServiceClient } from "@/lib/supabase/service";

// ─── Types ────────────────────────────────────────────────

export type TxType = "income" | "expense" | "defect" | "return";

export type ParseResult = {
  type: TxType | null;
  quantity: number | null;
  unit: string | null;
  material_id: string | null;
  material_name: string | null;
  confidence: "high" | "low";
  transaction_created: boolean;
};

// ─── Keyword maps ─────────────────────────────────────────

const TYPE_KEYWORDS: Record<TxType, string[]> = {
  income: [
    "привезли", "завезли", "поступило", "получили", "приход", "доставили",
    "пришло", "приехало", "поставили", "загрузили", "закупили",
  ],
  expense: [
    "использовали", "ушло", "потратили", "расход", "израсходовали", "списали",
    "использовано", "ушли", "выдали", "отгрузили", "взяли",
  ],
  defect: [
    "брак", "забраковали", "бракованный", "дефект", "бракованное",
    "испорчено", "испортилось", "дефектный", "неликвид",
  ],
  return: [
    "вернули", "возврат", "обратно", "возвращаем", "возвращено",
    "отправили обратно", "возвращаем",
  ],
};

// ─── Unit normalisation map ───────────────────────────────

const UNIT_MAP: Record<string, string> = {
  "тонн": "тонна", "тонна": "тонна", "тонны": "тонна", "тоны": "тонна",
  "кг": "кг", "кило": "кг", "килограмм": "кг", "килограмма": "кг",
  "килограммов": "кг",
  "шт": "шт", "штук": "шт", "штука": "шт", "штуки": "шт",
  "м3": "м3", "куб": "м3", "кубометр": "м3", "кубов": "м3", "куба": "м3",
  "м2": "м2", "квм": "м2",
  "литр": "литр", "литра": "литр", "литров": "литр", "л": "литр",
};

// Sorted by descending length so longer units match before shorter ones
const UNIT_KEYS = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length);

// ─── Levenshtein fuzzy matching ───────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : 1 + Math.min(row[j - 1], row[j], prev);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function fuzzyMaterialScore(
  text: string,
  materialName: string
): number {
  const textWords = text.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const matWords = materialName.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (matWords.length === 0) return 999;

  let totalScore = 0;
  for (const mw of matWords) {
    const threshold = Math.max(1, Math.floor(mw.length * 0.3));
    const best = textWords.reduce(
      (min, tw) => Math.min(min, levenshtein(tw, mw)),
      999
    );
    if (best > threshold) return 999; // required word too far off
    totalScore += best;
  }
  return totalScore;
}

// ─── Helpers ──────────────────────────────────────────────

function detectType(text: string): TxType | null {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS) as [TxType, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return type;
  }
  return null;
}

function extractQuantity(
  text: string
): { quantity: number; unit: string } | null {
  const lower = text.toLowerCase();

  // Pattern: number followed by optional space and unit
  // Examples: "5 тонн", "10.5кг", "100 шт", "3,5 куб"
  const unitPattern = UNIT_KEYS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(${unitPattern})(?:\\b|$)`,
    "i"
  );

  const match = lower.match(regex);
  if (!match) return null;

  const rawQty = match[1].replace(",", ".");
  const quantity = parseFloat(rawQty);
  if (isNaN(quantity) || quantity <= 0) return null;

  const rawUnit = match[2].toLowerCase();
  const unit = UNIT_MAP[rawUnit] ?? rawUnit;

  return { quantity, unit };
}

function findMaterial(
  text: string,
  materials: { id: string; name: string; unit: string }[]
): { id: string; name: string } | null {
  const lower = text.toLowerCase();

  // Exact match first
  const exact = materials.find((m) => lower.includes(m.name.toLowerCase()));
  if (exact) return { id: exact.id, name: exact.name };

  // Partial word match (each word of material name in text)
  const partial = materials.find((m) => {
    const words = m.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return words.length > 0 && words.every((w) => lower.includes(w));
  });
  if (partial) return { id: partial.id, name: partial.name };

  // Fuzzy Levenshtein match — catches typos and slight misspellings
  const scored = materials
    .map((m) => ({ m, score: fuzzyMaterialScore(lower, m.name) }))
    .filter(({ score }) => score < 999)
    .sort((a, b) => a.score - b.score);

  if (scored.length > 0) return { id: scored[0].m.id, name: scored[0].m.name };

  return null;
}

// ─── GPT fallback ─────────────────────────────────────────

interface GptParsed {
  type: TxType | null;
  material_name: string | null;
  quantity: number | null;
  unit: string | null;
}

async function callGptParser(
  text: string,
  materials: { id: string; name: string; unit: string }[],
  context: string[] = []
): Promise<GptParsed | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const materialsList = materials.map((m) => `- ${m.name} (${m.unit})`).join("\n");

  const contextBlock = context.length > 0
    ? `\n\nКонтекст предыдущих сообщений из этого чата (от старых к новым):\n${context.map((m, i) => `${i + 1}. ${m}`).join("\n")}\n\nЕсли текущее сообщение ссылается на предыдущее (например «ещё 200 кг», «и цемент тоже», «вернули то же»), используй контекст для определения материала/типа.`
    : "";

  const systemPrompt = `Ты парсер складских сообщений строительного производства. Анализируй сообщения на русском, казахском, сленге, с опечатками — пойми суть.

Список материалов компании:
${materialsList}${contextBlock}

Если сообщение НЕ является складской операцией (приветствие, вопрос, эмодзи, случайный текст, "Когда", ".", "Ок" и т.д.) — верни все поля null.

Если это складская операция — определи:
1. Тип операции: "income" (приход/завезли/поступило/получили/привезли), "expense" (расход/ушло/использовали/потратили/взяли), "defect" (брак/дефект/испорчено/поломка), "return" (возврат/вернули/обратно)
2. Название материала — выбери ТОЧНО из списка выше (не придумывай новые)
3. Количество (число)
4. Единица измерения

Ответь СТРОГО JSON без markdown:
{"type":"income|expense|defect|return|null","material_name":"название из списка или null","quantity":число_или_null,"unit":"единица или null"}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 150,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[parser] GPT API error:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    console.log("[parser] GPT raw response:", raw);

    const parsed = JSON.parse(raw) as GptParsed;
    return parsed;
  } catch (e) {
    console.error("[parser] GPT parse error:", e);
    return null;
  }
}

// ─── Main parser ──────────────────────────────────────────

export async function parseMessage(
  text: string,
  companyId: string,
  context: string[] = []
): Promise<ParseResult> {
  const service = createServiceClient();

  // Load company materials
  const { data: materials } = await service
    .from("materials")
    .select("id, name, unit")
    .eq("company_id", companyId);

  const matList = materials ?? [];

  // ── Step 1: keyword-based fast parse ──
  const type = detectType(text);
  const qtyResult = extractQuantity(text);
  const material = findMaterial(text, matList);
  const allFound = !!type && !!qtyResult && !!material;

  if (allFound) {
    return {
      type,
      quantity: qtyResult!.quantity,
      unit: qtyResult!.unit,
      material_id: material!.id,
      material_name: material!.name,
      confidence: "high",
      transaction_created: false,
    };
  }

  // ── Step 2: GPT fallback for fuzzy/slang/Kazakh input ──
  console.log(`[parser] keyword parse incomplete (type=${type}, qty=${qtyResult?.quantity}, mat=${material?.name}), trying GPT`);
  const gpt = await callGptParser(text, matList, context);

  if (gpt) {
    // Map GPT's material_name back to a real material id (case-insensitive)
    const matchedMat = gpt.material_name
      ? matList.find((m) =>
          m.name.toLowerCase() === gpt.material_name!.toLowerCase() ||
          m.name.toLowerCase().includes(gpt.material_name!.toLowerCase()) ||
          gpt.material_name!.toLowerCase().includes(m.name.toLowerCase())
        ) ?? null
      : null;

    const resolvedType   = gpt.type ?? type;
    const resolvedQty    = gpt.quantity ?? qtyResult?.quantity ?? null;
    const resolvedUnit   = gpt.unit ?? qtyResult?.unit ?? null;
    const resolvedMatId  = matchedMat?.id ?? material?.id ?? null;
    const resolvedMatName = matchedMat?.name ?? material?.name ?? gpt.material_name ?? null;

    const gptAllFound = !!(resolvedType && resolvedQty != null && resolvedMatId);

    console.log(`[parser] GPT result: type=${resolvedType} mat=${resolvedMatName} qty=${resolvedQty} conf=${gptAllFound ? "high" : "low"}`);

    return {
      type: resolvedType,
      quantity: resolvedQty,
      unit: resolvedUnit,
      material_id: resolvedMatId,
      material_name: resolvedMatName,
      confidence: gptAllFound ? "high" : "low",
      transaction_created: false,
    };
  }

  // ── Step 3: return best-effort keyword result ──
  return {
    type,
    quantity: qtyResult?.quantity ?? null,
    unit: qtyResult?.unit ?? null,
    material_id: material?.id ?? null,
    material_name: material?.name ?? null,
    confidence: "low",
    transaction_created: false,
  };
}
