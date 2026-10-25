-- 050_email_change_verify_attempts.sql
-- ============================================================
-- AD Pulse — анти-перебор 6-значного кода смены email
-- ============================================================
-- Счётчик привязан к user_id (PK), а НЕ к строке email_change_codes:
-- request-роут помечает старые коды used=true и вставляет новый ряд,
-- поэтому бюджет на строке кода обнулялся бы запросом нового кода.
-- Запрос кода этот счётчик не сбрасывает; сбрасывает только успешный verify
-- (p_success = true), который удаляет строку целиком.
--
-- Лимит: 5 неудачных попыток на окно 15 мин (TTL кода). На 5-й неудаче —
-- лок 15 мин, далее эскалация 30/60/120/240/480/960/1440 мин (кап 24 ч).
--
-- Применять ВРУЧНУЮ в Supabase SQL Editor. До применения код route.ts
-- работает в fail-open (лимитер недоступен — проверка кода продолжается).
--
-- Права: service-role only. anon/authenticated execute на функцию отозван,
-- таблица под RLS без политик (default deny).

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_change_verify_attempts (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempts      integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_start  timestamptz NOT NULL DEFAULT now(),
  lock_streak   integer     NOT NULL DEFAULT 0 CHECK (lock_streak >= 0),
  locked_until  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_change_verify_attempts ENABLE ROW LEVEL SECURITY;
-- политик нет: доступ только через service role (как 021 и 026)

REVOKE ALL ON TABLE public.email_change_verify_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.email_change_register_attempt(
  p_user_id uuid,
  p_success boolean
)
RETURNS TABLE (
  allowed              boolean,
  attempts_left        integer,
  locked_until         timestamptz,
  retry_after_seconds  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_attempts CONSTANT integer  := 5;
  v_window       CONSTANT interval := interval '15 minutes';
  v_base_lock    CONSTANT interval := interval '15 minutes';
  v_max_lock     CONSTANT interval := interval '24 hours';
  v_row  public.email_change_verify_attempts%ROWTYPE;
  v_now  timestamptz := now();
  v_lock interval;
BEGIN
  INSERT INTO public.email_change_verify_attempts (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  -- Строковая блокировка сериализует параллельные попытки: гонка не теряет
  -- инкременты и не выдаёт атакующему больше попыток, чем лимит.
  SELECT * INTO v_row FROM public.email_change_verify_attempts
    WHERE user_id = p_user_id FOR UPDATE;

  -- успешная проверка: полный сброс (включая lock_streak)
  IF p_success THEN
    DELETE FROM public.email_change_verify_attempts WHERE user_id = p_user_id;
    RETURN QUERY SELECT true, v_max_attempts, NULL::timestamptz, 0;
    RETURN;
  END IF;

  -- активный лок: отказ без инкремента
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN QUERY SELECT false, 0, v_row.locked_until,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.locked_until - v_now)))::integer);
    RETURN;
  END IF;

  -- лок истёк или окно истекло: новое окно, lock_streak СОХРАНЯЕМ (эскалация)
  IF v_row.locked_until IS NOT NULL OR v_now - v_row.window_start >= v_window THEN
    UPDATE public.email_change_verify_attempts
       SET attempts = 0, window_start = v_now, locked_until = NULL, updated_at = v_now
     WHERE user_id = p_user_id
    RETURNING * INTO v_row;
  END IF;

  -- инкремент попытки
  UPDATE public.email_change_verify_attempts
     SET attempts = attempts + 1, updated_at = v_now
   WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  -- лимит исчерпан: эскалирующий лок 15m*2^streak, кап 24h
  IF v_row.attempts >= v_max_attempts THEN
    v_lock := LEAST(v_base_lock * (1 << LEAST(v_row.lock_streak, 10)), v_max_lock);
    UPDATE public.email_change_verify_attempts
       SET locked_until = v_now + v_lock,
           lock_streak  = LEAST(lock_streak + 1, 12),
           attempts     = 0,
           window_start = v_now,
           updated_at   = v_now
     WHERE user_id = p_user_id
    RETURNING * INTO v_row;
    RETURN QUERY SELECT false, 0, v_row.locked_until,
      CEIL(EXTRACT(EPOCH FROM (v_row.locked_until - v_now)))::integer;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_max_attempts - v_row.attempts, NULL::timestamptz, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.email_change_register_attempt(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_change_register_attempt(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_change_register_attempt(uuid, boolean) TO service_role;

COMMIT;
