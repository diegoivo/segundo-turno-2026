// Utilitarios de teste: fixtures reais do TSE (0% apurado) e sintese de arquivos -u.json parciais a partir das baselines.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINES } from '../baselines/index.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
export const UFS = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz'.split(' ');

export function fixtures6258() {
  const dir = join(DIR, 'fixtures', '6258');
  return Object.fromEntries(readdirSync(dir).map((f) => [f.split('-')[0], JSON.parse(readFileSync(join(dir, f), 'utf8'))]));
}

const pt = (x, d = 2) => x.toFixed(d).replace('.', ',');

// Monta um -u.json do TSE com os campos que o modelo usa (strings, virgula decimal), como no arquivo real.
export function sintetizar({ ele = '6258', t = '2', tpabr = 'uf', cdabr = 'xx', dg = '25/10/2026', hg = '19:30:00', te, est, ts, st, comp, cands, vvc }) {
  const validos = vvc ?? cands.reduce((s, c) => s + c.vap, 0);
  const total = comp ?? Math.round(validos * 1.04);
  return {
    ele, t, f: 'o', tpabr, cdabr, dg, hg, idg: '1', dt: dg, ht: hg, tf: 'n', and: 'p',
    s: { ts: String(ts), st: String(st), pst: pt(ts ? (st / ts) * 100 : 0), pstn: String(ts ? (st / ts) * 100 : 0), snt: String(ts - st) },
    e: { te: String(te), est: String(est), pest: pt(te ? (est / te) * 100 : 0), c: String(total), a: String(Math.max(0, est - total)) },
    v: { tv: String(total), vvc: String(validos), vv: String(validos), vb: String(Math.round(total - validos) >> 1), tvn: String(total - validos - (Math.round(total - validos) >> 1)) },
    carg: [{ cd: tpabr === 'uf' && cdabr.length === 2 ? '1' : '3', agr: [{ tp: 'c', par: [{ sg: 'X', cand: cands.map((c, i) => ({ n: c.n, nmu: c.nmu ?? `CAND ${c.n}`, nm: c.nm ?? `CANDIDATO ${c.n}`, seq: String(i + 1), vap: String(c.vap), pvap: pt(validos ? (c.vap / validos) * 100 : 0), pvapn: pt(validos ? (c.vap / validos) * 100 : 0, 9), st: '', e: 'n' })) }] }] }],
  };
}

// Parcial sintetica de uma corrida a partir da baseline: cada estrato apurado em `frac` (0-1), votos = baseline x frac x ajuste.
export function parcialDeBaseline(baseline, { frac = 0.6, fracPorEstrato = {}, ajuste = {}, hgPorEstrato = {}, ele = '6258', tpabr = 'uf' } = {}) {
  const [c1, c2] = baseline.corrida.finalistas;
  return Object.fromEntries(Object.entries(baseline.estratos).map(([id, b]) => {
    const f = fracPorEstrato[id] ?? frac;
    const k1 = ajuste[c1.n] ?? 1;
    const k2 = ajuste[c2.n] ?? 1;
    const cands = [
      { n: c1.n, nmu: c1.nmu, nm: c1.nm, vap: Math.round(b.votos[c1.n] * f * k1) },
      { n: c2.n, nmu: c2.nmu, nm: c2.nm, vap: Math.round(b.votos[c2.n] * f * k2) },
    ];
    return [id, sintetizar({ ele, tpabr, cdabr: id, te: b.te, est: Math.round(b.te * f), ts: b.ts, st: Math.round(b.ts * f), cands, hg: hgPorEstrato[id] ?? '19:30:00' })];
  }));
}

export const baselinePresidente = BASELINES.presidente;
export const baselineGovernador = (uf) => BASELINES.governador[uf];
