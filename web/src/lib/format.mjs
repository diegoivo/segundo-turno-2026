// Formatação pt-BR e utilitários de texto. Funções puras, sem DOM (rodam no build e no navegador).
const NF = new Intl.NumberFormat('pt-BR');

export const NA = '—';
const finito = (v) => typeof v === 'number' && Number.isFinite(v);
export const pad2 = (n) => String(n).padStart(2, '0');

/** Inteiro com ponto de milhar. Valor ausente vira "—", nunca zero inventado. */
export const n = (v) => (finito(v) ? NF.format(Math.round(v)) : NA);
/** Decimal com vírgula. */
export const num = (v, d = 2) => (finito(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : NA);
export const p = (v, d = 2) => (finito(v) ? `${num(v, d)}%` : NA);
export const mi = (v) => (finito(v) ? `${num(v / 1e6, 2)} mi` : NA);

/** Escapa texto vindo de dado antes de entrar em HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Minutos desde as 17h (pode ser fracionário) -> "HH:MM". */
export function hhmm(minDesde17) {
  const m = 17 * 60 + Math.floor(minDesde17);
  return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
}

const BRT_MS = -3 * 3600 * 1000;
/** Epoch ms -> "HH:MM:SS" em Brasília (UTC-3, sem horário de verão). */
export function horaBrasilia(ms) {
  if (!finito(ms)) return NA;
  const d = new Date(ms + BRT_MS);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** "dd/mm/aaaa" + "HH:MM:SS" (Brasília) -> epoch ms, ou null. */
export function parseDgHg(dg, hg) {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dg ?? ''));
  const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(hg ?? ''));
  if (!d || !h) return null;
  const ms = Date.UTC(+d[3], +d[2] - 1, +d[1], +h[1], +h[2], +h[3]) - BRT_MS;
  return Number.isFinite(ms) ? ms : null;
}

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
export { finito };
