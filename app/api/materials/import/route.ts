import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import * as XLSX from "xlsx";

// Ограничители разбора пользовательского файла: в установленной версии xlsx
// есть известные уязвимости (prototype pollution, ReDoS), поэтому размер
// файла, число строк и набор парсеров ограничены явно.
//
// Остаточный риск (осознанно, решение о замене библиотеки — за владельцем):
// sheetRows обрезает УЖЕ РАСПАКОВАННЫЙ лист, то есть xlsx всё равно разбирает
// архив целиком и держит распакованные данные в памяти. Поэтому zip-бомба
// внутри лимита в 2 МБ способна съесть память процесса, и проверки размера и
// числа строк её не ловят. Полноценное решение — заменить библиотеку парсинга
// (потоковый/ограниченный по памяти парсер), это вне рамок текущей правки.
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 МБ
const MAX_SHEET_ROWS = 5000; // строк в листе, включая строку заголовка
const MAX_DATA_ROWS = MAX_SHEET_ROWS - 1; // строк данных после sheet_to_json (без заголовка)
const MAX_COLUMN_NAME_LENGTH = 100;
const FORBIDDEN_COLUMN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type Row = Record<string, unknown>;

/** Безопасное чтение ячейки: только собственные свойства, без прототипа. */
function readCell(row: Row, key: string | undefined): string {
  if (!key || FORBIDDEN_COLUMN_KEYS.has(key)) return "";
  if (!Object.hasOwn(row, key)) return "";
  const value = row[key];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) return NextResponse.json({ error: "Компания не найдена" }, { status: 403 });
    if (profile.role !== "admin" && profile.role !== "manager")
      return NextResponse.json({ error: "Нет прав" }, { status: 403 });

    const companyId: string = profile.company_id;

    // Размер проверяем ДО чтения тела: content-length приходит в заголовках,
    // поэтому тело такого запроса не буферизуется вообще. Заголовка может не
    // быть (chunked), и тогда единственная защита — проверка file.size ниже,
    // уже после того, как formData прочитала тело. То есть при отсутствии
    // заголовка тело всё равно попадает в память; от этого защищает только
    // лимит на размер тела запроса на уровне платформы (Vercel).
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const declaredBytes = Number(contentLength);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_FILE_BYTES)
        return NextResponse.json(
          { error: "Файл слишком большой: максимум 2 МБ" },
          { status: 413 }
        );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Файл не получен" }, { status: 400 });

    // Контрольная проверка фактического размера файла (content-length может
    // отсутствовать или врать) — до вызова парсера.
    if (file.size > MAX_FILE_BYTES)
      return NextResponse.json(
        { error: "Файл слишком большой: максимум 2 МБ" },
        { status: 413 }
      );

    const buffer = await file.arrayBuffer();
    // sheetRows = MAX_SHEET_ROWS + 1: читаем на одну строку больше лимита, чтобы
    // понять, что лист длиннее. Решение принимаем по фактическому числу строк
    // после sheet_to_json, а не по !ref / !fullref: у CSV SheetJS !fullref не
    // выставляет вовсе, а !ref обрезан sheetRows, из-за чего прежняя проверка по
    // диапазону для CSV была недостижима (6000 строк молча импортировались
    // частично, 4999 записей).
    // sheet_to_json отбрасывает строку заголовка, поэтому предел для rows —
    // MAX_DATA_ROWS: обрезанный лист (5001 строка) даёт ровно 5000 объектов,
    // и это уже превышение.
    const wb = XLSX.read(Buffer.from(buffer), {
      type: "buffer",
      sheetRows: MAX_SHEET_ROWS + 1,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return NextResponse.json({ error: "Пустой файл" }, { status: 400 });

    const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });

    // Превышение лимита строк — отказ целиком, без частичного импорта.
    // Работает одинаково для xlsx и CSV.
    if (rows.length > MAX_DATA_ROWS)
      return NextResponse.json(
        { error: "Файл слишком большой: не более 5000 строк вместе с заголовком" },
        { status: 400 }
      );

    if (rows.length === 0) return NextResponse.json({ error: "Нет строк для импорта" }, { status: 400 });

    // Заголовки из файла не доверенные: отбрасываем опасные ключи и ограничиваем
    // длину имени колонки, чтобы не отравить прототип через имена.
    const firstRow = rows[0];
    const columns = Object.keys(firstRow)
      .filter((key) => !FORBIDDEN_COLUMN_KEYS.has(key.trim()) && key.trim().length > 0)
      .map((key) => ({ key, name: key.trim().slice(0, MAX_COLUMN_NAME_LENGTH) }));

    // Detect columns: name/название, unit/единица
    const nameColumn = columns.find((c) =>
      /^(name|название|материал|наименование)/i.test(c.name)
    ) ?? columns[0];
    const unitColumn = columns.find((c) =>
      /^(unit|ед|единица|ед\.изм|ед_изм)/i.test(c.name)
    ) ?? columns[1];

    const VALID_UNITS = new Set(["кг", "тонна", "тн", "шт", "м3", "м2", "литр", "пог.м", "л", "т"]);

    const toInsert: { company_id: string; name: string; unit: string }[] = [];
    const skipped: string[] = [];

    for (const row of rows) {
      const name = readCell(row, nameColumn?.key);
      const rawUnit = readCell(row, unitColumn?.key).toLowerCase();
      const unit = VALID_UNITS.has(rawUnit) ? rawUnit : rawUnit || "шт";

      if (!name) { skipped.push(`(пустое название)`); continue; }
      if (name.length > 200) { skipped.push(name.slice(0, 40)); continue; }

      toInsert.push({ company_id: companyId, name, unit });
    }

    if (toInsert.length === 0)
      return NextResponse.json({ error: "Нет валидных строк", skipped }, { status: 400 });

    const service = createServiceClient();
    const { error: insertError, count } = await service
      .from("materials")
      .upsert(toInsert, { onConflict: "company_id,name", ignoreDuplicates: true });

    if (insertError) {
      console.error("[materials/import] upsert failed", insertError);
      return NextResponse.json({ error: "Не удалось сохранить материалы" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      imported: toInsert.length,
      skipped: skipped.length,
      skippedNames: skipped,
      count,
    });
  } catch (e) {
    console.error("[materials/import]", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
