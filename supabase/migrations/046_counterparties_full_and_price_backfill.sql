-- ============================================================
-- AD Pulse — справочник контрагентов по реальной истории + бэкфилл цен
-- ============================================================
-- ПЕРЕПИСАНА 05.10.2026 по живым данным. Применять ПОСЛЕ 045.
-- Порядок всей цепочки: 047 → 043 → 044 → 045 → 046.
--
-- ЗАЧЕМ. 045 засевает 6 контрагентов ИЗ ПРАЙСА. Реальная история знает других:
-- из прайсовых шести купила только Сенсата, а Галамат, Ас Строй, Куш Жигер,
-- НАК и Таншолпан не отгружались ни разу. Зато появились Leo invest,
-- Innovation development, G-Tech Stroy, Sapa trade inc, Капитал АТК,
-- Iron Stone Corp, СтройБизнесГрупп20 — их в прайсе нет.
--
-- ПОЧЕМУ СТОЛЬКО НАПИСАНИЙ. Контрагент вводился свободным текстом, и одна
-- компания расползлась на четыре записи (G tech Stroy / G-Tech Stroy /
-- G-Tech stroy / G-tech Stroy). Эта миграция схлопывает историю, а чтобы
-- не повторилось — во фронте (Фаза 6) поле заменено на выбор из справочника.
--
-- СЛИЯНИЯ ПОДТВЕРЖДЕНЫ Жахангиром 05.10.2026:
--   Atk kapital = Капитал АТК (одна компания, латиница/кириллица)
--   СПК = Спк = SPK Металл = SPK металл (одна компания)

BEGIN;

-- ── 1) Карта написаний. Единственное место, которое надо править, ────────
--     когда менеджер снова введёт контрагента руками.
CREATE TEMP TABLE cp_map (written text PRIMARY KEY, canonical text NOT NULL) ON COMMIT DROP;
INSERT INTO cp_map (written, canonical) VALUES
  ('Sensata',                'Сенсата'),
  ('Сенсата',                'Сенсата'),
  ('Leo invest',             'Leo invest'),
  ('Innovation development', 'Innovation development'),
  ('Sapa trade inc',         'Sapa trade inc'),
  ('G tech Stroy',           'G-Tech Stroy'),
  ('G-Tech Stroy',           'G-Tech Stroy'),
  ('G-Tech stroy',           'G-Tech Stroy'),
  ('G-tech Stroy',           'G-Tech Stroy'),
  ('Капитал АТК',            'Капитал АТК'),
  ('Atk kapital',            'Капитал АТК'),
  ('Iron Stone Corp',        'Iron Stone Corp'),
  ('Iron stone corp',        'Iron Stone Corp'),
  ('СтройБизнесГрупп20',     'СтройБизнесГрупп20'),
  ('ARGP',                   'ARGP'),
  ('Argp',                   'ARGP'),
  ('СПК',                    'СПК'),
  ('Спк',                    'СПК'),
  ('SPK Металл',             'СПК'),
  ('SPK металл',             'СПК'),
  ('Авангард',               'Авангард');

-- ── 2) Страховка: не появилось ли написание, которого нет в карте ────────
-- Если клиент ввёл нового контрагента после 05.10 — миграция честно падает
-- и называет его, вместо того чтобы молча оставить транзакции без привязки.
DO $$
DECLARE v_lost text;
BEGIN
  SELECT string_agg(DISTINCT mt.counterparty, ', ')
    INTO v_lost
    FROM material_transactions mt
   WHERE mt.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
     AND mt.counterparty IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cp_map WHERE cp_map.written = mt.counterparty);
  IF v_lost IS NOT NULL THEN
    RAISE EXCEPTION 'Нет в карте написаний: %. Добавь их в cp_map и повтори.', v_lost;
  END IF;
END $$;

-- ── 3) Завести недостающих контрагентов ─────────────────────────────────
INSERT INTO counterparties (company_id, name)
-- ::uuid обязателен: из-за DISTINCT литерал успевает стать text раньше,
-- чем Postgres посмотрит на тип целевой колонки (42804).
SELECT DISTINCT 'ab426af3-ba63-4137-b7c6-368b425f934e'::uuid, m.canonical
  FROM cp_map m
 WHERE NOT EXISTS (SELECT 1 FROM counterparties c
   WHERE c.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND c.name = m.canonical);

-- ── 4) Привязать всю историю к справочнику ──────────────────────────────
UPDATE material_transactions mt
   SET counterparty_id = c.id
  FROM cp_map m
  JOIN counterparties c
    ON c.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND c.name = m.canonical
 WHERE mt.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND mt.counterparty = m.written
   AND mt.counterparty_id IS DISTINCT FROM c.id;

DO $$
DECLARE v_unlinked int;
BEGIN
  SELECT count(*) INTO v_unlinked FROM material_transactions
   WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
     AND counterparty IS NOT NULL AND counterparty_id IS NULL;
  IF v_unlinked > 0 THEN
    RAISE EXCEPTION 'Осталось % транзакций без counterparty_id', v_unlinked;
  END IF;
END $$;

-- ── 5) Бэкфилл цен из прайса ────────────────────────────────────────────
-- ⚠️ Прайс Армана — ТЕКУЩИЙ, а отгрузки идут с марта. Если цены за это время
-- менялись, историческая выручка выйдет приблизительной. Подтвердить у Армана
-- «прайс не менялся с начала пилота?» ДО прогона. Не подтверждено —
-- закомментируй этот блок целиком, остальное от этого не пострадает.
--
-- Покрытие на 05.10.2026: цена найдётся примерно для 56 отгрузок из 207.
-- Остальные 151 — компании, которых в прайсе нет вообще (см. хвост файла).
DO $$
DECLARE v_priced int; v_revenue numeric; v_left int;
BEGIN
  UPDATE material_transactions mt
     SET unit_price = pl.price
    FROM price_list pl
   WHERE pl.company_id      = 'ab426af3-ba63-4137-b7c6-368b425f934e'
     AND mt.company_id      = 'ab426af3-ba63-4137-b7c6-368b425f934e'
     AND pl.material_id     = mt.material_id
     AND pl.load_index      = mt.load_index
     AND pl.counterparty_id = mt.counterparty_id
     AND mt.type            = 'expense'
     AND mt.deleted_at IS NULL
     AND mt.unit_price IS NULL;
  GET DIAGNOSTICS v_priced = ROW_COUNT;

  SELECT COALESCE(SUM(mt.quantity * mt.unit_price),0), count(*) FILTER (WHERE mt.unit_price IS NULL)
    INTO v_revenue, v_left
    FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
   WHERE mt.company_id='ab426af3-ba63-4137-b7c6-368b425f934e' AND mt.type='expense'
     AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока');

  RAISE NOTICE 'Проставлено цен: %. Выручка по истории: % тенге. Без цены осталось отгрузок: %.',
    v_priced, v_revenue, v_left;
END $$;

COMMIT;

-- ============================================================
-- ЧЕГО НЕТ В ПРАЙСЕ — список вопросов Арману (данные на 05.10.2026).
-- Это компании, которые реально покупали, но цен на них нет:
--   Leo invest             — 27 отгрузок,  986 шт
--   Innovation development —  9 отгрузок,  452 шт
--   G-Tech Stroy           — 17 отгрузок,  365 шт
--   Sapa trade inc         —  9 отгрузок,  330 шт
--   Капитал АТК            —  5 отгрузок,   88 шт
--   Iron Stone Corp        —  6 отгрузок,   51 шт
--   СтройБизнесГрупп20     —  1 отгрузка,    2 шт
--   ИТОГО                                 2274 шт без цены
--
-- Плюс у Сенсаты в прайсе только часть связок марка+индекс — её отгрузки
-- покрыты лишь наполовину.
--
-- Отдельно: 3 отгрузки (143 шт) записаны вообще без контрагента —
-- их в разрезе по клиентам не будет видно никогда, это дыра во вводе.
--
-- И ещё: у 1ПБ10-1 остаток 11.5 шт. Перемычки штучные, половина физически
-- невозможна — кто-то ввёл дробное количество. Показать Арману.
-- ============================================================
