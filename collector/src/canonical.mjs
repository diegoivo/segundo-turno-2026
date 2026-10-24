// JSON canonico (chaves ordenadas, sem espacos), SHA-256 e gzip. Sem dependencias.
export function canonicalize(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map((v) => (v === undefined ? 'null' : canonicalize(v))).join(',')}]`;
  const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonicalize(valor[k])}`).join(',')}}`;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const bytes = (x) => (typeof x === 'string' ? new TextEncoder().encode(x) : x);

export async function sha256Hex(dados) {
  return hex(await crypto.subtle.digest('SHA-256', bytes(dados)));
}

export async function gzipBytes(dados) {
  const stream = new Blob([bytes(dados)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipBytes(dados) {
  const stream = new Blob([dados]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Numero do TSE: "47,027772356" -> 47.027772356; "123" -> 123; invalido -> NaN.
export function num(s) {
  if (typeof s === 'number') return s;
  if (typeof s !== 'string') return NaN;
  const t = s.trim();
  return /^-?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : NaN;
}

// "25/10/2026" + "18:05:03" -> Date (UTC-3, sem horario de verao). Invalido -> null.
export function parseDgHg(dg, hg) {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dg ?? '');
  const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hg ?? '');
  if (!d || !h) return null;
  const iso = `${d[3]}-${d[2]}-${d[1]}T${h[1]}:${h[2]}:${h[3]}-03:00`;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t;
}

// AAAA-MM-DD no fuso de Brasilia.
export function dataBrasilia(date) {
  return new Date(date.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}
