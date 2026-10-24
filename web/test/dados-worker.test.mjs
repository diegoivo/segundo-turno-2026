import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoCaminho, servirDados } from '../worker/dados.mjs';

function cacheFalso() {
  const mapa = new Map();
  return {
    mapa,
    match: async (req) => mapa.get(req.url)?.clone(),
    put: async (req, res) => { mapa.set(req.url, res); },
  };
}

function bucketFalso(objetos) {
  return {
    get: async (chave) => {
      if (!(chave in objetos)) return null;
      return {
        body: objetos[chave],
        httpEtag: '"e1"',
        writeHttpMetadata: (h) => h.set('cache-control', 'public, max-age=5, s-maxage=10'),
      };
    },
  };
}

const ctx = () => { const p = []; return { waitUntil: (x) => p.push(x), done: () => Promise.all(p) }; };

test('chaveDoCaminho aceita só prefixos permitidos', () => {
  assert.equal(chaveDoCaminho('/dados/live/latest.json'), 'live/latest.json');
  assert.equal(chaveDoCaminho('/dados/history/6258/2026-10-25/000001-ab.json'), 'history/6258/2026-10-25/000001-ab.json');
  assert.equal(chaveDoCaminho('/dados/locks/coletor.lock'), null);
  assert.equal(chaveDoCaminho('/dados/live/../locks/x'), null);
  assert.equal(chaveDoCaminho('/outra/live/latest.json'), null);
});

test('MISS busca no R2 e guarda; HIT vem do cache', async () => {
  const cache = cacheFalso();
  const env = { DATA: bucketFalso({ 'live/latest.json': '{"a":1}' }) };
  const c1 = ctx();
  const r1 = await servirDados(new Request('https://x/dados/live/latest.json'), env, c1, cache);
  await c1.done();
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('x-cache'), 'MISS');
  assert.equal(await r1.text(), '{"a":1}');
  const r2 = await servirDados(new Request('https://x/dados/live/latest.json'), env, ctx(), cache);
  assert.equal(r2.headers.get('x-cache'), 'HIT');
  assert.equal(await r2.text(), '{"a":1}');
});

test('query string, método e chave inválidos são recusados', async () => {
  const env = { DATA: bucketFalso({}) };
  const cache = cacheFalso();
  assert.equal((await servirDados(new Request('https://x/dados/live/latest.json?t=1'), env, ctx(), cache)).status, 400);
  assert.equal((await servirDados(new Request('https://x/dados/live/latest.json', { method: 'POST' }), env, ctx(), cache)).status, 405);
  assert.equal((await servirDados(new Request('https://x/dados/locks/a'), env, ctx(), cache)).status, 404);
  assert.equal((await servirDados(new Request('https://x/dados/live/nada.json'), env, ctx(), cache)).status, 404);
});
