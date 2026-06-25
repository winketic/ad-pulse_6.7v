-- ============================================================
-- AD Pulse — material consumption norms per unit of finished product
-- ============================================================

ALTER TABLE materials ADD COLUMN IF NOT EXISTS norm_concrete numeric(10,4);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS norm_rebar numeric(10,4);

COMMENT ON COLUMN materials.norm_concrete IS 'Расход бетона (м³) на 1 шт готовой продукции';
COMMENT ON COLUMN materials.norm_rebar IS 'Длина арматуры (м) на 1 шт готовой продукции';
