import { expect, test } from '@playwright/test';
import { iniciarServidor } from './servidor.mjs';

let srv;
test.beforeAll(async () => { srv = await iniciarServidor(); });
test.afterAll(async () => { await srv.fechar(); });

// Relógio fixo no horário do dado de cada estado (hg) + 30 s, para o indicador de atraso ser determinístico.
const HORA = { 1: '2026-10-25T19:30:00Z', 2: '2026-10-25T20:51:30Z', 3: '2026-10-25T21:39:30Z', 4: '2026-10-25T22:50:30Z' };
const VIEWS = [{ nome: '360', width: 360, height: 800 }, { nome: '1440', width: 1440, height: 900 }];

// A API do GitHub nunca é chamada de verdade nos testes.
export const bloquearGithub = (page, corpo = { stargazers_count: 42 }, status = 200) => page.context().route('https://api.github.com/**', (r) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(corpo) }));

async function abrir(page, estado, caminho = '/', hora = HORA[estado]) {
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  await bloquearGithub(page);
  await fetch(`${srv.url}/__estado/${estado}`);
  srv.estado.requisicoes.length = 0;
  await page.clock.install({ time: new Date(hora) });
  await page.goto(srv.url + caminho);
  await page.waitForLoadState('networkidle');
  return erros;
}

const semScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const v of VIEWS) {
  for (const estado of [1, 2, 3, 4]) {
    test(`home, estado ${estado}, ${v.nome}px: renderiza, sem scroll horizontal e sem erros`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      const erros = await abrir(page, estado);
      await expect(page.locator('h1')).toHaveText('Apuração do 2º turno');
      await expect(page.locator('.tagline').first()).toContainText('Projeção estatística do resultado final');
      const manchete = page.locator('#finding');
      if (estado === 1) {
        await expect(manchete).toContainText('Projeção disponível a partir de 10% do eleitorado apurado');
        await expect(page.locator('#score')).toContainText('45,16%');
        await expect(page.locator('#score')).toContainText('53.879.538');
        await expect(page.locator('#count')).toBeVisible();
      } else if (estado === 2) {
        await expect(manchete).toContainText('Projeção disponível a partir de 10%');
        await expect(manchete).toContainText('Apuração oficial');
        await expect(page.locator('#fc')).toContainText('Projeção indisponível');
        await expect(page.locator('#fc .crit li.no').first()).toContainText('Falta.');
        await expect(page.locator('#count')).toBeHidden();
      } else if (estado === 3) {
        await expect(manchete).toContainText('Projeção:');
        await expect(manchete).toContainText('entre');
        await expect(manchete).toContainText('Disputa indefinida');
        await expect(page.locator('#fc')).toContainText('Projeção do resultado final');
        await expect(page.locator('#histchart svg')).toBeVisible();
      } else {
        await expect(manchete).toContainText('Vitória matematicamente definida');
        await expect(page.locator('#fc')).toContainText('Projeção final');
      }
      expect(await semScrollHorizontal(page)).toBe(true);
      await expect(page.locator('.simband, .mockbar')).toHaveCount(0);
      expect(erros).toEqual([]);
    });
  }

  test(`governador DF, ${v.nome}px: estados 1 e 3`, async ({ page, browser }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    let erros = await abrir(page, 1, '/governador/df/');
    await expect(page).toHaveTitle(/Governador do Distrito Federal/);
    await expect(page.locator('#score')).toContainText('49,93%');
    expect(await semScrollHorizontal(page)).toBe(true);
    expect(erros).toEqual([]);
    const p2 = await (await browser.newContext()).newPage();
    await p2.setViewportSize({ width: v.width, height: v.height });
    erros = await abrir(p2, 3, '/governador/df/');
        await expect(p2.locator('#finding')).toContainText('Projeção:');
    await expect(p2.locator('#score')).toContainText('Apuração oficial do TSE');
    expect(await semScrollHorizontal(p2)).toBe(true);
    expect(erros).toEqual([]);
    // gov-df.json só é pedido na página da UF
    expect(srv.estado.requisicoes.some((r) => r.includes('/live/gov-df.json'))).toBe(true);
  });
}

test('home não baixa gov-<uf>.json nem manifest antes de precisar; series.json 1× por visita', async ({ page }) => {
  await abrir(page, 3);
  const r = srv.estado.requisicoes;
  expect(r.filter((x) => x.includes('gov-'))).toEqual([]);
  expect(r.filter((x) => x.includes('series.json')).length).toBe(1);
});

test('polling: a cada ~20 s, sem query string, sem cache-busting', async ({ page }) => {
  await abrir(page, 3);
  const antes = srv.estado.requisicoes.filter((x) => x.includes('latest.json')).length;
  expect(antes).toBe(1);
  for (let i = 0; i < 3; i++) { await page.clock.runFor(21000); await page.waitForTimeout(250); }
  const latest = srv.estado.requisicoes.filter((x) => x.includes('latest.json'));
  expect(latest.length).toBeGreaterThanOrEqual(3);
  expect(latest.length).toBeLessThanOrEqual(5);
  for (const u of srv.estado.requisicoes.filter((x) => x.startsWith('/dados/'))) expect(u).not.toContain('?');
  expect(latest.every((u) => u === '/dados/live/latest.json')).toBe(true);
  // series.json continua só 1×
  expect(srv.estado.requisicoes.filter((x) => x.includes('series.json')).length).toBe(1);
});

test('"dados do TSE atrasados" aparece com stale=true e com dg/hg velho', async ({ page, browser }) => {
  await abrir(page, 'atrasado', '/', HORA[3]);
  await expect(page.locator('#upd')).toContainText('Dados do TSE atrasados');
  const p2 = await (await browser.newContext()).newPage();
  await abrir(p2, 3, '/', '2026-10-25T21:45:00Z'); // 6 min depois do hg
  await expect(p2.locator('#upd')).toContainText('Dados do TSE atrasados');
  const p3 = await (await browser.newContext()).newPage();
  await abrir(p3, 3, '/', HORA[3]);
  await expect(p3.locator('#upd')).toContainText('Ao vivo');
});

test('latest.json ausente (404) antes dos dados: fica no estado 1 sem exceção', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await fetch(`${srv.url}/__estado/vazio404`);
  await page.clock.install({ time: new Date(HORA[1]) });
  await page.goto(srv.url);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#finding')).toContainText('Projeção disponível');
  await expect(page.locator('#score')).toContainText('45,16%');
  expect(erros).toEqual([]);
});

test('sem JavaScript: HTML pré-renderizado traz o estado 1 e o 1º turno real', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(srv.url);
  await expect(page.locator('#score')).toContainText('56.104.503');
  await expect(page.locator('#finding')).toContainText('Projeção disponível a partir de 10%');
  await expect(page.locator('#histchart svg')).toBeVisible();
  await expect(page.locator('#regs')).toContainText('Nordeste');
  await ctx.close();
});

test('mapa carrega sob demanda com a parcial por UF', async ({ page }) => {
  await abrir(page, 3);
  await expect(page.locator('#mapbox svg')).toHaveCount(0);
  await page.locator('#estados').scrollIntoViewIfNeeded();
  await expect(page.locator('#mapbox svg path.uf').first()).toBeVisible();
  await expect(page.locator('#mapbox svg path.uf')).toHaveCount(27);
  await expect(page.locator('#maptitle')).toContainText('Panorama por região e UF');
  await expect(page.locator('#maplegend').first()).toContainText('não a projeção');
});

test('auditoria: cadeia verificada no navegador e adulteração de 1 byte detectada', async ({ page }) => {
  const erros = await abrir(page, 3, '/auditoria/');
  const sec = page.locator('section[data-cadeia="6258"]');
  await expect(sec.locator('.a-line')).toContainText('Cadeia íntegra', { timeout: 10000 });
  await expect(sec.locator('[data-chain] li')).toHaveCount(4);
  await expect(sec.locator('.a-snap')).toHaveAttribute('href', /\/dados\/history\/6258\/.+\.json$/);
  await expect(sec.locator('.a-raw')).toHaveAttribute('href', /\/dados\/raw\/[0-9a-f]{64}\.json\.gz$/);
  await expect(sec.locator('.audlinks a').nth(1)).toHaveAttribute('href', /verificar-cadeia\.mjs/);
  await sec.locator('.a-ver').click();
  await expect(sec.locator('.result')).toContainText('Cadeia íntegra');
  await sec.locator('.a-chk').check();
  await sec.locator('.a-ver').click();
  await expect(sec.locator('.result')).toContainText('Cadeia quebrada');
  await expect(sec.locator('.a-line')).toContainText('Cadeia quebrada');
  expect(erros).toEqual([]);
  expect(srv.estado.requisicoes.filter((x) => x.startsWith('/dados/')).every((x) => !x.includes('?'))).toBe(true);
});

test('auditoria antes das 17h: sem snapshots, sem erro', async ({ page }) => {
  const erros = await abrir(page, 1, '/auditoria/');
  await expect(page.locator('.a-empty').first()).toBeVisible();
  expect(erros).toEqual([]);
});

test('metodologia, 404 e links do rodapé', async ({ page }) => {
  const erros = await abrir(page, 1, '/metodologia/');
  await expect(page.locator('h1')).toContainText('Metodologia da projeção');
  await expect(page.locator('table').first()).toBeVisible();
  await expect(page.locator('footer a[href="/auditoria/"]')).toContainText('Auditoria e histórico');
  expect(erros).toEqual([]);
  const r = await page.goto(`${srv.url}/nao-existe/`);
  expect(r.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('404');
  // a home não tem mais a seção de auditoria
  await page.goto(srv.url);
  await expect(page.locator('#auditoria')).toHaveCount(0);
});

test('meta OG/Twitter, manifest e robots', async ({ page, request }) => {
  await abrir(page, 1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  for (const f of ['/og.png', '/favicon.svg', '/manifest.webmanifest', '/robots.txt', '/apple-touch-icon.png']) expect((await request.get(srv.url + f)).status()).toBe(200);
});

test('tema escuro e foco do botão', async ({ page }) => {
  await abrir(page, 3);
  await page.locator('#tema').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
