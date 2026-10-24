// Defeitos D1/D2 do ensaio geral: placar regredindo no latest.json e commit lento de 6260 perdendo o lock/CAS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estratosDoConfig } from '../src/config.mjs';
import { verificarCadeia } from '../../tools/verificar-cadeia.mjs';
import { apurar, avancar, definirRelogio, lerObj, novoAmbiente, rodar } from './helpers/comum.mjs';
import { lerFixture, sintetizar, TseFalso, urlTse } from './helpers/tse-mock.mjs';

const CFG_URL = 'https://resultados.tse.jus.br/oficial/ele2026/6260/config/mun-e006260-cm.json';
const historico = (b, e) => [...b.objetos.keys()].filter((k) => k.startsWith(`history/${e}/`));
const copiar = (tse) => { const t = new TseFalso(); for (const [u, a] of tse.arquivos) t.definir(u, a.texto); return t; };

test('D1: commit lento de 6260 nunca faz o latest.json regredir a cabeca de 6258', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10);
  await rodar(amb); // 6258 seq 0, 6260 seq 0

  // A: so o governador muda (30%) e a resposta do TSE fica retida; B: so o presidente avanca enquanto A espera.
  const tseA = copiar(amb.tse);
  const tseB = copiar(amb.tse);
  const comGov30 = new TseFalso();
  apurar({ tse: comGov30 }, 30);
  for (const [u, a] of comGov30.arquivos) if (u.includes('/6260/')) tseA.definir(u, a.texto);
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  const fetchA = async (u, i) => { if (u.includes('/6260/')) await portao; return tseA.fetch(u, i); };
  const emA = rodar(amb, { fetchFn: fetchA });

  const lido = [];
  for (const pct of [30, 50]) {
    const t = new TseFalso();
    apurar({ tse: t }, pct);
    for (const [u, a] of t.arquivos) if (u.includes('/6258/')) tseB.definir(u, a.texto);
    avancar(30_000);
    await rodar(amb, { fetchFn: tseB.fetch });
    lido.push(lerObj(amb.bucket, 'live/latest.json').presidente.seq);
  }
  assert.deepEqual(lido, [1, 2]);

  liberar();
  const rA = await emA;
  assert.deepEqual(rA.erros, []);
  assert.equal(rA.commits.find((c) => c.eleicao === '6260').seq, 1);
  const latest = lerObj(amb.bucket, 'live/latest.json');
  assert.equal(latest.presidente.seq, 2, 'o latest nao pode voltar para a cabeca antiga de 6258');
  assert.equal(latest.governadores.ac.seq, 1);
  const m = lerObj(amb.bucket, 'live/manifest.json');
  assert.equal(m.cadeias['6258'].seq, 2);
  assert.equal(m.cadeias['6260'].seq, 1);
});

test('D1b: latest.json so avanca, mesmo com commits das duas cadeias intercalados (leituras a cada put)', async () => {
  const amb = novoAmbiente();
  const vistos = [];
  amb.bucket.aoPut = async (chave) => {
    if (chave === 'live/latest.json') return;
    const o = amb.bucket.objetos.get('live/latest.json');
    if (o) vistos.push(JSON.parse(new TextDecoder().decode(o.bytes)));
  };
  for (const pct of [10, 25, 40, 60]) {
    apurar(amb, pct);
    avancar(30_000);
    await Promise.all([rodar(amb), rodar(amb)]);
  }
  const seqs = vistos.map((l) => l.presidente?.seq ?? -1);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'seq do presidente monotono nas leituras');
  const gov = vistos.map((l) => l.governadores.ac?.seq ?? -1);
  assert.deepEqual(gov, [...gov].sort((a, b) => a - b));
});

function estratosSinteticos(amb, pct) {
  const cfg = lerFixture('6260/config/mun-e006260-cm.json');
  amb.tse.definir(CFG_URL, cfg);
  const base = lerFixture('6260/dados/ac/ac01392-c0003-e006260-u.json');
  for (const e of estratosDoConfig(cfg)) {
    amb.tse.definir(e.url, sintetizar(base, { regiao: e.cdabr ?? '0001', tpabr: e.tpabr ?? 'zona', pct, votos: [Math.round(pct * 3), Math.round(pct * 2)], hg: '18:00:00' }));
  }
}

test('D2: commit de 6260 com ~280 raws e I/O lento mantem o lock (renovacao) e nao perde o CAS; sem snapshot orfao', async () => {
  const amb = novoAmbiente();
  apurar(amb, 30);
  estratosSinteticos(amb, 30);
  definirRelogio('2026-10-25T22:00:00Z');
  let concorrente = null;
  // cada put custa 400 ms simulados; no meio do commit de 6260 (ja alem de 45 s) outra invocacao tenta commitar
  amb.bucket.aoPut = async (chave, n) => {
    avancar(400);
    if (!concorrente && chave.startsWith('raw/') && n > 180) {
      amb.bucket.aoPut = async () => avancar(400);
      concorrente = rodar(amb, { ciclos: 1 });
    }
  };
  const rA = await rodar(amb, { ciclos: 4, intervaloMs: 0 });
  const rB = await concorrente;
  assert.ok(concorrente, 'o cenario disparou a invocacao concorrente');
  const todos = [...rA.erros, ...rB.erros];
  assert.deepEqual(todos, [], `sem CAS perdido: ${todos}`);
  const seq6260 = lerObj(amb.bucket, 'live/manifest.json').cadeias['6260'].seq;
  assert.equal(historico(amb.bucket, '6260').length, seq6260 + 1, 'nenhum snapshot orfao em history/6260');
  assert.equal(historico(amb.bucket, '6258').length, lerObj(amb.bucket, 'live/manifest.json').cadeias['6258'].seq + 1);
  const c = rA.commits.find((x) => x.eleicao === '6260');
  assert.ok(c.duracao_ms > 45_000, `commit mais lento que o TTL antigo (${c.duracao_ms} ms)`);
  assert.equal(lerObj(amb.bucket, 'live/manifest-6260.json').duracao_commit_ms > 0, true);
  assert.deepEqual((await verificarCadeia(amb.bucket.leitor())).erros, []);
});

test('ordem estrita: CAS do manifest da cadeia antes de latest/gov/series; CAS perdido nao publica nada', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10);
  const ordem = [];
  amb.bucket.aoPut = async (chave) => { ordem.push(chave); };
  await rodar(amb);
  const pos = (re) => ordem.findIndex((k) => re.test(k));
  const iCas = pos(/live\/manifest-6258\.json/);
  assert.ok(pos(/^history\/6258\//) < iCas && iCas < pos(/live\/latest\.json/));
  assert.ok(iCas < pos(/live\/series\.json/));
  assert.ok(pos(/^history\/6260\//) < pos(/live\/manifest-6260\.json/) && pos(/live\/manifest-6260\.json/) < pos(/live\/gov-ac\.json/));
  assert.ok(pos(/live\/latest\.json/) < ordem.lastIndexOf('live/manifest.json'), 'indice composto por ultimo');

  // outro escritor muda o manifest da cadeia no meio do commit -> CAS falha -> nada de latest/gov/series
  const amb2 = novoAmbiente();
  apurar(amb2, 10);
  amb2.bucket.aoPut = async (chave) => {
    if (chave === 'live/manifest-6258.json') {
      amb2.bucket.aoPut = null;
      await amb2.bucket.put('live/manifest-6258.json', JSON.stringify({ schema: 1, ambiente: 'staging', seq: 9, sha256: 'x', chave: 'y' }));
    }
  };
  const r = await rodar(amb2);
  assert.ok(r.erros.some((e) => e.includes('CAS falhou')));
  assert.equal(r.commits.filter((c) => c.eleicao === '6258').length, 0);
  // o commit perdido nao publicou nada dele: sem latest com o presidente seq 0 e sem ponto na serie
  assert.equal(amb2.bucket.texto('live/latest.json'), null);
  assert.deepEqual(lerObj(amb2.bucket, 'live/series.json').presidente ?? [], []);
});

test('compatibilidade: bucket antigo (so indice composto, sem manifest por cadeia) continua avancando', async () => {
  const amb = novoAmbiente();
  apurar(amb, 10);
  await rodar(amb);
  const idx = lerObj(amb.bucket, 'live/manifest.json');
  amb.bucket.objetos.delete('live/manifest-6258.json');
  amb.bucket.objetos.delete('live/manifest-6260.json');
  avancar(60_000);
  apurar(amb, 30);
  const r = await rodar(amb);
  assert.deepEqual(r.erros, []);
  assert.equal(lerObj(amb.bucket, 'live/manifest.json').cadeias['6258'].seq, idx.cadeias['6258'].seq + 1);
});
