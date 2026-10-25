import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast, VERSAO, MODELO, CALIBRACAO } from '../index.mjs';
import { fixtures6258, parcialDeBaseline, baselinePresidente, baselineGovernador, sintetizar } from './helpers.mjs';
import * as BASE from '../baselines/index.mjs';

const parcial60 = () => parcialDeBaseline(baselinePresidente, { frac: 0.6 });

test('exporta versao e modelo', () => {
  assert.equal(typeof VERSAO, 'string');
  assert.equal(MODELO.versao, VERSAO);
  assert.equal(MODELO.calibracao, CALIBRACAO.versao);
});

test('cargo invalido -> forecast null e criterio', () => {
  const r = forecast({ cargo: 'senador' });
  assert.equal(r.forecast, null);
  assert.deepEqual(r.criterios_nao_atendidos, ['cargo_invalido']);
  assert.equal(forecast(null).forecast, null);
});

test('0% apurado (arquivos reais pre-eleicao 6258): forecast null, apuracao_minima e estratos_apurados', () => {
  const { br, ...ufs } = fixtures6258();
  assert.equal(Object.keys(ufs).length, 28);
  const r = forecast({ cargo: 'presidente', br, ufs });
  assert.equal(r.forecast, null);
  assert.ok(r.criterios_nao_atendidos.includes('apuracao_minima'));
  assert.equal(r.apurado.eleitorado_pct, 0);
  assert.equal(r.parcial.validos, 0);
  assert.equal(r.corrida.finalistas.length, 2);
  assert.equal(r.cobertura.comDado, 28);
  assert.equal(r.estratos.length, 28);
  assert.ok(r.criterios.every((c) => typeof c.ok === 'boolean' && typeof c.id === 'string'));
});

test('UF faltando: cobertura_dados nao atendido, eleitorado sem dado > 0', () => {
  const { am, ...ufs } = parcial60();
  const r = forecast({ cargo: 'presidente', ufs });
  assert.equal(r.forecast, null);
  assert.ok(r.criterios_nao_atendidos.includes('cobertura_dados'));
  assert.ok(r.cobertura.eleitorado_pct.semDado > 1);
  assert.equal(r.estratos.find((e) => e.id === 'am').tipo, 'fallback:baseline+swing');
});

test('dado inconsistente (est > te): arquivos_validos nao atendido e id citado', () => {
  const ufs = parcial60();
  const quebrado = { ...ufs.ba, e: { ...ufs.ba.e, est: String(Number(ufs.ba.e.te) + 10) } };
  const r = forecast({ cargo: 'presidente', ufs: { ...ufs, ba: quebrado } });
  assert.equal(r.forecast, null);
  assert.ok(r.criterios_nao_atendidos.includes('arquivos_validos'));
  assert.match(r.criterios.find((c) => c.id === 'arquivos_validos').detalhe, /ba\(/);
});

test('turno/eleicao errados sao rejeitados', () => {
  const ufs = parcial60();
  const r = forecast({ cargo: 'presidente', ufs: { ...ufs, sp: { ...ufs.sp, t: '1' } } });
  assert.ok(r.criterios_nao_atendidos.includes('arquivos_validos'));
  const r2 = forecast({ cargo: 'presidente', ufs: { ...ufs, sp: { ...ufs.sp, ele: '6257' } } });
  assert.ok(r2.criterios_nao_atendidos.includes('arquivos_validos'));
  const r3 = forecast({ cargo: 'presidente', ufs: { ...ufs, sp: 'nao e json' } });
  assert.ok(r3.criterios_nao_atendidos.includes('arquivos_validos'));
});

test('presidente 60% apurado: forecast completo e coerente', () => {
  const r = forecast({ cargo: 'presidente', ufs: parcial60() });
  assert.deepEqual(r.criterios_nao_atendidos, []);
  const f = r.forecast;
  assert.ok(f);
  assert.equal(f.metodo, 'presidente');
  assert.equal(f.candidatos.length, 2);
  assert.ok(Math.abs(f.projecao['13'] + f.projecao['22'] - 100) < 0.02);
  for (const c of f.candidatos) {
    assert.ok(c.faixa[0] <= c.pct_proj && c.pct_proj <= c.faixa[1]);
    assert.deepEqual(f.faixa[c.n], c.faixa);
    assert.ok(c.votos_proj > 0);
  }
  // Parcial sintetica = 1T escalado: a projecao BRUTA devolve as participacoes do 1T (Flavio 51,0 / Lula 49,0 entre os dois)
  assert.ok(Math.abs(f.sem_correcao['22'] - 51.01) < 0.05, `bruto 22 = ${f.sem_correcao['22']}`);
  // ... e a correcao de deriva desloca Lula para cima (em 2022 o modelo subestimava Lula a 60% apurado)
  assert.equal(f.correcao_pp.candidato, '13');
  assert.ok(f.correcao_pp.delta > 0.3 && f.correcao_pp.delta < 1.5, `delta = ${f.correcao_pp.delta}`);
  assert.ok(Math.abs(f.projecao['13'] - (f.sem_correcao['13'] + f.correcao_pp.delta)) < 0.02);
  assert.ok(f.erro_medio_esperado_pp > 0 && f.erro_medio_esperado_pp < 1);
  assert.ok(Math.abs(f.candidatos[0].votos_proj + f.candidatos[1].votos_proj - f.validos_proj) <= 1);
  assert.ok(Math.abs(f.faixa_margem_pp - 2 * f.meia_largura_pp) < 0.02);
  assert.equal(r.parcial.definido_matematicamente, null); // a 60% ainda ha mais eleitores pendentes que a vantagem
  const temTendencia = Math.abs(f.margem_pp) > f.faixa_margem_pp;
  assert.equal(Boolean(f.tendencia), temTendencia);
  assert.equal(f.confianca, 'media');
  assert.ok(r.apurado.eleitorado_pct > 59 && r.apurado.eleitorado_pct < 61);
  assert.equal(r.cobertura.apurados, 28);
  assert.equal(r.cobertura.fallbackNacional, 0);
  assert.ok(r.estratos.every((e) => e.tipo === 'observado' && e.pendentes > 0));
});

test('faixa de erro vem da calibracao e tendencia so com margem acima da faixa', () => {
  const calibracao = { versao: 'teste', faixas: { presidente: [{ ate: 50, meia: 3 }, { ate: 100.01, meia: 1 }] } };
  // ajuste forte a favor do 13 em todas as UFs -> margem grande -> tendencia 13
  const r = forecast({ cargo: 'presidente', ufs: parcialDeBaseline(baselinePresidente, { frac: 0.95, ajuste: { 13: 1.5 } }), calibracao });
  assert.ok(r.forecast);
  assert.equal(r.forecast.meia_largura_pp, 1);
  assert.equal(r.forecast.faixa_margem_pp, 2);
  assert.equal(r.forecast.tendencia?.n, '13');
  assert.equal(r.forecast.confianca, 'alta');
  // empate quase perfeito -> sem tendencia
  const e = forecast({ cargo: 'presidente', ufs: parcialDeBaseline(baselinePresidente, { frac: 0.95, ajuste: { 13: 56104503 / 53879538 } }), calibracao });
  assert.equal(e.forecast.tendencia, null);
  // a 30% apurado a faixa e a do primeiro bin
  const b = forecast({ cargo: 'presidente', ufs: parcialDeBaseline(baselinePresidente, { frac: 0.3 }), calibracao });
  assert.equal(b.forecast.meia_largura_pp, 3);
  // calibracao de producao: faixa estreita com mais apuracao (monotonica)
  const p30 = forecast({ cargo: 'presidente', ufs: parcialDeBaseline(baselinePresidente, { frac: 0.3 }) });
  const p95 = forecast({ cargo: 'presidente', ufs: parcialDeBaseline(baselinePresidente, { frac: 0.95 }) });
  assert.ok(p30.forecast.meia_largura_pp >= p95.forecast.meia_largura_pp);
});

test('UF sem apuracao com baseline -> fallback baseline+swing; sem baseline -> fallback nacional (criterio por tamanho)', () => {
  const ufs = parcialDeBaseline(baselinePresidente, { frac: 0.6, fracPorEstrato: { ac: 0, sp: 0 } });
  const r = forecast({ cargo: 'presidente', ufs });
  assert.ok(r.forecast, JSON.stringify(r.criterios_nao_atendidos));
  assert.equal(r.estratos.find((e) => e.id === 'ac').tipo, 'fallback:baseline+swing');
  assert.equal(r.cobertura.fallbackBaseline, 2);
  // sem baseline para SP (33% do eleitorado): fallback nacional estoura o limite de 5%
  const { sp, ...estratosBase } = baselinePresidente.estratos;
  const semSp = { ...baselinePresidente, estratos: estratosBase };
  const r2 = forecast({ cargo: 'presidente', ufs, baselines: semSp });
  assert.equal(r2.forecast, null);
  assert.ok(r2.criterios_nao_atendidos.includes('fallback_nacional'));
  assert.equal(r2.estratos.find((e) => e.id === 'sp').tipo, 'fallback:nacional');
  // sem baseline para AC (0,4%): dentro do limite
  const { ac, ...semAcBase } = baselinePresidente.estratos;
  const r3 = forecast({ cargo: 'presidente', ufs, baselines: { ...baselinePresidente, estratos: semAcBase } });
  assert.ok(r3.forecast);
  assert.ok(r3.cobertura.eleitorado_pct.fallbackNacional > 0 && r3.cobertura.eleitorado_pct.fallbackNacional < 5);
});

test('leitura preservada (stale) bloqueia presidente', () => {
  const r = forecast({ cargo: 'presidente', ufs: parcial60(), stale: { sp: true } });
  assert.equal(r.forecast, null);
  assert.ok(r.criterios_nao_atendidos.includes('leituras_preservadas'));
  assert.equal(r.cobertura.stale, 1);
});

test('dispersao de horarios e frescor', () => {
  const ufs = parcialDeBaseline(baselinePresidente, { frac: 0.6, hgPorEstrato: { rj: '21:00:00' } });
  const r = forecast({ cargo: 'presidente', ufs });
  assert.ok(r.criterios_nao_atendidos.includes('dispersao_horarios'));
  const ok = forecast({ cargo: 'presidente', ufs: parcial60(), agora: Date.parse('2026-10-25T19:32:00-03:00') });
  assert.ok(ok.forecast);
  const velho = forecast({ cargo: 'presidente', ufs: parcial60(), agora: '2026-10-25T21:00:00-03:00' });
  assert.ok(velho.criterios_nao_atendidos.includes('frescor'));
  const semHora = parcial60();
  const r4 = forecast({ cargo: 'presidente', ufs: { ...semHora, pr: { ...semHora.pr, hg: '' } } });
  assert.ok(r4.criterios_nao_atendidos.includes('horarios_presentes'));
});

test('governador com estratos municipais (AC) e por zonas (DF)', () => {
  const ac = forecast({ cargo: 'governador', uf: 'ac', estratos: parcialDeBaseline(baselineGovernador('ac'), { frac: 0.5, ele: '6260', tpabr: 'mu' }) });
  assert.deepEqual(ac.criterios_nao_atendidos, []);
  assert.equal(ac.forecast.metodo, 'governador');
  assert.equal(ac.cobertura.total, 22);
  assert.deepEqual(ac.corrida.finalistas.map((f) => f.n), ['11', '10']);
  assert.ok(Math.abs(ac.forecast.projecao['11'] + ac.forecast.projecao['10'] - 100) < 0.02);
  const df = forecast({ cargo: 'governador', uf: 'DF', estratos: parcialDeBaseline(baselineGovernador('df'), { frac: 0.5, ele: '6260', tpabr: 'zona' }) });
  assert.deepEqual(df.criterios_nao_atendidos, []);
  assert.equal(df.forecast.metodo, 'governador_zonas');
  assert.equal(df.cobertura.total, 19);
});

test('governador sem estratos municipais: so o arquivo da UF -> estrato unico, faixa larga', () => {
  const b = baselineGovernador('rn');
  const soma = (f) => Object.values(b.estratos).reduce((s, x) => s + f(x), 0);
  const [c1, c2] = b.corrida.finalistas;
  const ufJson = sintetizar({ ele: '6260', cdabr: 'rn', te: soma((x) => x.te), est: Math.round(soma((x) => x.te) * 0.3), ts: soma((x) => x.ts), st: Math.round(soma((x) => x.ts) * 0.3),
    cands: [{ n: c1.n, vap: 300000 }, { n: c2.n, vap: 280000 }] });
  const r = forecast({ cargo: 'governador', uf: 'rn', ufs: { rn: ufJson } });
  assert.deepEqual(r.criterios_nao_atendidos, []);
  assert.equal(r.forecast.metodo, 'governador_uf');
  assert.equal(r.cobertura.total, 1);
  assert.ok(Math.abs(r.forecast.projecao[c1.n] - (300000 / 580000) * 100) < 0.01);
  const baixo = forecast({ cargo: 'governador', uf: 'rn', ufs: { rn: { ...ufJson, e: { ...ufJson.e, est: '1000' }, s: { ...ufJson.s, st: '10' } } } });
  // qualquer dado projeta (decisao de 25/10), com a faixa larga do inicio
  assert.ok(baixo.forecast, JSON.stringify(baixo.criterios_nao_atendidos));
  assert.ok(baixo.forecast.meia_largura_pp > r.forecast.meia_largura_pp);
});

test('governador: municipio faltando dentro do limite de 2% mantem a projecao; acima bloqueia', () => {
  const todos = parcialDeBaseline(baselineGovernador('rn'), { frac: 0.5, ele: '6260', tpabr: 'mu' });
  const menor = Object.entries(baselineGovernador('rn').estratos).sort((a, b) => a[1].te - b[1].te)[0][0];
  const { [menor]: _, ...semMenor } = todos;
  const r = forecast({ cargo: 'governador', uf: 'rn', estratos: semMenor });
  assert.ok(r.forecast, JSON.stringify(r.criterios_nao_atendidos));
  assert.equal(r.cobertura.comDado, 166);
  const { rn17612: __, ...semNatal } = todos; // Natal (21% do eleitorado do RN)
  const r2 = forecast({ cargo: 'governador', uf: 'rn', estratos: semNatal });
  assert.equal(r2.forecast, null);
  assert.ok(r2.criterios_nao_atendidos.includes('cobertura_dados'));
});

test('aceita Compacto do coletor se trouxer eleitorado.totalizado; sem ele, nao projeta', () => {
  const ufs = parcial60();
  const compactar = (j, comTotalizado) => ({
    tpabr: j.tpabr, cdabr: j.cdabr, dg: j.dg, hg: j.hg, ele: j.ele, t: j.t,
    secoes: { total: Number(j.s.ts), totalizadas: Number(j.s.st), pct_totalizadas: 0 },
    eleitorado: { total: Number(j.e.te), comparecimento: Number(j.e.c), abstencao: 0, ...(comTotalizado ? { totalizado: Number(j.e.est) } : {}) },
    votos: { total: Number(j.v.tv), validos_candidatos: Number(j.v.vvc), brancos: 0, nulos: 0 },
    candidatos: j.carg[0].agr[0].par[0].cand.map((c) => ({ n: c.n, nome: c.nmu, votos: Number(c.vap), pct_validos: 0, eleito: false, status: '' })),
  });
  const compactos = Object.fromEntries(Object.entries(ufs).map(([k, v]) => [k, compactar(v, true)]));
  const r = forecast({ cargo: 'presidente', ufs: compactos });
  const esperado = forecast({ cargo: 'presidente', ufs });
  assert.deepEqual(r.forecast.projecao, esperado.forecast.projecao);
  const semEst = Object.fromEntries(Object.entries(ufs).map(([k, v]) => [k, compactar(v, false)]));
  const r2 = forecast({ cargo: 'presidente', ufs: semEst });
  assert.equal(r2.forecast, null);
  assert.ok(r2.criterios_nao_atendidos.includes('arquivos_validos'));
});

test('definido matematicamente: vantagem em votos maior que o eleitorado pendente (criterio aritmetico)', () => {
  const r = forecast({ cargo: 'presidente', ufs: parcialDeBaseline(baselinePresidente, { frac: 0.999, ajuste: { 13: 1.3 } }) });
  assert.equal(r.parcial.definido_matematicamente?.n, '13');
  assert.ok(r.parcial.vantagem_votos > r.parcial.eleitores_pendentes_max);
  const { br, ...ufs } = fixtures6258();
  assert.equal(forecast({ cargo: 'presidente', ufs }).parcial.definido_matematicamente, null);
});

test('estrato com 100% das secoes totalizadas fica isento de frescor e dispersao', () => {
  // presidente: AC 100% apurado com arquivo 2 h mais velho que os demais -> nao conta
  const ufs = parcialDeBaseline(baselinePresidente, { frac: 0.6, fracPorEstrato: { ac: 1 }, hgPorEstrato: { ac: '17:30:00' } });
  const r = forecast({ cargo: 'presidente', ufs, agora: '2026-10-25T19:32:00-03:00' });
  assert.deepEqual(r.criterios_nao_atendidos, []);
  assert.equal(r.criterios.find((c) => c.id === 'dispersao_horarios').valor, 0);
  // mesmo arquivo velho, mas com 99% -> conta e derruba
  const ufs2 = parcialDeBaseline(baselinePresidente, { frac: 0.6, fracPorEstrato: { ac: 0.99 }, hgPorEstrato: { ac: '17:30:00' } });
  const r2 = forecast({ cargo: 'presidente', ufs: ufs2, agora: '2026-10-25T19:32:00-03:00' });
  assert.ok(r2.criterios_nao_atendidos.includes('dispersao_horarios'));
  assert.ok(r2.criterios_nao_atendidos.includes('frescor'));
  // governador: todos os municipios finais sem hg -> horarios_presentes continua ok
  const todosFinais = parcialDeBaseline(baselineGovernador('ac'), { frac: 1, ele: '6260', tpabr: 'mu' });
  const semHg = Object.fromEntries(Object.entries(todosFinais).map(([k, v]) => [k, { ...v, hg: '' }]));
  const r3 = forecast({ cargo: 'governador', uf: 'ac', estratos: semHg });
  assert.ok(r3.forecast, JSON.stringify(r3.criterios_nao_atendidos));
});

test('governador: frescor e dispersao medidos contra o arquivo da UF quando ele e passado', () => {
  const b = baselineGovernador('ac');
  const soma = (f) => Object.values(b.estratos).reduce((s, x) => s + f(x), 0);
  const [c1, c2] = b.corrida.finalistas;
  const ufJson = (hg) => sintetizar({ ele: '6260', cdabr: 'ac', hg, te: soma((x) => x.te), est: Math.round(soma((x) => x.te) * 0.5), ts: soma((x) => x.ts), st: Math.round(soma((x) => x.ts) * 0.5),
    cands: [{ n: c1.n, vap: 100000 }, { n: c2.n, vap: 90000 }] });
  // municipios com horarios 10 min apart entre si: sem referencia derruba; com arquivo da UF a 1 min de todos... nao da
  const estratos = parcialDeBaseline(b, { frac: 0.5, ele: '6260', tpabr: 'mu', hgPorEstrato: { ac01392: '19:38:00' } }); // Rio Branco 8 min a frente
  // com a UF em 19:34: desvio maximo = 4 min -> ok; relogio medido no arquivo da UF
  const comRef = forecast({ cargo: 'governador', uf: 'ac', estratos, ufs: { ac: ufJson('19:34:00') }, agora: '2026-10-25T19:36:00-03:00' });
  assert.deepEqual(comRef.criterios_nao_atendidos, []);
  assert.equal(comRef.criterios.find((c) => c.id === 'dispersao_horarios').valor, 240);
  assert.equal(comRef.criterios.find((c) => c.id === 'frescor').valor, 120);
  // UF 10 min a frente dos municipios -> dispersao estoura
  const refLonge = forecast({ cargo: 'governador', uf: 'ac', estratos: parcialDeBaseline(b, { frac: 0.5, ele: '6260', tpabr: 'mu' }), ufs: { ac: ufJson('21:00:00') } });
  assert.ok(refLonge.criterios_nao_atendidos.includes('dispersao_horarios'));
  // municipios antigos e finais nao importam, mas o arquivo da UF velho no relogio derruba
  const finais = parcialDeBaseline(b, { frac: 1, ele: '6260', tpabr: 'mu', hgPorEstrato: { ac01392: '17:30:00' } });
  const ufVelha = forecast({ cargo: 'governador', uf: 'ac', estratos: finais, ufs: { ac: ufJson('18:00:00') }, agora: '2026-10-25T19:36:00-03:00' });
  assert.deepEqual(ufVelha.criterios_nao_atendidos, ['frescor']);
  const ufNova = forecast({ cargo: 'governador', uf: 'ac', estratos: finais, ufs: { ac: ufJson('19:35:00') }, agora: '2026-10-25T19:36:00-03:00' });
  assert.deepEqual(ufNova.criterios_nao_atendidos, []);
});

test('presidente com estratos municipais (modelo B): metodo presidente_mun, baseline municipal embutida, correcao propria', () => {
  const { BASELINES } = BASE;
  const estratos = parcialDeBaseline(BASELINES.presidenteMunicipios, { frac: 0.5, tpabr: 'mu' });
  assert.ok(Object.keys(estratos).length > 5000);
  const r = forecast({ cargo: 'presidente', estratos });
  assert.deepEqual(r.criterios_nao_atendidos, []);
  assert.equal(r.forecast.metodo, 'presidente_mun');
  assert.equal(r.cobertura.total, Object.keys(estratos).length);
  assert.ok(Math.abs(r.forecast.sem_correcao['22'] - 51.01) < 0.05);
  assert.ok(r.forecast.correcao_pp.delta > 0 && r.forecast.correcao_pp.delta < r.forecast.sem_correcao['13']);
  assert.ok(r.forecast.erro_medio_esperado_pp > 0);
  // faltando 2% do eleitorado em municipios ainda projeta; faltando SP capital (8%) nao
  const { sp71072: _, ...semSp } = estratos;
  assert.equal(forecast({ cargo: 'presidente', estratos: semSp }).forecast, null);
  // governador nao tem correcao de deriva
  const g = forecast({ cargo: 'governador', uf: 'ac', estratos: parcialDeBaseline(baselineGovernador('ac'), { frac: 0.5, ele: '6260', tpabr: 'mu' }) });
  assert.equal(g.forecast.correcao_pp.delta, 0);
  assert.deepEqual(g.forecast.projecao, g.forecast.sem_correcao);
  assert.ok(g.forecast.erro_medio_esperado_pp > 0);
});

test('v3.1: interruptor metodoPresidente, erro_medio_esperado {projecao, parcial} e faixa >= 0,75 x curva', () => {
  const ufs = parcialDeBaseline(baselinePresidente, { frac: 0.3 });
  const com = forecast({ cargo: 'presidente', ufs });
  const sem = forecast({ cargo: 'presidente', ufs, cfg: { metodoPresidente: 'sem_correcao' } });
  assert.equal(com.forecast.metodo, 'presidente');
  assert.equal(sem.forecast.metodo, 'presidente_sem_correcao');
  assert.equal(sem.forecast.correcao_pp.delta, 0);
  assert.deepEqual(sem.forecast.projecao, sem.forecast.sem_correcao);
  assert.deepEqual(sem.forecast.sem_correcao, com.forecast.sem_correcao);
  assert.ok(sem.forecast.meia_largura_pp > com.forecast.meia_largura_pp); // faixa v2 e mais larga
  for (const f of [com.forecast, sem.forecast]) {
    assert.equal(f.erro_medio_esperado.projecao, f.erro_medio_esperado_pp);
    assert.equal(f.erro_medio_esperado.parcial, f.erro_medio_parcial_pp);
    assert.ok(f.erro_medio_esperado.parcial > f.erro_medio_esperado.projecao); // a parcial erra mais que a projecao
    assert.ok(f.erro_medio_esperado.projecao >= f.meia_largura_pp / 2 - 0.001); // MAE exibido >= meia/2
  }
  // faixa do presidente a 10-40% = 0,75 x |curva 2T 2022| (revisao v3 §2): 0,752
  assert.ok(Math.abs(com.forecast.meia_largura_pp - 0.75) < 0.01, `meia = ${com.forecast.meia_largura_pp}`);
  assert.ok(Math.abs(com.forecast.erro_medio_esperado.projecao - 0.38) < 0.01);
  const alto = forecast({ cargo: 'presidente', ufs: parcialDeBaseline(baselinePresidente, { frac: 0.92 }) });
  assert.ok(alto.forecast.meia_largura_pp < 0.25 && alto.forecast.meia_largura_pp > 0.15);
  // cfg invalido cai no padrao
  assert.equal(forecast({ cargo: 'presidente', ufs, cfg: { metodoPresidente: 'x' } }).forecast.metodo, 'presidente');
});

test('entrada nao e mutada', () => {
  const ufs = parcial60();
  const antes = JSON.stringify(ufs);
  forecast({ cargo: 'presidente', ufs });
  assert.equal(JSON.stringify(ufs), antes);
});
