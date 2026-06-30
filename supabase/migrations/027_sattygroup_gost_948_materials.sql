-- ============================================================
-- AD Pulse — СаттиГрупп: добавление материалов ГОСТ 948-84 (1ПБ-5ПБ)
-- ============================================================
-- company_id = ab426af3-ba63-4137-b7c6-368b425f934e
-- Каждая строка обёрнута в WHERE NOT EXISTS, поэтому миграция безопасно
-- идемпотентна и не требует UNIQUE(company_id, name) — пропускает уже
-- существующие материалы (например 5ПБ-25 и 5ПБ-27 уже есть в базе с
-- такими же нормами бетона/стали, добавляются только их -п варианты).
--
-- ВАЖНО: серии 6ПБ и 7ПБ упомянуты в задаче, но нормы для них не были
-- предоставлены — в этой миграции их нет. Также не включены -п варианты
-- для уже существующих 2ПБ-10, 2ПБ-13, 2ПБ-16, 2ПБ-17, 2ПБ-22, 3ПБ-13,
-- 3ПБ-16, 3ПБ-18, 3ПБ-21, 3ПБ-25, 3ПБ-27, 3ПБ-30, 5ПБ-18, 5ПБ-21 — нормы
-- стали "с петлями" для них не были указаны (только "сталь чуть больше").

-- 1ПБ (без петель)
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '1ПБ-10', 'шт', 0.008, 0.31
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '1ПБ-10');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '1ПБ-13', 'шт', 0.010, 0.41
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '1ПБ-13');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '1ПБ-16', 'шт', 0.012, 0.48
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '1ПБ-16');

-- 2ПБ
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-19', 'шт', 0.033, 0.85
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-19');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-19-п', 'шт', 0.033, 1.11
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-19-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-25', 'шт', 0.041, 1.85
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-25');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-25-п', 'шт', 0.041, 2.11
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-25-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-26', 'шт', 0.044, 2.40
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-26');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-26-п', 'шт', 0.044, 2.66
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-26-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-29', 'шт', 0.048, 3.06
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-29');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-29-п', 'шт', 0.048, 3.32
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-29-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-30', 'шт', 0.050, 3.19
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-30');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-30-п', 'шт', 0.050, 3.45
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-30-п');

-- 3ПБ
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-34', 'шт', 0.089, 2.73
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-34');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-34-п', 'шт', 0.089, 3.31
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-34-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-36', 'шт', 0.096, 4.10
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-36');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-36-п', 'шт', 0.096, 4.68
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-36-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-39', 'шт', 0.103, 10.13
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-39');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-39-п', 'шт', 0.103, 10.71
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-39-п');

-- 4ПБ
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-30', 'шт', 0.104, 1.85
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-30');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-30-п', 'шт', 0.104, 2.49
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-30-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-44', 'шт', 0.154, 11.88
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-44');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-44-п', 'шт', 0.154, 12.52
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-44-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-48', 'шт', 0.167, 15.12
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-48');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-48-п', 'шт', 0.167, 15.76
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-48-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-60', 'шт', 0.207, 29.20
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-60');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-60-п', 'шт', 0.207, 29.84
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-60-п');

-- 5ПБ-25-п / 5ПБ-27-п (базовые 5ПБ-25 и 5ПБ-27 уже есть в базе с теми же
-- нормами бетона/стали, что указаны в задаче — добавляются только -п)
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '5ПБ-25-п', 'шт', 0.135, 9.06
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '5ПБ-25-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '5ПБ-27-п', 'шт', 0.150, 12.49
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '5ПБ-27-п');
