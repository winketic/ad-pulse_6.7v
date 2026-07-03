-- kg→m conversion for rebar-type materials.
-- When kg_per_meter is set, the transaction form accepts kilograms and
-- stores meters (quantity = kg / kg_per_meter). NULL = normal behavior.

ALTER TABLE materials ADD COLUMN IF NOT EXISTS kg_per_meter numeric(10,4);

-- СаттиГрупп: Арматура Ø12 = 0.888 кг/м, unit switches to meters
UPDATE materials SET kg_per_meter = 0.888, unit = 'м'
WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = 'Арматура';

-- Перемычки norms from kg to meters (only those consuming Арматура, not Проволока)
UPDATE materials SET norm_rebar = ROUND(norm_rebar / 0.888, 4)
WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
  AND norm_rebar IS NOT NULL
  AND (rebar_material_name = 'Арматура' OR rebar_material_name IS NULL);

-- Existing Арматура transactions of this company: kg → meters
UPDATE material_transactions mt SET quantity = ROUND(quantity / 0.888, 4)
FROM materials m
WHERE mt.material_id = m.id
  AND m.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
  AND m.name = 'Арматура';
