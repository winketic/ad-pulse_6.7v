/**
 * Чистый разбор строк импорта материалов.
 *
 * Здесь нет обращений к сети, БД или env: функция принимает уже разобранные
 * строки листа (XLSX.utils.sheet_to_json) и возвращает готовые к вставке
 * записи. Благодаря этому логику можно покрыть unit-тестами, не поднимая
 * Next.js и не подключаясь к Supabase.
 */

/** Строк данных (без заголовка). 5000 строк в файле включая заголовок. */
export const MAX_DATA_ROWS = 4999;

/** Строк в листе, включая строку заголовка. */
export const MAX_SHEET_ROWS = MAX_DATA_ROWS + 1;

/** Максимальная длина названия материала. */
export const MAX_NAME_LENGTH = 200;

/** Максимальная длина имени колонки, участвующего в определении. */
const MAX_COLUMN_NAME_LENGTH = 100;

/** Ключи, через которые можно отравить прототип объекта. */
const FORBIDDEN_COLUMN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const VALID_UNITS = new Set(["кг", "тонна", "тн", "шт", "м3", "м2", "литр", "пог.м", "л", "т"]);

const NAME_COLUMN_RE = /^(name|название|материал|наименование)/i;
const UNIT_COLUMN_RE = /^(unit|ед|единица|ед\.изм|ед_изм)/i;

export type MaterialRow = Record<string, unknown>;

export type ParsedMaterial = { name: string; unit: string };

export type ParseMaterialRowsResult = {
  items: ParsedMaterial[];
  skipped: string[];
  tooManyRows: boolean;
};

/** Безопасное чтение ячейки: только собственные свойства, без прототипа. */
function readCell(row: MaterialRow, key: string | undefined): string {
  if (!key || FORBIDDEN_COLUMN_KEYS.has(key)) return "";
  if (!Object.hasOwn(row, key)) return "";
  const value = row[key];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/**
 * Разбирает строки листа в материалы.
 *
 * Поведение совпадает с прежней реализацией в app/api/materials/import/route.ts:
 * колонки ищутся по тем же регэкспам (при отсутствии — первая/вторая колонка),
 * единица приводится к нижнему регистру, пустая единица заменяется на «шт»,
 * пустые имена и имена длиннее MAX_NAME_LENGTH отбрасываются. Опасные ключи
 * колонок игнорируются, ячейки читаются только как собственные свойства.
 *
 * При превышении MAX_DATA_ROWS возвращается tooManyRows = true и пустые
 * items/skipped: как и раньше, такой файл отклоняется целиком, частичный
 * разбор не нужен.
 */
export function parseMaterialRows(rows: MaterialRow[]): ParseMaterialRowsResult {
  if (rows.length > MAX_DATA_ROWS) {
    return { items: [], skipped: [], tooManyRows: true };
  }

  // Заголовки из файла не доверенные: отбрасываем опасные ключи и ограничиваем
  // длину имени колонки, чтобы не отравить прототип через имена.
  const firstRow = rows[0];
  const columns = firstRow
    ? Object.keys(firstRow)
        .filter((key) => !FORBIDDEN_COLUMN_KEYS.has(key.trim()) && key.trim().length > 0)
        .map((key) => ({ key, name: key.trim().slice(0, MAX_COLUMN_NAME_LENGTH) }))
    : [];

  // Detect columns: name/название, unit/единица
  const nameColumn = columns.find((c) => NAME_COLUMN_RE.test(c.name)) ?? columns[0];
  const unitColumn = columns.find((c) => UNIT_COLUMN_RE.test(c.name)) ?? columns[1];

  const items: ParsedMaterial[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const name = readCell(row, nameColumn?.key);
    const rawUnit = readCell(row, unitColumn?.key).toLowerCase();
    // Неизвестная непустая единица сохраняется как есть (прежнее поведение),
    // подставляется только при пустой ячейке.
    const unit = VALID_UNITS.has(rawUnit) ? rawUnit : rawUnit || "шт";

    if (!name) { skipped.push(`(пустое название)`); continue; }
    if (name.length > MAX_NAME_LENGTH) { skipped.push(name.slice(0, 40)); continue; }

    items.push({ name, unit });
  }

  return { items, skipped, tooManyRows: false };
}
