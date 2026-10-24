import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numero, dataHoraTse, parseTse, validarConsistencia, extrairCandidatos } from '../parse.mjs';
import { projetar, calcularSwing, resumirEstrato, CFG_PADRAO } from '../estratos.mjs';
import { meiaLargura, confianca, tendencia } from '../faixa.mjs';
import { avaliarCriterios, naoAtendidos, LIMIARES } from '../criterios.mjs';
import { sintetizar } from './helpers.mjs';

test('numero normaliza virgula decimal e lixo', () => {
  assert.equal(numero('47,03'), 47.03);
  assert.equal(numero('47.027772356'), 47.027772356);
  assert.equal(numero(null), 0);
  assert.equal(numero('abc'), 0);
  assert.equal(numero(12), 12);
});

test('dataHoraTse interpreta dg/hg em Brasilia', () => {
  assert.equal(dataHoraTse('25/10/2026', '17:00:00'), Date.parse('2026-10-25T20:00:00Z'));
  assert.equal(dataHoraTse('', '17:00:00'), null);
  assert.equal(dataHoraTse('25/10/2026', '17h'), null);
  assert.equal(dataHoraTse('99/99/2026', '17:00:00'), null);
});

test('parseTse rejeita entradas invalidas e checa eleicao/turno', () => {
  assert.deepEqual(parseTse(null).erros, ['json_invalido']);
  assert.deepEqual(parseTse([]).erros, ['json_invalido']);
  const j = sintetizar({ te: 1000, est: 500, ts: 10, st: 5, cands: [{ n: '13', vap: 200 }, { n: '22', vap: 150 }] });
  const ok = parseTse(j, { eleicao: '6258', turno: '2' });
  assert.ok(ok.ok, ok.erros.join());
  assert.equal(ok.obs.vvc, 350);
  assert.equal(ok.obs.cands.length, 2);
  assert.ok(Object.isFrozen(ok.obs));
  const ruim = parseTse(j, { eleicao: '6260', turno: '1' });
  assert.ok(ruim.erros.includes('eleicao_inesperada:6258'));
  assert.ok(ruim.erros.includes('turno_inesperado:2'));
  assert.deepEqual(extrairCandidatos({}), []);
  assert.deepEqual(extrairCandidatos({ carg: [{ agr: null }] }), []);
});

test('validarConsistencia detecta somas e limites errados', () => {
  const base = { te: 1000, est: 500, ts: 10, st: 5, comp: 400, vvc: 350, cands: [{ n: '13', vap: 200 }, { n: '22', vap: 150 }] };
  assert.deepEqual(validarConsistencia(base), []);
  assert.ok(validarConsistencia({ ...base, vvc: 300 }).includes('soma_vap_maior_que_vvc'));
  assert.ok(validarConsistencia({ ...base, vvc: 400 }).includes('soma_vap_diferente_de_vvc'));
  assert.ok(validarConsistencia({ ...base, st: 11 }).includes('st_maior_que_ts'));
  assert.ok(validarConsistencia({ ...base, te: 0 }).includes('eleitorado_zero'));
  assert.ok(validarConsistencia({ ...base, ts: 0 }).includes('secoes_zero'));
  assert.ok(validarConsistencia({ ...base, cands: [] }).includes('sem_candidatos'));
  assert.ok(validarConsistencia({ ...base, comp: 100 }).includes('vvc_maior_que_comparecimento'));
  assert.ok(validarConsistencia({ ...base, est: 0 }).includes('votos_sem_eleitorado_totalizado'));
});

const obs = (te, est, a, b) => ({ te, est, st: 1, ts: 2, vvc: a + b, cands: [{ n: 'A', vap: a }, { n: 'B', vap: b }] });

test('resumirEstrato usa baseline quando falta dado e limita est a te', () => {
  const r = resumirEstrato({ id: 'x', obs: null, baseline: { te: 500, vvc: 400, votos: { A: 300, B: 100 } } }, ['A', 'B']);
  assert.equal(r.temDado, false);
  assert.equal(r.te, 500);
  assert.equal(r.base, 0.75);
  assert.equal(r.validoBase, 0.8);
  const s = resumirEstrato({ id: 'y', obs: obs(100, 150, 10, 10), baseline: null }, ['A', 'B']);
  assert.equal(s.est, 100);
  assert.equal(s.base, null);
});

test('calcularSwing: media ponderada em logit e minimo de votos', () => {
  const itens = [
    resumirEstrato({ id: '1', obs: obs(1000, 500, 300, 200), baseline: { te: 1000, vvc: 800, votos: { A: 400, B: 400 } } }, ['A', 'B']),
    resumirEstrato({ id: '2', obs: obs(1000, 500, 10, 10), baseline: { te: 1000, vvc: 800, votos: { A: 100, B: 700 } } }, ['A', 'B']),
  ];
  const { swing, estratos } = calcularSwing(itens, CFG_PADRAO);
  assert.equal(estratos, 1); // o estrato 2 tem 20 votos < minVotosSwing
  assert.ok(Math.abs(swing - Math.log(0.6 / 0.4)) < 1e-9);
  assert.deepEqual(calcularSwing([], CFG_PADRAO), { swing: null, estratos: 0 });
});

test('projetar: tipos de estrato, fallback nacional e sem prior', () => {
  const estratos = [
    { id: 'a', obs: obs(1000, 500, 300, 100), baseline: null },
    { id: 'b', obs: obs(1000, 0, 0, 0), baseline: null },
    { id: 'c', obs: null, baseline: { te: 2000, vvc: 1600, votos: { A: 800, B: 800 } } },
  ];
  const p = projetar({ estratos, finalistas: ['A', 'B'] });
  const tipos = Object.fromEntries(p.estratos.map((x) => [x.id, x.tipo]));
  assert.equal(tipos.a, 'observado');
  assert.equal(tipos.b, 'fallback:nacional');
  assert.equal(tipos.c, 'fallback:nacional'); // sem outro estrato com baseline nao ha swing
  assert.equal(p.contagem.fallbackNacional, 2);
  assert.ok(Math.abs(p.eleitoradoPct.semDado - 50) < 1e-9);
  assert.ok(Math.abs(p.totais.A / p.totais.validosProj - 0.75) < 1e-9);
  // pendentes: a = 500*0.8 = 400 ; b = 1000*0.8 ; c = 2000*0.8
  assert.ok(Math.abs(p.totais.pendentes - (400 + 800 + 1600)) < 1e-9);
  const vazio = projetar({ estratos: [{ id: 'z', obs: obs(1000, 0, 0, 0), baseline: null }], finalistas: ['A', 'B'] });
  assert.equal(vazio.estratos[0].tipo, 'sem_prior');
  assert.equal(vazio.totais.validosProj, 0);
  assert.equal(vazio.pNac, null);
});

test('projetar: prior baseline+swing e encolhimento', () => {
  const bl = (a, b) => ({ te: 1000, vvc: a + b, votos: { A: a, B: b } });
  const estratos = [
    { id: 'a', obs: obs(1000, 500, 300, 100), baseline: bl(400, 400) }, // obs 75% vs base 50% -> swing +logit(3)
    { id: 'c', obs: null, baseline: bl(400, 400) },
  ];
  const p = projetar({ estratos, finalistas: ['A', 'B'] });
  const c = p.estratos.find((x) => x.id === 'c');
  assert.equal(c.tipo, 'fallback:baseline+swing');
  assert.ok(Math.abs(c.q - 0.75) < 1e-9);
  const enc = projetar({ estratos, finalistas: ['A', 'B'], cfg: { encolhimento: 1 } });
  const a = enc.estratos.find((x) => x.id === 'a');
  assert.equal(a.tipo, 'observado');
  assert.ok(Math.abs(a.q - 0.75) < 1e-9); // prior == observado neste caso; w = 0.5
  const semBaseline = projetar({ estratos, finalistas: ['A', 'B'], cfg: { usarBaseline: false } });
  assert.equal(semBaseline.estratos.find((x) => x.id === 'c').tipo, 'fallback:nacional');
  const turnout = projetar({ estratos, finalistas: ['A', 'B'], cfg: { pendenteBaseline: true } });
  // a: obs 400 validos em 500 eleitores (0,8) vs base 0,8 -> razao 1 -> c pendente = 1000*0,8*1 = 800
  assert.ok(Math.abs(turnout.estratos.find((x) => x.id === 'c').h - 800) < 1e-9);
});

test('faixa: lookup por bin, tipo desconhecido e tendencia', () => {
  const calib = { faixas: { presidente: [{ ate: 50, meia: 2 }, { ate: 100.01, meia: 0.5 }], governador_uf: [{ ate: 100.01, meia: 9 }] } };
  assert.equal(meiaLargura('presidente', 10, calib), 2);
  assert.equal(meiaLargura('presidente', 50, calib), 0.5);
  assert.equal(meiaLargura('presidente', 100, calib), 0.5);
  assert.equal(meiaLargura('presidente', NaN, calib), 2);
  assert.equal(meiaLargura('inexistente', 50, calib), 9);
  assert.equal(confianca(10), 'baixa');
  assert.equal(confianca(50), 'media');
  assert.equal(confianca(90), 'alta');
  assert.equal(tendencia({ pctA: 52, pctB: 48, meia: 1 }).lider, 'A');
  assert.equal(tendencia({ pctA: 48, pctB: 52, meia: 1 }).lider, 'B');
  assert.equal(tendencia({ pctA: 51, pctB: 49, meia: 1 }).lider, null);
});

test('correcao de deriva: interpolacao linear com extremos e aplicacao simetrica', async () => {
  const { interpolar, aplicarCorrecao } = await import('../correcao.mjs');
  const curva = [{ x: 10, y: -2 }, { x: 20, y: -1 }, { x: 50, y: 0 }];
  assert.equal(interpolar(curva, 5), -2);
  assert.equal(interpolar(curva, 15), -1.5);
  assert.equal(interpolar(curva, 35), -0.5);
  assert.equal(interpolar(curva, 90), 0);
  assert.equal(interpolar([], 50), 0);
  assert.equal(interpolar(null, 50), 0);
  const r = aplicarCorrecao({ pcts: { 13: 48, 22: 52 }, correcao: { candidato: '13', curva }, pctApurado: 15 });
  assert.deepEqual(r, { pcts: { 13: 49.5, 22: 50.5 }, delta: -1.5 });
  const semCurva = aplicarCorrecao({ pcts: { 13: 48, 22: 52 }, correcao: null, pctApurado: 15 });
  assert.deepEqual(semCurva, { pcts: { 13: 48, 22: 52 }, delta: 0 });
  const outroCand = aplicarCorrecao({ pcts: { 11: 48, 10: 52 }, correcao: { candidato: '13', curva }, pctApurado: 15 });
  assert.equal(outroCand.delta, 0);
  const limite = aplicarCorrecao({ pcts: { 13: 99.5, 22: 0.5 }, correcao: { candidato: '13', curva }, pctApurado: 10 });
  assert.equal(limite.pcts[13], 100);
});

test('criterios: sem projecao devolve so os criterios de dados', () => {
  const c = avaliarCriterios({ tipo: 'presidente', erros: [{ id: 'x', erros: ['e'] }], estratosEsperados: 0, proj: null, geracao: {}, agora: null });
  assert.deepEqual(naoAtendidos(c), ['arquivos_validos', 'estratos_esperados', 'finalistas_identificados']);
  assert.ok(LIMIARES.presidente.apuracaoMinPct < LIMIARES.governador.apuracaoMinPct);
  const d = avaliarCriterios({ tipo: 'outro', erros: [], estratosEsperados: 1, proj: null, geracao: {}, agora: null });
  assert.ok(d.find((x) => x.id === 'finalistas_identificados').ok === false);
});
