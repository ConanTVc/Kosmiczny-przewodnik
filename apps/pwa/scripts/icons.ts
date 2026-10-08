/**
 * Generuje ikony aplikacji (kompas – ten sam znak co ikona w pasku gry) bez zewnętrznych
 * zależności: rysowanie z wygładzaniem (4×4 próbki na piksel) i własny zapis PNG.
 * Uruchom: pnpm --filter @kp/pwa icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];
const BG: Rgb = [0x11, 0x13, 0x1a];
const ACCENT: Rgb = [0xf4, 0xb4, 0x00];
const SOUTH: Rgb = [0x9a, 0xa2, 0xb4];

/** Kompas w jednostkach SVG 24×24 (jak ikona w grze): pierścień r=9, grubość 2.2, igła po przekątnej. */
const RING_R = 9;
const RING_W = 2.2;
const NEEDLE = { tip: [4, -4], tail: [-4, 4], left: [-1.6, -1.6], right: [1.6, 1.6] } as const;

interface IconSpec {
  file: string;
  size: number;
  /** Promień zewnętrzny pierścienia jako ułamek boku. */
  ring: number;
  /** Zaokrąglenie tła (ułamek boku); 0 = pełny kwadrat (maskable, iOS zaokrągla sam). */
  radius: number;
}

const ICONS: IconSpec[] = [
  { file: 'public/icons/icon-192.png', size: 192, ring: 0.36, radius: 0.22 },
  { file: 'public/icons/icon-512.png', size: 512, ring: 0.36, radius: 0.22 },
  // maskable: wszystko w bezpiecznym kole o promieniu 0.4 boku
  { file: 'public/icons/maskable-512.png', size: 512, ring: 0.3, radius: 0 },
  { file: 'public/apple-touch-icon.png', size: 180, ring: 0.34, radius: 0 },
];

type P = readonly [number, number];
const cross = (a: P, b: P, c: P) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function inTriangle(p: P, a: P, b: P, c: P): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function inRoundedSquare(x: number, y: number, r: number): boolean {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Kolor w punkcie (x, y ∈ 0..1) albo `undefined` = przezroczysto. */
function sample(spec: IconSpec, x: number, y: number): Rgb | undefined {
  if (!inRoundedSquare(x, y, spec.radius)) return undefined;
  const unit = spec.ring / (RING_R + RING_W / 2); // jednostka SVG w ułamku boku
  const p: P = [(x - 0.5) / unit, (y - 0.5) / unit];
  const d = Math.hypot(p[0], p[1]);
  if (Math.abs(d - RING_R) <= RING_W / 2) return ACCENT;
  if (inTriangle(p, NEEDLE.tip, NEEDLE.left, NEEDLE.right)) return ACCENT;
  if (inTriangle(p, NEEDLE.tail, NEEDLE.left, NEEDLE.right)) return SOUTH;
  return BG;
}

function render(spec: IconSpec): Buffer {
  const { size } = spec;
  const ss = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample(spec, (px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
        rgba[i + 3] = Math.round((a / (ss * ss)) * 255);
      }
    }
  }
  return encodePng(size, size, rgba);
}

/* ───── PNG ───── */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bity na kanał
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtr „none”
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ───── SVG (favicon) ───── */

const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const pt = (p: P) => `${12 + p[0]} ${12 + p[1]}`;
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="5" fill="${hex(BG)}"/>
  <g transform="translate(12 12) scale(0.86) translate(-12 -12)">
    <circle cx="12" cy="12" r="${RING_R}" fill="none" stroke="${hex(ACCENT)}" stroke-width="${RING_W}"/>
    <path fill="${hex(ACCENT)}" d="M${pt(NEEDLE.tip)} L${pt(NEEDLE.right)} L${pt(NEEDLE.left)} Z"/>
    <path fill="${hex(SOUTH)}" d="M${pt(NEEDLE.tail)} L${pt(NEEDLE.left)} L${pt(NEEDLE.right)} Z"/>
  </g>
</svg>
`;

const root = resolve(import.meta.dirname, '..');
const write = (file: string, data: Buffer | string) => {
  const path = resolve(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`✓ ${file}`);
};
for (const spec of ICONS) write(spec.file, render(spec));
write('public/favicon.svg', FAVICON);
