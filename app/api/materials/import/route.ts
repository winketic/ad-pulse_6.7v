import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import * as XLSX from "xlsx";

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Файл не получен" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buffer), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return NextResponse.json({ error: "Пустой файл" }, { status: 400 });

    type Row = Record<string, unknown>;
    const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });

    if (rows.length === 0) return NextResponse.json({ error: "Нет строк для импорта" }, { status: 400 });

    // Detect columns: name/название, unit/единица
    const firstRow = rows[0];
    const keys = Object.keys(firstRow);

    const nameKey = keys.find((k) =>
      /^(name|название|материал|наименование)/i.test(k.trim())
    ) ?? keys[0];
    const unitKey = keys.find((k) =>
      /^(unit|ед|единица|ед\.изм|ед_изм)/i.test(k.trim())
    ) ?? keys[1];

    const VALID_UNITS = new Set(["кг", "тонна", "тн", "шт", "м3", "м2", "литр", "пог.м", "л", "т"]);

    const toInsert: { company_id: string; name: string; unit: string }[] = [];
    const skipped: string[] = [];

    for (const row of rows) {
      const name = String(row[nameKey] ?? "").trim();
      const rawUnit = String(row[unitKey] ?? "").trim().toLowerCase();
      const unit = VALID_UNITS.has(rawUnit) ? rawUnit : rawUnit || "шт";

      if (!name) { skipped.push(`(пустое название)`); continue; }
      if (name.length > 200) { skipped.push(name.slice(0, 40)); continue; }

      toInsert.push({ company_id: profile.company_id, name, unit });
    }

    if (toInsert.length === 0)
      return NextResponse.json({ error: "Нет валидных строк", skipped }, { status: 400 });

    const service = createServiceClient();
    const { error: insertError, count } = await service
      .from("materials")
      .upsert(toInsert, { onConflict: "company_id,name", ignoreDuplicates: true });

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

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
