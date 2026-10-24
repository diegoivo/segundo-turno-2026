import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarEstado } from '../fixtures/gerar.mjs';
import * as F from '../../src/lib/format.mjs';
import * as V from '../../src/lib/viewmodel.mjs';
import * as C from '../../src/lib/components.mjs';
import * as CH from '../../src/lib/chart.mjs';
import * as P from '../../src/lib/panorama.mjs';
import * as W from '../../src/lib/views.mjs';
import { mdParaHtml } from '../../src/lib/md.mjs';
import { ALVO_MS, GOV_UFS, PRIMEIRO_TURNO, candidatosGov } from '../../src/lib/config.mjs';
import { gerarHeaders } from '../../src/build/headers.mjs';

const latestDe = (n) => JSON.parse(montarEstado(n).get('live/latest.json'));
const serieDe = (n) => JSON.parse(montarEstado(n).get('live/series.json'));

test('formatação pt-BR e ausentes viram "—"', () => {
  assert.equal(F.n(1234567), '1.234.567');
  assert.equal(F.n(null), '—');
  assert.equal(F.p(45.158), '45,16%');
  assert.equal(F.p(undefined), '—');
  assert.equal(F.num(1.5, 1), '1,5');
  assert.equal(F.mi(53879538), '53,88 mi');
  assert.equal(F.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(F.hhmm(0), '17:00');
  assert.equal(F.hhmm(99.7), '18:39');
  assert.equal(F.horaBrasilia(Date.UTC(2026, 9, 25, 20, 1, 2)), '17:01:02');
  assert.equal(F.horaBrasilia(NaN), '—');
  assert.equal(F.parseDgHg('25/10/2026', '17:00:00'), ALVO_MS);
  assert.equal(F.parseDgHg('x', '17:00:00'), null);
  assert.equal(F.cap('média'), 'Média');
});

test('estado derivado dos dados reais: 1 pré, 2 sem projeção, 3 com projeção, 4 definido', () => {
  assert.equal(V.estadoDe(null), 1);
  assert.equal(V.estadoDe(latestDe(1).presidente), 1);
  assert.equal(V.estadoDe(latestDe(2).presidente), 2);
  assert.equal(V.estadoDe(latestDe(3).presidente), 3);
  assert.equal(V.estadoDe(latestDe(4).presidente), 4);
  assert.equal(V.estadoDe({ candidatos: [1, 2], pct_secoes: 0 }), 1);
});

test('view-model: veredito, faixa e ausência de valores inventados', () => {
  const vm3 = V.presidenteVM(latestDe(3), serieDe(3).presidente);
  assert.equal(vm3.verdict, 'indef');
  assert.equal(vm3.fc.avail, true);
  assert.equal(vm3.fc.conf, 'alta');
  assert.ok(Math.abs(vm3.fc.hi - 51.2) < 1e-9);
  assert.ok(vm3.series.length > 3 && vm3.series.every((q) => q.t >= 0));
  const vm4 = V.presidenteVM(latestDe(4), []);
  assert.equal(vm4.verdict, 'def');
  assert.equal(vm4.winner, 'left');
  const vm2 = V.presidenteVM(latestDe(2), []);
  assert.equal(vm2.verdict, 'na');
  assert.equal(vm2.fc.L, null);
  assert.equal(vm2.pctEleitorado, 10.69);
  const vm1 = V.presidenteVM(null);
  assert.equal(vm1.vazio, true);
  // projeção com tendência definida pelo modelo
  const l = latestDe(3);
  l.presidente.forecast.tendencia = { n: '22', nmu: 'X' };
  assert.equal(V.presidenteVM(l).verdict, 'proj');
  assert.equal(V.presidenteVM(l).winner, 'right');
  // candidatos de outra UF não casam: cai para vazio
  const l2 = latestDe(3);
  l2.presidente.candidatos = [{ n: '1', votos: 1 }, { n: '2', votos: 1 }];
  assert.equal(V.presidenteVM(l2).vazio, true);
});

test('governador: lados por cor (vermelho à esquerda) e VM vazio sem dado', () => {
  const c = candidatosGov('am');
  assert.equal(c.left.cor, 'red');
  assert.equal(c.right.cor, 'blue');
  const c2 = candidatosGov('rn');
  assert.equal(c2.left.nome, 'Cadu de Lula');
  assert.equal(candidatosGov('xx'), null);
  const g = V.governadorVM('df', latestDe(3), { parcial: { secoes: { total: 6969, totalizadas: 5000 } } }, serieDe(3).governadores.df);
  assert.equal(g.left.nome, 'Leandro Grass');
  assert.equal(g.secTotal, 6969);
  assert.equal(V.governadorVM('df', latestDe(1)).vazio, true);
  assert.equal(V.ladosGov('xx'), null);
  const l = latestDe(3);
  l.governadores.df.candidatos = [{ n: '9', votos: 1 }, { n: '8', votos: 1 }];
  assert.equal(V.governadorVM('df', l).vazio, true);
});

test('atraso do TSE: stale=true, hg > 3 min, e sem alarme a 100%', () => {
  const l = latestDe(3);
  const hg = F.parseDgHg(l.presidente.dg, l.presidente.hg);
  assert.equal(V.dadosAtrasados(l, hg + 60e3), false);
  assert.equal(V.dadosAtrasados(l, hg + 181e3), true);
  assert.equal(V.dadosAtrasados({ ...l, stale: true }, hg), true);
  assert.equal(V.dadosAtrasados(null, hg), false);
  assert.equal(V.dadosAtrasados({ stale: false, presidente: null }, hg), false);
  const fim = latestDe(3);
  fim.presidente.pct_secoes = 100;
  assert.equal(V.dadosAtrasados(fim, hg + 3600e3), false);
});

test('série: estende pelo latest sem duplicar e sem pontos antes das 17h', () => {
  const l = latestDe(3);
  l.presidente.seq = 99;
  const base = serieDe(3).presidente;
  const mais = V.estenderSerie(base, l.presidente);
  assert.equal(mais.length, base.length + 1);
  assert.equal(V.estenderSerie(mais, l.presidente).length, mais.length);
  const cedo = { ...l.presidente, seq: 99, coletado_em: '2026-10-25T19:00:00.000Z' };
  assert.equal(V.estenderSerie(base, cedo).length, base.length);
  assert.equal(V.estenderSerie(base, null).length, base.length);
  assert.deepEqual(V.mesclarSerie([{ s: 2 }, { s: 1 }], [{ s: 2 }, { s: 3 }]).map((x) => x.s), [1, 2, 3]);
  assert.equal(V.pontoDeRace({ coletado_em: 'x', candidatos: [] }), null);
  const pts = V.serieParaGrafico([{ t: Math.floor(ALVO_MS / 1000) - 60, p: 1, c: [['13', 1, 50], ['22', 1, 50]], s: 0 }, { t: 1, p: 1, c: [['13', 0, 0], ['22', 0, 0]], s: 1 }], { n: '13' }, { n: '22' });
  assert.equal(pts.length, 0);
});

test('componentes: sem número inventado quando falta campo', () => {
  const vm = V.presidenteVM(latestDe(2));
  const html = C.scoreLive(vm);
  assert.match(html, /Eleitorado totalizado/);
  assert.match(C.fcNA(vm, 'presidente'), /Projeção indisponível/);
  assert.match(C.fcNA(vm, 'presidente'), /Falta\./);
  assert.match(C.fcNA(null, 'presidente'), /Quando a projeção aparece/);
  const sem = { ...vm, L: null, R: null, shareL: null, shareR: null, pct: null, pctEleitorado: null, hg: null };
  assert.match(C.scoreLive(sem), /—/);
  assert.match(C.fcHTML(V.presidenteVM(latestDe(3))), /entre <b>49,60%|entre <b>49,6%/);
  assert.match(C.verdictHTML(V.presidenteVM(latestDe(3))), /Disputa indefinida/);
  assert.match(C.verdictHTML(V.presidenteVM(latestDe(4))), /matematicamente definida/);
  assert.match(C.fcFinal(V.presidenteVM(latestDe(4), serieDe(4).presidente)), /Resultado (dentro|fora) da faixa/);
  assert.match(C.divRow('X', '', 0, 0), /sem votos/);
  assert.match(C.divRow('X', '', 60, 40), /60,0%/);
  assert.match(C.divRow('X', '', 40, 60), /c-blue/);
  assert.match(C.critHTML({ criterios: ['zzz_novo'], pctEleitorado: 3 }, 'governador'), /zzz novo/);
  assert.equal(C.projecaoAnterior([]), null);
  assert.ok(Math.abs(C.m2022(100) - 1.8) < 1e-9);
  assert.match(C.cmpHTML(vm), /não é previsão/);
  assert.match(C.cmpHTML(null), /2022/);
  assert.match(C.histSummary(null), /17h/);
  assert.match(C.histSummary(vm), /ainda não há projeção/);
  assert.match(C.histSummary(V.presidenteVM(latestDe(4))), /definido/);
  const proj = latestDe(3);
  proj.presidente.forecast.tendencia = { n: '13', nmu: 'LULA' };
  assert.match(C.histSummary(V.presidenteVM(proj)), /aponta/);
  assert.match(C.histSummary(V.presidenteVM(latestDe(3))), /cruzam/);
  assert.equal(C.shortHash(null), '—');
});

test('manchete: projeção como proposta, critérios faltando e precisão só se o modelo exportar', () => {
  assert.match(C.headlineHTML(null, 'presidente'), /a partir de 10% do eleitorado apurado/);
  assert.match(C.headlineHTML(null, 'governador'), /a partir de 20%/);
  const h2 = C.headlineHTML(V.presidenteVM(latestDe(2)), 'presidente');
  assert.match(h2, /a partir de 10%/);
  assert.match(h2, /Apuração oficial: <b>12,2% das seções/);
  const h3 = C.headlineHTML(V.presidenteVM(latestDe(3)), 'presidente');
  assert.match(h3, /Projeção:/);
  assert.match(h3, /Lula 50,4%/);
  assert.match(h3, /entre 49,6% e 51,2%/);
  assert.match(h3, /Disputa indefinida/);
  assert.match(h3, /Confiança alta/);
  assert.doesNotMatch(h3, /erra em média/); // sem erro_medio_esperado: oculto
  const l = latestDe(3);
  l.presidente.forecast.erro_medio_esperado = { projecao: 0.6, parcial: 2.1 };
  assert.match(C.headlineHTML(V.presidenteVM(l), 'presidente'), /a projeção erra em média ±0,6 ponto; a parcial, ±2,1/);
  assert.equal(C.erroMedio({ forecast: { erro_medio_esperado: { projecao: 1 } } }), null);
  assert.match(C.headlineHTML(V.presidenteVM(latestDe(4)), 'presidente'), /Vitória matematicamente definida: Lula/);
});

test('linhas da lista de disputas e situação', () => {
  const vm3 = V.presidenteVM(latestDe(3));
  assert.match(C.raceRow(vm3), /Disputa indefinida/);
  assert.match(C.raceRow(V.presidenteVM(latestDe(2))), /Projeção indisponível/);
  assert.match(C.raceRow(V.presidenteVM(latestDe(4))), /Definido/);
  assert.match(C.raceRow({ vazio: true, nome: 'X', href: '/', t1: W.homeView({}).vm && { left: vm3.left, right: vm3.right, shareL: 1, shareR: 2, L: 1, R: 2 } }), /Aguardando as 17h/);
});

test('gráfico: escala fixa 35-65, eixo desde 17h, sem projeção sem faixa', () => {
  const vm = V.presidenteVM(latestDe(3), serieDe(3).presidente);
  const cfg = { series: vm.series, tEnd: CH.fimDoEixo(vm.series), left: { nome: 'Lula', curto: 'Lula', cor: 'red' }, right: { nome: 'Flávio', curto: 'Flávio', cor: 'blue' } };
  const { svg, geom } = CH.histSVG(cfg, 640, 330);
  assert.match(svg, /17h · urnas fechadas/);
  assert.match(svg, /35%/);
  assert.match(svg, /65%/);
  assert.match(svg, /stroke-dasharray="7 5"/);
  assert.match(svg, /aguardando dados suficientes/);
  assert.ok(geom.tEnd >= 60);
  assert.match(CH.histSVG({ ...cfg, empty: true, series: [] }, 300, 300).svg, /A apuração começa às 17h/);
  const s4 = V.presidenteVM(latestDe(4), serieDe(4).presidente).series.map((q, i, a) => ({ ...q, def: i >= a.length - 2 }));
  assert.match(CH.histSVG({ ...cfg, tEnd: CH.fimDoEixo(s4), series: s4 }, 640, 330).svg, /Vitória definida/);
  assert.match(CH.tooltipHTML(vm.series[vm.series.length - 1], cfg), /Projeção/);
  assert.match(CH.tooltipHTML({ ...vm.series[0], on: false }, cfg), /Sem projeção/);
  assert.match(CH.histTable(cfg), /<table/);
  assert.equal(CH.histTable({ ...cfg, series: [] }), '');
  assert.equal(CH.fimDoEixo([]), 60);
  assert.match(CH.cmpSVG({ curve: CH.curva2022(), now: [[10, 1], [50, 2]] }, 300), /Lula 2026/);
  assert.equal(CH.amostra15([{ t: 1 }, { t: 2 }, { t: 20 }]).length, 2);
});

test('panorama: 1º turno real, parcial viva e mapa', () => {
  const r1 = P.linhas1T();
  assert.equal(r1.length, 27);
  assert.match(P.regioesHTML(r1, '1t'), /Nordeste/);
  const snap = JSON.parse(montarEstado(3).get(Object.keys(Object.fromEntries(montarEstado(3))).find((k) => k.startsWith('history/6258/')))) ;
  const { rows, exterior } = P.linhasVivo(snap.parcial);
  assert.equal(rows.length, 27);
  assert.ok(exterior);
  assert.match(P.ufsHTML(rows, 'vivo', exterior), /Exterior/);
  assert.match(P.regioesHTML(rows, 'vivo'), /apurado/);
  const vazio = P.linhasVivo(null);
  assert.equal(vazio.rows[0].L, 0);
  const mapa = { viewBox: '0 0 10 10', ufs: { DF: { d: 'M0 0', c: [1, 1], a: 2000 }, SP: { d: 'M0 0', c: [1, 1], a: 10 } } };
  const svg = P.mapaSVG(mapa, r1, { regiao: 'Sul', modo: '1t' });
  assert.match(svg, /href="\/governador\/df\/"/);
  assert.match(svg, /dim/);
  assert.match(P.mapaSVG(mapa, vazio.rows, { modo: 'vivo' }), /none/);
  assert.match(P.legendaMapa('vivo'), /não a projeção|não é a projeção/);
  assert.match(P.legendaMapa('1t'), /dado real/);
});

test('views: slots pré-renderizados com 1º turno real e estados', () => {
  const v = W.homeView({});
  assert.equal(v.estado, 1);
  assert.match(v.slots.score, /53\.879\.538/);
  assert.match(v.slots.finding, /Projeção disponível a partir de 10%/);
  assert.match(v.slots.score, /45,16%/);
  assert.match(v.slots.score, /47,03%/);
  const v3 = W.homeView({ latest: latestDe(3), serie: serieDe(3).presidente });
  assert.equal(v3.estado, 3);
  assert.match(v3.slots.fc, /Projeção do resultado final/);
  assert.match(W.homeView({ latest: latestDe(4) }).slots.fc, /Projeção final/);
  assert.match(W.updHTML(v3.vm, { atrasado: true }), /Dados do TSE atrasados/);
  assert.match(W.updHTML(v3.vm, { offline: true }), /Sem conexão/);
  assert.match(W.updHTML(v3.vm), /Ao vivo/);
  assert.match(W.updHTML(null), /25\/10\/2026/);
  for (const uf of GOV_UFS) {
    const g = W.govView(uf, {});
    assert.match(g.slots.score, /1º turno/);
    assert.match(W.tituloGov(uf), /^Governador do /);
  }
  const g3 = W.govView('df', { latest: latestDe(3), serie: serieDe(3).governadores.df });
  assert.equal(g3.live, true);
  assert.match(g3.slots.cmp, /Projeção final/);
  assert.match(g3.slots.others, /Governador · Acre/);
  assert.match(W.govView('df', { latest: latestDe(2) }).slots.cmp, /<td>/);
});

test('1º turno embutido bate com o total oficial (TSE 6257)', () => {
  const p = PRIMEIRO_TURNO.presidente;
  assert.equal(p.votosLula, 53879538);
  assert.equal(p.votosFlavio, 56104503);
  const soma = PRIMEIRO_TURNO.ufs.reduce((a, u) => a + u.lula, 0);
  assert.equal(soma <= p.votosLula, true); // exterior fica de fora das 27 UFs
  assert.ok(p.votosLula - soma < 700000);
});

test('markdown mínimo e cabeçalhos HTTP do build', () => {
  const h = mdParaHtml('# T\n\ntexto **b** `c` [l](https://x.y) <script>\n\n- a\n- b\n\n1. um\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> cit');
  assert.match(h, /<h1>T<\/h1>/);
  assert.match(h, /<strong>b<\/strong>/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(h, /<ol>/);
  assert.match(h, /<th scope="col">A<\/th>/);
  assert.match(h, /<blockquote>/);
  const hd = gerarHeaders();
  assert.match(hd, /\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
  assert.match(hd, /\/\n  Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300/);
});
