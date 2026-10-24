// Backtest por replay: reconstroi a apuracao minuto a minuto a partir dos boletins de urna de 2022 (bweb, coluna
// DT_BU_RECEBIDO) e roda o nucleo do modelo (model/estratos.mjs) em cada instante, comparando com o resultado final.
// Uso: node model/backtest/replay.mjs <dir eventos> <saida.json> [passoSegundos=60]
//   <dir eventos>/<1t|2t>/<UF>-c<1|3>.json  gerados por model/backtest/tools/bweb2events.py
// Corridas avaliadas (todas de 2022, ordem REAL de recepcao dos BUs):
//   presidente_2t            : 2o turno presidente, 28 estratos (27 UFs + ZZ), baseline = 1o turno 2022 por UF
//   gov_2t_<UF>              : 2o turno governador (12 UFs), estratos = municipios, baseline = 1o turno 2022 por municipio
//   pres2t_uf_<UF>           : 2o turno presidente DENTRO de cada UF (proxy de corrida estadual), estratos = municipios
//   pres2t_zonas_DF          : idem no DF com estratos = zonas eleitorais
//   presidente_1t, gov_1t_<UF>: 1o turno (sem baseline anterior): so o modelo sem prior; participacao do 1o colocado
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { projetar } from '../estratos.mjs';

const [dirEventos, saida, passoArg] = process.argv.slice(2);
const PASSO = Number(passoArg ?? 60);
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO ZZ'.split(' ');

export const VARIANTES = Object.freeze({
  M0_1T: { usarBaseline: false, encolhimento: 0, pendenteBaseline: false },
  M1_prior: { usarBaseline: true, encolhimento: 0, pendenteBaseline: false },
  M1_prior_turnout: { usarBaseline: true, encolhimento: 0, pendenteBaseline: true },
  M2_enc25: { usarBaseline: true, encolhimento: 0.25, pendenteBaseline: false },
  M2_enc50: { usarBaseline: true, encolhimento: 0.5, pendenteBaseline: false },
  M2_enc100: { usarBaseline: true, encolhimento: 1.0, pendenteBaseline: false },
});
// Variantes para o presidente com estratos MUNICIPAIS (modelo B): swing global ou hierarquico (UF -> regiao -> BR).
export const VARIANTES_B = Object.freeze({
  B_global: { usarBaseline: true, encolhimento: 0, pendenteBaseline: false, kSwing: null },
  B_k20k: { usarBaseline: true, encolhimento: 0, pendenteBaseline: false, kSwing: 20000 },
  B_k100k: { usarBaseline: true, encolhimento: 0, pendenteBaseline: false, kSwing: 100000 },
  B_k500k: { usarBaseline: true, encolhimento: 0, pendenteBaseline: false, kSwing: 500000 },
});
const REGIAO = Object.fromEntries([
  ...'AC AM AP PA RO RR TO'.split(' ').map((u) => [u, 'N']), ...'AL BA CE MA PB PE PI RN SE'.split(' ').map((u) => [u, 'NE']),
  ...'DF GO MS MT'.split(' ').map((u) => [u, 'CO']), ...'ES MG RJ SP'.split(' ').map((u) => [u, 'SE']), ...'PR RS SC'.split(' ').map((u) => [u, 'S']), ['ZZ', 'ZZ'],
]);

const ler = (p) => JSON.parse(readFileSync(p, 'utf8'));
const existe = (turno, uf, cargo) => existsSync(join(dirEventos, turno, `${uf}-c${cargo}.json`));
const carregar = (turno, uf, cargo) => ler(join(dirEventos, turno, `${uf}-c${cargo}.json`));

// Soma por estrato de um arquivo de eventos: {id: {te, ts, vvc, votos{n}}}
function totaisPorEstrato(ev, chave) {
  const out = {};
  for (const s of ev.sections) {
    const id = chave(s);
    const o = out[id] ?? (out[id] = { te: 0, ts: 0, vvc: 0, votos: {} });
    o.te += s[3]; o.ts += 1;
    for (const [n, v] of Object.entries(s[7])) { o.vvc += v; o.votos[n] = (o.votos[n] ?? 0) + v; }
  }
  return out;
}

const chaveUf = (uf) => () => uf;
const chaveMun = (uf) => (s) => `${uf}${s[1]}`;
const chaveZona = (uf) => (s) => `${uf}-z${s[2]}`;

// Evolucao cumulativa: devolve snapshots a cada PASSO segundos com {est, st, votos} por estrato.
function* snapshots(secoesPorArquivo, chaves) {
  const todas = secoesPorArquivo.flatMap(([ev, chave]) => ev.sections.map((s) => [s[0] < 0 ? Infinity : s[0], chave(s), s]));
  todas.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const acc = {};
  const add = (id, s) => {
    const o = acc[id] ?? (acc[id] = { est: 0, st: 0, votos: {} });
    o.est += s[3]; o.st += 1;
    for (const [n, v] of Object.entries(s[7])) o.votos[n] = (o.votos[n] ?? 0) + v;
  };
  let i = 0;
  const tMax = todas.reduce((m, x) => (x[0] < Infinity && x[0] > m ? x[0] : m), 0);
  for (let t = 0; t <= tMax; t += PASSO) {
    while (i < todas.length && todas[i][0] <= t) { add(todas[i][1], todas[i][2]); i += 1; }
    yield { t, acc: clonar(acc) };
  }
  while (i < todas.length) { add(todas[i][1], todas[i][2]); i += 1; }
  yield { t: Infinity, acc: clonar(acc) };
}
const clonar = (acc) => Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { ...v, votos: { ...v.votos } }]));

function obsDe(snap, finalistas, totais) {
  return {
    te: totais.te, est: snap?.est ?? 0, st: snap?.st ?? 0, ts: totais.ts,
    vvc: finalistas.reduce((s, n) => s + (snap?.votos[n] ?? 0), 0),
    cands: finalistas.map((n) => ({ n, vap: snap?.votos[n] ?? 0 })),
  };
}

// Roda todas as variantes em todos os instantes de uma corrida.
function avaliarCorrida({ nome, tipo, arquivos, finalistas, baseline, variantes }) {
  const totais = Object.assign({}, ...arquivos.map(([ev, chave]) => totaisPorEstrato(ev, chave)));
  const ids = Object.keys(totais);
  const te = ids.reduce((s, id) => s + totais[id].te, 0);
  const finalA = ids.reduce((s, id) => s + (totais[id].votos[finalistas[0]] ?? 0), 0);
  const finalV = finalistas.reduce((s, n) => s + ids.reduce((q, id) => q + (totais[id].votos[n] ?? 0), 0), 0);
  const pctFinalA = (finalA / finalV) * 100;
  const serie = [];
  for (const { t, acc } of snapshots(arquivos, null)) {
    if (t === Infinity) break;
    const estratos = ids.map((id) => ({ id, obs: obsDe(acc[id], finalistas, totais[id]), baseline: baseline?.[id] ?? null, grupo: { uf: id.slice(0, 2), regiao: REGIAO[id.slice(0, 2)] ?? null } }));
    const est = ids.reduce((s, id) => s + (acc[id]?.est ?? 0), 0);
    const st = ids.reduce((s, id) => s + (acc[id]?.st ?? 0), 0);
    if (est === 0) continue;
    const erros = Object.fromEntries(Object.entries(variantes).map(([k, cfg]) => {
      const p = projetar({ estratos, finalistas, cfg });
      const pctA = p.totais.validosProj > 0 ? (p.totais.A / p.totais.validosProj) * 100 : null;
      return [k, pctA == null ? null : round(pctA - pctFinalA)];
    }));
    const vA = ids.reduce((s, id) => s + (acc[id]?.votos[finalistas[0]] ?? 0), 0);
    const vV = finalistas.reduce((s, n) => s + ids.reduce((q, id) => q + (acc[id]?.votos[n] ?? 0), 0), 0);
    serie.push({
      t, pctEl: round((est / te) * 100), pctSec: round((st / ids.reduce((s, id) => s + totais[id].ts, 0)) * 100),
      estratosApurados: ids.filter((id) => (acc[id]?.est ?? 0) > 0).length,
      bruto: vV ? round((vA / vV) * 100 - pctFinalA) : null, erros,
    });
  }
  return { nome, tipo, estratos: ids.length, finalistas, pctFinalA: round(pctFinalA), te, serie };
}
const round = (x) => Math.round(x * 1000) / 1000;

function top2(ev) {
  const tot = {};
  for (const s of ev.sections) for (const [n, v] of Object.entries(s[7])) tot[n] = (tot[n] ?? 0) + v;
  return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
}
const baselineDe = (ev, chave) => Object.fromEntries(Object.entries(totaisPorEstrato(ev, chave)).map(([id, v]) => [id, { te: v.te, vvc: v.vvc, votos: v.votos }]));

function corridas() {
  const lista = [];
  const pres2t = UFS.filter((uf) => existe('2t', uf, 1)).map((uf) => [uf, carregar('2t', uf, 1)]);
  const pres1t = UFS.filter((uf) => existe('1t', uf, 1)).map((uf) => [uf, carregar('1t', uf, 1)]);
  const base1tUf = Object.assign({}, ...pres1t.map(([uf, ev]) => baselineDe(ev, chaveUf(uf))));
  if (pres2t.length === 28) {
    lista.push({ nome: 'presidente_2t', tipo: 'presidente', arquivos: pres2t.map(([uf, ev]) => [ev, chaveUf(uf)]), finalistas: ['13', '22'], baseline: pres1t.length === 28 ? base1tUf : null, variantes: VARIANTES });
  }
  if (pres1t.length === 28) {
    lista.push({ nome: 'presidente_1t', tipo: 'presidente_1t', arquivos: pres1t.map(([uf, ev]) => [ev, chaveUf(uf)]), finalistas: ['13', '22'], baseline: null, variantes: { M0_1T: VARIANTES.M0_1T } });
  }
  // Modelo B (presidente com estratos municipais): 2T 2022 com baseline municipal do 1T 2022
  const chaveMunUf = (s, uf) => `${uf}${s[1]}`;
  if (pres2t.length === 28 && pres1t.length === 28) {
    const base1tMun = Object.assign({}, ...pres1t.map(([uf, ev]) => baselineDe(ev, (s) => chaveMunUf(s, uf))));
    lista.push({ nome: 'presidente_2t_mun', tipo: 'presidente_mun', arquivos: pres2t.map(([uf, ev]) => [ev, (s) => chaveMunUf(s, uf)]), finalistas: ['13', '22'], baseline: base1tMun, variantes: VARIANTES_B });
  }
  // HOLDOUT 1T 2026 (reconstrucao backfill/1t2026): A por UF e B por municipio, baseline = 2T 2022 (eleicao anterior)
  const h26 = UFS.filter((uf) => existe('1t2026', uf, 1)).map((uf) => [uf, carregar('1t2026', uf, 1)]);
  if (h26.length === 28 && pres2t.length === 28) {
    const base2tUf = Object.assign({}, ...pres2t.map(([uf, ev]) => baselineDe(ev, chaveUf(uf))));
    const base2tMun = Object.assign({}, ...pres2t.map(([uf, ev]) => baselineDe(ev, (s) => chaveMunUf(s, uf))));
    lista.push({ nome: 'holdout_1t2026_uf', tipo: 'holdout_uf', arquivos: h26.map(([uf, ev]) => [ev, chaveUf(uf)]), finalistas: ['13', '22'], baseline: base2tUf, variantes: { M0_1T: VARIANTES.M0_1T, M1_prior: VARIANTES.M1_prior } });
    lista.push({ nome: 'holdout_1t2026_mun', tipo: 'holdout_mun', arquivos: h26.map(([uf, ev]) => [ev, (s) => chaveMunUf(s, uf)]), finalistas: ['13', '22'], baseline: base2tMun, variantes: VARIANTES_B });
  }
  for (const uf of UFS.filter((u) => existe('1t2026', u, 3))) {
    const ev = carregar('1t2026', uf, 3);
    const chave = uf === 'DF' ? chaveZona(uf) : chaveMun(uf);
    lista.push({ nome: `holdout_gov1t2026_${uf}`, tipo: uf === 'DF' ? 'holdout_gov_zonas' : 'holdout_gov', arquivos: [[ev, chave]], finalistas: top2(ev), baseline: null, variantes: { M0_1T: VARIANTES.M0_1T } });
  }
  for (const [uf, ev] of pres2t) {
    if (uf === 'ZZ') continue;
    const b1 = pres1t.find(([u]) => u === uf)?.[1];
    const chave = uf === 'DF' ? chaveZona(uf) : chaveMun(uf);
    lista.push({ nome: uf === 'DF' ? 'pres2t_zonas_DF' : `pres2t_uf_${uf}`, tipo: uf === 'DF' ? 'governador_zonas' : 'governador', arquivos: [[ev, chave]], finalistas: ['13', '22'], baseline: b1 ? baselineDe(b1, chave) : null, variantes: VARIANTES });
    lista.push({ nome: `pres2t_ufunico_${uf}`, tipo: 'governador_uf', arquivos: [[ev, chaveUf(uf)]], finalistas: ['13', '22'], baseline: null, variantes: { M0_1T: VARIANTES.M0_1T } });
  }
  for (const uf of UFS.filter((u) => existe('2t', u, 3))) {
    const ev = carregar('2t', uf, 3);
    const fin = top2(ev);
    const b1 = existe('1t', uf, 3) ? carregar('1t', uf, 3) : null;
    lista.push({ nome: `gov_2t_${uf}`, tipo: 'governador', arquivos: [[ev, chaveMun(uf)]], finalistas: fin, baseline: b1 ? baselineDe(b1, chaveMun(uf)) : null, variantes: VARIANTES });
    lista.push({ nome: `gov_2t_ufunico_${uf}`, tipo: 'governador_uf', arquivos: [[ev, chaveUf(uf)]], finalistas: fin, baseline: null, variantes: { M0_1T: VARIANTES.M0_1T } });
  }
  for (const uf of UFS.filter((u) => u !== 'ZZ' && u !== 'DF' && existe('1t', u, 3))) {
    const ev = carregar('1t', uf, 3);
    lista.push({ nome: `gov_1t_${uf}`, tipo: 'governador_1t', arquivos: [[ev, chaveMun(uf)]], finalistas: top2(ev), baseline: null, variantes: { M0_1T: VARIANTES.M0_1T } });
  }
  if (existe('1t', 'DF', 3)) {
    const ev = carregar('1t', 'DF', 3);
    lista.push({ nome: 'gov_1t_zonas_DF', tipo: 'governador_zonas_1t', arquivos: [[ev, chaveZona('DF')]], finalistas: top2(ev), baseline: null, variantes: { M0_1T: VARIANTES.M0_1T } });
  }
  return lista;
}

const resultados = [];
for (const c of corridas()) {
  const t0 = Date.now();
  const r = avaliarCorrida(c);
  resultados.push(r);
  console.error(`${c.nome}: ${r.estratos} estratos, ${r.serie.length} instantes, final A=${r.pctFinalA}% (${Date.now() - t0} ms)`);
}
writeFileSync(saida, JSON.stringify({ gerado_em: new Date().toISOString(), passo_s: PASSO, variantes: VARIANTES, variantes_b: VARIANTES_B, corridas: resultados }));
console.error('gravado', saida);
