#!/usr/bin/env node
// Build estático: pré-renderiza as páginas (estado "antes das 17h" + 1º turno real), empacota JS/CSS com hash de conteúdo
// e escreve dist/. Configuração por variáveis de ambiente:
//   DATA_BASE_URL  base dos JSON (padrão "/dados/", mesma origem). Ex.: https://dados.exemplo.com.br/
//   SITE_URL       URL pública do site, para canonical/OG (placeholder se ausente)
//   EVIDENCE_TEXT  frase opcional de evidência (ex.: desempenho no 1º turno); só aparece se preenchida
//   VERIFIER_URL   link do verificador tools/verificar-cadeia.mjs no GitHub (placeholder se ausente)
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { renderOg } from '../src/build/og.mjs';
import { gerarHeaders } from '../src/build/headers.mjs';
import { pagina404, paginaAuditoria, paginaDoc, paginaGov, paginaHome } from '../src/build/pages.mjs';
import { cmpSVG, curva2022, histSVG } from '../src/lib/chart.mjs';
import { GOV_UFS } from '../src/lib/config.mjs';
import { mdParaHtml } from '../src/lib/md.mjs';
import { govView, homeView } from '../src/lib/views.mjs';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const DIST = process.env.OUT_DIR ? `${process.cwd()}/${process.env.OUT_DIR}` : `${RAIZ}dist`;
const SITE = (process.env.SITE_URL || 'https://apuracao2026.example.com.br').replace(/\/+$/, '');
const DADOS = (process.env.DATA_BASE_URL || '/dados/').replace(/\/*$/, '/');
const VERIFICADOR = process.env.VERIFIER_URL || 'https://github.com/SEU-USUARIO/segundo-turno/blob/main/tools/verificar-cadeia.mjs';
const EVIDENCIA = process.env.EVIDENCE_TEXT || '';
const dadosOrigem = /^https?:\/\//.test(DADOS) ? new URL(DADOS).origin : null;

const hash8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const escrever = (rel, conteudo) => { const p = `${DIST}/${rel}`; mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true }); writeFileSync(p, conteudo); };

rmSync(DIST, { recursive: true, force: true });
mkdirSync(`${DIST}/assets`, { recursive: true });

// 1. malha do IBGE com hash (carregada sob demanda)
const mapaBuf = readFileSync(`${RAIZ}src/assets/mapa-br.json`);
const mapaNome = `assets/mapa-br.${hash8(mapaBuf)}.json`;
escrever(mapaNome, mapaBuf);

// 2. JS e CSS com hash de conteúdo
const comum = { bundle: true, minify: true, outdir: DIST, entryNames: 'assets/[name].[hash]', metafile: true, logLevel: 'warning' };
const js = await build({
  ...comum,
  entryPoints: { app: `${RAIZ}src/client/main.mjs` },
  format: 'esm',
  target: 'es2020',
  define: { __DATA_BASE__: JSON.stringify(DADOS), __MAPA_URL__: JSON.stringify(`/${mapaNome}`), __VERIFIER_URL__: JSON.stringify(VERIFICADOR) },
});
const css = await build({ ...comum, entryPoints: { app: `${RAIZ}src/css/app.css` } });
const saida = (r, ext) => Object.keys(r.metafile.outputs).find((k) => k.endsWith(ext)).replace(/^.*?dist\//, '').replace(/^.*?assets\//, 'assets/');
const assets = { js: `/${saida(js, '.js')}`, css: `/${saida(css, '.css')}` };
assets.cssTexto = readFileSync(`${DIST}${assets.css}`, 'utf8'); // CSS inline no <head>: não bloqueia a renderização

// 3. páginas pré-renderizadas
const base = { assets, site: SITE, dadosOrigem, verificador: VERIFICADOR, evidencia: EVIDENCIA };
const home0 = homeView({});
const cmp0 = cmpSVG({ curve: curva2022(), now: null }, 640);
escrever('index.html', paginaHome({ ...base, histSvg: histSVG(home0.hist, 640, 330).svg, cmpSvg: cmp0 }));
for (const uf of GOV_UFS) {
  const v = govView(uf, {});
  escrever(`governador/${uf}/index.html`, paginaGov({ ...base, uf, histSvg: histSVG(v.hist, 640, 330).svg }));
}
const md = readFileSync(`${RAIZ}../docs/METODOLOGIA.md`, 'utf8');
escrever('metodologia/index.html', paginaDoc({
  ...base, titulo: 'Metodologia da projeção', caminho: '/metodologia/',
  descricao: 'Como a projeção do 2º turno 2026 é calculada, qual a faixa de erro, quando ela não é publicada e como auditar.',
  corpoHtml: mdParaHtml(md),
}));
escrever('auditoria/index.html', paginaAuditoria(base));
escrever('404.html', pagina404(base));

// 4. estáticos, OG, robots, sitemap, cabeçalhos
for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) cpSync(`${RAIZ}src/assets/${f}`, `${DIST}/${f}`);
escrever('og.png', renderOg());
escrever('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const urls = ['/', ...GOV_UFS.map((u) => `/governador/${u}/`), '/metodologia/', '/auditoria/'];
escrever('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
escrever('_headers', gerarHeaders());

console.log(`build ok -> ${DIST}\n  js  ${assets.js}\n  css ${assets.css}\n  dados: ${DADOS}  site: ${SITE}`);
