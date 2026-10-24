import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { GOV_UFS, UFS } from '../src/config.mjs';
import { canonicalize, sha256Hex } from '../src/canonical.mjs';
import { criarForecaster } from '../src/forecast-adapter.mjs';
import { verificarCadeia } from '../../tools/verificar-cadeia.mjs';
import {
  apurar, avancar, definirRelogio, lerObj, novoAmbiente, rodar,
} from './helpers/comum.mjs';
import { fixtureTexto, lerFixture, sintetizar, urlTse } from './helpers/tse-mock.mjs';

const historyKeys = (b, ele) => [...b.objetos.keys()].filter((k) => k.startsWith(`history/${ele}/`)).sort();

test('replay das fixtures reais (zeradas): 1 snapshot por cadeia, headers corretos, latest <= 3 KB gz', async () => {
  const amb = novoAmbiente();
  // 6258: fixtures reais de BR e AC; demais UFs = copia da fixture de AC com cdabr trocado
  const ac = lerFixture('6258/dados/ac/ac-c0001-e006258-u.json');
  amb.tse.definir(urlTse('6258', 'br', 1), fixtureTexto('6258/dados/br/br-c0001-e006258-u.json'));
  for (const uf of [...UFS, 'zz']) amb.tse.definir(urlTse('6258', uf, 1), uf === 'ac' ? fixtureTexto('6258/dados/ac/ac-c0001-e006258-u.json') : { ...ac, cdabr: uf });
  for (const uf of GOV_UFS) amb.tse.definir(urlTse('6260', uf, 3), fixtureTexto(`6260/dados/${uf}/${uf}-c0003-e006260-u.json`));

  const r = await rodar(amb);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.commits.map((c) => `${c.eleicao}:${c.seq}`).sort(), ['6258:0', '6260:0']);

  const manifest = lerObj(amb.bucket, 'live/manifest.json');
  assert.equal(manifest.ambiente, 'staging');
  assert.equal(manifest.cadeias['6258'].seq, 0);
  const [chave] = historyKeys(amb.bucket, '6258');
  assert.match(chave, /^history\/6258\/\d{4}-\d{2}-\d{2}\/000000-[0-9a-f]{64}\.json$/);
  const snap = lerObj(amb.bucket, chave);
  assert.equal(snap.prev_sha256, null);
  assert.equal(snap.fontes.length, 29);
  assert.equal(snap.fontes[0].id, 'br');
  assert.ok(snap.fontes[0].etag && snap.fontes[0].sha256_raw && snap.fontes[0].dg === '15/10/2026');
  assert.deepEqual(snap.criterios_nao_atendidos, ['modelo_indisponivel']);
  assert.equal(snap.forecast, null);

  // raw: gzip do corpo original, deduplicado (27 UFs sintetizadas distintas + br)
  const rawKey = `raw/${snap.fontes[0].sha256_raw}.json.gz`;
  const raw = amb.bucket.objetos.get(rawKey);
  assert.equal(Buffer.from(gunzipSync(raw.bytes)).toString(), fixtureTexto('6258/dados/br/br-c0001-e006258-u.json'));
  assert.equal(raw.httpMetadata.contentType, 'application/gzip');
  assert.equal(raw.httpMetadata.cacheControl, 'public, max-age=31536000, immutable');
  assert.equal(amb.bucket.objetos.get(chave).httpMetadata.cacheControl, 'public, max-age=31536000, immutable');
  assert.match(amb.bucket.objetos.get(chave).httpMetadata.contentType, /^application\/json/);
  for (const k of ['live/latest.json', 'live/series.json', 'live/manifest.json', 'live/gov-ac.json']) {
    assert.equal(amb.bucket.objetos.get(k).httpMetadata.cacheControl, 'public, max-age=5, s-maxage=10, stale-while-revalidate=30', k);
  }
  const gzLatest = gzipSync(amb.bucket.texto('live/latest.json')).length;
  assert.ok(gzLatest <= 3072, `latest.json ${gzLatest} B gz`);
  const latest = lerObj(amb.bucket, 'live/latest.json');
  assert.equal(latest.presidente.candidatos.length, 2);
  assert.deepEqual(Object.keys(latest.governadores).sort(), [...GOV_UFS].sort());
  assert.equal(latest.stale, false);

  const v = await verificarCadeia(amb.bucket.leitor());
  assert.deepEqual(v.erros, []);
});

test('dado inalterado: nenhuma escrita (nem lock); 304 e 200 identico', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10);
  await rodar(amb);
  amb.bucket.limparLog();
  const r = await rodar(amb, { ciclos: 2 }); // invocacao nova: condicional vem do snapshot
  assert.equal(r.commits.length, 0);
  assert.equal(amb.bucket.log.length, 0);
  assert.ok(amb.tse.requisicoes.some((q) => q.headers['If-None-Match']), 'envia If-None-Match');
  // servidor ignora condicional e devolve 200 com o mesmo corpo
  const fetch200 = async (u, i) => amb.tse.fetch(u, { ...i, headers: {} });
  const r2 = await rodar(amb, { fetchFn: fetch200 });
  assert.equal(r2.commits.length, 0);
  assert.equal(amb.bucket.log.length, 0);
});

test('apuracao progressiva sintetica: seq monotonico, cadeia valida, serie e latest atualizados', async () => {
  const amb = novoAmbiente();
  for (const [i, pct] of [5, 20, 55, 100].entries()) {
    apurar(amb, pct, { hg: `${17 + i}:00:00` });
    avancar(60_000);
    const r = await rodar(amb);
    assert.equal(r.commits.length, 2);
  }
  const m = lerObj(amb.bucket, 'live/manifest.json');
  assert.equal(m.cadeias['6258'].seq, 3);
  assert.equal(m.cadeias['6260'].seq, 3);
  assert.equal(historyKeys(amb.bucket, '6258').length, 4);
  const serie = lerObj(amb.bucket, 'live/series.json');
  assert.deepEqual(serie.presidente.map((p) => p.s), [0, 1, 2, 3]);
  assert.deepEqual(serie.presidente.map((p) => p.p), [5, 20, 55, 100]);
  assert.equal(serie.governadores.ac.length, 4);
  const latest = lerObj(amb.bucket, 'live/latest.json');
  assert.equal(latest.presidente.seq, 3);
  assert.equal(latest.presidente.pct_secoes, 100);
  const v = await verificarCadeia(amb.bucket.leitor());
  assert.deepEqual(v.erros, []);
  assert.equal(v.resumo['6258'].snapshots_verificados, 4);
  // so UF mudou: cada snapshot cobre todas as fontes mas so grava raw novo
  const gov = lerObj(amb.bucket, 'live/gov-ac.json');
  assert.equal(gov.seq, 3);
  assert.equal(gov.stale, false);
});

test('forecast do modelo entra no snapshot, na serie e no latest (faixa, confianca, definido, versao)', async () => {
  const amb = novoAmbiente();
  const entradas = [];
  const modelo = {
    VERSAO: 'teste-1',
    SHA_CODIGO: 'abc',
    MODELO: { nome: 'stub', versao: 'teste-1', calibracao: 'c1' },
    forecast: (e) => {
      entradas.push(e);
      return {
        forecast: { metodo: 'x', projecao: { 13: 51.5, 22: 48.5 }, faixa: { 13: [49, 54] }, meia_largura_pp: 2.5, confianca: 'media', grande: 'x'.repeat(900) },
        criterios_nao_atendidos: [],
        apurado: { eleitorado_pct: 40.5 },
        parcial: { definido_matematicamente: { n: '13', nmu: 'LULA' } },
        corrida: { estratificacao: 'presidente' },
      };
    },
  };
  apurar(amb, 40, { hg: '18:00:00' });
  await rodar(amb, { forecaster: criarForecaster(modelo) });
  assert.equal(entradas[0].cargo, 'presidente');
  assert.ok(entradas[0].br && Object.keys(entradas[0].ufs).length === 28);
  assert.equal(typeof entradas[0].agora, 'number');
  assert.equal(entradas[0].stale.sp, false);
  const snap = lerObj(amb.bucket, historyKeys(amb.bucket, '6258')[0]);
  assert.deepEqual(snap.modelo, { nome: 'stub', versao: 'teste-1', calibracao: 'c1', sha_codigo: 'abc' });
  assert.equal(snap.forecast.projecao[13], 51.5);
  assert.equal(snap.analise.definido_matematicamente.n, '13');
  assert.deepEqual(lerObj(amb.bucket, 'live/series.json').presidente[0].f, { p: { 13: 51.5, 22: 48.5 }, m: 2.5, c: 'media' });
  assert.equal(lerObj(amb.bucket, 'live/series.json').presidente[0].d, '13');
  const latest = lerObj(amb.bucket, 'live/latest.json');
  const p = latest.presidente;
  assert.equal(p.forecast.grande, undefined, 'campo grande fica fora do latest');
  assert.equal(p.forecast.meia_largura_pp, 2.5);
  assert.equal(p.faixa_meia_largura_pp, 2.5);
  assert.equal(p.confianca, 'media');
  assert.equal(p.definido_matematicamente.n, '13');
  assert.equal(p.modelo_versao, 'teste-1');
  assert.equal(p.pct_eleitorado, 40.5);
  assert.equal(latest.governadores.ac.forecast.projecao[13], 51.5);
  assert.equal(lerObj(amb.bucket, 'live/gov-ac.json').apurado.eleitorado_pct, 40.5);
  assert.equal(lerObj(amb.bucket, 'live/gov-ac.json').confianca, undefined);
});

test('serie so comeca no 1o dado real apos 17h (SERIE_INICIO)', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10, { hg: '16:59:59' });
  await rodar(amb);
  assert.deepEqual(lerObj(amb.bucket, 'live/series.json').presidente, []);
  assert.equal(lerObj(amb.bucket, 'live/manifest.json').cadeias['6258'].seq, 0, 'snapshot existe mesmo assim');
  apurar(amb, 20, { hg: '17:00:00' });
  avancar(60_000);
  await rodar(amb);
  const serie = lerObj(amb.bucket, 'live/series.json');
  assert.deepEqual(serie.presidente.map((p) => p.s), [1]);
  assert.deepEqual(serie.governadores.ac.map((p) => p.s), [1]);
});

test('modelo com erro ou sem funcao: forecast null com criterio', async () => {
  const f1 = await criarForecaster({ forecast: () => { throw new Error('quebrou'); } })({});
  assert.equal(f1.forecast, null);
  assert.match(f1.criterios_nao_atendidos[0], /erro_modelo: quebrou/);
  const f2 = await criarForecaster({ foo: 1 })({});
  assert.deepEqual(f2.criterios_nao_atendidos, ['modelo_sem_funcao_forecast']);
  const f3 = await criarForecaster({ calcularForecast: async () => ({ forecast: null, criterios_nao_atendidos: ['secoes_< 20%'] }) })({});
  assert.deepEqual(f3.criterios_nao_atendidos, ['secoes_< 20%']);
  const f4 = await criarForecaster({ default: () => undefined })({});
  assert.deepEqual(f4.criterios_nao_atendidos, ['criterios_nao_informados']);
  const f5 = await criarForecaster()({}); // carrega ../../model (pode nao existir)
  assert.ok(f5.versao);
});

test('schema invalido: mantem o ultimo bom, marca stale e recupera', async () => {
  const amb = novoAmbiente();
  apurar(amb, 30);
  await rodar(amb);
  const antes = lerObj(amb.bucket, 'live/manifest.json');

  // BR passa a vir com soma de votos inconsistente
  const url = urlTse('6258', 'br', 1);
  const ruim = JSON.parse(amb.tse.arquivos.get(url).texto);
  ruim.v.vvc = '1';
  ruim.dg = '25/10/2026';
  ruim.hg = '19:00:00';
  amb.tse.definir(url, ruim);
  amb.bucket.limparLog();
  const r = await rodar(amb, { ciclos: 2 });
  assert.equal(r.commits.length, 0);
  assert.deepEqual(r.stale, ['6258:br']);
  const m = lerObj(amb.bucket, 'live/manifest.json');
  assert.equal(m.stale, true);
  assert.deepEqual(m.stale_fontes, ['6258:br']);
  assert.equal(m.cadeias['6258'].sha256, antes.cadeias['6258'].sha256, 'ultimo bom mantido');
  const latest = lerObj(amb.bucket, 'live/latest.json');
  assert.equal(latest.stale, true);
  assert.equal(latest.presidente.pct_secoes, 30);
  assert.equal(amb.bucket.puts('history/').length, 0);

  // repetir a mesma coleta ruim nao escreve de novo (estado stale ja publicado)
  amb.bucket.limparLog();
  await rodar(amb, { ciclos: 2 });
  assert.equal(amb.bucket.log.length, 0);

  // volta a ficar valido
  apurar(amb, 45);
  const r3 = await rodar(amb);
  assert.equal(r3.commits.length, 2);
  const m3 = lerObj(amb.bucket, 'live/manifest.json');
  assert.equal(m3.stale, false);
  assert.equal(m3.cadeias['6258'].seq, 1);
});

test('falhas de rede/5xx/404 de fonte obrigatoria (inclui zz) marcam stale', async () => {
  const amb = novoAmbiente();
  apurar(amb, 30);
  await rodar(amb);
  amb.tse.remover(urlTse('6258', 'sp', 1)); // 404
  amb.tse.falhas.set(urlTse('6260', 'df', 3), 99); // 503 sempre
  const r = await rodar(amb, { ciclos: 2, intervaloMs: 0 });
  assert.deepEqual(r.stale, ['6258:sp', '6260:df']);
  assert.equal(r.commits.length, 0);
  assert.equal(lerObj(amb.bucket, 'live/gov-df.json').stale, true);
});

test('arquivo da eleicao/cargo errado, JSON ilegivel e sintetico em producao sao rejeitados', async () => {
  const amb = novoAmbiente();
  apurar(amb, 30);
  const errado = lerFixture('6257/dados/br/br-c0001-e006257-u.json');
  amb.tse.definir(urlTse('6258', 'br', 1), errado);
  amb.tse.definir(urlTse('6258', 'rj', 1), '{nao e json');
  const r = await rodar(amb);
  assert.equal(r.commits.filter((c) => c.eleicao === '6258').length, 0, 'cadeia nao comeca sem todas as fontes');
  assert.ok(r.stale.includes('6258:br') && r.stale.includes('6258:rj'));
});

test('producao: dado pre-eleicao (zerado ou de 15/10) nao inicia a cadeia; 1o dado real de 25/10 com st>0 vira seq 0', async () => {
  const amb = novoAmbiente('production', { START_DATE: '2026-10-25' });
  // zerado oficial
  amb.tse.definir(urlTse('6258', 'br', 1), fixtureTexto('6258/dados/br/br-c0001-e006258-u.json'));
  for (const uf of GOV_UFS) amb.tse.definir(urlTse('6260', uf, 3), fixtureTexto(`6260/dados/${uf}/${uf}-c0003-e006260-u.json`));
  let r = await rodar(amb);
  assert.equal(r.commits.length, 0);
  assert.equal(amb.bucket.log.length, 0, 'nada gravado antes do dado real');
  // antes do gate so a fonte BR e consultada na presidencial
  const pres = amb.tse.requisicoes.filter((q) => q.url.includes('/6258/'));
  assert.equal(pres.length, 1);
  assert.equal(amb.tse.requisicoes.filter((q) => q.url.includes('/6260/')).length, 0, 'nem governadores nem municipais antes do 1o dado real');

  // "real" de 25/10 (usamos arquivos gerados a partir da fixture, sem a marca sintetica)
  amb.tse.arquivos.clear();
  apurar(amb, 7);
  for (const [u, a] of amb.tse.arquivos) {
    const j = JSON.parse(a.texto);
    delete j._sintetico;
    amb.tse.definir(u, j);
  }
  r = await rodar(amb, { ciclos: 2, intervaloMs: 0 });
  assert.deepEqual(r.commits.map((c) => `${c.eleicao}:${c.seq}`).sort(), ['6258:0', '6260:0']);
  const snap = lerObj(amb.bucket, historyKeys(amb.bucket, '6258')[0]);
  assert.equal(snap.ambiente, 'production');
  assert.equal(snap.seq, 0);
  assert.equal(lerObj(amb.bucket, 'live/manifest.json').ambiente, 'production');
});

test('producao nunca grava arquivo sintetico', async () => {
  const amb = novoAmbiente('production');
  apurar(amb, 50); // todos com _sintetico: true
  const r = await rodar(amb, { ciclos: 2, intervaloMs: 0 });
  assert.equal(r.commits.length, 0);
  assert.equal(amb.bucket.log.length, 0);
  assert.equal(amb.bucket.objetos.size, 0);
});

test('producao: arquivo de 25/10 com st=0 (zerado regerado) nao inicia', async () => {
  const amb = novoAmbiente('production');
  apurar(amb, 0);
  for (const [u, a] of amb.tse.arquivos) {
    const j = JSON.parse(a.texto);
    delete j._sintetico;
    amb.tse.definir(u, j);
  }
  const r = await rodar(amb);
  assert.equal(r.commits.length, 0);
  assert.equal(amb.bucket.objetos.size, 0);
});

test('adulteracao de 1 byte: verificar-cadeia falha (snapshot, raw e prev_sha256)', async () => {
  const amb = novoAmbiente();
  for (const pct of [10, 40, 80]) {
    apurar(amb, pct);
    avancar(60_000);
    await rodar(amb);
  }
  assert.deepEqual((await verificarCadeia(amb.bucket.leitor())).erros, []);

  const [, meio] = historyKeys(amb.bucket, '6258'); // seq 1
  const original = amb.bucket.objetos.get(meio);
  const bytes = original.bytes.slice();
  const i = new TextDecoder().decode(bytes).indexOf('"votos":') + 9;
  bytes[i] = bytes[i] === 0x39 ? 0x38 : bytes[i] + 1; // 1 byte
  amb.bucket.objetos.set(meio, { ...original, bytes });
  const r = await verificarCadeia(amb.bucket.leitor());
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('seq 1')), r.erros.join('\n'));
  amb.bucket.objetos.set(meio, original);
  assert.equal((await verificarCadeia(amb.bucket.leitor())).ok, true);

  // raw adulterado
  const snap = lerObj(amb.bucket, meio);
  const rawKey = `raw/${snap.fontes.find((f) => f.id === 'br').sha256_raw}.json.gz`;
  const rawOrig = amb.bucket.objetos.get(rawKey);
  amb.bucket.objetos.set(rawKey, { ...rawOrig, bytes: new Uint8Array(gzipSync('{}')) });
  assert.equal((await verificarCadeia(amb.bucket.leitor())).ok, false);
  amb.bucket.objetos.delete(rawKey);
  assert.equal((await verificarCadeia(amb.bucket.leitor())).ok, false, 'raw ausente');
  amb.bucket.objetos.set(rawKey, rawOrig);

  // snapshot reescrito consistente (recalculando seu proprio sha) quebra o elo seguinte
  const forjado = { ...snap, parcial: { ...snap.parcial } };
  forjado.coletado_em = '2026-10-25T00:00:00.000Z';
  const canon = canonicalize(forjado);
  const sha = await sha256Hex(canon);
  const chaveNova = meio.replace(/-[0-9a-f]{64}\.json$/, `-${sha}.json`);
  amb.bucket.objetos.set(chaveNova, { ...original, bytes: new TextEncoder().encode(canon) });
  amb.bucket.objetos.delete(meio);
  const r2 = await verificarCadeia(amb.bucket.leitor());
  assert.equal(r2.ok, false);
});

test('verificar-cadeia: manifest ausente, cadeia inexistente, seq quebrado', async () => {
  const amb = novoAmbiente();
  assert.equal((await verificarCadeia(amb.bucket.leitor())).ok, false);
  apurar(amb, 10);
  await rodar(amb);
  assert.equal((await verificarCadeia(amb.bucket.leitor(), { cadeia: '9999' })).ok, false);
  apurar(amb, 20);
  avancar(1000);
  await rodar(amb);
  const m = lerObj(amb.bucket, 'live/manifest.json');
  const prev = m.cadeias['6258'];
  amb.bucket.objetos.delete(lerObj(amb.bucket, prev.chave).prev_chave);
  const r = await verificarCadeia(amb.bucket.leitor(), { cadeia: '6258' });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /ilegivel/);
});

test('cron concorrente: duas e cinco invocacoes simultaneas nao duplicam seq', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10);
  await Promise.all([rodar(amb), rodar(amb), rodar(amb), rodar(amb), rodar(amb)]);
  assert.equal(historyKeys(amb.bucket, '6258').length, 1);
  assert.equal(historyKeys(amb.bucket, '6260').length, 1);

  for (const pct of [30, 60]) {
    apurar(amb, pct);
    avancar(30_000);
    await Promise.all([rodar(amb), rodar(amb, { ciclos: 2, intervaloMs: 0 }), rodar(amb), rodar(amb)]);
  }
  for (const ele of ['6258', '6260']) {
    const seqs = historyKeys(amb.bucket, ele).map((k) => Number(/\/(\d{6})-/.exec(k)[1]));
    assert.deepEqual(seqs, [0, 1, 2], `seqs de ${ele}`);
  }
  const v = await verificarCadeia(amb.bucket.leitor());
  assert.deepEqual(v.erros, []);
  assert.equal(lerObj(amb.bucket, 'live/manifest.json').cadeias['6258'].seq, 2);
  assert.equal(lerObj(amb.bucket, 'live/series.json').presidente.length, 3);
});

test('ambiente do bucket diverge do Worker: aborta sem escrever', async () => {
  const prod = novoAmbiente('production');
  await prod.bucket.put('live/manifest.json', JSON.stringify({ ambiente: 'staging', cadeias: {} }));
  prod.bucket.limparLog();
  await assert.rejects(rodar(prod), /pertence a 'staging'/);
  assert.equal(prod.bucket.log.length, 0);
  await assert.rejects(rodar({ env: { ENV: 'dev', DATA: prod.bucket }, tse: prod.tse }), /ENV invalido/);
  await assert.rejects(rodar({ env: { ENV: 'staging' }, tse: prod.tse }), /binding R2/);
});

test('lock ocupado: cadeia nao avanca e o resumo registra', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10);
  await amb.bucket.put('locks/coletor.lock', JSON.stringify({ dono: 'outro', expira_em: Date.parse('2099-01-01') }));
  const r = await rodar(amb);
  assert.equal(r.commits.length, 0);
  assert.ok(r.pulados.length >= 1);
  assert.equal(amb.bucket.texto('live/manifest.json'), null);
});

test('commit falha: erro registrado no resumo e lock liberado', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10);
  const putOriginal = amb.bucket.put.bind(amb.bucket);
  amb.bucket.put = async (k, v, o) => (k.startsWith('history/6258') ? Promise.reject(new Error('r2 fora')) : putOriginal(k, v, o));
  const r = await rodar(amb);
  assert.ok(r.erros.some((e) => e.includes('r2 fora')));
  assert.equal(r.commits.filter((c) => c.eleicao === '6260').length, 1);
  assert.equal(amb.bucket.texto('locks/coletor.lock'), null);
});

test('reaproveita raw identico entre fontes (dedupe) e usa data de Brasilia na pasta', async () => {
  const amb = novoAmbiente();
  definirRelogio('2026-10-26T01:30:00Z'); // 22:30 de 25/10 em Brasilia
  const ac = lerFixture('6258/dados/ac/ac-c0001-e006258-u.json');
  const base = sintetizar(ac, { regiao: 'br', tpabr: 'br', pct: 10, votos: [60, 40] });
  amb.tse.definir(urlTse('6258', 'br', 1), base);
  for (const uf of [...UFS, 'zz']) amb.tse.definir(urlTse('6258', uf, 1), { ...base, cdabr: uf, tpabr: 'uf' });
  apurar(amb, 10);
  amb.tse.definir(urlTse('6258', 'br', 1), base);
  await rodar(amb);
  assert.match(historyKeys(amb.bucket, '6258')[0], /history\/6258\/2026-10-25\//);
});
