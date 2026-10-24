// Estratos (municipios/zonas) dos governadores: round-robin, orcamento, prazo, e integracao REAL com model/index.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { CALIBRACAO_SHA256, GOV_UFS, UFS, estratosDoConfig } from '../src/config.mjs';
import { criarForecaster } from '../src/forecast-adapter.mjs';
import { verificarCadeia } from '../../tools/verificar-cadeia.mjs';
import { definirRelogio, lerObj, novoAmbiente, rodar, apurar, avancar } from './helpers/comum.mjs';
import { fixtureTexto, lerFixture, sintetizar, urlTse } from './helpers/tse-mock.mjs';

const CFG_URL = 'https://resultados.tse.jus.br/oficial/ele2026/6260/config/mun-e006260-cm.json';

function publicarEstratosSinteticos(amb, pct) {
  const cfg = lerFixture('6260/config/mun-e006260-cm.json');
  amb.tse.definir(CFG_URL, cfg);
  const base = lerFixture('6260/dados/ac/ac01392-c0003-e006260-u.json');
  const lista = estratosDoConfig(cfg);
  for (const e of lista) {
    const f = Math.round(pct * 3);
    amb.tse.definir(e.url, sintetizar(base, { regiao: e.cdabr ?? '0001', tpabr: e.tpabr ?? 'zona', pct, votos: [f, f * 2 / 3 | 0], hg: '18:00:00' }));
  }
  return lista;
}

const reqEstratos = (amb) => amb.tse.requisicoes.filter((q) => /\/6260\/dados\/\w+\/\w+\d{5}(-z\d+)?-c0003/.test(q.url));

test('round-robin: 244 estratos por invocacao, cobertura total em 2 invocacoes, modelo so recebe estratos com UF completa', async () => {
  const amb = novoAmbiente();
  apurar(amb, 30);
  const lista = publicarEstratosSinteticos(amb, 30);
  const entradas = [];
  const modelo = { VERSAO: 's', forecast: (e) => { entradas.push(e); return { forecast: null, criterios_nao_atendidos: ['x'] }; } };
  const forecaster = criarForecaster(modelo);
  definirRelogio('2026-10-25T22:00:05Z');

  const r1 = await rodar(amb, { ciclos: 4, intervaloMs: 0, forecaster });
  assert.deepEqual(r1.erros, []);
  const a = reqEstratos(amb);
  assert.equal(a.length, 244);
  assert.equal(new Set(a.map((q) => q.url)).size, 244, 'sem repeticao na invocacao');
  assert.ok(entradas.every((e) => e.estratos === undefined), 'cobertura incompleta -> modo UF');
  assert.equal(r1.subrequests_tse, 4 * 35 + 1 + 244, '4 ciclos x 35 (BR+27 UFs+zz+6 gov) + config + estratos');
  assert.ok(amb.bucket.objetos.has('state/estratos-6260.json'));

  amb.tse.requisicoes.length = 0;
  entradas.length = 0;
  avancar(60_000);
  const r2 = await rodar(amb, { ciclos: 4, intervaloMs: 0, forecaster });
  const b = reqEstratos(amb);
  assert.equal(b.length, 244);
  assert.equal(new Set([...a, ...b].map((q) => q.url)).size, 487, 'duas invocacoes cobrem os 487');
  assert.ok(r2.subrequests_tse < 800);
  const ac = entradas.find((e) => e.uf === 'ac');
  assert.equal(Object.keys(ac.estratos).length, 22);
  const df = entradas.find((e) => e.uf === 'df');
  assert.equal(Object.keys(df.estratos).length, 19);
  assert.deepEqual(Object.keys(ac.stale).length, 22);

  const snap = lerObj(amb.bucket, amb.bucket.leitor && [...amb.bucket.objetos.keys()].filter((k) => k.startsWith('history/6260/')).sort().at(-1));
  assert.equal(snap.fontes.length, 6 + 487);
  assert.equal(snap.fontes.find((f) => f.id === 'ac01392').url, undefined, 'estrato sem url no snapshot');
  const gov = lerObj(amb.bucket, 'live/gov-ac.json');
  assert.equal(gov.estratos_coletados, 22);
  assert.equal(gov.estratificacao, null);
  // 1 snapshot de governador por invocacao (nao por ciclo)
  assert.equal([...amb.bucket.objetos.keys()].filter((k) => k.startsWith('history/6260/')).length, 2);
  assert.deepEqual((await verificarCadeia(amb.bucket.leitor())).erros, []);

  // sem mudanca: 304 nos estratos, nenhuma escrita
  amb.bucket.limparLog();
  avancar(60_000);
  await rodar(amb, { ciclos: 2, intervaloMs: 0, forecaster });
  assert.equal(amb.bucket.log.length, 0);
  assert.ok(reqEstratos(amb).some((q) => q.headers['If-None-Match']));
});

test('orcamento de subrequests e prazo da invocacao limitam o trabalho', async () => {
  const amb = novoAmbiente('staging', { SUBREQUEST_ORCAMENTO: '200' });
  apurar(amb, 30);
  publicarEstratosSinteticos(amb, 30);
  const r = await rodar(amb, { ciclos: 4, intervaloMs: 0 });
  assert.ok(r.subrequests_tse <= 200, `usou ${r.subrequests_tse}`);
  assert.ok(reqEstratos(amb).length < 244);

  const amb2 = novoAmbiente();
  apurar(amb2, 30);
  let t = Date.parse('2026-10-25T22:00:00Z');
  const r2 = await rodar(amb2, { ciclos: 4, intervaloMs: 15_000, prazoMs: 30_000, agora: () => (t += 20_000) });
  assert.ok(r2.ciclos < 4, `ciclos=${r2.ciclos}`);
  assert.equal(r2.commits.length, 2, 'ainda faz o commit final');
});

test('lista de estratos indisponivel: aviso e governador em modo UF; lista pre-existente no R2 e reaproveitada', async () => {
  const amb = novoAmbiente();
  apurar(amb, 30);
  const r = await rodar(amb);
  assert.match(r.avisos[0], /estratos/);
  assert.equal(r.commits.length, 2);

  const amb2 = novoAmbiente();
  apurar(amb2, 30);
  amb2.tse.definir(CFG_URL, '{lixo');
  assert.match((await rodar(amb2)).avisos[0], /estratos/);
  await amb2.bucket.put('state/estratos-6260.json', JSON.stringify({ estratos: estratosDoConfig(lerFixture('6260/config/mun-e006260-cm.json')).slice(0, 3) }));
  amb2.tse.requisicoes.length = 0;
  await rodar(amb2);
  assert.ok(!amb2.tse.requisicoes.some((q) => q.url === CFG_URL), 'nao rebaixa a config');
});

test('producao: municipais so depois do 1o dado real', async () => {
  const amb = novoAmbiente('production');
  amb.tse.definir(CFG_URL, fixtureTexto('6260/config/mun-e006260-cm.json'));
  amb.tse.definir(urlTse('6258', 'br', 1), fixtureTexto('6258/dados/br/br-c0001-e006258-u.json'));
  await rodar(amb);
  assert.deepEqual(amb.tse.requisicoes.map((q) => q.url), [urlTse('6258', 'br', 1)]);
  assert.equal(amb.bucket.objetos.size, 0);
});

function prepararReal(amb, helpers) {
  const { parcialDeBaseline, baselinePresidente, baselineGovernador, sintetizar: sint } = helpers;
  definirRelogio('2026-10-25T22:31:00Z'); // 19:31 BRT; arquivos com hg 19:30:00

  // presidente: 27 UFs + zz a partir da baseline; BR = copia de uma UF com tpabr/cdabr de BR
  const pres = parcialDeBaseline(baselinePresidente, { frac: 0.6, ele: '6258' });
  for (const [uf, j] of Object.entries(pres)) amb.tse.definir(urlTse('6258', uf, 1), j);
  amb.tse.definir(urlTse('6258', 'br', 1), { ...pres.sp, tpabr: 'br', cdabr: 'br' });

  // governadores: estratos da baseline + arquivo da UF (soma dos estratos) + config municipal
  const cfg = { abr: [] };
  for (const uf of GOV_UFS) {
    const base = baselineGovernador(uf);
    const est = parcialDeBaseline(base, { frac: 0.6, ele: '6260' });
    const ids = Object.keys(est);
    const mu = uf === 'df' ? [{ cd: '97012', z: ids.map((i) => i.split('-z')[1]) }] : ids.map((i) => ({ cd: i.slice(2) }));
    cfg.abr.push({ cd: uf, mu });
    let [te, tes, ts, tst] = [0, 0, 0, 0];
    const [c1, c2] = base.corrida.finalistas;
    const votos = { [c1.n]: 0, [c2.n]: 0 };
    for (const [id, j] of Object.entries(est)) {
      const o = JSON.parse(JSON.stringify(j));
      if (uf !== 'df') { o.tpabr = 'mu'; o.cdabr = id.slice(2); }
      te += Number(j.e.te); tes += Number(j.e.est); ts += Number(j.s.ts); tst += Number(j.s.st);
      for (const c of j.carg[0].agr[0].par[0].cand) votos[c.n] += Number(c.vap);
      const e = estratosDoConfig(cfg).find((x) => x.id === id);
      if (e) amb.tse.definir(e.url, o);
    }
    amb.tse.definir(urlTse('6260', uf, 3), sint({
      ele: '6260', tpabr: 'uf', cdabr: uf, te, est: tes, ts, st: tst,
      cands: [c1, c2].map((c) => ({ n: c.n, nmu: c.nmu, nm: c.nm, vap: votos[c.n] })),
    }));
  }
  for (const uf of GOV_UFS) { // sint() marca cd '1' para cdabr de 2 letras: corrige para governador
    const u = urlTse('6260', uf, 3);
    const j = JSON.parse(amb.tse.arquivos.get(u).texto);
    j.carg[0].cd = '3';
    amb.tse.definir(u, j);
  }
  amb.tse.definir(CFG_URL, cfg);

}

// ----------------------------------------------------------------------------------------------
// Integracao com o modelo REAL (model/index.mjs) e dados sinteticos derivados das baselines do proprio modelo.
test('integracao real com model/index.mjs: presidente e 6 governadores projetam, latest <= 3 KB gz, cadeia valida', async (t) => {
  let helpers;
  let modelo;
  try {
    helpers = await import('../../model/test/helpers.mjs');
    modelo = await import('../../model/index.mjs');
  } catch {
    t.skip('model/ indisponivel');
    return;
  }
  const { parcialDeBaseline, baselinePresidente, baselineGovernador, sintetizar: sint } = helpers;
  const amb = novoAmbiente();
  prepararReal(amb, helpers);
  const forecaster = criarForecaster(); // import real de ../../model/index.mjs
  const r1 = await rodar(amb, { ciclos: 4, intervaloMs: 0, forecaster });
  assert.deepEqual(r1.erros, []);
  avancar(60_000);
  const r2 = await rodar(amb, { ciclos: 4, intervaloMs: 0, forecaster });
  assert.deepEqual(r2.erros, []);
  assert.ok(r1.stale.length === 0 && r2.stale.length === 0, `stale: ${r1.stale} ${r2.stale}`);

  const heads = Object.fromEntries(['6258', '6260'].map((e) => [e, lerObj(amb.bucket, lerObj(amb.bucket, 'live/manifest.json').cadeias[e].chave)]));
  assert.equal(heads['6258'].modelo.versao, modelo.VERSAO);
  assert.ok(heads['6258'].forecast, `presidente sem forecast: ${heads['6258'].criterios_nao_atendidos}`);
  assert.equal(heads['6258'].modelo.calibracao_sha256, CALIBRACAO_SHA256);
  assert.equal(heads['6258'].modelo.metodo, 'presidente');
  assert.equal(heads['6258'].forecast.metodo, 'presidente');
  assert.ok(heads['6258'].forecast.erro_medio_esperado.projecao > 0 && heads['6258'].forecast.erro_medio_esperado.parcial > 0);
  assert.ok(Math.abs(Object.values(heads['6258'].forecast.projecao).reduce((a, b) => a + b, 0) - 100) < 0.05);
  assert.ok(heads['6258'].forecast.meia_largura_pp > 0 && heads['6258'].forecast.confianca);
  assert.deepEqual(Object.keys(heads['6260'].forecast).sort(), [...GOV_UFS].sort(), JSON.stringify(heads['6260'].criterios_nao_atendidos));
  for (const uf of GOV_UFS) assert.equal(heads['6260'].analise[uf].estratos_completos, true);
  assert.equal(heads['6260'].analise.df.estratificacao, 'governador_zonas');
  assert.equal(heads['6260'].analise.ac.estratificacao, 'governador');

  const latest = lerObj(amb.bucket, 'live/latest.json');
  const gz = gzipSync(amb.bucket.texto('live/latest.json')).length;
  assert.ok(gz <= 3072, `latest.json ${gz} B gz`);
  assert.ok(latest.presidente.forecast.projecao && latest.presidente.faixa_meia_largura_pp > 0 && latest.presidente.modelo_versao === modelo.VERSAO);
  for (const uf of GOV_UFS) {
    assert.ok(latest.governadores[uf].forecast, uf);
    assert.equal(latest.governadores[uf].confianca, latest.governadores[uf].forecast.confianca);
  }
  const lp = latest.presidente;
  assert.equal(lp.metodo, 'presidente');
  assert.deepEqual(Object.keys(lp.erro_medio_esperado).sort(), ['parcial', 'projecao']);
  assert.ok(lp.correcao_pp && 'delta' in lp.correcao_pp);
  assert.equal(lp.modelo_calibracao, modelo.MODELO.calibracao);
  for (const uf of GOV_UFS) {
    assert.ok(latest.governadores[uf].erro_medio_esperado.projecao > 0, uf);
    assert.match(latest.governadores[uf].metodo, /^governador/);
  }
  const g = lerObj(amb.bucket, 'live/gov-rn.json');
  assert.ok(g.erro_medio_esperado.parcial > 0 && g.metodo.startsWith('governador') && g.modelo.calibracao_sha256 === CALIBRACAO_SHA256);
  assert.ok(g.forecast.candidatos.length === 2 && g.apurado.eleitorado_pct > 0 && g.estratos_coletados === 167);
  const serie = lerObj(amb.bucket, 'live/series.json');
  assert.ok(serie.presidente.at(-1).f.m > 0 && serie.governadores.to.at(-1).f.p);
  assert.deepEqual((await verificarCadeia(amb.bucket.leitor())).erros, []);
  void UFS;
});

async function rodarReal(amb) {
  const forecaster = criarForecaster();
  await rodar(amb, { ciclos: 4, intervaloMs: 0, forecaster });
  avancar(60_000);
  await rodar(amb, { ciclos: 4, intervaloMs: 0, forecaster });
  const m = lerObj(amb.bucket, 'live/manifest.json');
  return lerObj(amb.bucket, m.cadeias['6260'].chave);
}

test('frescor medido contra a UF: municipio velho 100% totalizado nao derruba; UF velha derruba', async (t) => {
  let helpers;
  try {
    helpers = await import('../../model/test/helpers.mjs');
  } catch {
    t.skip('model/ indisponivel');
    return;
  }

  // A) municipio de AC com dg antigo (2 h) e 100% das secoes totalizadas: forecast de AC continua
  const a = novoAmbiente();
  prepararReal(a, helpers);
  const cfg = JSON.parse(a.tse.arquivos.get(CFG_URL).texto);
  const alvo = estratosDoConfig(cfg).find((e) => e.uf === 'ac');
  const j = JSON.parse(a.tse.arquivos.get(alvo.url).texto);
  j.dg = '25/10/2026';
  j.hg = '17:30:00'; // 2 h mais velho que a UF (19:30)
  j.s.st = j.s.ts;
  j.s.snt = '0';
  a.tse.definir(alvo.url, j);
  const headA = await rodarReal(a);
  assert.ok(headA.forecast.ac, `AC deveria projetar: ${JSON.stringify(headA.criterios_nao_atendidos)}`);
  assert.equal(headA.analise.ac.estratos_completos, true);

  // B) arquivo da UF velho (> 300 s antes de agora): AC perde o forecast, as demais UFs seguem
  const b = novoAmbiente();
  prepararReal(b, helpers);
  const urlUf = urlTse('6260', 'ac', 3);
  const uf = JSON.parse(b.tse.arquivos.get(urlUf).texto);
  uf.hg = '17:00:00';
  b.tse.definir(urlUf, uf);
  const headB = await rodarReal(b);
  assert.equal(headB.forecast.ac, undefined);
  assert.ok(headB.criterios_nao_atendidos.ac.length > 0, 'criterio de frescor/dispersao citado');
  assert.ok(headB.forecast.am && headB.forecast.rn);
});

test('CALIBRACAO_SHA256 do coletor bate com o hash real de model/calibracao.mjs (falha se a calibracao mudar)', () => {
  const hash = createHash('sha256').update(readFileSync(new URL('../../model/calibracao.mjs', import.meta.url))).digest('hex');
  assert.equal(hash, CALIBRACAO_SHA256);
});
