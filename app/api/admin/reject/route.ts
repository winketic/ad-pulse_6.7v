import { rejectRegistration } from "@/app/admin/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { registrationId?: unknown };
    if (typeof body.registrationId !== "string") {
      return Response.json({ error: "registrationId обязателен" }, { status: 400 });
    }
    await rejectRegistration(body.registrationId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    const status = message === "Доступ запрещён" ? 403 : message.includes("уже обработана") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
