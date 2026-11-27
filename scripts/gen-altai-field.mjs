#!/usr/bin/env node
/**
 * gen-altai-field.mjs — Altai Field: предрассчитанная топография Алтая.
 *
 * Источник данных: Mapzen Terrain Tiles (terrarium-кодировка), AWS Open Data
 *   https://registry.opendata.aws/terrain-tiles/
 *   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 * Атрибуция (docs/attribution.md tilezen/joerd): SRTM terrain data courtesy
 * of the U.S. Geological Survey; Terrain Tiles, Mapzen (Linux Foundation).
 *
 * Регион: Горный Алтай, массив Белухи (49.8°N, 86.6°E), zoom 8,
 * тайлы x 188–190, y 86–88 (3×3 ≈ 470×470 км).
 *
 * Выводы (детерминированные, без случайности):
 *   landing/assets/field/altai-field-core.svg   — статический fallback (Core)
 *   landing/assets/field/altai-field-lite.json  — LOD Lite (Canvas 2D)
 *   landing/assets/field/altai-field-high.json  — LOD High/Ultra (Canvas 2D)
 *   landing/assets/field/README.md              — происхождение и атрибуция
 *
 * Запуск: node scripts/gen-altai-field.mjs
 * Повторный запуск воспроизводим: те же тайлы → те же контуры.
 */

import { inflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "landing", "assets", "field");

/* ── Регион ─────────────────────────────────────────── */
const Z = 8;
const X0 = 188, X1 = 190, Y0 = 86, Y1 = 88; // 3×3 тайла
const TILE = 256;
const CROP_TOP = 110, CROP_BOTTOM = 590;     // широкая центральная полоса

/* ── Параметры уровней детализации ─────────────────── */
const LOD = {
  core: { levels: 9, eps: 2.5, minLen: 30, maxPts: 2600, maxLinePts: 55, out: "altai-field-core.svg" },
  lite: { levels: 12, eps: 1.4, minLen: 25, maxPts: 9000, maxLinePts: 90, out: "altai-field-lite.json" },
  high: { levels: 14, eps: 0.7, minLen: 15, maxPts: 26000, maxLinePts: 130, out: "altai-field-high.json" },
};
const VB = { w: 1000, h: 620 };

/* ── Минимальный декодер PNG (8-bit RGB/RGBA, без interlace) ── */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, w = 0, h = 0, bpp = 0, idats = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      const depth = data[8], colorType = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6))
        throw new Error(`unsupported PNG ${depth}/${colorType}/${interlace}`);
      bpp = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idats));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * bpp);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[src + x];
      const left = x >= bpp ? out[dst + x - bpp] : 0;
      const up = y > 0 ? out[dst - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[dst - stride + x - bpp] : 0;
      let v = rawByte;
      if (filter === 1) v = (rawByte + left) & 0xff;
      else if (filter === 2) v = (rawByte + up) & 0xff;
      else if (filter === 3) v = (rawByte + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) v = (rawByte + paeth(left, up, upLeft)) & 0xff;
      out[dst + x] = v;
    }
  }
  return { w, h, bpp, px: out };
}

/* ── Процедурный fallback (фиксированный seed) ───────── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function proceduralGrid(w, h) {
  const rnd = mulberry32(0x0a17a1);
  const perm = new Float32Array(512);
  for (let i = 0; i < 256; i++) perm[i] = perm[i + 256] = rnd();
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (ix, iy, x, y) => {
    const h2 = perm[(perm[ix & 255] + iy) & 255] & 7;
    let u = h2 < 4 ? x : y, v = h2 < 4 ? y : x;
    if (h2 & 1) u = -u;
    if (h2 & 2) v = -v;
    return u + v;
  };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const n00 = grad(ix, iy, fx, fy), n10 = grad(ix + 1, iy, fx - 1, fy);
    const n01 = grad(ix, iy + 1, fx, fy - 1), n11 = grad(ix + 1, iy + 1, fx - 1, fy - 1);
    const u = fade(fx), v = fade(fy);
    const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.42;
  };
  const fbm = (x, y) => {
    let s = 0, amp = 0.55, f = 1;
    for (let o = 0; o < 4; o++) { s += amp * noise(x * f, y * f); amp *= 0.5; f *= 2.1; }
    return s;
  };
  const grid = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = x / w, ny = y / h;
      const warp = 0.6 * fbm(nx * 3 + 7.3, ny * 3 + 1.7);
      const v = fbm(nx * 4 + warp, ny * 4 - warp);
      grid[y * w + x] = Math.max(0, (v + 1) * 1400 + 300 * fbm(nx * 9, ny * 9));
    }
  return grid;
}

/* ── Контуры: marching squares + связывание + упрощение ── */
function contours(grid, w, h, level, eps, minLen) {
  const segs = [];
  const at = (x, y) => grid[y * w + x];
  const interp = (a, b, x1, y1, x2, y2) => {
    const t = (level - a) / (b - a || 1e-9);
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const v00 = at(x, y), v10 = at(x + 1, y), v01 = at(x, y + 1), v11 = at(x + 1, y + 1);
      const c = (v00 >= level ? 8 : 0) | (v10 >= level ? 4 : 0) | (v11 >= level ? 2 : 0) | (v01 >= level ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const eTop = interp(v00, v10, x, y, x + 1, y);
      const eRight = interp(v10, v11, x + 1, y, x + 1, y + 1);
      const eBottom = interp(v01, v11, x, y + 1, x + 1, y + 1);
      const eLeft = interp(v00, v01, x, y, x, y + 1);
      const push = (a, b) => segs.push([a, b]);
      if (c === 1 || c === 14) push(eLeft, eBottom);
      else if (c === 2 || c === 13) push(eBottom, eRight);
      else if (c === 4 || c === 11) push(eTop, eRight);
      else if (c === 8 || c === 7) push(eTop, eLeft);
      else if (c === 3 || c === 12) push(eLeft, eRight);
      else if (c === 6 || c === 9) push(eTop, eBottom);
      else if (c === 5) { push(eTop, eRight); push(eLeft, eBottom); }
      else if (c === 10) { push(eTop, eLeft); push(eRight, eBottom); }
    }
  }
  // Связывание сегментов в полилинии. Направление сегментов из таблицы
  // случаев не согласовано, поэтому цепочка растёт по обеим концам через
  // карту смежности: у каждого ключа точки — все касающиеся её сегменты.
  const key = (p) => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`;
  const adj = new Map();
  for (const seg of segs) {
    const [a, b] = seg;
    const ka = key(a), kb = key(b);
    if (ka === kb) continue;
    if (!adj.has(ka)) adj.set(ka, []);
    adj.get(ka).push({ to: b, seg });
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(kb).push({ to: a, seg });
  }
  const usedSeg = new Set();
  const polylines = [];
  for (const seg of segs) {
    if (usedSeg.has(seg)) continue;
    const line = [...seg[0], ...seg[1]];
    usedSeg.add(seg);
    let cur = key(seg[1]);
    while (true) {
      const next = (adj.get(cur) || []).find((o) => !usedSeg.has(o.seg));
      if (!next) break;
      line.push(...next.to);
      usedSeg.add(next.seg);
      cur = key(next.to);
    }
    cur = key(seg[0]);
    while (true) {
      const prev = (adj.get(cur) || []).find((o) => !usedSeg.has(o.seg));
      if (!prev) break;
      line.unshift(...prev.to);
      usedSeg.add(prev.seg);
      cur = key(prev.to);
    }
    polylines.push(line);
  }
  // Douglas–Peucker
  const simplify = (pts, e2) => {
    const stack = [[0, pts.length - 2]];
    const keep = new Uint8Array(pts.length - 1);
    keep[0] = 1; keep[pts.length - 2] = 1;
    while (stack.length) {
      const [s, e] = stack.pop();
      if (e <= s + 1) continue;
      const x0 = pts[s], y0 = pts[s + 1], x1 = pts[e], y1 = pts[e + 1];
      const dx = x1 - x0, dy = y1 - y0;
      const len2 = dx * dx + dy * dy || 1e-9;
      let maxD = -1, maxI = -1;
      for (let i = s + 2; i < e; i += 2) {
        const t = ((pts[i] - x0) * dx + (pts[i + 1] - y0) * dy) / len2;
        const cx = x0 + t * dx, cy = y0 + t * dy;
        const d = (pts[i] - cx) ** 2 + (pts[i + 1] - cy) ** 2;
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > e2) { stack.push([s, maxI], [maxI, e]); }
      else keep[s >> 1] = keep[e >> 1] = 1;
    }
    const out = [];
    for (let i = 0; i < pts.length; i += 2) if (keep[i >> 1]) out.push(pts[i], pts[i + 1]);
    return out;
  };
  const result = [];
  if (process.env.FIELD_DEBUG3) {
    const lens = polylines.map((l) => l.length / 2).sort((a, b) => b - a);
    console.log(`FIELD_DEBUG3 raw chains=${polylines.length} maxLen=${lens[0]} top=${lens.slice(0, 8).join(",")}`);
    for (const line of polylines.slice(0, 3)) {
      const simplified = simplify(line, eps * eps);
      console.log(`  raw pts=${line.length / 2} -> simplified ${simplified.length / 2}; raw head: ${line.slice(0, 16).map((v) => v.toFixed(2)).join(" ")}`);
    }
    process.exit(0);
  }
  for (const line of polylines) {
    if (line.length / 2 < minLen) continue;
    const simplified = simplify(line, eps * eps);
    if (simplified.length / 2 >= 2) result.push(simplified);
  }
  return result;
}

/* ── Сборка ──────────────────────────────────────────── */
async function main() {
  const tiles = [];
  let fetched = 0, failed = 0;
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        tiles.push({ x, y, data: Buffer.from(await res.arrayBuffer()) });
        fetched++;
      } catch (e) {
        console.error(`tile ${x}/${y}: ${e.message}`);
        failed++;
      }
    }
  console.log(`tiles: ${fetched} ok, ${failed} failed`);

  const W = (X1 - X0 + 1) * TILE, H = (Y1 - Y0 + 1) * TILE;
  let grid;
  let source = "Mapzen Terrain Tiles (SRTM)";
  if (failed > 2) {
    source = "PROCEDURAL (fixed seed 0x0A17A1) — тайлы недоступны";
    grid = proceduralGrid(W, H);
  } else {
    grid = new Float32Array(W * H).fill(-32768);
    for (const t of tiles) {
      const { w: tw, h: th, bpp, px } = decodePNG(t.data);
      const ox = (t.x - X0) * TILE, oy = (t.y - Y0) * TILE;
      for (let ty = 0; ty < th; ty++)
        for (let tx = 0; tx < tw; tx++) {
          const i = (ty * tw + tx) * bpp;
          const e = px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
          grid[(oy + ty) * W + (ox + tx)] = e;
        }
    }
  }

  // кроп центральной полосы
  const cw = W, ch = CROP_BOTTOM - CROP_TOP;
  const cgrid = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) cgrid.set(grid.subarray((CROP_TOP + y) * W, (CROP_TOP + y) * W + cw), y * cw);

  // Уровни: интерполированные квантили + сдвиг, который не кратен
  // 1/256 м (квант terrarium) — уровень никогда не совпадает точно
  // со значением ячейки, иначе контур проходит через вершины сетки
  // и связывание рвётся на каждом таком пересечении.
  const sorted = Array.from(cgrid).filter((v) => v > -1000).sort((a, b) => a - b);
  const q = (p) => {
    const f = p * (sorted.length - 1);
    const i = Math.floor(f);
    return sorted[i] + (sorted[i + 1] - sorted[i]) * (f - i);
  };
  const lo = q(0.25) + 0.0007, hi = q(0.92) + 0.0007;
  const mkLevels = (n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

  if (process.env.FIELD_DEBUG3) {
    const sub = cgrid, dw = cw, dh = ch;
    const vals = Array.from(sub).sort((a, b) => a - b);
    const lv = vals[Math.floor(vals.length * 0.3)] + 0.0007;
    contours(sub, dw, dh, lv, 1.0, 18);
    process.exit(0);
  }

  const sx = VB.w / cw, sy = VB.h / ch;

  if (process.env.FIELD_DEBUG2) {
    const dw = 12, dh = 10, ox0 = 300, oy0 = 180;
    const sub = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++)
      sub.set(cgrid.subarray((oy0 + y) * cw + ox0, (oy0 + y) * cw + ox0 + dw), y * dw);
    const vals = Array.from(sub).sort((a, b) => a - b);
    const lv = vals[Math.floor(vals.length * 0.55)] + 0.0007;
    console.log(`region grid ${dw}x${dh}, level=${lv.toFixed(3)}`);
    for (let y = 0; y < dh; y++) console.log(y.toString().padStart(2) + ":" + Array.from(sub.subarray(y * dw, y * dw + dw)).map((v) => (v >= lv ? "■" : "·")).join(""));
    const p = contours(sub, dw, dh, lv, 0.01, 1);
    for (const line of p) console.log("  chain:", line.map((v) => v.toFixed(5)).join(" "));
    // Все сегменты с полной точностью и номерами ячеек
    for (let y = 0; y < dh - 1; y++)
      for (let x = 0; x < dw - 1; x++) {
        const v00 = sub[y * dw + x], v10 = sub[y * dw + x + 1], v01 = sub[(y + 1) * dw + x], v11 = sub[(y + 1) * dw + x + 1];
        const c = (v00 >= lv ? 8 : 0) | (v10 >= lv ? 4 : 0) | (v11 >= lv ? 2 : 0) | (v01 >= lv ? 1 : 0);
        if (c === 0 || c === 15) continue;
        const t0 = (lv - v00) / (v10 - v00 || 1e-9), t1 = (lv - v01) / (v11 - v01 || 1e-9);
        const t2 = (lv - v00) / (v01 - v00 || 1e-9), t3 = (lv - v10) / (v11 - v10 || 1e-9);
        const segs2 = [];
        if (t0 > 0 && t0 < 1) segs2.push(`top(${(x + t0).toFixed(5)},${y})`);
        if (t3 > 0 && t3 < 1) segs2.push(`right(${x + 1},${(y + t3).toFixed(5)})`);
        if (t1 > 0 && t1 < 1) segs2.push(`bottom(${(x + t1).toFixed(5)},${y + 1})`);
        if (t2 > 0 && t2 < 1) segs2.push(`left(${x},${(y + t2).toFixed(5)})`);
        console.log(`  cell(${x},${y}) c=${c} ${segs2.join(" ")}`);
      }
    process.exit(0);
  }

  if (process.env.FIELD_DEBUG) {
    // Отладочный прогон на подрегионе
    const dw = 120, dh = 100, ox0 = 300, oy0 = 180;
    const sub = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++)
      sub.set(cgrid.subarray((oy0 + y) * cw + ox0, (oy0 + y) * cw + ox0 + dw), y * dw);
    const vals = Array.from(sub).sort((a, b) => a - b);
    const lv = vals[Math.floor(vals.length * 0.5)] + 0.0007;
    const p = contours(sub, dw, dh, lv, 0.5, 2);
    const lens = p.map((l) => l.length / 2).sort((a, b) => b - a);
    console.log(`FIELD_DEBUG sub ${dw}x${dh} level=${lv.toFixed(2)} chains=${p.length} maxLen=${lens[0]} top8=${lens.slice(0, 8).join(",")}`);
    // Проверка концов цепочек: есть ли рядом сегменты с другим ключом?
    let foundNear = 0, checked = 0, boundaryEnds = 0;
    const pairs = [];
    for (const line of p.slice(0, 200)) {
      for (const end of [line.slice(0, 2), line.slice(-2)]) {
        checked++;
        const [ex, ey] = end;
        if (ex <= 0.01 || ex >= dw - 1.01 || ey <= 0.01 || ey >= dh - 1.01) { boundaryEnds++; continue; }
        let near = false;
        outer:
        for (const l2 of p) {
          for (const cand of [l2.slice(0, 2), l2.slice(-2)]) {
            if (Math.abs(cand[0] - ex) < 0.005 && Math.abs(cand[1] - ey) < 0.005) { near = true; pairs.push([end, cand]); break outer; }
          }
        }
        if (near) foundNear++;
      }
    }
    console.log(`FIELD_DEBUG ends checked=${checked} onBoundary=${boundaryEnds} nearOtherChainEnd=${foundNear}`);
    for (const [a, b] of pairs.slice(0, 5)) {
      const ka = `${Math.round(a[0] * 1e3)},${Math.round(a[1] * 1e3)}`;
      const kb = `${Math.round(b[0] * 1e3)},${Math.round(b[1] * 1e3)}`;
      console.log(`  end=(${a[0].toFixed(6)},${a[1].toFixed(6)}) key=${ka} | near=(${b[0].toFixed(6)},${b[1].toFixed(6)}) key=${kb}`);
    }
    process.exit(0);
  }

  const meta = {
    source,
    attribution: "SRTM terrain data courtesy of the U.S. Geological Survey; Terrain Tiles © Mapzen (Linux Foundation), accessed 2026-11-26 via registry.opendata.aws/terrain-tiles",
    region: "Belukha massif, Altai (~49.8°N 86.6°E), zoom 8, tiles 188–190/86–88",
    elevationMeters: { min: Math.round(lo), max: Math.round(hi) },
    repro: "node scripts/gen-altai-field.mjs",
  };

  mkdirSync(OUT, { recursive: true });
  const stats = {};

  for (const [name, cfg] of Object.entries(LOD)) {
    const levels = mkLevels(cfg.levels);
    const all = [];
    for (const lv of levels) all.push(...contours(cgrid, cw, ch, lv, cfg.eps, cfg.minLen));
    // Самые длинные линии — контурная структура; бюджет по ОЧКАМ удерживает
    // размер ресурса, а субдискретизация длинных линий (stride) сохраняет
    // количество путей, чтобы карта не превращалась в 5 гигантских контуров.
    all.sort((a, b) => b.length - a.length);
    const selected = [];
    let pts = 0;
    for (const line of all) {
      const n = line.length / 2;
      if (n > cfg.maxLinePts) {
        const stride = Math.ceil(n / cfg.maxLinePts);
        const sampled = [line[0], line[1]];
        for (let i = 2; i < line.length - 2; i += stride * 2) sampled.push(line[i], line[i + 1]);
        sampled.push(line[line.length - 2], line[line.length - 1]);
        selected.push(sampled);
        pts += sampled.length / 2;
      } else {
        selected.push(line);
        pts += n;
      }
      if (pts >= cfg.maxPts) break;
    }
    stats[name] = { paths: selected.length, points: Math.round(pts), dropped: all.length - selected.length, levels: cfg.levels };
    if (cfg.out.endsWith(".svg")) {
      let paths = "";
      selected.forEach((line, i) => {
        const d = [];
        for (let k = 0; k < line.length; k += 2)
          d.push(`${k === 0 ? "M" : "L"}${(line[k] * sx).toFixed(1)} ${(line[k + 1] * sy).toFixed(1)}`);
        const lime = i === 1 || i % 13 === 5 ? ' stroke="#B2F230" stroke-opacity="0.55"' : ' stroke="#3A3A3A"';
        paths += `  <path d="${d.join("")}" fill="none"${lime} stroke-width="1" vector-effect="non-scaling-stroke"/>\n`;
      });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}" role="img" aria-label="Топографические контуры Горного Алтая">\n<!-- ${meta.source} | ${meta.attribution} -->\n<g stroke-linecap="round">\n${paths}</g>\n</svg>\n`;
      writeFileSync(path.join(OUT, cfg.out), svg);
    } else {
      const data = selected.map((line) => line.map((v, i) => (i % 2 ? v * sy : v * sx)).map((v) => Math.round(v * 10) / 10));
      writeFileSync(path.join(OUT, cfg.out), JSON.stringify({ meta, viewBox: VB, polylines: data }));
    }
    console.log(`${cfg.out}: ${selected.length} paths (dropped ${all.length - selected.length})`);
  }

  writeFileSync(
    path.join(OUT, "README.md"),
    `# Altai Field — происхождение и атрибуция\n\n` +
    `- Источник рельефа: ${meta.source}.\n` +
    `- Атрибуция: ${meta.attribution}\n` +
    `- Регион: ${meta.region}\n` +
    `- Диапазон высот в выборке: ${meta.elevationMeters.min}–${meta.elevationMeters.max} м.\n` +
    `- Воспроизведение: \`${meta.repro}\` (детерминированно).\n` +
    `- LOD: core.svg — статический fallback; lite/high.json — полилинии для Canvas (профили Lite/High/Ultra).\n` +
    `- Процедурная генерация используется только если тайлы недоступны (seed 0x0A17A1).\n`
  );
  console.log(JSON.stringify({ meta, stats }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
