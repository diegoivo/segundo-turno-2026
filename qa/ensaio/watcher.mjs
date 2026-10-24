import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
const require = createRequire('/Users/diego/Claude/segundo-turno/web/package.json');
const { chromium } = require('@playwright/test');
const W = 'https://segundo-turno-web-ensaio.hosts5924.workers.dev';
const OUT = '/Users/diego/Claude/segundo-turno/docs/ensaio';
const log = (o) => appendFileSync('/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/ensaio/watcher.log', JSON.stringify(o) + '\n');
const b = await chromium.launch({ channel: 'chrome' });
const pgs = {};
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); await p.goto(W + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { window.__sem_reload = 'vivo'; });
  pgs[w] = p;
}
const feitos = new Set();
const marco = async (nome) => { if (feitos.has(nome)) return; feitos.add(nome); for (const w of [390, 1440]) { await pgs[w].screenshot({ path: `${OUT}/${nome}-${w}.png` }); } log({ marco: nome, hora: new Date().toISOString() }); };
let ultimo = '';
for (;;) {
  try {
    const l = await (await fetch(W + '/dados/live/latest.json', { cache: 'no-store' })).json();
    const p = l.presidente;
    const sem = await pgs[1440].evaluate(() => window.__sem_reload);
    const txt = (await pgs[1440].innerText('body')).replace(/\s+/g, ' ');
    const cab = txt.slice(0, 700);
    if (cab !== ultimo) { log({ hora: new Date().toISOString(), sem_reload: sem, front: cab.slice(0, 450) }); ultimo = cab; }
    if (p?.forecast?.projecao != null) await marco('e2-03-primeira-projecao');
    if (p && p.pct_eleitorado >= 50) await marco('e2-04-meio-50pct');
    if (p && p.pct_secoes >= 99.5) { await new Promise((r) => setTimeout(r, 20000)); await marco('e2-05-fim'); log({ fim_texto: (await pgs[1440].innerText('body')).replace(/\s+/g, ' ').slice(0, 2500), sem_reload: await pgs[1440].evaluate(() => window.__sem_reload) }); break; }
  } catch (e) { log({ erro: String(e) }); }
  await new Promise((r) => setTimeout(r, 30000));
}
await b.close();
