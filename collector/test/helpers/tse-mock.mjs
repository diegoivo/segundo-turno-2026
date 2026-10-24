// Servidor TSE falso (fetch mock) + gerador de arquivos SINTETICOS de apuracao progressiva.
// Tudo que sai daqui leva "_sintetico": true; o coletor em production rejeita esses arquivos.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GOV_UFS, UFS } from '../../src/config.mjs';

const RAIZ = fileURLToPath(new URL('../../../fixtures/tse/oficial/ele2026/', import.meta.url));
export const lerFixture = (rel) => JSON.parse(readFileSync(RAIZ + rel, 'utf8'));
export const fixtureTexto = (rel) => readFileSync(RAIZ + rel, 'utf8');

export const urlTse = (ele, regiao, cd) =>
  `https://resultados.tse.jus.br/oficial/ele2026/${ele}/dados/${regiao}/${regiao}-c000${cd}-e00${ele}-u.json`;

/**
 * Gera um arquivo sintetico a partir de uma fixture real.
 * @param base objeto da fixture (6258 ou 6260)
 * @param o { regiao, tpabr, pct (0-100), votos: [v1, v2] (na ordem dos candidatos no arquivo), dg, hg }
 */
export function sintetizar(base, { regiao, tpabr, pct, votos, dg = '25/10/2026', hg = '18:00:00' }) {
  const j = structuredClone(base);
  j._sintetico = true;
  j.tpabr = tpabr;
  j.cdabr = regiao;
  j.dg = dg;
  j.hg = hg;
  const ts = Number(j.s.ts);
  const st = Math.round((ts * pct) / 100);
  Object.assign(j.s, { st: String(st), snt: String(ts - st), pst: pct.toFixed(2).replace('.', ','), pstn: String(pct) });
  const cands = j.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand));
  const total = votos.reduce((a, b) => a + b, 0);
  cands.forEach((c, i) => {
    c.vap = String(votos[i]);
    c.pvap = total ? ((votos[i] / total) * 100).toFixed(2).replace('.', ',') : '0,00';
    c.pvapn = total ? ((votos[i] / total) * 100).toFixed(9).replace('.', ',') : '0';
  });
  j.v.vvc = String(total);
  j.v.vv = String(total);
  j.v.tv = String(total + 10);
  j.e.c = String(total + 10);
  return j;
}

export class TseFalso {
  constructor() {
    this.arquivos = new Map(); // url -> { texto, etag, status }
    this.requisicoes = [];
    this.falhas = new Map(); // url -> n tentativas a falhar com 503
  }

  definir(url, objetoOuTexto) {
    const texto = typeof objetoOuTexto === 'string' ? objetoOuTexto : JSON.stringify(objetoOuTexto);
    this.arquivos.set(url, { texto, etag: createHash('md5').update(texto).digest('hex') });
  }

  remover(url) {
    this.arquivos.delete(url);
  }

  fetch = async (url, init = {}) => {
    const h = init.headers ?? {};
    this.requisicoes.push({ url, headers: h });
    const falhas = this.falhas.get(url) ?? 0;
    if (falhas > 0) {
      this.falhas.set(url, falhas - 1);
      return new Response('erro', { status: 503 });
    }
    const a = this.arquivos.get(url);
    if (!a) return new Response('<html>nao encontrado</html>', { status: 404 });
    if (h['If-None-Match'] && h['If-None-Match'] === a.etag) return new Response(null, { status: 304 });
    return new Response(a.texto, {
      status: 200,
      headers: { etag: a.etag, 'last-modified': 'Sun, 25 Oct 2026 21:00:00 GMT', 'content-type': 'application/json' },
    });
  };
}

/**
 * Publica no TSE falso todo o conjunto de 6258 (BR + 27 UFs) e 6260 (6 UFs) no ponto de apuracao `pct`.
 * `ajuste` opcional: (id, objeto) => objeto para customizar.
 */
export function publicarApuracao(tse, { pct, hg = '18:00:00', dg = '25/10/2026', fatorLula = 0.5 }) {
  const brPres = lerFixture('6258/dados/br/br-c0001-e006258-u.json');
  const gov = (uf) => lerFixture(`6260/dados/${uf}/${uf}-c0003-e006260-u.json`);
  const ordem = (j) => j.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand)).map((c) => c.n);
  const split = (j, total) => {
    const [a] = ordem(j);
    const v1 = Math.round(total * (a === '22' ? 1 - fatorLula : fatorLula));
    return [v1, total - v1];
  };
  const mk = (base, regiao, tpabr, total) =>
    sintetizar(base, { regiao, tpabr, pct, votos: split(base, Math.round(total * (pct / 100))), dg, hg });
  tse.definir(urlTse('6258', 'br', 1), mk(brPres, 'br', 'br', 120_000_000));
  for (const uf of [...UFS, 'zz']) tse.definir(urlTse('6258', uf, 1), mk(brPres, uf, 'uf', 4_000_000));
  for (const uf of GOV_UFS) {
    const base = gov(uf);
    const total = Math.round(Number(base.e.te) * 0.6 * (pct / 100));
    const v1 = Math.round(total * 0.52);
    tse.definir(urlTse('6260', uf, 3), sintetizar(base, { regiao: uf, tpabr: 'uf', pct, votos: [v1, total - v1], dg, hg }));
  }
}
