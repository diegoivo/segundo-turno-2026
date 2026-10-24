// Imagem OG estática (1200x630 PNG) gerada sem dependências: marca do site + título em fonte bitmap. Sem números de apuração.
import { deflateSync } from 'node:zlib';

const W = 1200;
const H = 630;
const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'], E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], 'º': ['.##..', '#..#.', '#..#.', '.##..', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
const TIL = ['.##.#', '#..#.'];
const CED = ['..#..', '.##..'];

function glyphPixels(ch) {
  if (ch === 'Ç') return { rows: [...G.C, ...CED], top: 0 };
  if (ch === 'Ã') return { rows: [...TIL, ...G.A], top: 2 };
  return { rows: G[ch] ?? G[' '], top: 0 };
}

export function renderOg() {
  const px = Buffer.alloc(W * H * 3);
  const set = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    px[i] = Math.round(px[i] * (1 - a) + r * a);
    px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a);
    px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
  };
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };
  // fundo
  rect(0, 0, W, H, [242, 244, 247]);
  // formas com antialiasing por supersampling 3x3: f(x,y) => dentro?
  const shape = (x0, y0, x1, y1, inside, c) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let hit = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hit++;
      if (hit) set(x, y, c, hit / 9);
    }
  };
  // marca (viewBox 64x64) escalada para 360px em (96, 135)
  const S = 360 / 64;
  const OX = 96;
  const OY = 135;
  const u = (x, y) => [(x - OX) / S, (y - OY) / S];
  const rr = (px_, py_, r) => { const dx = Math.max(Math.abs(px_ - 32) - (32 - r), 0); const dy = Math.max(Math.abs(py_ - 32) - (32 - r), 0); return dx * dx + dy * dy <= r * r; };
  shape(OX, OY, OX + 360, OY + 360, (x, y) => { const [a, b] = u(x, y); return rr(a, b, 14); }, [0, 156, 59]);
  shape(OX, OY, OX + 360, OY + 360, (x, y) => { const [a, b] = u(x, y); return Math.abs(a - 32) / 26 + Math.abs(b - 32) / 23 <= 1; }, [255, 223, 0]);
  shape(OX, OY, OX + 360, OY + 360, (x, y) => { const [a, b] = u(x, y); return (a - 32) ** 2 + (b - 32) ** 2 <= 14.5 ** 2; }, [0, 39, 118]);
  const seg = (ax, ay, bx, by, r) => (x, y) => {
    const [a, b] = u(x, y); const vx = bx - ax; const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((a - ax) * vx + (b - ay) * vy) / (vx * vx + vy * vy)));
    return (a - (ax + t * vx)) ** 2 + (b - (ay + t * vy)) ** 2 <= r * r;
  };
  const s1 = seg(25, 32.5, 30, 37.5, 1.8); const s2 = seg(30, 37.5, 39.5, 27, 1.8);
  shape(OX, OY, OX + 360, OY + 360, (x, y) => s1(x, y) || s2(x, y), [255, 255, 255]);
  // texto
  const texto = (str, x, y, escala, cor) => {
    let cx = x;
    for (const ch of str) {
      const { rows, top } = glyphPixels(ch);
      rows.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '#') rect(cx + rx * escala, y + (ry - top) * escala, escala, escala, cor); }));
      cx += 6 * escala;
    }
  };
  const tinta = [17, 20, 24];
  texto('APURAÇÃO DO', 510, 175, 8, tinta);
  texto('2º TURNO 2026', 510, 265, 8, tinta);
  texto('PRESIDENTE E GOVERNADORES', 510, 380, 4, [86, 93, 107]);
  // barra vermelho/azul decorativa de 50/50 (sem número)
  rect(510, 450, 270, 14, [192, 33, 43]);
  rect(780, 450, 270, 14, [29, 95, 191]);
  rect(776, 442, 8, 30, tinta);
  return png(px);
}

function crc32(buf) {
  let c; let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
