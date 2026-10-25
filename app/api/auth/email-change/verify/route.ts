import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Код-заглушка для сравнения, когда валидной записи нет. Путь «нет кода»
 * должен быть неотличим от «неверный код» ни по ответу, ни по времени.
 */
const DUMMY_CODE = "000000";

type VerifyAttemptRow = {
  attempts: number;
  window_start: string;
  lock_streak: number;
  locked_until: string | null;
  updated_at: string;
};

type RegisterAttemptRow = {
  allowed: boolean;
  attempts_left: number;
  locked_until: string | null;
  retry_after_seconds: number;
};

type PostgrestErrorLike = { code?: string; message?: string } | null;

/** sha256-дайджесты фиксированной длины + timingSafeEqual: сравнение не утекает ни содержимое, ни длину. */
function safeEqualString(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function retrySecondsFrom(lockedUntil?: string | null): number {
  if (!lockedUntil) return 1;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 1;
  return Math.max(1, Math.ceil(ms / 1000));
}

function rateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: "Слишком много попыток. Попробуйте позже.",
      code: "rate_limited",
      retry_after_seconds: retryAfterSeconds,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

/**
 * Лимитер — не источник истины для доступа пользователя к фиче: если таблицы
 * или RPC ещё нет (миграция 050 не применена), либо БД/сеть подвели, проверка
 * кода продолжается без лимита. Сломанная смена email хуже, чем окно без
 * троттлинга. Никогда не превращаем ошибку лимитера в 4xx/5xx.
 */
function logLimiterUnavailable(err: PostgrestErrorLike): void {
  console.error(
    "[email-change/verify] limiter unavailable — fail-open:",
    err?.code ?? err?.message ?? "unknown error"
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Код должен быть 6 цифр" }, { status: 400 });
  }

  const service = createServiceClient();

  // Аварийный рубильник. Любое значение, кроме "off", — лимит включён.
  const limiterEnabled = process.env.EMAIL_CHANGE_VERIFY_LIMIT !== "off";
  let limiterAvailable = limiterEnabled;

  // Шаг 1. Pre-check лока ДО чтения кода: правильный код при активном локе тоже
  // должен получать 429 и не раскрывать свою валидность.
  if (limiterAvailable) {
    const { data: attemptRow, error: attemptErr } = await service
      .from("email_change_verify_attempts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (attemptErr) {
      limiterAvailable = false;
      logLimiterUnavailable(attemptErr);
    } else if (attemptRow) {
      const row = attemptRow as VerifyAttemptRow;
      if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
        return rateLimited(retrySecondsFrom(row.locked_until));
      }
    }
  }

  // Шаг 2. Чтение кода. select("*"), а не список колонок: route обязан
  // переживать окно до/после применения миграции 050.
  const { data: record, error: fetchErr } = await service
    .from("email_change_codes")
    .select("*")
    .eq("user_id", user.id)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) {
    console.error(
      "[email-change/verify] code lookup error:",
      fetchErr.code ?? fetchErr.message
    );
    return NextResponse.json(
      { error: "Внутренняя ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }

  // Шаг 3. Сравнение. Для отсутствующей записи берём дамп-строку, чтобы
  // «нет кода» / «истёк» / «used» / «неверный код» шли одним путём.
  // Сравнение выполняется всегда, но успех без реальной записи невозможен:
  // иначе ввод «000000» при отсутствии кода проходил бы сравнение.
  const ok = safeEqualString(record?.code ?? DUMMY_CODE, code) && record !== null;

  if (!ok) {
    // Диагностика — только в серверный лог, наружу деталь не отдаём.
    console.warn("[email-change/verify] code rejected:", {
      reason: record ? "mismatch" : "no_record",
      userId: user.id,
    });

    // Ровно один вызов лимитера на любой отказ проверки кода.
    let retryAfter: number | null = null;
    if (limiterAvailable) {
      const { data: attemptResult, error: limitErr } = await service.rpc(
        "email_change_register_attempt",
        { p_user_id: user.id, p_success: false }
      );

      if (limitErr) {
        logLimiterUnavailable(limitErr);
      } else {
        const row = (Array.isArray(attemptResult) ? attemptResult[0] : attemptResult) as
          | RegisterAttemptRow
          | null
          | undefined;
        if (row && row.allowed === false) {
          retryAfter =
            row.retry_after_seconds > 0
              ? row.retry_after_seconds
              : retrySecondsFrom(row.locked_until);
        }
      }
    }

    if (retryAfter !== null) return rateLimited(retryAfter);

    // Единственный текст на все отказы проверки кода — без «не найден»/«неверный».
    return NextResponse.json(
      {
        error: "Код недействителен или истёк. Запросите новый код.",
        code: "code_rejected",
      },
      { status: 400 }
    );
  }

  // Шаг 4. Смена email в Supabase Auth ДО пометки used=true: если updateUser
  // упал, код не сгорает — это намеренное поведение.
  const { error: updateErr } = await supabase.auth.updateUser({
    email: record.new_email,
  });

  if (updateErr) {
    // Детали — только в лог: текст вида «email уже занят» = account enumeration.
    console.error("[email-change/verify] updateUser error:", updateErr);
    return NextResponse.json(
      { error: "Внутренняя ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }

  await service
    .from("email_change_codes")
    .update({ used: true })
    .eq("id", record.id);

  // Успешный verify полностью сбрасывает счётчик; ошибка сброса игнорируется.
  if (limiterEnabled) {
    const { error: resetErr } = await service.rpc("email_change_register_attempt", {
      p_user_id: user.id,
      p_success: true,
    });
    if (resetErr) {
      logLimiterUnavailable(resetErr);
    }
  }

  return NextResponse.json({ ok: true, new_email: record.new_email });
}
