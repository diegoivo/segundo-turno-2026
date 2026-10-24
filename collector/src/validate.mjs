// Validacao de schema e consistencia de um arquivo -u.json do TSE.
import { num, parseDgHg } from './canonical.mjs';

export function candidatos(json) {
  const out = [];
  for (const agr of json?.carg?.[0]?.agr ?? []) {
    for (const par of agr?.par ?? []) for (const c of par?.cand ?? []) out.push(c);
  }
  return out;
}

const pctOk = (s) => {
  const n = num(s);
  return Number.isFinite(n) && n >= 0 && n <= 100.0001;
};
const inteiroOk = (s) => Number.isInteger(num(s)) && num(s) >= 0;

/**
 * @param json objeto parseado
 * @param esperado { ele, cd, tpabr, cdabr, nCandidatos }
 * @returns {string[]} lista de erros (vazia = valido)
 */
export function validarArquivo(json, esperado) {
  const erros = [];
  const falha = (m) => erros.push(m);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return ['nao e objeto'];

  if (json.ele !== esperado.ele) falha(`ele=${json.ele}, esperado ${esperado.ele}`);
  if (json.t !== '2') falha(`t=${json.t}, esperado turno 2`);
  if (json.f !== 'o') falha(`f=${json.f}, esperado oficial`);
  if (esperado.tpabr && json.tpabr !== esperado.tpabr) falha(`tpabr=${json.tpabr}, esperado ${esperado.tpabr}`);
  if (esperado.cdabr && json.cdabr !== esperado.cdabr) falha(`cdabr=${json.cdabr}, esperado ${esperado.cdabr}`);
  if (!parseDgHg(json.dg, json.hg)) falha(`dg/hg ilegiveis: ${json.dg} ${json.hg}`);
  if (json.carg?.[0]?.cd !== esperado.cd) falha(`cargo=${json.carg?.[0]?.cd}, esperado ${esperado.cd}`);

  const cands = candidatos(json);
  if (cands.length !== esperado.nCandidatos) falha(`${cands.length} candidatos, esperado ${esperado.nCandidatos}`);
  let soma = 0;
  for (const c of cands) {
    if (!inteiroOk(c.vap)) falha(`vap invalido (${c.n}): ${c.vap}`);
    else soma += num(c.vap);
    if (!pctOk(c.pvap)) falha(`pvap fora de 0-100 (${c.n}): ${c.pvap}`);
    if (c.pvapn !== undefined && !pctOk(c.pvapn)) falha(`pvapn fora de 0-100 (${c.n}): ${c.pvapn}`);
  }

  const s = json.s ?? {};
  const v = json.v ?? {};
  const e = json.e ?? {};
  for (const k of ['ts', 'st', 'snt']) if (!inteiroOk(s[k])) falha(`s.${k} invalido: ${s[k]}`);
  if (!pctOk(s.pst)) falha(`s.pst fora de 0-100: ${s.pst}`);
  if (inteiroOk(s.ts) && inteiroOk(s.st) && inteiroOk(s.snt)) {
    if (num(s.st) + num(s.snt) !== num(s.ts)) falha('secoes: st + snt != ts');
  }
  for (const k of ['tv', 'vvc']) if (!inteiroOk(v[k])) falha(`v.${k} invalido: ${v[k]}`);
  if (inteiroOk(v.vvc) && soma !== num(v.vvc)) falha(`soma dos votos (${soma}) != v.vvc (${v.vvc})`);
  if (inteiroOk(v.tv) && inteiroOk(v.vvc) && num(v.vvc) > num(v.tv)) falha('v.vvc > v.tv');
  if (!inteiroOk(e.te)) falha(`e.te invalido: ${e.te}`);
  if (inteiroOk(e.te) && inteiroOk(e.c) && num(e.c) > num(e.te)) falha('e.c > e.te');
  if (e.pc !== undefined && !pctOk(e.pc)) falha(`e.pc fora de 0-100: ${e.pc}`);
  if (soma > 0) {
    const somaPct = cands.reduce((a, c) => a + num(c.pvap), 0);
    if (Math.abs(somaPct - 100) > 0.1) falha(`soma de pvap = ${somaPct}`);
  }
  return erros;
}

// Versao compacta e normalizada (numeros de verdade) guardada no snapshot.
export function compactar(json) {
  const n = (x) => num(x);
  return {
    ele: json.ele,
    t: json.t,
    tpabr: json.tpabr,
    cdabr: json.cdabr,
    dg: json.dg,
    hg: json.hg,
    totalizacao_final: json.tf === 's',
    andamento: json.and ?? null,
    secoes: { total: n(json.s.ts), totalizadas: n(json.s.st), pct_totalizadas: n(json.s.pstn ?? json.s.pst) },
    eleitorado: { total: n(json.e.te), totalizado: n(json.e.est), comparecimento: n(json.e.c), abstencao: n(json.e.a) },
    votos: { total: n(json.v.tv), validos_candidatos: n(json.v.vvc), brancos: n(json.v.vb), nulos: n(json.v.tvn) },
    candidatos: candidatos(json).map((c) => ({
      n: c.n,
      nome: c.nmu ?? c.nm,
      votos: n(c.vap),
      pct_validos: Number.isFinite(n(c.pvapn)) && n(c.pvapn) > 0 ? n(c.pvapn) : n(c.pvap),
      eleito: c.e === 's',
      status: c.st ?? '',
    })),
  };
}
