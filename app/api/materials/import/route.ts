import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  MAX_SHEET_ROWS,
  parseMaterialRows,
  type MaterialRow,
} from "@/lib/materials/parseImport";
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

    const rows = XLSX.utils.sheet_to_json<MaterialRow>(ws, { defval: "" });

    if (rows.length === 0) return NextResponse.json({ error: "Нет строк для импорта" }, { status: 400 });

    // Разбор строк вынесен в чистую функцию (lib/materials/parseImport.ts):
    // определение колонок, VALID_UNITS, trim, отсев пустых и слишком длинных
    // имён, безопасный доступ к ячейкам. Превышение лимита строк — отказ
    // целиком, без частичного импорта.
    const { items, skipped, tooManyRows } = parseMaterialRows(rows);

    if (tooManyRows)
      return NextResponse.json(
        { error: "Файл слишком большой: не более 5000 строк вместе с заголовком" },
        { status: 400 }
      );

    if (items.length === 0)
      return NextResponse.json({ error: "Нет валидных строк", skipped }, { status: 400 });

    const toInsert = items.map((item) => ({
      company_id: companyId,
      name: item.name,
      unit: item.unit,
    }));

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
