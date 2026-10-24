import { createRequire } from 'node:module';
const require = createRequire('/Users/diego/Claude/segundo-turno/web/package.json');
const { chromium } = require('@playwright/test');
const [, , rotulo, rota = '/'] = process.argv;
const URL_ = 'https://segundo-turno-web-ensaio.hosts5924.workers.dev';
const b = await chromium.launch({ channel: 'chrome' });
for (const [w, h, nome] of [[390, 844, '390'], [1440, 900, '1440']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(URL_ + rota, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `/Users/diego/Claude/segundo-turno/docs/ensaio/${rotulo}-${nome}.png`, fullPage: false });
  console.log(rotulo, nome, (await p.innerText('body')).replace(/\s+/g, ' ').slice(0, 400));
  await ctx.close();
}
await b.close();
