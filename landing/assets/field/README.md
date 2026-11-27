# Altai Field — происхождение и атрибуция

- Источник рельефа: Mapzen Terrain Tiles (SRTM).
- Атрибуция: SRTM terrain data courtesy of the U.S. Geological Survey; Terrain Tiles © Mapzen (Linux Foundation), accessed 2026-11-26 via registry.opendata.aws/terrain-tiles
- Регион: Belukha massif, Altai (~49.8°N 86.6°E), zoom 8, tiles 188–190/86–88
- Диапазон высот в выборке: 1481–2874 м.
- Воспроизведение: `node scripts/gen-altai-field.mjs` (детерминированно).
- LOD: core.svg — статический fallback; lite/high.json — полилинии для Canvas (профили Lite/High/Ultra).
- Процедурная генерация используется только если тайлы недоступны (seed 0x0A17A1).
