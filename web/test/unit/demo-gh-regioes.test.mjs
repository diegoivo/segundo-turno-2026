import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gerarHeaders } from '../../src/build/headers.mjs';
import { GITHUB_MARK } from '../../src/build/pages.mjs';
import { divRow } from '../../src/lib/components.mjs';
import { GITHUB_API, GITHUB_URL } from '../../src/lib/config.mjs';
import { DEMO_AVISO, DEMO_BASE, faixaDemoHTML, hrefDemo, modoDemo } from '../../src/lib/demo.mjs';
import { compacto } from '../../src/lib/format.mjs';
import { legendaMapa, mapaSVG, regioesHTML } from '../../src/lib/panorama.mjs';
import { estadoDe } from '../../src/lib/viewmodel.mjs';

const DEMO_DIR = fileURLToPath(new URL('../../src/demo/', import.meta.url));
const lerDemo = (f) => JSON.parse(readFileSync(`${DEMO_DIR}${f}`, 'utf8'));

test('modoDemo: ?demo, ?demo=1 e ?demo=apurando ligam; ausente e valores de desligar não', () => {
  for (const q of ['?demo', '?demo=1', '?demo=apurando', '?x=1&demo=1']) assert.equal(modoDemo(q), true, q);
  for (const q of ['', '?', '?demo=0', '?demo=false', '?demo=aguardando', '?demonstracao=1', null, undefined]) assert.equal(modoDemo(q), false, String(q));
});

test('hrefDemo preserva ?demo só nos links de página (home e governador)', () => {
  assert.equal(hrefDemo('/'), '/?demo=1');
  assert.equal(hrefDemo('/governador/df/'), '/governador/df/?demo=1');
  assert.equal(hrefDemo('/#placar'), '/?demo=1#placar');
  assert.equal(hrefDemo('/metodologia/'), '/metodologia/');
  assert.equal(hrefDemo('/auditoria/'), '/auditoria/');
  assert.equal(hrefDemo('/dados/live/latest.json'), '/dados/live/latest.json');
});

test('faixa da demo traz o aviso obrigatório', () => {
  assert.match(faixaDemoHTML(), /Simulação com dados do 1º turno — não é resultado real/);
  assert.equal(DEMO_AVISO, 'Simulação com dados do 1º turno — não é resultado real');
  assert.equal(DEMO_BASE, '/demo/');
});

test('dados da demo: presidente apurando 40–70% com projeção; governadores presentes; marcados como demo', () => {
  const l = lerDemo('live/latest.json');
  assert.equal(l.demo, true);
  assert.equal(l.ambiente, 'demo');
  assert.equal(l.stale, false);
  assert.ok(l.presidente.pct_secoes >= 40 && l.presidente.pct_secoes <= 70, `presidente ${l.presidente.pct_secoes}`);
  assert.ok([3, 4].includes(estadoDe(l.presidente)), 'presidente com projeção liberada');
  for (const uf of ['ac', 'am', 'df', 'es', 'rn', 'to']) {
    assert.ok(l.governadores[uf].pct_secoes > 0, uf);
    assert.deepEqual(lerDemo(`live/gov-${uf}.json`).uf, uf);
    assert.equal(lerDemo(`live/gov-${uf}.json`).demo, true);
  }
  assert.ok(['am', 'df', 'es', 'rn', 'to'].filter((u) => estadoDe(l.governadores[u]) >= 3).length >= 4, 'maioria dos governadores com projeção');
});

test('dados da demo: série cortada no mesmo ponto do latest; sem hash nem chave de produção', () => {
  const l = lerDemo('live/latest.json');
  const s = lerDemo('live/series.json');
  assert.equal(s.presidente.at(-1).s, l.presidente.seq);
  for (const uf of Object.keys(l.governadores)) assert.equal(s.governadores[uf].at(-1).s, l.governadores[uf].seq, uf);
  const m = lerDemo('live/manifest.json');
  assert.equal(m.cadeias['6258'].chave, 'snapshot-6258.json');
  assert.equal(l.presidente.sha256, null);
  const txt = readdirSync(`${DEMO_DIR}live`).map((f) => readFileSync(`${DEMO_DIR}live/${f}`, 'utf8')).join('');
  assert.doesNotMatch(txt, /history\/|segundo-turno-prod|"ambiente":"production"/);
  assert.equal(Object.keys(lerDemo('snapshot-6258.json').parcial).length, 29);
});

test('headers: /demo/* tem bloco próprio (cache curto, noindex) e não colide com /dados', () => {
  const h = gerarHeaders();
  assert.match(h, /\/demo\/\*\n  Cache-Control: public, max-age=300\n/);
  assert.match(h, /\/demo\/\*[^]*?X-Robots-Tag: noindex/);
  assert.doesNotMatch(h, /\/dados/);
  // se um dia houver CSP, connect-src precisa liberar a API do GitHub (contagem de estrelas)
  if (/Content-Security-Policy/i.test(h)) assert.match(h, /connect-src[^\n;]*https:\/\/api\.github\.com/);
});

test('GitHub: URL do repositório, API e marca SVG inline', () => {
  assert.equal(GITHUB_URL, 'https://github.com/diegoivo/segundo-turno-2026');
  assert.equal(GITHUB_API, 'https://api.github.com/repos/diegoivo/segundo-turno-2026');
  assert.match(GITHUB_MARK, /^M8 0C3\.58/);
});

test('compacto: contagem curta pt-BR', () => {
  assert.equal(compacto(0), '0');
  assert.equal(compacto(987), '987');
  assert.equal(compacto(1234), '1,2 mil');
  assert.equal(compacto(12000), '12 mil');
  assert.equal(compacto(1500000), '1,5 mi');
  assert.equal(compacto(null), '—');
});

test('por região: sempre os dois percentuais e barra vermelha + azul (inclusive sem votos)', () => {
  const lado = divRow('Sul', '', 55, 45);
  assert.match(lado, /55,0%/);
  assert.match(lado, /45,0%/);
  assert.match(lado, /<i class="c-red"/);
  assert.match(lado, /<i class="c-blue"/);
  assert.match(lado, /aria-label="Lula 55,0%, Flávio 45,0%"/);
  const vazio = divRow('Norte', '', 0, 0);
  assert.equal((vazio.match(/—/g) ?? []).length >= 2, true);
  assert.match(vazio, /sem votos apurados/);
  const rows = [{ uf: 'AC', nome: 'Acre', regiao: 'Norte', pct: 50, L: 10, R: 30, st: 5, ts: 10 }];
  const html = regioesHTML(rows, 'vivo');
  assert.equal((html.match(/class="dvbar"/g) ?? []).length, 1);
  assert.match(html, /25,0%/);
  assert.match(html, /75,0%/);
});

test('mapa: UF com gov continua marcada (.gov), sem preto grosso no CSS, legenda explica o contorno', () => {
  const mapa = { viewBox: '0 0 10 10', ufs: { AC: { d: 'M0 0', c: [1, 1], a: 10 }, SP: { d: 'M1 1', c: [2, 2], a: 10 } } };
  const rows = [{ uf: 'AC', nome: 'Acre', regiao: 'Norte', pct: 60, L: 1, R: 2, st: 1, ts: 1 }, { uf: 'SP', nome: 'São Paulo', regiao: 'Sudeste', pct: 60, L: 3, R: 1, st: 1, ts: 1 }];
  const svg = mapaSVG(mapa, rows, { modo: 'vivo' });
  assert.match(svg, /class="uf c-blue[^"]*gov/);
  assert.match(svg, /class="uf c-red"/);
  assert.match(legendaMapa('vivo'), /contorno mais grosso/);
  const css = readFileSync(fileURLToPath(new URL('../../src/css/app.css', import.meta.url)), 'utf8');
  const regras = css.split('\n').filter((l) => /^\.uf(\.|:|\s)/.test(l)).join('\n');
  assert.doesNotMatch(regras, /stroke:\s*var\(--text\)[^;]*;\s*stroke-width:\s*(2\.[2-9]|[3-9])/);
  assert.match(css, /\.uf \{[^}]*stroke: color-mix\(in srgb, var\(--c\)/);
});
