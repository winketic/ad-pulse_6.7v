import { test, expect } from "playwright/test";
import {
  buildTxInput,
  type Counterparty,
  type FormState,
  type Material,
} from "../../components/transactions/buildTxInput";

/**
 * buildTxInput: Движение form state → createTransaction payload.
 *
 * Covers in particular the free-text counterparty fallback (empty directory),
 * which lost its e2e coverage once the E2E_TEST seed got a counterparty
 * directory — the form only renders the text input when the directory is empty.
 */

const CONCRETE: Material = { id: "m-concrete", name: "Бетон", unit: "м³" };
const REBAR: Material = {
  id: "m-rebar",
  name: "Арматура",
  unit: "м",
  kg_per_meter: 0.888,
};
const MATERIALS: Material[] = [CONCRETE, REBAR];

const CP_A: Counterparty = { id: "cp-a", name: "ТОО Альфа" };
const DIRECTORY: Counterparty[] = [CP_A];

const form = (overrides: Partial<FormState> = {}): FormState => ({
  type: "income",
  material_id: CONCRETE.id,
  quantity: "10",
  defect_reason: "",
  note: "",
  counterparty: "",
  counterparty_id: "",
  load_index: "",
  date: "2026-10-06",
  unit_price: "",
  ...overrides,
});

// ─── Контрагент ──────────────────────────────────────────────────────────

test.describe("контрагент", () => {
  test("пустой справочник: берётся свободный текст, обрезанный, без id", () => {
    const out = buildTxInput(form({ counterparty: "  ООО Ромашка  " }), MATERIALS, []);
    expect(out.counterparty).toBe("ООО Ромашка");
    expect(out.counterparty_id).toBeNull();
  });

  test("пустой справочник и пустой текст → null, а не пустая строка", () => {
    const out = buildTxInput(form({ counterparty: "   " }), MATERIALS);
    expect(out.counterparty).toBeNull();
    expect(out.counterparty_id).toBeNull();
  });

  test("выбор из справочника пишет и id, и имя; свободный текст игнорируется", () => {
    const out = buildTxInput(
      form({ counterparty_id: CP_A.id, counterparty: "что-то старое" }),
      MATERIALS,
      DIRECTORY,
    );
    expect(out.counterparty_id).toBe(CP_A.id);
    expect(out.counterparty).toBe(CP_A.name);
  });

  test("id не из справочника не уходит на сервер — откат на текст", () => {
    const out = buildTxInput(
      form({ counterparty_id: "cp-unknown", counterparty: "ООО Ромашка" }),
      MATERIALS,
      DIRECTORY,
    );
    expect(out.counterparty_id).toBeNull();
    expect(out.counterparty).toBe("ООО Ромашка");
  });
});

// ─── Индекс нагрузки ─────────────────────────────────────────────────────

test.describe("индекс нагрузки", () => {
  test("на расходе сохраняется (обрезанный)", () => {
    expect(buildTxInput(form({ type: "expense", load_index: " 20 " }), MATERIALS).load_index)
      .toBe("20");
  });

  test("на любом другом типе → null, даже если в форме остался", () => {
    for (const type of ["income", "return", "defect"]) {
      expect(buildTxInput(form({ type, load_index: "20" }), MATERIALS).load_index).toBeNull();
    }
  });

  test("пустой индекс на расходе → null", () => {
    expect(buildTxInput(form({ type: "expense", load_index: "" }), MATERIALS).load_index)
      .toBeNull();
  });
});

// ─── Цена ────────────────────────────────────────────────────────────────

test.describe("цена за единицу", () => {
  test("приход/расход: округляется до копеек", () => {
    expect(buildTxInput(form({ unit_price: "1234.567" }), MATERIALS).unit_price).toBe(1234.57);
    expect(
      buildTxInput(form({ type: "expense", unit_price: "5200" }), MATERIALS).unit_price,
    ).toBe(5200);
  });

  test("ноль, пусто и мусор → null (ноль ценой не считается)", () => {
    for (const unit_price of ["0", "", "abc", "-5"]) {
      expect(buildTxInput(form({ unit_price }), MATERIALS).unit_price).toBeNull();
    }
  });

  test("возврат и брак цену не несут", () => {
    for (const type of ["return", "defect"]) {
      expect(buildTxInput(form({ type, unit_price: "100" }), MATERIALS).unit_price).toBeNull();
    }
  });
});

// ─── Количество и примечание ─────────────────────────────────────────────

test.describe("количество и примечание", () => {
  test("материал без kg_per_meter: количество как введено", () => {
    const out = buildTxInput(form({ quantity: "2.5" }), MATERIALS);
    expect(out.quantity).toBe(2.5);
    expect(out.note).toBeNull();
  });

  test("кг→м: хранится в метрах, введённые кг — в примечании", () => {
    const out = buildTxInput(
      form({ material_id: REBAR.id, quantity: "8.88", note: "партия 7" }),
      MATERIALS,
    );
    expect(out.quantity).toBe(10); // 8.88 / 0.888
    expect(out.note).toBe("партия 7\n(введено: 8.88 кг)");
  });

  test("брак: причина первой, примечание через пустую строку", () => {
    const out = buildTxInput(
      form({ type: "defect", defect_reason: " Скол ", note: " при погрузке " }),
      MATERIALS,
    );
    expect(out.note).toBe("Скол\n\nпри погрузке");
  });

  test("тип, материал и дата проходят без изменений", () => {
    const out = buildTxInput(form({ type: "return" }), MATERIALS);
    expect(out).toMatchObject({
      type: "return",
      material_id: CONCRETE.id,
      transaction_date: "2026-10-06",
    });
  });
});
