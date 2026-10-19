#!/usr/bin/env node
// Draws the app icons (two hearts on a rose gradient) as PNGs with no dependencies.
// Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Classic implicit heart: (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0, for x in [-1.2, 1.2], y in [-1, 1.25].
const inHeart = (x, y) => {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
};

function draw(size, { background = true, radius = 0.22, scale = 0.5, mono = false } = {}) {
  const out = Buffer.alloc(size * size * 4);
  const S = 4; // supersampling per axis
  const hearts = [
    { cx: 0.43, cy: 0.5, s: scale, color: [255, 255, 255], alpha: 1 },
    { cx: 0.62, cy: 0.56, s: scale * 0.62, color: [255, 228, 236], alpha: mono ? 0 : 0.92 },
  ];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (px + (sx + 0.5) / S) / size;
          const v = (py + (sy + 0.5) / S) / size;
          let cr = 0, cg = 0, cb = 0, ca = 0;
          if (background) {
            // rounded square with a diagonal rose -> pink gradient
            const d = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
            const inside =
              radius === 0 ||
              d <= 0.5 - radius ||
              Math.hypot(Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0), Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0)) <= radius;
            if (inside) {
              const t = (u + v) / 2;
              cr = 244 + (236 - 244) * t;
              cg = 63 + (72 - 63) * t;
              cb = 94 + (153 - 94) * t;
              ca = 1;
            }
          }
          // second heart first, so the main heart sits on top
          for (const h of [...hearts].reverse()) {
            if (!h.alpha) continue;
            const x = ((u - h.cx) / h.s) * 2.4;
            const y = -((v - h.cy) / h.s) * 2.4 + 0.15;
            if (inHeart(x, y)) {
              const [hr, hg, hb] = h.color;
              cr = cr * (1 - h.alpha) + hr * h.alpha;
              cg = cg * (1 - h.alpha) + hg * h.alpha;
              cb = cb * (1 - h.alpha) + hb * h.alpha;
              ca = Math.max(ca, h.alpha);
            }
          }
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const i = (py * size + px) * 4;
      const n = S * S;
      out[i + 3] = Math.round((a / n) * 255);
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
    }
  }
  return png(size, out);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", draw(192));
writeFileSync("public/icons/icon-512.png", draw(512));
writeFileSync("public/icons/maskable-512.png", draw(512, { radius: 0, scale: 0.36 }));
writeFileSync("public/icons/badge-96.png", draw(96, { background: false, scale: 0.8, mono: true }));
writeFileSync("src/app/apple-icon.png", draw(180, { radius: 0 }));
console.log("Icons written to public/icons and src/app/apple-icon.png");
