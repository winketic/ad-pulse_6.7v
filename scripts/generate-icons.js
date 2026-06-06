// Pure Node.js PNG icon generator — no external packages needed
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// CRC32 for PNG chunks
const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const combined = Buffer.concat([typeBuf, data]);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(combined), 0);
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Draw line between two points using Bresenham's algorithm
function drawLine(pixels, width, x0, y0, x1, y1, r, g, b, thickness = 1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = Math.round(x0), y = Math.round(y0);

  while (true) {
    for (let ty = -Math.floor(thickness / 2); ty <= Math.floor(thickness / 2); ty++) {
      for (let tx = -Math.floor(thickness / 2); tx <= Math.floor(thickness / 2); tx++) {
        const px = x + tx, py = y + ty;
        if (px >= 0 && px < width && py >= 0 && py < width) {
          const idx = (py * width + px) * 3;
          pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b;
        }
      }
    }
    if (x === Math.round(x1) && y === Math.round(y1)) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx)  { err += dx; y += sy; }
  }
}

function createIcon(size) {
  // Dark background: #05050a
  const pixels = Buffer.alloc(size * size * 3, 0);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = 5; pixels[i * 3 + 1] = 5; pixels[i * 3 + 2] = 10;
  }

  // Logo waveform from SVG viewBox 0 0 64 64
  // polyline points="6,32 14,32 18,20 22,44 26,28 30,36 34,32 58,32"
  const svgPoints = [[6,32],[14,32],[18,20],[22,44],[26,28],[30,36],[34,32],[58,32]];
  const scale = size / 64;
  const thickness = Math.max(2, Math.round(size / 32));
  // #00f5c4 = RGB(0, 245, 196)
  for (let i = 0; i < svgPoints.length - 1; i++) {
    const [x0, y0] = svgPoints[i];
    const [x1, y1] = svgPoints[i + 1];
    drawLine(pixels, size, x0 * scale, y0 * scale, x1 * scale, y1 * scale, 0, 245, 196, thickness);
  }

  // Draw dot at peak: circle at (18*scale, 20*scale) r=3*scale, #00f5c4
  const cx = Math.round(18 * scale), cy = Math.round(20 * scale);
  const r = Math.max(2, Math.round(3 * scale));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const px = cx + dx, py = cy + dy;
        if (px >= 0 && px < size && py >= 0 && py < size) {
          const idx = (py * size + px) * 3;
          pixels[idx] = 0; pixels[idx + 1] = 245; pixels[idx + 2] = 196;
        }
      }
    }
  }

  // Build PNG
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw data: filter byte (0) + row pixels
  const raw = Buffer.allocUnsafe(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: None
    pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const publicDir = path.join(__dirname, "../public");

fs.writeFileSync(path.join(publicDir, "icon-192.png"), createIcon(192));
console.log("✓ icon-192.png");

fs.writeFileSync(path.join(publicDir, "icon-512.png"), createIcon(512));
console.log("✓ icon-512.png");

console.log("Icons generated successfully.");
