// QA independente do modelo (v2.0.1) no holdout do 1o turno 2026. Executa o modelo em cada um dos 265 instantes do
// replay e grava resultados.json. Uso: node validar.mjs   (depois: node relatar.mjs)
// Sem dependencias. Nao altera model/ nem backfill/.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { forecast, BASELINES, VERSAO } from '../../model/index.mjs';
import { extrairCandidatos } from '../../model/parse.mjs';
import { RAIZ, REPLAY, OFICIAL, UFS27, lerJson, listarInstantes, epoch, como2T } from './lib/io.mjs';
import { carregarSecoesDf, zonasPorInstante } from './lib/df-zonas.mjs';

const GOV_UFS = ['ac', 'am', 'df', 'es', 'rn', 'to'];
// Modos: A = producao como entregue (baseline = resultado FINAL do 1T 2026 => nao cego); B = sem baseline (cego).
const MODOS = { A: undefined, B: { usarBaseline: false } };

const vap = (j, n) => extrairCandidatos(j).find((c) => c.n === n)?.vap ?? 0;
const base2 = (j, a, b) => (vap(j, a) / (vap(j, a) + vap(j, b))) * 100;

function corridas() {
  const pres = BASELINES.presidente.corrida.finalistas;
  const lula = pres.find((c) => c.n === '13'); const flavio = pres.find((c) => c.n === '22');
  const lista = [{ id: 'presidente', cargo: 'presidente', A: lula, B: flavio,
    verdade: base2(lerJson(join(OFICIAL, '6257/dados/br/br-c0001-e006257-u.json')), '13', '22') }];
  for (const uf of GOV_UFS) {
    const [A, B] = BASELINES.governador[uf].corrida.finalistas;
    lista.push({ id: `gov-${uf}`, cargo: 'governador', uf, A, B,
      verdade: base2(lerJson(join(OFICIAL, `6259/dados/${uf}/${uf}-c0003-e006259-u.json`)), A.n, B.n) });
  }
  return lista;
}

function arquivosPresidente(hhmm) {
  const dir = join(REPLAY, 'presidente', hhmm);
  return Object.fromEntries([...UFS27, 'zz'].map((u) => [u, como2T(lerJson(join(dir, `${u}-c0001-e006257-u.json`)))]));
}

function arquivosGov(uf, hhmm, zonasDf) {
  const dir = join(REPLAY, 'governador', uf, hhmm);
  const ufs = {}; const estratos = {};
  for (const f of readdirSync(dir)) {
    const id = f.split('-')[0];
    const j = como2T(lerJson(join(dir, f)));
    if (id === uf) ufs[uf] = j;
    else if (uf !== 'df') estratos[id] = j; // DF: zonas construidas a partir do CSV (o municipal unico e descartado)
  }
  return { ufs, estratos: uf === 'df' ? zonasDf : estratos };
}

function linha(corrida, modo, hhmm, T, out) {
  const fc = out.forecast;
  const cand = (arr, n) => arr?.candidatos?.find((c) => c.n === n);
  const pa = out.parcial?.candidatos?.find((c) => c.n === corrida.A.n)?.votos;
  const pb = out.parcial?.candidatos?.find((c) => c.n === corrida.B.n)?.votos;
  return {
    corrida: corrida.id, modo, hhmm, t: T,
    apurado: out.apurado?.eleitorado_pct ?? 0,
    publicado: Boolean(fc),
    proj: fc?.projecao?.[corrida.A.n] ?? null,
    faixa: fc?.faixa?.[corrida.A.n] ?? null,
    meia: fc?.meia_largura_pp ?? null,
    parcial: pa + pb > 0 ? (pa / (pa + pb)) * 100 : null,
    tendencia: fc?.tendencia?.n ?? null,
    definido: out.parcial?.definido_matematicamente?.n ?? null,
    bloqueios: fc ? [] : out.criterios_nao_atendidos,
    estratificacao: out.corrida?.estratificacao ?? null,
    _ok: Boolean(cand),
  };
}

const instantes = listarInstantes();
const brT = instantes.map((h) => { const j = lerJson(join(REPLAY, 'presidente', h, 'br-c0001-e006257-u.json')); return epoch(j.dg, j.hg); });
const df = carregarSecoesDf();
const zonas = zonasPorInstante(df, brT);
const lista = corridas();
const rows = []; const erros = [];
const t0 = Date.now();

instantes.forEach((hhmm, i) => {
  const T = brT[i];
  for (const c of lista) {
    const ent = c.cargo === 'presidente'
      ? { cargo: 'presidente', eleicao: '6257', ufs: arquivosPresidente(hhmm) }
      : { cargo: 'governador', uf: c.uf, eleicao: '6259', ...arquivosGov(c.uf, hhmm, zonas[i]) };
    for (const [modo, cfg] of Object.entries(MODOS)) {
      try {
        const out = forecast({ ...ent, agora: T, ...(cfg ? { cfg } : {}) });
        rows.push(linha(c, modo, hhmm, T, out));
      } catch (e) { erros.push({ corrida: c.id, modo, hhmm, erro: String(e?.stack ?? e).slice(0, 400) }); }
    }
  }
  if (i % 20 === 0) console.error(`${hhmm} (${i + 1}/${instantes.length}) ${Math.round((Date.now() - t0) / 1000)}s`);
});

const meta = {
  modelo: VERSAO, gerado_em: new Date().toISOString(), instantes: instantes.length,
  corridas: lista.map(({ id, cargo, uf, A, B, verdade }) => ({ id, cargo, uf: uf ?? null, A, B, verdade_pct_A: verdade })),
  modos: { A: 'producao (baseline = 1T 2026 final: NAO cego)', B: 'cfg.usarBaseline=false (cego)' },
};
writeFileSync(join(RAIZ, 'qa/validacao-1t2026/resultados.json'), JSON.stringify({ meta, erros, rows }));
console.error(`ok: ${rows.length} linhas, ${erros.length} erros de execucao, ${Math.round((Date.now() - t0) / 1000)}s`);
