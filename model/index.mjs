// Modelo de projecao do 2o turno 2026 (presidente e governadores). Modulo ESM PURO: sem I/O, sem dependencias.
//
// CONTRATO (para collector/src/forecast-adapter.mjs):
//   export function forecast(entrada) -> { forecast: object|null, criterios_nao_atendidos: string[], criterios, ... }
//   entrada = {
//     cargo: 'presidente' | 'governador',
//     uf?: 'ac' | 'am' | 'df' | 'es' | 'rn' | 'to',          // obrigatorio para governador
//     ufs:   { [id]: TseJson | Compacto },                      // presidente: 27 UFs + 'zz' (arquivos 6258 -u.json)
//     estratos?: { [id]: TseJson | Compacto },                  // governador: arquivos MUNICIPAIS 6260
//                                                               //   id = '<uf><cd5>' (ex.: 'ac01120'); DF: zonas 'df97012-z0001'
//                                                               // presidente (opcional, modelo B): arquivos MUNICIPAIS 6258
//                                                               //   '<uf><cd5>-c0001-e006258-u.json' (~5.700); com eles o metodo
//                                                               //   vira 'presidente_mun' (baseline municipal do 1T 2026 embutida)
//   v3: a projecao do presidente recebe a CORRECAO DE DERIVA das urnas tardias (curva do 2T 2022, model/correcao.mjs);
//   `forecast.sem_correcao` traz o valor bruto, `forecast.correcao_pp` o deslocamento, `forecast.erro_medio_esperado_pp`
//   o MAE calibrado para a faixa de apuracao atual (UI: "hoje a projecao erra em media ±X p.p.").
//     br?: TseJson | Compacto,                                  // opcional, nao entra na projecao
//     // governador: passe TAMBEM ufs[uf] (arquivo da UF 6260): e a referencia de relogio (frescor) e os municipais
//     // sao medidos contra o dg/hg dele (tolerancia 300 s). Estrato com 100% das secoes totalizadas e isento.
//     stale?: { [id]: boolean },                                // leituras preservadas (nao atualizadas)
//     agora?: number | string,                                  // epoch ms ou ISO; liga o criterio de frescor
//     cfg?: { encolhimento?, usarBaseline?, pendenteBaseline? } // so para backtest; producao usa o padrao calibrado
//     calibracao?: { faixas: {...} }                            // so para testes; producao usa ./calibracao.mjs
//   }
//   TseJson = o `-u.json` do TSE como baixado (recomendado). Compacto = saida de validate.compactar() SOMENTE se
//   trouxer `eleitorado.totalizado` (= e.est) e `secoes.totalizadas`; sem `e.est` o modelo nao projeta.
//   Governador sem `estratos` municipais: projeta com um unico estrato (= parcial) e faixa larga ('governador_uf').
//   Baselines (1o turno 2026 por UF/municipio/zona) ja estao embutidas em ./baselines/.
//   Saida: `forecast.projecao = { "<n>": pct_validos_projetado }` e `forecast.faixa = { "<n>": [min, max] }`.
import { parseTse, numero } from './parse.mjs';
import { projetar, CFG_PADRAO } from './estratos.mjs';
import { avaliarCriterios, naoAtendidos } from './criterios.mjs';
import { meiaLargura, confianca, tendencia } from './faixa.mjs';
import { aplicarCorrecao } from './correcao.mjs';
import { CALIBRACAO } from './calibracao.mjs';
import { BASELINES } from './baselines/index.mjs';

export const VERSAO = '3.0.0';
export const MODELO = Object.freeze({ nome: 'estratificado-2t', versao: VERSAO, calibracao: CALIBRACAO.versao });
export const ELEICOES = Object.freeze({ presidente: '6258', governador: '6260' });
// Configuracao de producao: definida pelo backtest (ver docs/BACKTEST.md e model/calibracao.mjs).
export const CFG_PRODUCAO = Object.freeze({ ...CFG_PADRAO, ...(CALIBRACAO.cfg ?? {}) });

export { parseTse, projetar, CFG_PADRAO, meiaLargura, CALIBRACAO, BASELINES };

const r = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// Aceita o -u.json do TSE ou o Compacto do coletor (se trouxer eleitorado.totalizado).
function paraTse(x) {
  if (!x || typeof x !== 'object' || x.carg || !x.candidatos) return x;
  const est = x.eleitorado?.totalizado ?? x.eleitorado?.est;
  return {
    ele: x.ele ?? x.eleicao, t: x.t ?? x.turno ?? '2', tpabr: x.tpabr, cdabr: x.cdabr, dg: x.dg, hg: x.hg,
    s: { ts: x.secoes?.total, st: x.secoes?.totalizadas, pst: x.secoes?.pct_totalizadas },
    e: { te: x.eleitorado?.total, est: est == null ? undefined : est, c: x.eleitorado?.comparecimento },
    v: { vvc: x.votos?.validos_candidatos, tv: x.votos?.total },
    carg: [{ agr: [{ par: [{ cand: x.candidatos.map((c) => ({ n: c.n, nmu: c.nome, nm: c.nome, vap: c.votos, st: c.status, e: c.eleito ? 's' : 'n' })) }] }] }],
  };
}

const temEstratos = (entrada) => Boolean(entrada.estratos && Object.keys(entrada.estratos).length > 0);

function baselineDe(entrada) {
  if (entrada.baselines) return entrada.baselines;
  if (entrada.cargo === 'presidente') return temEstratos(entrada) ? BASELINES.presidenteMunicipios : BASELINES.presidente;
  return BASELINES.governador?.[String(entrada.uf ?? '').toLowerCase()] ?? null;
}

function fontesDe(entrada) {
  if (temEstratos(entrada)) return entrada.estratos;
  if (entrada.cargo === 'presidente') return entrada.ufs ?? {};
  const uf = String(entrada.uf ?? '').toLowerCase();
  return entrada.ufs?.[uf] ? { [uf]: entrada.ufs[uf] } : {};
}

// Tipo de estratificacao -> tabela de faixa/MAE/correcao e limiares de criterios.
function tipoFaixa(entrada, baseline) {
  if (entrada.cargo === 'presidente') return temEstratos(entrada) ? 'presidente_mun' : 'presidente';
  if (!temEstratos(entrada)) return 'governador_uf';
  return baseline?.corrida?.estratificacao === 'zona' ? 'governador_zonas' : 'governador';
}

function finalistasDe(baseline, parsed) {
  if (baseline?.corrida?.finalistas?.length === 2) return baseline.corrida.finalistas;
  const nums = new Set(parsed.flatMap((p) => p.obs?.cands?.map((c) => c.n) ?? []));
  if (nums.size !== 2) return null;
  const [a, b] = [...nums];
  const info = (n) => parsed.flatMap((p) => p.obs?.cands ?? []).find((c) => c.n === n);
  return [a, b].map((n) => ({ n, nmu: info(n)?.nmu ?? n, nm: info(n)?.nm ?? '', sgp: info(n)?.sgp ?? null }));
}

function montarEstratos({ fontes, baseline, eleicao, stale, usarEstratoUnico }) {
  const ids = new Set([...Object.keys(baseline?.estratos ?? {}), ...Object.keys(fontes)]);
  const erros = [];
  const estratos = [...ids].map((id) => {
    const bruto = fontes[id];
    const p = bruto == null ? null : parseTse(paraTse(bruto), { eleicao, turno: '2' });
    if (p && !p.ok) erros.push({ id, erros: p.erros });
    const baseEstrato = usarEstratoUnico ? agregarBaseline(baseline) : baseline?.estratos?.[id] ?? null;
    return { id, obs: p?.ok ? p.obs : null, baseline: baseEstrato, stale: Boolean(stale?.[id]), parsed: p };
  });
  return { estratos, erros };
}

function agregarBaseline(baseline) {
  const lista = Object.values(baseline?.estratos ?? {});
  if (!lista.length) return null;
  const soma = (f) => lista.reduce((s, x) => s + (f(x) ?? 0), 0);
  const votos = Object.fromEntries((baseline.corrida?.finalistas ?? []).map((c) => [c.n, soma((x) => x.votos?.[c.n])]));
  return { nome: baseline.corrida?.uf ?? 'uf', te: soma((x) => x.te), vvc: soma((x) => x.vvc), votos };
}

// Horarios de geracao dos estratos NAO finais (estrato com 100% das secoes totalizadas tem dado final e fica isento:
// o TSE pode nao regerar um arquivo que nao mudou). `referencia` = geradoEm do arquivo da UF (governador), quando dado.
const estratoFinal = (obs) => obs != null && obs.ts > 0 && obs.st >= obs.ts;
function horarios(estratos, referencia = null) {
  const abertos = estratos.filter((e) => e.obs && !estratoFinal(e.obs));
  const ts = abertos.map((e) => e.obs.geradoEm).filter((t) => t != null);
  const desvioRef = referencia != null && ts.length ? Math.max(...ts.map((t) => Math.abs(t - referencia))) : null;
  return {
    min: ts.length ? Math.min(...ts) : null, max: ts.length ? Math.max(...ts) : null,
    semHorario: abertos.length - ts.length, abertos: abertos.length, referencia, desvioRef,
  };
}

// Governador: o arquivo da UF (entrada.ufs[uf]) e a referencia de relogio; os municipais sao medidos contra ele.
function referenciaUf(entrada, eleicao) {
  if (entrada.cargo !== 'governador' || !entrada.estratos) return null;
  const bruto = entrada.ufs?.[String(entrada.uf ?? '').toLowerCase()];
  const p = bruto == null ? null : parseTse(paraTse(bruto), { eleicao, turno: '2' });
  return p?.ok ? p.obs.geradoEm : null;
}

// Parcial = soma dos estratos. `definido_matematicamente`: criterio ARITMETICO, sem modelo: a vantagem em votos ja
// supera todo o eleitorado ainda nao totalizado (te - est), logo nao pode ser revertida.
function parcialDe(proj, finalistas) {
  const { obsA, obsB, te, est } = proj.totais;
  const tot = obsA + obsB;
  const vantagem = Math.abs(obsA - obsB);
  const pendentesMax = Math.max(0, te - est);
  const definido = tot > 0 && est > 0 && vantagem > pendentesMax ? finalistas[obsA > obsB ? 0 : 1] : null;
  return {
    candidatos: finalistas.map((c, i) => ({ ...c, votos: i === 0 ? obsA : obsB, pct: tot ? r(((i === 0 ? obsA : obsB) / tot) * 100) : null })),
    validos: tot, margem_pp: tot ? r(((obsA - obsB) / tot) * 100) : null,
    vantagem_votos: vantagem, eleitores_pendentes_max: pendentesMax,
    definido_matematicamente: definido ? { n: definido.n, nmu: definido.nmu } : null,
  };
}

function maeEsperado(tipo, pctApurado, calibracao) {
  const tabela = calibracao.mae?.[tipo];
  if (!tabela?.length) return null;
  const bin = tabela.find((b) => pctApurado < b.ate) ?? tabela[tabela.length - 1];
  return bin.mae;
}

function forecastDe({ proj, finalistas, tipo, cfg, calibracao }) {
  const { A, B, validosProj, pendentes } = proj.totais;
  if (!(validosProj > 0)) return null;
  const [c1, c2] = finalistas;
  const bruto = { [c1.n]: (A / validosProj) * 100, [c2.n]: (B / validosProj) * 100 };
  const apurado = proj.eleitoradoPct.apurado;
  // Correcao de deriva das urnas tardias (so onde ha curva calibrada no mesmo tipo de turno: presidente).
  const { pcts, delta } = aplicarCorrecao({ pcts: bruto, correcao: calibracao.correcao?.[tipo], pctApurado: apurado });
  const pctA = pcts[c1.n];
  const pctB = pcts[c2.n];
  const meia = meiaLargura(tipo, apurado, calibracao);
  const t = tendencia({ pctA, pctB, meia });
  const lider = t.lider === 'A' ? c1 : t.lider === 'B' ? c2 : null;
  const votosA = (pctA / 100) * validosProj;
  return {
    metodo: tipo, modelo: MODELO, cfg: { encolhimento: cfg.encolhimento, usarBaseline: cfg.usarBaseline, pendenteBaseline: cfg.pendenteBaseline, kSwing: cfg.kSwing ?? null },
    candidatos: [
      { ...c1, votos_proj: Math.round(votosA), pct_proj: r(pctA), faixa: [r(pctA - meia), r(pctA + meia)] },
      { ...c2, votos_proj: Math.round(validosProj - votosA), pct_proj: r(pctB), faixa: [r(pctB - meia), r(pctB + meia)] },
    ],
    projecao: { [c1.n]: r(pctA), [c2.n]: r(pctB) },
    sem_correcao: { [c1.n]: r(bruto[c1.n]), [c2.n]: r(bruto[c2.n]) },
    correcao_pp: { candidato: calibracao.correcao?.[tipo]?.candidato ?? null, delta: delta === 0 ? 0 : r(-delta) },
    erro_medio_esperado_pp: maeEsperado(tipo, apurado, calibracao),
    faixa: { [c1.n]: [r(pctA - meia), r(pctA + meia)], [c2.n]: [r(pctB - meia), r(pctB + meia)] },
    meia_largura_pp: r(meia), margem_pp: r(t.margem), faixa_margem_pp: r(t.faixaMargem),
    tendencia: lider ? { n: lider.n, nmu: lider.nmu } : null,
    confianca: confianca(proj.eleitoradoPct.apurado),
    validos_proj: Math.round(validosProj), pendentes_proj: Math.round(pendentes),
    swing_logit: r(proj.swing, 4), estratos_swing: proj.estratosSwing,
  };
}

function detalheEstratos(proj) {
  return proj.estratos.map((x) => ({
    id: x.id, nome: x.nome, tipo: x.tipo, stale: x.stale, te: x.te, est: x.est, st: x.st, ts: x.ts,
    pct_eleitorado: r(x.frac * 100), pct_secoes: x.ts ? r((x.st / x.ts) * 100) : null,
    votos: [x.a, x.b], pct_obs: x.vvc ? [r((x.a / x.vvc) * 100), r((x.b / x.vvc) * 100)] : null,
    pendentes: Math.round(x.h), pct_pendentes: x.q == null ? null : r(x.q * 100),
  }));
}

export function forecast(entrada) {
  if (!entrada || !['presidente', 'governador'].includes(entrada.cargo)) {
    return { forecast: null, criterios_nao_atendidos: ['cargo_invalido'], criterios: [], modelo: MODELO };
  }
  const baseline = baselineDe(entrada);
  const fontes = fontesDe(entrada);
  const tipo = tipoFaixa(entrada, baseline);
  const cfgTipo = tipo === 'presidente_mun' ? (CALIBRACAO.cfgMunicipal ?? {}) : {};
  const cfg = { ...CFG_PRODUCAO, ...cfgTipo, ...(entrada.cfg ?? {}) };
  const eleicao = entrada.eleicao ?? ELEICOES[entrada.cargo];
  const usarEstratoUnico = tipo === 'governador_uf';
  const baseEfetiva = usarEstratoUnico ? { ...baseline, estratos: {} } : baseline;
  const { estratos, erros } = montarEstratos({ fontes, baseline: baseEfetiva, eleicao, stale: entrada.stale, usarEstratoUnico });
  const finalistas = finalistasDe(baseline, estratos.map((e) => e.parsed).filter(Boolean));
  const proj = finalistas ? projetar({ estratos, finalistas: finalistas.map((c) => c.n), cfg }) : null;
  const agora = entrada.agora == null ? null : typeof entrada.agora === 'number' ? entrada.agora : Date.parse(entrada.agora);
  const criterios = avaliarCriterios({
    tipo: tipo === 'presidente_mun' ? 'presidente_mun' : entrada.cargo, erros, estratosEsperados: estratos.length, proj,
    geracao: horarios(estratos, referenciaUf(entrada, eleicao)), agora: Number.isFinite(agora) ? agora : null,
  });
  const pendencias = naoAtendidos(criterios);
  const calibracao = entrada.calibracao ?? CALIBRACAO; // override so para testes/backtest
  const fc = pendencias.length === 0 && proj ? forecastDe({ proj, finalistas, tipo, cfg, calibracao }) : null;
  return {
    modelo: MODELO, versao: VERSAO,
    corrida: { cargo: entrada.cargo, uf: entrada.uf ?? null, eleicao, turno: 2, finalistas: finalistas ?? [], estratificacao: tipo },
    apurado: proj ? {
      eleitorado_pct: r(proj.eleitoradoPct.apurado), secoes_pct: proj.totais.ts ? r((proj.totais.st / proj.totais.ts) * 100) : null,
      est: proj.totais.est, te: proj.totais.te, st: proj.totais.st, ts: proj.totais.ts,
    } : null,
    parcial: proj && finalistas ? parcialDe(proj, finalistas) : null,
    cobertura: proj ? { ...proj.contagem, eleitorado_pct: Object.fromEntries(Object.entries(proj.eleitoradoPct).map(([k, v]) => [k, r(v)])) } : null,
    forecast: fc ?? null,
    criterios, criterios_nao_atendidos: fc ? [] : (pendencias.length ? pendencias : ['sem_projecao']),
    estratos: proj ? detalheEstratos(proj) : [],
  };
}

export default forecast;
