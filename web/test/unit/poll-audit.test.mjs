import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarEstado } from '../fixtures/gerar.mjs';
import * as A from '../../src/lib/audit.mjs';
import { buscarJson, criarPoller, proximoAtrasoMs, urlDados } from '../../src/lib/poll.mjs';

test('atraso do polling: 20 s ± 3 s e backoff exponencial limitado', () => {
  assert.equal(proximoAtrasoMs({ falhas: 0, random: () => 0.5 }), 20000);
  assert.equal(proximoAtrasoMs({ falhas: 0, random: () => 0 }), 17000);
  assert.equal(proximoAtrasoMs({ falhas: 0, random: () => 1 }), 23000);
  const b1 = proximoAtrasoMs({ falhas: 1, random: () => 0.5 });
  const b2 = proximoAtrasoMs({ falhas: 2, random: () => 0.5 });
  assert.ok(b2 > b1);
  assert.equal(proximoAtrasoMs({ falhas: 20, random: () => 0.5 }), 120000);
});

test('urlDados nunca produz query string', () => {
  assert.equal(urlDados('/dados/', 'live/latest.json'), '/dados/live/latest.json');
  assert.equal(urlDados('https://d.x.br', '/live/latest.json?x=1'), 'https://d.x.br/live/latest.json');
  assert.equal(urlDados('', 'a.json'), '/a.json');
});

function relogioFalso() {
  const fila = [];
  return { setT: (f, ms) => { fila.push({ f, ms }); return fila.length; }, clearT: () => {}, fila };
}
const resp = (ok, corpo) => ({ ok, status: ok ? 200 : 503, json: async () => corpo });

test('poller: agenda com jitter, backoff em erro, pausa com aba oculta, sem query string', async () => {
  const r = relogioFalso();
  const urls = [];
  let falha = false;
  const dados = [];
  const erros = [];
  const doc = { hidden: false, addEventListener(n, f) { this.f = f; }, removeEventListener() {} };
  const p = criarPoller({ url: '/dados/live/latest.json', fetchFn: async (u, ...resto) => { urls.push([u, resto.length]); return falha ? resp(false) : resp(true, { schema: 1 }); },
    onData: (j) => dados.push(j), onErro: (e, n) => erros.push(n), validar: (j) => j.schema === 1, doc, setT: r.setT, clearT: r.clearT, random: () => 0.5 });
  p.iniciar();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(dados.length, 1);
  assert.deepEqual(urls[0], ['/dados/live/latest.json', 0]); // fetch normal, sem opções
  assert.equal(r.fila.at(-1).ms, 20000);
  falha = true;
  await r.fila.at(-1).f();
  assert.deepEqual(erros, [1]);
  assert.ok(r.fila.at(-1).ms >= 40000);
  await r.fila.at(-1).f();
  assert.ok(r.fila.at(-1).ms >= 80000);
  // aba oculta: não agenda
  doc.hidden = true;
  const n = r.fila.length;
  await p.atualizarAgora();
  assert.equal(r.fila.length, n);
  // volta a ficar visível: busca na hora
  doc.hidden = false;
  falha = false;
  doc.f();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(dados.length, 2);
  assert.ok(urls.every(([u]) => !u.includes('?')));
  assert.equal(p.estado().ativo, true);
  p.parar();
  assert.equal(p.estado().ativo, false);
});

test('poller: JSON fora do schema conta como erro', async () => {
  const r = relogioFalso();
  const erros = [];
  const p = criarPoller({ url: '/x', fetchFn: async () => resp(true, { schema: 2 }), onData: () => assert.fail(), onErro: (e) => erros.push(e.message), validar: (j) => j.schema === 1, doc: null, setT: r.setT, clearT: r.clearT });
  p.iniciar();
  await new Promise((ok) => setImmediate(ok));
  assert.match(erros[0], /schema/);
  await assert.rejects(buscarJson('/x', async () => resp(false)), /HTTP 503/);
});

async function cadeiaDe(n) {
  const arq = montarEstado(n);
  const manifest = JSON.parse(arq.get('live/manifest.json'));
  return A.carregarCadeia({ manifest, cadeia: '6258', n: 4, fetchTexto: async (p) => arq.get(p) });
}

test('auditoria: cadeia íntegra passa; 1 byte alterado quebra no snapshot alterado', async () => {
  const { itens, ref, total } = await cadeiaDe(3);
  assert.equal(itens.length, 4);
  assert.equal(total, 4);
  const ok = await A.verificarCadeia(itens, ref);
  assert.equal(ok.ok, true);
  assert.equal(ok.de, 0);
  assert.match(A.resumoOk(ok, total), /Cadeia íntegra · 4 versões/);
  assert.match(A.detalheOk(ok), /4 snapshots/);
  const ruim = await A.verificarCadeia(A.cadeiaAdulterada(itens), ref);
  assert.equal(ruim.ok, false);
  assert.equal(ruim.reason, 'hash');
  assert.equal(ruim.at, 2);
  assert.match(A.resumoFalha(ruim), /quebrada em #2/);
  assert.match(A.detalheFalha(ruim), /não bate/);
  assert.match(A.chainHTML(itens, [3], '/dados/'), /class="cur bad"|class="bad"/);
});

test('auditoria: elo, sequência, manifest e forma canônica', async () => {
  const { itens, ref } = await cadeiaDe(3);
  const troca = itens.map((x) => ({ ...x }));
  // pula um snapshot: o prev não confere
  const sem = [itens[0], itens[2], itens[3]].map((x) => ({ ...x }));
  assert.equal((await A.verificarCadeia(sem, ref)).reason, 'prev');
  assert.equal((await A.verificarCadeia(troca, { ...ref, sha256: 'a'.repeat(64) })).reason, 'manifest');
  const espaco = itens.map((x, i) => (i === 1 ? { ...x, texto: `${x.texto} ` } : { ...x }));
  assert.equal((await A.verificarCadeia(espaco, ref)).reason, 'canonico');
  assert.equal((await A.verificarCadeia([], ref)).reason, 'vazia');
  await assert.rejects(A.carregarCadeia({ manifest: { cadeias: {} }, cadeia: '6258', n: 2, fetchTexto: async () => '' }), /ausente/);
  assert.equal(A.adulterar('abc'), 'abc ');
  assert.equal(A.canonicalize({ b: [1, undefined], a: undefined }), '{"b":[1,null]}');
});
