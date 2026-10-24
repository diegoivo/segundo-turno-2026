// DF nao tem replay zonal. Constroi arquivos por zona (formato -u.json minimo que o modelo le) a partir do CSV por
// secao (NR_ZONA). Convencao igual a dos municipais do replay: a zona so "existe" apos o 1o BU; te/ts da zona = soma
// de TODAS as secoes da zona no CSV (como o backfill faz para municipio); est/st/votos = BUs recebidos ate T.
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BACKFILL } from './io.mjs';

const NULO_TECNICO = 'v_55'; // DF (docs/BACKFILL-1T2026.md)

export function carregarSecoesDf() {
  const linhas = gunzipSync(readFileSync(join(BACKFILL, 'secoes-governador-df.csv.gz'))).toString('utf8').trim().split('\n');
  const cab = linhas[0].split(',');
  const col = Object.fromEntries(cab.map((c, i) => [c, i]));
  const cands = cab.filter((c) => c.startsWith('v_') && c !== NULO_TECNICO);
  const secoes = linhas.slice(1).map((l) => {
    const f = l.split(',');
    return {
      t: Date.parse(`${f[col.dt_bu_recebido].replace(' ', 'T')}-03:00`), cd: f[col.cd_municipio], zona: Number(f[col.zona]),
      aptos: Number(f[col.aptos]), comp: Number(f[col.comparecimento]), votos: cands.map((c) => Number(f[col[c]])),
    };
  }).sort((a, b) => a.t - b.t);
  return { secoes, cands: cands.map((c) => c.slice(2)), cd: secoes[0].cd };
}

export const idZona = (cd, zona) => `df${cd}-z${String(zona).padStart(4, '0')}`;

// Varre os instantes (epoch ms, ascendente) e devolve, para cada um, {idZona: json}.
export function zonasPorInstante({ secoes, cands, cd }, instantes) {
  const total = new Map();
  for (const s of secoes) {
    const o = total.get(s.zona) ?? { te: 0, ts: 0 };
    o.te += s.aptos; o.ts += 1; total.set(s.zona, o);
  }
  const acc = new Map();
  let i = 0;
  return instantes.map((T) => {
    for (; i < secoes.length && secoes[i].t <= T; i++) {
      const s = secoes[i];
      const o = acc.get(s.zona) ?? { est: 0, st: 0, comp: 0, votos: cands.map(() => 0) };
      o.est += s.aptos; o.st += 1; o.comp += s.comp; s.votos.forEach((v, k) => { o.votos[k] += v; });
      acc.set(s.zona, o);
    }
    const d = new Date(T - 3 * 3600e3);
    const p = (x) => String(x).padStart(2, '0');
    const dg = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    const hg = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    const out = {};
    for (const [zona, o] of acc) {
      const tot = total.get(zona);
      const vvc = o.votos.reduce((a, b) => a + b, 0);
      out[idZona(cd, zona)] = {
        ele: '6259', t: '2', tpabr: 'zn', cdabr: String(zona), dg, hg,
        s: { ts: String(tot.ts), st: String(o.st) }, e: { te: String(tot.te), est: String(o.est), c: String(o.comp) },
        v: { tv: String(o.comp), vvc: String(vvc) },
        carg: [{ agr: [{ par: [{ cand: cands.map((n, k) => ({ n, nmu: n, nm: n, vap: String(o.votos[k]) })) }] }] }],
      };
    }
    return out;
  });
}
