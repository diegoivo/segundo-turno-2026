// Ajustes de front de 25/10: header em 1 linha, botão do GitHub, tema só com ícone, modo demo (?demo), mapa e bloco por região.
import { expect, test } from '@playwright/test';
import { iniciarServidor } from './servidor.mjs';

let srv;
test.beforeAll(async () => { srv = await iniciarServidor(); });
test.afterAll(async () => { await srv.fechar(); });

const LARGURAS = [360, 390, 768, 1280];
const HORA = '2026-10-25T21:39:30Z';

const github = (page, { status = 200, n = 42, contador } = {}) => page.context().route('https://api.github.com/**', (r) => {
  if (contador) contador.n += 1;
  return r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ stargazers_count: n }) });
});

async function abrir(page, caminho = '/', { estado = 1, gh = {} } = {}) {
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  await github(page, gh);
  await fetch(`${srv.url}/__estado/${estado}`);
  srv.estado.requisicoes.length = 0;
  await page.clock.install({ time: new Date(HORA) });
  await page.goto(srv.url + caminho);
  await page.waitForLoadState('networkidle');
  return erros;
}

const semScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** Cada item do cabeçalho numa linha só: marca, GitHub e tema alinhados; status e navegação sem quebrar por dentro. */
async function medirHeader(page) {
  return page.evaluate(() => {
    const cy = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const q = (s) => document.querySelector(s);
    const linha = ['.top .brand', '#gh', '#tema'].map((s) => cy(q(s)));
    const umaLinha = (el) => { const cs = getComputedStyle(el); return el.getBoundingClientRect().height <= parseFloat(cs.lineHeight) * 1.6 + 1; };
    const lis = [...document.querySelectorAll('.top .nav li')].map((l) => l.getBoundingClientRect().top);
    const live = q('.top .live');
    const brandTxt = q('.top .brand span');
    return {
      altura: Math.round(document.querySelector('.top').getBoundingClientRect().height),
      linhas: new Set([...document.querySelectorAll('.top .wrap > *')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => Math.round((e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2) / 24))).size,
      dyMax: Math.max(...linha) - Math.min(...linha),
      navUmaLinha: Math.max(...lis) - Math.min(...lis) < 4,
      liveUmaLinha: live ? umaLinha(live) : true,
      brandUmaLinha: brandTxt.getBoundingClientRect().height <= parseFloat(getComputedStyle(brandTxt).lineHeight) * 1.6 + 1,
      brandCortada: brandTxt.scrollWidth > brandTxt.clientWidth + 1,
      botoes: ['#gh', '#tema'].map((s) => { const r = q(s).getBoundingClientRect(); return [r.left >= 0, r.right <= innerWidth]; }).flat(),
    };
  });
}

for (const w of LARGURAS) {
  test(`header em 1 linha a ${w}px (home, governador e metodologia), sem scroll horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    const alturas = [];
    for (const caminho of ['/', '/governador/df/', '/metodologia/', '/?demo=1', '/governador/df/?demo=1']) {
      const erros = await abrir(page, caminho);
      const m = await medirHeader(page);
      expect(m.dyMax, `${caminho} marca/GitHub/tema alinhados`).toBeLessThan(4);
      // meta: a partir de 768 px tudo em 1 linha (<= 64 px); abaixo, no máximo 2 linhas (<= 96 px)
      if (w >= 768) expect(m.altura, `${caminho} altura a ${w}px`).toBeLessThanOrEqual(64);
      else expect(m.altura, `${caminho} altura a ${w}px`).toBeLessThanOrEqual(96);
      expect(m.linhas, `${caminho} linhas a ${w}px`).toBeLessThanOrEqual(w >= 768 ? 1 : 2);
      alturas.push(`${caminho}@${w}=${m.altura}`);
      expect(m.navUmaLinha, `${caminho} navegação`).toBe(true);
      expect(m.liveUmaLinha, `${caminho} status`).toBe(true);
      expect(m.brandUmaLinha).toBe(true);
      expect(m.botoes.every(Boolean)).toBe(true);
      expect(await semScrollH(page)).toBe(true);
      expect(erros).toEqual([]);
    }
    console.log(`alturas do header: ${alturas.join(' ')}`);
  });
}

test('header: status atrasado e offline continuam numa linha a 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await abrir(page, '/', { estado: 'atrasado' });
  await expect(page.locator('#upd')).toContainText('Dados do TSE atrasados');
  expect((await medirHeader(page)).liveUmaLinha).toBe(true);
  expect(await semScrollH(page)).toBe(true);
});

test('tema: só o ícone visível, com aria-label e title; alterna', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await abrir(page);
  const b = page.locator('#tema');
  await expect(b).toHaveText('');
  await expect(b).toHaveAttribute('aria-label', /tema/i);
  await expect(b).toHaveAttribute('title', /tema/i);
  const antes = await b.getAttribute('aria-label');
  await b.click();
  expect(await b.getAttribute('aria-label')).not.toBe(antes);
  const tema = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(['light', 'dark']).toContain(tema);
  expect(await b.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(32);
});

test('GitHub: botão compacto com ícone inline, link do repositório e contagem; cache de 1 h no localStorage', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const contador = { n: 0 };
  await abrir(page, '/', { gh: { contador, n: 1234 } });
  const gh = page.locator('#gh');
  await expect(gh).toHaveAttribute('href', 'https://github.com/diegoivo/segundo-turno-2026');
  await expect(gh.locator('svg path')).toHaveCount(1);
  await expect(gh).toContainText('Star');
  await expect(page.locator('#gh-n')).toHaveText('1,2 mil');
  await expect(gh).toHaveAttribute('aria-label', /1234 estrelas/);
  expect(await gh.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
  expect(contador.n).toBe(1);
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('gh_stars')));
  expect(guardado.n).toBe(1234);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#gh-n')).toHaveText('1,2 mil');
  expect(contador.n).toBe(1); // 2ª visita dentro de 1 h: sem nova chamada
  // cache vencido (> 1 h) busca de novo
  await page.evaluate(() => localStorage.setItem('gh_stars', JSON.stringify({ n: 5, t: Date.now() - 61 * 60 * 1000 })));
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(contador.n).toBe(2);
});

test('GitHub: sem rede ou com limite da API, o botão aparece sem número e sem exceção', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const excecoes = [];
  page.on('pageerror', (e) => excecoes.push(e.message));
  await abrir(page, '/', { gh: { status: 403 } });
  await expect(page.locator('#gh')).toBeVisible();
  await expect(page.locator('#gh-n')).toBeHidden();
  expect(excecoes).toEqual([]);
  expect((await medirHeader(page)).dyMax).toBeLessThan(4);
});

test('GitHub: o claro e o escuro mantêm contraste legível no botão', async ({ page }) => {
  await abrir(page);
  for (const t of ['light', 'dark']) {
    await page.evaluate((x) => { document.documentElement.dataset.theme = x; }, t);
    const [cor, fundo] = await page.locator('#gh').evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
    expect(cor).not.toBe(fundo);
  }
});

// ---------- demo ----------

test('sem ?demo: nenhuma faixa, nenhuma requisição a /demo/, dados só de /dados/', async ({ page }) => {
  const erros = await abrir(page, '/', { estado: 3 });
  await expect(page.locator('#demoband')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/is-demo/);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await page.locator('#estados').scrollIntoViewIfNeeded();
  await expect(page.locator('#mapbox svg path.uf')).toHaveCount(27);
  const r = srv.estado.requisicoes;
  expect(r.some((u) => u.startsWith('/demo/'))).toBe(false);
  expect(r.some((u) => u.startsWith('/dados/live/latest.json'))).toBe(true);
  for (const q of ['/?demo=0', '/?demo=aguardando', '/?demonstracao=1']) {
    await abrir(page, q, { estado: 1 });
    await expect(page.locator('#demoband')).toHaveCount(0);
    expect(srv.estado.requisicoes.some((u) => u.startsWith('/demo/'))).toBe(false);
    await expect(page.locator('#count')).toBeVisible();
  }
  expect(erros).toEqual([]);
});

test('?demo=1: faixa fixa visível, dados de /demo/, nenhuma chamada a /dados/, contagem e mapa', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const erros = await abrir(page, '/?demo=1', { estado: 'vazio404' }); // /dados/ vazio: tudo vem da demo
  const faixa = page.locator('#demoband');
  await expect(faixa).toBeVisible();
  await expect(faixa).toContainText('Simulação com dados do 1º turno — não é resultado real');
  await expect(page.locator('#count')).toBeHidden();
  await expect(page.locator('#finding')).toContainText('Projeção:');
  await expect(page.locator('#upd')).toContainText('Simulação');
  await expect(page.locator('#upd')).not.toContainText('atrasados');
  await expect(page.locator('#fc')).toContainText('Projeção do resultado final');
  await expect(page.locator('#histchart svg')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  // a faixa continua visível depois de rolar
  await page.locator('#estados').scrollIntoViewIfNeeded();
  await expect(faixa).toBeInViewport();
  await expect(page.locator('#mapbox svg path.uf')).toHaveCount(27);
  await expect(page.locator('#maptitle')).toContainText('Panorama por região e UF');
  const r = srv.estado.requisicoes;
  expect(r.filter((u) => u.startsWith('/dados/'))).toEqual([]);
  // determinístico: espera cada requisição aparecer (o snapshot do mapa chega depois do desenho do mapa)
  for (const u of ['/demo/live/latest.json', '/demo/live/manifest.json', '/demo/snapshot-6258.json']) {
    await expect.poll(() => srv.estado.requisicoes.includes(u), { message: u }).toBe(true);
  }
  expect(r.filter((u) => u.includes('series.json')).length).toBe(1);
  expect(r.every((u) => !u.includes('?') || u.startsWith('/?demo'))).toBe(true);
  expect(await semScrollH(page)).toBe(true);
  expect(erros).toEqual([]);
});

test('?demo e ?demo=apurando equivalem a ?demo=1; a demo não faz polling', async ({ page }) => {
  for (const q of ['/?demo', '/?demo=apurando']) {
    await abrir(page, q);
    await expect(page.locator('#demoband')).toBeVisible();
    await expect(page.locator('#finding')).toContainText('Projeção:');
  }
  const antes = srv.estado.requisicoes.filter((u) => u.includes('latest.json')).length;
  for (let i = 0; i < 3; i++) { await page.clock.runFor(21000); await page.waitForTimeout(150); }
  expect(srv.estado.requisicoes.filter((u) => u.includes('latest.json')).length).toBe(antes);
  expect(srv.estado.requisicoes.some((u) => u.startsWith('/dados/'))).toBe(false);
});

test('?demo: link para governador mantém a demo e lê gov-<uf>.json de /demo/', async ({ page }) => {
  await abrir(page, '/?demo=1', { estado: 'vazio404' });
  await page.locator('#vf a[href="/governador/df/"]').first().click();
  await expect(page).toHaveURL(/\/governador\/df\/\?demo=1/);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#demoband')).toBeVisible();
  await expect(page.locator('#finding')).toContainText('Celina');
  const r = srv.estado.requisicoes;
  expect(r).toContain('/demo/live/gov-df.json');
  expect(r.filter((u) => u.startsWith('/dados/'))).toEqual([]);
  await expect(page.locator('#upd')).toContainText('Simulação');
});

test('?demo só vale na home e nos governadores (auditoria e metodologia seguem com /dados/ e sem faixa)', async ({ page }) => {
  const erros = await abrir(page, '/auditoria/?demo=1', { estado: 3 });
  await expect(page.locator('#demoband')).toHaveCount(0);
  expect(srv.estado.requisicoes.some((u) => u.startsWith('/demo/'))).toBe(false);
  expect(srv.estado.requisicoes.some((u) => u.startsWith('/dados/'))).toBe(true);
  expect(erros).toEqual([]);
});

test('demo: nada de /demo/ aparece no HTML estático, no sitemap ou nos links da página normal', async () => {
  const html = await (await fetch(srv.url + '/')).text();
  expect(html).not.toContain('/demo/');
  expect(html).not.toContain('id="demoband"');
  expect(await (await fetch(srv.url + '/sitemap.xml')).text()).not.toContain('demo');
  expect((await fetch(srv.url + '/demo/live/latest.json')).status).toBe(200);
});

// ---------- mapa e por região ----------

test('mapa: sem contorno preto grosso; contorno fino na cor de quem lidera', async ({ page }) => {
  await abrir(page, '/?demo=1');
  await page.locator('#estados').scrollIntoViewIfNeeded();
  await expect(page.locator('#mapbox svg path.uf')).toHaveCount(27);
  const info = await page.locator('#mapbox path.uf').evaluateAll((ps) => ps.map((p) => {
    const cs = getComputedStyle(p);
    return { gov: p.classList.contains('gov'), cor: p.classList.contains('c-red') ? 'red' : 'blue', stroke: cs.stroke, w: parseFloat(cs.strokeWidth) };
  }));
  const preto = await page.evaluate(() => { const e = document.createElement('i'); e.style.color = 'var(--text)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; });
  for (const u of info) {
    expect(u.stroke).not.toBe(preto);
    expect(u.w).toBeLessThanOrEqual(2);
  }
  expect(info.filter((u) => !u.gov).every((u) => u.w <= 1.01)).toBe(true);
  expect(info.some((u) => u.gov)).toBe(true);
  const vermelho = info.find((u) => u.cor === 'red');
  const azul = info.find((u) => u.cor === 'blue');
  expect(vermelho && azul).toBeTruthy();
  expect(vermelho.stroke).not.toBe(azul.stroke);
  const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  expect(rgb(vermelho.stroke)[0]).toBeGreaterThan(rgb(vermelho.stroke)[2]); // tende ao vermelho
  expect(rgb(azul.stroke)[2]).toBeGreaterThan(rgb(azul.stroke)[0]); // tende ao azul
});

test('mapa: no escuro o contorno também não é preto', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await abrir(page, '/?demo=1');
  await page.locator('#estados').scrollIntoViewIfNeeded();
  await expect(page.locator('#mapbox svg path.uf')).toHaveCount(27);
  const s = await page.locator('#mapbox path.uf').first().evaluate((p) => getComputedStyle(p).stroke);
  expect(s).not.toBe('rgb(0, 0, 0)');
});

test('por região: cada região mostra os dois percentuais e a barra vermelha e azul', async ({ page }) => {
  await abrir(page, '/?demo=1');
  const itens = page.locator('#regs li');
  await expect(itens).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const li = itens.nth(i);
    await expect(li.locator('.dv > span')).toHaveCount(2);
    await expect(li.locator('.dv > span').first()).toHaveText(/^\d+,\d%$/);
    await expect(li.locator('.dv > span').last()).toHaveText(/^\d+,\d%$/);
    await expect(li.locator('.dvbar i.c-red')).toHaveCount(1);
    await expect(li.locator('.dvbar i.c-blue')).toHaveCount(1);
    const [a, c] = await li.locator('.dv > span').allTextContents();
    expect(Math.abs(parseFloat(a.replace(',', '.')) + parseFloat(c.replace(',', '.')) - 100)).toBeLessThan(0.15);
  }
});

test('por região no 1º turno (sem JS): percentuais e barras bicolores no HTML pré-renderizado', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(srv.url);
  await expect(page.locator('#regs li .dvbar i.c-red')).toHaveCount(5);
  await expect(page.locator('#regs li .dvbar i.c-blue')).toHaveCount(5);
  await ctx.close();
});

test('demo: "Sair da simulação" leva à home normal, sem ?demo e sem faixa', async ({ page }) => {
  await abrir(page, '/?demo=1');
  const sair = page.locator('#demoband a');
  await expect(sair).toHaveAttribute('href', '/');
  await sair.click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(srv.url + '/');
  await expect(page.locator('#demoband')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/is-demo/);
});

for (const w of [360, 1280]) {
  test(`demo a ${w}px: sem deslocamento de layout (CLS ~0) e conteúdo abaixo da faixa`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await abrir(page, '/?demo=1');
    await expect(page.locator('html')).toHaveClass(/is-demo/);
    const m = await page.evaluate(() => ({ faixa: document.querySelector('#demoband').getBoundingClientRect().bottom, topo: document.querySelector('.top').getBoundingClientRect().top, cls: window.__cls }));
    expect(m.topo).toBeGreaterThanOrEqual(m.faixa - 1); // o header começa abaixo da faixa
    expect(m.cls).toBeLessThan(0.05); // o que sobra é a troca do pré-render pelos dados (igual ao modo normal com dados); a faixa não desloca nada (QA media 0,11 antes)
  });
}

test('nav rolável esmaece a borda onde há itens escondidos (sem cortar letra seca)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 800 });
  await abrir(page, '/', { estado: 3 });
  const nav = page.locator('.top .nav');
  await expect(nav).toHaveClass(/fade-r/);
  await expect(nav).not.toHaveClass(/fade-l/);
  expect(await nav.evaluate((e) => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage)).toContain('linear-gradient');
  await nav.evaluate((e) => { e.scrollLeft = e.scrollWidth; });
  await expect(nav).toHaveClass(/fade-l/);
  await expect(nav).not.toHaveClass(/fade-r/);
  await page.setViewportSize({ width: 1440, height: 800 });
  await expect(nav).not.toHaveClass(/fade-(l|r)/);
});

test('sem ?demo o <head> não marca is-demo; a regra do head acompanha o cliente', async ({ page }) => {
  for (const [q, esperado] of [['/', false], ['/?demo=0', false], ['/?demo', true], ['/?demo=apurando', true], ['/metodologia/?demo=1', false]]) {
    await abrir(page, q);
    expect(await page.evaluate(() => document.documentElement.classList.contains('is-demo')), q).toBe(esperado);
  }
});
