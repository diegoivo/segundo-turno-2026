#!/usr/bin/env node
// Lighthouse mobile (padrão) em páginas servidas por dist/ + dados de exemplo. Uso: npm run lighthouse -- [estado=3]
// Requer Google Chrome (CHROME_PATH) e rede para o npx baixar o lighthouse.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { iniciarServidor } from '../test/e2e/servidor.mjs';
import { montarEstado } from '../test/fixtures/gerar.mjs';

const estado = Number(process.argv[2] ?? 3);
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const s = await iniciarServidor();
s.estado.dados = montarEstado(estado);
const dir = mkdtempSync(`${tmpdir()}/lh-`);
let falhou = false;
const execFileAsync = promisify(execFile); // assíncrono: o servidor de teste roda neste mesmo processo
for (const caminho of ['/', '/governador/df/', '/metodologia/', '/auditoria/']) {
  const out = `${dir}/r.json`;
  await execFileAsync('npx', ['-y', 'lighthouse@12', s.url + caminho, '--quiet', '--chrome-flags=--headless=new --no-sandbox', '--output=json', `--output-path=${out}`, '--only-categories=performance,accessibility,best-practices,seo'], { env: { ...process.env, CHROME_PATH: chrome } });
  const r = JSON.parse(readFileSync(out, 'utf8'));
  const n = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  console.log(caminho, `estado ${estado}`, JSON.stringify(n), `LCP ${r.audits['largest-contentful-paint'].displayValue} CLS ${r.audits['cumulative-layout-shift'].displayValue} TBT ${r.audits['total-blocking-time'].displayValue}`);
  if (Object.entries(n).some(([k, v]) => k !== 'seo' && v < 95)) falhou = true;
}
await s.fechar();
process.exit(falhou ? 1 : 0);
