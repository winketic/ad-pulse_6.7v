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

  return null;
}

// ─── Main parser ──────────────────────────────────────────

export async function parseMessage(
  text: string,
  companyId: string
): Promise<ParseResult> {
  const service = createServiceClient();

  // Load company materials
  const { data: materials } = await service
    .from("materials")
    .select("id, name, unit")
    .eq("company_id", companyId);

  const type = detectType(text);
  const qtyResult = extractQuantity(text);
  const material = findMaterial(text, materials ?? []);

  const allFound = !!type && !!qtyResult && !!material;

  return {
    type,
    quantity: qtyResult?.quantity ?? null,
    unit: qtyResult?.unit ?? null,
    material_id: material?.id ?? null,
    material_name: material?.name ?? null,
    confidence: allFound ? "high" : "low",
    transaction_created: false,
  };
}
