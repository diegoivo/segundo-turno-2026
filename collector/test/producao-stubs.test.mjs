import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { GOV_UFS } from '../src/config.mjs';
import { verificarCadeia } from '../../tools/verificar-cadeia.mjs';
import { apurar, avancar, definirRelogio, lerObj, novoAmbiente, rodar } from './helpers/comum.mjs';
import { fixtureTexto, urlTse } from './helpers/tse-mock.mjs';

const STUB_LATEST = '{"schema":1,"ambiente":"production","presidente":null,"governadores":{}}';
const STUB_MANIFEST = '{"schema":1,"ambiente":"production","cadeias":{}}';
const ehImutavel = (k) => k.startsWith('history/') || k.startsWith('raw/');
const tiraSintetico = (tse) => {
  for (const [u, a] of tse.arquivos) {
    const j = JSON.parse(a.texto);
    delete j._sintetico;
    tse.definir(u, j);
  }
};

test('producao com stubs: pre-eleicao nao grava nada; 1o dado real inicia seq 0 com CAS no etag do stub; Bucket Lock tolerado', async () => {
  const amb = novoAmbiente('production', { START_DATE: '2026-10-25' });
  amb.bucket.bloqueados = ['history/', 'raw/'];
  definirRelogio('2026-10-25T14:00:00Z');
  await amb.bucket.put('live/latest.json', STUB_LATEST);
  await amb.bucket.put('live/manifest.json', STUB_MANIFEST);
  const etagStub = (await amb.bucket.head('live/manifest.json')).etag;
  amb.bucket.limparLog();

  // (1) zerado oficial, e depois falha de rede no BR (stale): nada e gravado, stubs intactos
  amb.tse.definir(urlTse('6258', 'br', 1), fixtureTexto('6258/dados/br/br-c0001-e006258-u.json'));
  for (const uf of GOV_UFS) amb.tse.definir(urlTse('6260', uf, 3), fixtureTexto(`6260/dados/${uf}/${uf}-c0003-e006260-u.json`));
  await rodar(amb, { ciclos: 2, intervaloMs: 0 });
  amb.tse.falhas.set(urlTse('6258', 'br', 1), 99);
  const r = await rodar(amb, { ciclos: 2, intervaloMs: 0 });
  assert.deepEqual(r.stale, ['6258:br']);
  assert.equal(amb.bucket.log.length, 0, 'nenhuma escrita (nem history/raw, nem manifest/latest)');
  assert.equal(amb.bucket.texto('live/manifest.json'), STUB_MANIFEST);
  assert.equal(amb.bucket.texto('live/latest.json'), STUB_LATEST);
  amb.tse.falhas.clear();

  // (2) 1o dado real. O raw do BR ja existe no bucket (ex.: regravacao): o coletor nao pode quebrar.
  amb.tse.arquivos.clear();
  apurar(amb, 7, { hg: '14:05:00' });
  tiraSintetico(amb.tse);
  const textoBr = amb.tse.arquivos.get(urlTse('6258', 'br', 1)).texto;
  const shaBr = createHash('sha256').update(textoBr).digest('hex');
  await amb.bucket.put(`raw/${shaBr}.json.gz`, gzipSync(textoBr));
  amb.bucket.limparLog();
  const r1 = await rodar(amb, { ciclos: 2, intervaloMs: 0 }); // ciclo 1 detecta o inicio (so BR); ciclo 2 baixa o resto
  assert.deepEqual(r1.erros, []);
  assert.deepEqual(r1.commits.map((c) => `${c.eleicao}:${c.seq}`).sort(), ['6258:0', '6260:0']);
  const m = lerObj(amb.bucket, 'live/manifest.json');
  assert.equal(m.ambiente, 'production');
  assert.equal(m.cadeias['6258'].seq, 0);
  assert.notEqual((await amb.bucket.head('live/manifest.json')).etag, etagStub);
  for (const e of ['6258', '6260']) assert.equal(lerObj(amb.bucket, m.cadeias[e].chave).prev_sha256, null);
  assert.equal(lerObj(amb.bucket, 'live/latest.json').presidente.seq, 0);
  assert.equal(lerObj(amb.bucket, 'live/latest.json').ambiente, 'production');

  // (3) evolucao: nenhuma chave de history/ ou raw/ e escrita duas vezes
  for (const pct of [20, 45]) {
    apurar(amb, pct, { hg: '15:00:00' });
    tiraSintetico(amb.tse);
    avancar(60_000);
    await rodar(amb, { ciclos: 1 });
  }
  const chaves = amb.bucket.log.filter((l) => l.op === 'put' && ehImutavel(l.chave)).map((l) => l.chave);
  assert.equal(new Set(chaves).size, chaves.length, 'sem regravacao de objetos imutaveis');
  assert.equal(amb.bucket.log.filter((l) => l.op === 'delete' && ehImutavel(l.chave)).length, 0);
  assert.equal(lerObj(amb.bucket, 'live/manifest.json').cadeias['6258'].seq, 2);
  assert.deepEqual((await verificarCadeia(amb.bucket.leitor())).erros, []);
});

test('Bucket Lock: history existente (colisao real) continua sendo erro; raw existente e tolerado', async () => {
  const amb = novoAmbiente();
  amb.bucket.bloqueados = ['history/', 'raw/'];
  apurar(amb, 10);
  await rodar(amb);
  // forca recolocar a mesma chave de history: put direto falha 409 e gravarImutavel propaga so se nao existir
  const { gravarImutavel } = await import('../src/armazenamento.mjs');
  const chave = [...amb.bucket.objetos.keys()].find((k) => k.startsWith('history/6258/'));
  assert.equal(await gravarImutavel(amb.bucket, chave, 'x', 'application/json'), false);
  const falho = { put: async () => { throw new Error('rede'); }, head: async () => null };
  await assert.rejects(gravarImutavel(falho, 'raw/novo', 'x', 'a/b'), /rede/);
});
