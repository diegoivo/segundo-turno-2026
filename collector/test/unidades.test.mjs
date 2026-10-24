import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalize, dataBrasilia, gunzipBytes, gzipBytes, num, parseDgHg, sha256Hex } from '../src/canonical.mjs';
import { adquirirLock, conferirLock, liberarLock } from '../src/lock.mjs';
import worker, { tratarHttp } from '../src/index.mjs';
import { buscarArquivo, executarPaced } from '../src/tse-fetch.mjs';
import { compactar, validarArquivo } from '../src/validate.mjs';
import { anexarSerie } from '../src/live.mjs';
import { resumoForecast } from '../src/live.mjs';
import { estratosDoConfig } from '../src/config.mjs';
import { MockR2 } from './helpers/mock-r2.mjs';
import { lerFixture, sintetizar } from './helpers/tse-mock.mjs';

const semEspera = async () => {};
const ESP = { ele: '6258', cd: '1', tpabr: 'br', cdabr: 'br', nCandidatos: 2 };
const base = () => sintetizar(lerFixture('6258/dados/br/br-c0001-e006258-u.json'), { regiao: 'br', tpabr: 'br', pct: 40, votos: [600, 400] });

test('canonical: ordena chaves, sha conhecido, gzip ida e volta, numeros e datas', async () => {
  assert.equal(canonicalize({ b: 1, a: [2, { d: undefined, c: null }], u: undefined }), '{"a":[2,{"c":null}],"b":1}');
  assert.equal(canonicalize([undefined]), '[null]');
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const z = await gzipBytes('ola mundo');
  assert.equal(new TextDecoder().decode(await gunzipBytes(z)), 'ola mundo');
  assert.equal(num('47,027772356'), 47.027772356);
  assert.equal(num(5), 5);
  assert.ok(Number.isNaN(num('x')) && Number.isNaN(num(null)) && Number.isNaN(num('1.234,5')));
  assert.equal(parseDgHg('25/10/2026', '18:05:03').toISOString(), '2026-10-25T21:05:03.000Z');
  assert.equal(parseDgHg('32/13/2026', '18:05:03'), null);
  assert.equal(parseDgHg('x', 'y'), null);
  assert.equal(dataBrasilia(new Date('2026-10-26T01:00:00Z')), '2026-10-25');
});

test('validar: arquivo bom passa; cada inconsistencia e detectada', () => {
  assert.deepEqual(validarArquivo(base(), ESP), []);
  const quebra = (fn, trecho) => {
    const j = base();
    fn(j);
    const erros = validarArquivo(j, ESP);
    assert.ok(erros.some((e) => e.includes(trecho)), `${trecho} em ${JSON.stringify(erros)}`);
  };
  const cands = (j) => j.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand));
  assert.deepEqual(validarArquivo(null, ESP), ['nao e objeto']);
  assert.deepEqual(validarArquivo([], ESP), ['nao e objeto']);
  quebra((j) => { j.ele = '6257'; }, 'ele=');
  quebra((j) => { j.t = '1'; }, 'turno 2');
  quebra((j) => { j.f = 's'; }, 'oficial');
  quebra((j) => { j.tpabr = 'uf'; }, 'tpabr');
  quebra((j) => { j.cdabr = 'sp'; }, 'cdabr');
  quebra((j) => { j.hg = '99:99'; }, 'dg/hg');
  quebra((j) => { j.carg[0].cd = '3'; }, 'cargo');
  quebra((j) => { cands(j).pop(); j.carg[0].agr.pop(); }, 'candidatos');
  quebra((j) => { cands(j)[0].vap = '-3'; }, 'vap invalido');
  quebra((j) => { cands(j)[0].pvap = '101,00'; }, 'pvap fora');
  quebra((j) => { cands(j)[0].pvapn = 'abc'; }, 'pvapn fora');
  quebra((j) => { j.s.st = '1'; }, 'st + snt');
  quebra((j) => { j.s.ts = 'x'; }, 's.ts');
  quebra((j) => { j.s.pst = '120,00'; }, 's.pst');
  quebra((j) => { j.v.vvc = '1'; }, 'soma dos votos');
  quebra((j) => { j.v.tv = '5'; }, 'v.vvc > v.tv');
  quebra((j) => { j.v.tv = undefined; }, 'v.tv');
  quebra((j) => { j.e.te = '1'; j.e.c = '9'; }, 'e.c > e.te');
  quebra((j) => { j.e.te = 'z'; }, 'e.te');
  quebra((j) => { j.e.pc = '300'; }, 'e.pc');
  quebra((j) => { cands(j)[0].pvap = '10,00'; }, 'soma de pvap');
});

test('compactar normaliza virgula decimal e usa pvapn quando existe', () => {
  const c = compactar(base());
  assert.equal(c.candidatos.length, 2);
  assert.ok(Math.abs(c.candidatos[0].pct_validos + c.candidatos[1].pct_validos - 100) < 1e-6);
  assert.equal(c.secoes.pct_totalizadas, 40);
  assert.equal(c.totalizacao_final, false);
  const j = lerFixture('6258/dados/br/br-c0001-e006258-u.json'); // pvapn "0" -> cai no pvap
  assert.equal(compactar(j).candidatos[0].pct_validos, 0);
});

const resp = (status, corpo = '{}', h = {}) => new Response(status === 304 ? null : corpo, { status, headers: h });

test('buscarArquivo: condicional, 304, 404, retry com backoff em 5xx/rede/timeout, 4xx sem retry', async () => {
  const esperas = [];
  const sleep = async (ms) => { esperas.push(ms); };
  let vistos = [];
  const mk = (...rs) => async (url, init) => {
    vistos.push(init.headers);
    const r = rs.shift();
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r(init);
    return r;
  };
  let r = await buscarArquivo('u', { etag: 'E', lastModified: 'LM' }, { fetchFn: mk(resp(304)), sleep });
  assert.equal(r.status, 304);
  assert.equal(vistos[0]['If-None-Match'], 'E');
  assert.equal(vistos[0]['If-Modified-Since'], 'LM');
  assert.match(vistos[0]['User-Agent'], /segundo-turno-coletor/);

  r = await buscarArquivo('u', null, { fetchFn: mk(resp(200, 'abc', { etag: 'X', 'last-modified': 'L' })), sleep });
  assert.deepEqual([r.status, r.etag, r.lastModified, new TextDecoder().decode(r.body)], [200, 'X', 'L', 'abc']);

  assert.equal((await buscarArquivo('u', null, { fetchFn: mk(resp(404)), sleep })).status, 404);
  assert.equal((await buscarArquivo('u', null, { fetchFn: mk(resp(403)), sleep })).erro, 'HTTP 403');

  r = await buscarArquivo('u', null, { fetchFn: mk(resp(503), new Error('reset'), resp(200, 'ok')), sleep });
  assert.equal(r.status, 200);
  assert.deepEqual(esperas, [300, 600]);

  r = await buscarArquivo('u', null, { fetchFn: mk(resp(429), resp(500), resp(502)), sleep });
  assert.deepEqual([r.status, r.erro], [0, 'HTTP 502']);

  const pendurado = (init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  r = await buscarArquivo('u', null, { fetchFn: mk(pendurado, pendurado), sleep, timeoutMs: 5, retries: 1 });
  assert.deepEqual([r.status, r.erro], [0, 'timeout']);
});

test('executarPaced: respeita concorrencia, ordem dos resultados e espacamento', async () => {
  let ativos = 0;
  let max = 0;
  const esperas = [];
  const tarefas = Array.from({ length: 8 }, (_, i) => async () => {
    ativos++; max = Math.max(max, ativos);
    await new Promise((r) => setTimeout(r, 2));
    ativos--;
    return i;
  });
  const out = await executarPaced(tarefas, { concorrencia: 3, paceMs: 250, sleep: async (ms) => { esperas.push(ms); } });
  assert.deepEqual(out, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(max <= 3);
  assert.ok(esperas.length > 0 && esperas.every((e) => e <= 250 * 8));
  assert.deepEqual(await executarPaced([]), []);
  assert.deepEqual(await executarPaced([async () => 1]), [1]); // sleep/pace padrao
});

test('lock: so um vence a disputa; expirado e tomado por um so; liberar so o dono', async () => {
  const b = new MockR2();
  const r = await Promise.all(Array.from({ length: 10 }, () => adquirirLock(b, { tentativas: 1 })));
  assert.equal(r.filter(Boolean).length, 1);
  const dono = r.find(Boolean);
  assert.equal(await conferirLock(b, dono), true);
  assert.equal(await conferirLock(b, { chave: dono.chave, dono: 'outro' }), false);
  await liberarLock(b, { chave: dono.chave, dono: 'outro' });
  assert.ok(b.texto(dono.chave));
  await liberarLock(b, dono);
  assert.equal(b.texto(dono.chave), null);
  assert.equal(await conferirLock(b, dono), false);

  // lock expirado: disputa de takeover, so um vence
  await b.put('locks/coletor.lock', JSON.stringify({ dono: 'morto', expira_em: 1 }));
  const t = await Promise.all(Array.from({ length: 8 }, () => adquirirLock(b, { tentativas: 1 })));
  assert.equal(t.filter(Boolean).length, 1);
  // corrompido conta como expirado
  const c = new MockR2();
  await c.put('locks/coletor.lock', 'lixo');
  assert.ok(await adquirirLock(c, { tentativas: 1 }));
  assert.equal(await conferirLock(c, { chave: 'locks/coletor.lock', dono: 'x' }), false);
  // ocupado e valido: desiste apos as tentativas, dormindo entre elas
  const o = new MockR2();
  await o.put('locks/coletor.lock', JSON.stringify({ dono: 'vivo', expira_em: Date.now() + 1e6 }));
  let dormiu = 0;
  assert.equal(await adquirirLock(o, { tentativas: 3, sleep: async () => { dormiu++; } }), null);
  assert.equal(dormiu, 3);
});

test('HTTP: producao sempre 404; staging exige token e rota exata', async () => {
  const req = (path = '/coletar', init = { method: 'POST' }) => new Request(`https://x.workers.dev${path}`, init);
  const prod = { ENV: 'production', STAGING_TOKEN: 'tok' };
  for (const p of ['/', '/coletar', '/live/latest.json']) assert.equal((await tratarHttp(req(p), prod)).status, 404);
  assert.equal((await worker.fetch(req(), prod)).status, 404);
  const stg = { ENV: 'staging', STAGING_TOKEN: 'tok' };
  assert.equal((await tratarHttp(req(), { ENV: 'staging' })).status, 404, 'sem token configurado');
  assert.equal((await tratarHttp(req('/outra'), stg)).status, 404);
  assert.equal((await tratarHttp(req('/coletar', { method: 'GET' }), stg)).status, 404);
  assert.equal((await tratarHttp(req(), stg)).status, 401);
  assert.equal((await tratarHttp(req('/coletar', { method: 'POST', headers: { authorization: 'Bearer errado' } }), stg)).status, 401);
  const ok = await tratarHttp(req('/coletar', { method: 'POST', headers: { authorization: 'Bearer tok' } }), stg, async (e, d) => ({ ciclos: d.ciclos }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ciclos: 1 });
  const falha = await tratarHttp(req('/coletar', { method: 'POST', headers: { authorization: 'Bearer tok' } }), stg, async () => { throw new Error('boom'); });
  assert.equal(falha.status, 500);
});

test('scheduled dispara a coleta via waitUntil e propaga erro de configuracao', async () => {
  const promessas = [];
  const ctx = { waitUntil: (p) => promessas.push(p) };
  worker.scheduled({}, { ENV: 'nada' }, ctx);
  await assert.rejects(promessas[0], /ENV invalido/);
});

test('serie: idempotente por seq, tolera serie anterior invalida e respeita o inicio', () => {
  const snap = { seq: 0, cargo: 'presidente', coletado_em: '2026-10-25T21:00:00.000Z', parcial: { br: { dg: '25/10/2026', hg: '18:00:00', secoes: { pct_totalizadas: 1 }, candidatos: [{ n: '13', votos: 1, pct_validos: 50 }] } } };
  const o = { forecastPorId: { br: { projecao: { 13: 50 } } }, inicioMs: Date.parse('2026-10-25T17:00:00-03:00') };
  const s1 = anexarSerie({ lixo: true }, snap, o);
  const s2 = anexarSerie(s1, snap, o);
  assert.equal(s2.presidente.length, 1);
  assert.deepEqual(s2.presidente[0].f, { p: { 13: 50 }, m: null, c: null });
  assert.equal(s2.presidente[0].d, null);
  assert.equal(anexarSerie(null, snap, { ...o, inicioMs: Date.parse('2026-10-26T00:00:00-03:00') }).presidente.length, 0);
  const gov = { ...snap, cargo: 'governador', parcial: { ac: snap.parcial.br, xx: snap.parcial.br } };
  const g = anexarSerie(null, gov, { forecastPorId: {}, inicioMs: 0 });
  assert.deepEqual(Object.keys(g.governadores), ['ac']);
  assert.equal(g.governadores.ac[0].f, null);
  assert.equal(anexarSerie(g, gov, { forecastPorId: {}, inicioMs: 0 }).governadores.ac.length, 1);
});

test('resumoForecast: so campos publicos; tolera nao-objeto', () => {
  assert.equal(resumoForecast(null), null);
  assert.equal(resumoForecast(5), null);
  assert.deepEqual(resumoForecast({ projecao: { 1: 2 }, confianca: 'alta', estratos: [1, 2, 3], candidatos: [] }), { projecao: { 1: 2 }, confianca: 'alta' });
});

test('estratosDoConfig: municipios por UF, zonas no DF, ignora UF sem 2o turno', () => {
  const cfg = lerFixture('6260/config/mun-e006260-cm.json');
  const l = estratosDoConfig(cfg);
  const por = (uf) => l.filter((e) => e.uf === uf).length;
  assert.deepEqual(['ac', 'am', 'df', 'es', 'rn', 'to'].map(por), [22, 62, 19, 78, 167, 139]);
  assert.equal(l.length, 487);
  const df = l.find((e) => e.uf === 'df');
  assert.match(df.url, /\/df\/df97012-z0001-c0003-e006260-u\.json$/);
  assert.equal(df.cdabr, null);
  const ac = l.find((e) => e.id === 'ac01392');
  assert.equal(ac.url, 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/ac/ac01392-c0003-e006260-u.json');
  assert.deepEqual([ac.tpabr, ac.cdabr], ['mu', '01392']);
  assert.deepEqual(estratosDoConfig({ abr: [{ cd: 'sp', mu: [{ cd: '1' }] }] }), []);
  assert.deepEqual(estratosDoConfig(null), []);
});

test('TSE_BASE configuravel: padrao = TSE oficial; var troca as URLs; valida o formato', async () => {
  const { TSE_BASE, cadeias, govCfgUrl, resolverTseBase } = await import('../src/config.mjs');
  assert.equal(resolverTseBase({}), TSE_BASE);
  assert.equal(resolverTseBase(undefined), TSE_BASE);
  assert.equal(resolverTseBase({ TSE_BASE: '' }), TSE_BASE);
  assert.equal(resolverTseBase({ TSE_BASE: 'https://falso.exemplo.dev/oficial/ele2026/' }), 'https://falso.exemplo.dev/oficial/ele2026');
  assert.throws(() => resolverTseBase({ TSE_BASE: 'ftp://x' }), /TSE_BASE invalida/);
  // production: so o TSE oficial (ou ausente); staging aceita base falsa
  assert.equal(resolverTseBase({ ENV: 'production' }), TSE_BASE);
  assert.equal(resolverTseBase({ ENV: 'production', TSE_BASE: `${TSE_BASE}/` }), TSE_BASE);
  assert.throws(() => resolverTseBase({ ENV: 'production', TSE_BASE: 'https://falso.exemplo.dev/oficial/ele2026' }), /exatamente/);
  assert.equal(resolverTseBase({ ENV: 'staging', TSE_BASE: 'https://falso.exemplo.dev/x' }), 'https://falso.exemplo.dev/x');
  assert.equal(cadeias()[0].fontes[0].url, `${TSE_BASE}/6258/dados/br/br-c0001-e006258-u.json`);
  const falso = cadeias('https://f.dev/o');
  assert.equal(falso[0].fontes[0].url, 'https://f.dev/o/6258/dados/br/br-c0001-e006258-u.json');
  assert.equal(falso[1].fontes[0].url, 'https://f.dev/o/6260/dados/ac/ac-c0003-e006260-u.json');
  assert.equal(govCfgUrl('https://f.dev/o'), 'https://f.dev/o/6260/config/mun-e006260-cm.json');
  const cfg = { abr: [{ cd: 'ac', mu: [{ cd: '01392' }] }] };
  assert.equal(estratosDoConfig(cfg, 'https://f.dev/o')[0].url, 'https://f.dev/o/6260/dados/ac/ac01392-c0003-e006260-u.json');
  assert.equal(estratosDoConfig(cfg)[0].url, `${TSE_BASE}/6260/dados/ac/ac01392-c0003-e006260-u.json`);
});

test('production com TSE_BASE falsa aborta antes de qualquer fetch ou escrita', async () => {
  const { executarInvocacao } = await import('../src/collect.mjs');
  const b = new MockR2();
  let fetches = 0;
  await assert.rejects(
    executarInvocacao({ ENV: 'production', DATA: b, TSE_BASE: 'https://falso.exemplo.dev/oficial/ele2026' }, { fetchFn: async () => { fetches++; return new Response('', { status: 404 }); }, sleep: semEspera, ciclos: 1 }),
    /TSE_BASE em production/,
  );
  assert.equal(fetches, 0);
  assert.equal(b.log.length, 0);
});
