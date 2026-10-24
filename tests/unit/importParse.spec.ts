import { test, expect } from "playwright/test";
import {
  MAX_DATA_ROWS,
  MAX_NAME_LENGTH,
  MAX_SHEET_ROWS,
  parseMaterialRows,
  type MaterialRow,
} from "../../lib/materials/parseImport";

const HEADER_NAME = "Наименование";
const HEADER_UNIT = "Единица";

function buildRows(count: number): MaterialRow[] {
  return Array.from({ length: count }, (_, index) => ({
    [HEADER_NAME]: `Материал ${index + 1}`,
    [HEADER_UNIT]: "шт",
  }));
}

test.describe("parseMaterialRows", () => {
  // Pinned to literals on purpose: the route rejects a file of 5001 rows and
  // tells the user "no more than 5000 rows including the header". If someone
  // changes the constant, these tests must go red instead of silently moving
  // the boundary and contradicting the message.
  test("row limits stay in sync with the message shown to the user", () => {
    expect(MAX_SHEET_ROWS).toBe(5000);
    expect(MAX_DATA_ROWS).toBe(4999);
  });

  test("accepts exactly MAX_DATA_ROWS data rows", () => {
    const result = parseMaterialRows(buildRows(4999));

    expect(result.tooManyRows).toBe(false);
    expect(result.items).toHaveLength(4999);
    expect(result.skipped).toEqual([]);
  });

  test("flags MAX_DATA_ROWS + 1 data rows as too many", () => {
    const result = parseMaterialRows(buildRows(5000));

    expect(result.tooManyRows).toBe(true);
  });

  test("detects name and unit columns from russian and english headers", () => {
    const russian = parseMaterialRows([{ "Материал": "Песок", "Ед. изм": "т" }]);
    expect(russian.items).toEqual([{ name: "Песок", unit: "т" }]);

    const english = parseMaterialRows([{ name: "Цемент", unit: "КГ" }]);
    expect(english.items).toEqual([{ name: "Цемент", unit: "кг" }]);
  });

  test("falls back to the first and second column when headers are unknown", () => {
    const result = parseMaterialRows([
      { "Колонка A": "Щебень", "Колонка B": "м3" },
    ]);

    expect(result.items).toEqual([{ name: "Щебень", unit: "м3" }]);
  });

  test("lowercases and trims units, defaulting an empty unit to шт", () => {
    const result = parseMaterialRows([
      { [HEADER_NAME]: "Цемент", [HEADER_UNIT]: "  КГ  " },
      { [HEADER_NAME]: "Песок" },
      { [HEADER_NAME]: "Щебень", [HEADER_UNIT]: "М3" },
    ]);

    expect(result.items).toEqual([
      { name: "Цемент", unit: "кг" },
      { name: "Песок", unit: "шт" },
      { name: "Щебень", unit: "м3" },
    ]);
  });

  test("skips empty names and names longer than MAX_NAME_LENGTH", () => {
    const exactName = "А".repeat(MAX_NAME_LENGTH);
    const longName = "Я".repeat(MAX_NAME_LENGTH + 1);

    const result = parseMaterialRows([
      { [HEADER_NAME]: "   ", [HEADER_UNIT]: "кг" },
      { [HEADER_NAME]: longName, [HEADER_UNIT]: "кг" },
      { [HEADER_NAME]: exactName, [HEADER_UNIT]: "кг" },
    ]);

    expect(result.items).toEqual([{ name: exactName, unit: "кг" }]);
    expect(result.skipped).toEqual(["(пустое название)", longName.slice(0, 40)]);
  });

  test("ignores forbidden keys and inherited cells without poisoning the prototype", () => {
    const hostile = JSON.parse(
      '{"__proto__":"polluted","constructor":"polluted","prototype":"polluted","Наименование":"Цемент","Единица":"кг"}'
    ) as MaterialRow;
    const inherited = Object.create({
      [HEADER_NAME]: "Из прототипа",
      [HEADER_UNIT]: "кг",
    }) as MaterialRow;

    const result = parseMaterialRows([hostile, inherited]);
    const probe = {} as Record<string, unknown>;

    expect(result.items).toEqual([{ name: "Цемент", unit: "кг" }]);
    expect(result.skipped).toEqual(["(пустое название)"]);
    expect(probe.name).toBeUndefined();
    expect(probe.polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
  });

  // Without the key filter the fallback would pick "__proto__" as the name
  // column and read Object.prototype through it, turning the cell into
  // "[object Object]". Selecting a forbidden key must be impossible.
  test("never falls back to a forbidden key as a column", () => {
    const hostile = JSON.parse('{"__proto__":"подмена","Единица":"кг"}') as MaterialRow;

    const result = parseMaterialRows([hostile]);

    for (const item of result.items) {
      expect(item.name).not.toContain("[object");
      expect(item.name).not.toBe("подмена");
    }
  });

  test("passes an unrecognised non-empty unit through lowercased", () => {
    const result = parseMaterialRows([
      { [HEADER_NAME]: "Плёнка", [HEADER_UNIT]: "Упак" },
    ]);

    expect(result.items).toEqual([{ name: "Плёнка", unit: "упак" }]);
  });
});
