-- 051_telegram_connect_attempt_rpc.sql
-- ============================================================
-- AD Pulse — атомарный лимитер кодов подключения Telegram (D1/D2, 051)
-- ============================================================
-- Заменяет неатомарный select+upsert в app/api/telegram/webhook/route.ts:
-- два параллельных запроса читали attempts = N и оба писали N+1, поэтому
-- лимит 5 попыток обходился параллельным залпом.
--
-- Вся проверка и инкремент выполняются в одной транзакции под строковой
-- блокировкой: INSERT ... ON CONFLICT DO NOTHING → SELECT ... FOR UPDATE →
-- атомарный UPDATE attempts = attempts + 1.
--
-- Семантика (не меняется): 5 неудачных попыток на chat_id за окно 10 минут;
-- p_success = true удаляет строку (сброс после успешной привязки); при
-- активном превышении allowed = false и retry_after_seconds до конца окна.
-- Эскалации локов нет — окно всегда 10 минут, легитимный пользователь не
-- залипает.
--
-- Права: service-role only. RLS на telegram_rate_limits (026) остаётся
-- включённым и без политик — не ослабляем.
--
-- Применять ВРУЧНУЮ в Supabase SQL Editor. До применения код route.ts
-- работает в fail-open: RPC недоступен — попытки не блокируются, но сбой
-- пишется в лог (console.error), а не проглатывается.

BEGIN;

CREATE OR REPLACE FUNCTION public.telegram_register_connect_attempt(
  p_chat_id text,
  p_success boolean
)
RETURNS TABLE (
  allowed              boolean,
  attempts_left        integer,
  retry_after_seconds  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_attempts CONSTANT integer  := 5;
  v_window       CONSTANT interval := interval '10 minutes';
  v_attempts     integer;
  v_window_start timestamptz;
  v_now          timestamptz := now();
BEGIN
  -- Лимитировать нечего: пустой chat_id не должен создавать строку.
  IF p_chat_id IS NULL OR btrim(p_chat_id) = '' THEN
    RETURN QUERY SELECT true, v_max_attempts, 0;
    RETURN;
  END IF;

  INSERT INTO public.telegram_rate_limits (chat_id, attempts, window_start)
    VALUES (p_chat_id, 0, v_now)
    ON CONFLICT (chat_id) DO NOTHING;

  -- Строковая блокировка сериализует параллельные попытки: гонка не теряет
  -- инкременты и не выдаёт атакующему больше попыток, чем лимит.
  SELECT attempts, window_start INTO v_attempts, v_window_start
    FROM public.telegram_rate_limits
   WHERE chat_id = p_chat_id
     FOR UPDATE;

  -- Успешная привязка — полный сброс счётчика.
  IF p_success THEN
    DELETE FROM public.telegram_rate_limits WHERE chat_id = p_chat_id;
    RETURN QUERY SELECT true, v_max_attempts, 0;
    RETURN;
  END IF;

  -- Окно истекло — новое окно, счётчик с нуля (без эскалации).
  IF v_window_start IS NULL OR v_now - v_window_start >= v_window THEN
    UPDATE public.telegram_rate_limits
       SET attempts = 0, window_start = v_now
     WHERE chat_id = p_chat_id
    RETURNING attempts, window_start INTO v_attempts, v_window_start;
  END IF;

  -- Лимит исчерпан: отказ без инкремента, ждём конца окна.
  IF v_attempts >= v_max_attempts THEN
    RETURN QUERY SELECT false, 0,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_start + v_window - v_now)))::integer);
    RETURN;
  END IF;

  -- Атомарный инкремент в той же транзакции, что и блокировка строки.
  UPDATE public.telegram_rate_limits
     SET attempts = attempts + 1
   WHERE chat_id = p_chat_id
  RETURNING attempts INTO v_attempts;

  RETURN QUERY SELECT true, GREATEST(0, v_max_attempts - v_attempts), 0;
EXCEPTION
  WHEN OTHERS THEN
    -- Лимитер — не источник истины: внутренний сбой не должен блокировать
    -- подключение. Наружу уходит fail-open строка, диагноз — в лог PostgreSQL.
    RAISE WARNING 'telegram_register_connect_attempt failed [%]: %', SQLSTATE, SQLERRM;
    RETURN QUERY SELECT true, v_max_attempts, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.telegram_register_connect_attempt(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telegram_register_connect_attempt(text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_register_connect_attempt(text, boolean) TO service_role;

-- Примечание: D4 (find_company_by_code: SECURITY DEFINER без SET search_path,
-- EXECUTE для PUBLIC) закрывается отдельной миграцией
-- 052_find_company_by_code_restrict.sql — здесь функцию не переопределяем,
-- чтобы не откатить её ужесточение (проверку 8-hex префикса).

COMMIT;
