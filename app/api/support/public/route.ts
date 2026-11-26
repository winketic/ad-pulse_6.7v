import { type NextRequest, NextResponse } from "next/server";
import { submitSupportRequest } from "@/lib/support/submit";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = new Set([
  "https://altaidynamics.kz",
  "https://www.altaidynamics.kz",
  // Предпросмотр GitHub Pages и локальная проверка лендинга.
  "https://wtrhhe.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/** Публичная форма поддержки с лендинга. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "Origin не разрешён" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, emailSent: false }, { headers: corsHeaders(origin) });
  }

  try {
    const result = await submitSupportRequest({
      name: typeof body.name === "string" ? body.name : null,
      email: typeof body.email === "string" ? body.email : "",
      subject: typeof body.subject === "string" ? body.subject : "",
      message: typeof body.message === "string" ? body.message : "",
      source: "public",
    });
    return NextResponse.json({ ok: true, emailSent: result.emailSent }, { headers: corsHeaders(origin) });
  } catch (error) {
    console.error("[support/public]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось отправить обращение" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }
}
