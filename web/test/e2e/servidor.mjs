// Servidor local para o E2E: serve dist/ e, em /dados/, os JSON de exemplo do estado escolhido. Registra as requisições.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarEstado, montarEstadoAtrasado } from '../fixtures/gerar.mjs';

const DIST = process.env.DIST_DIR ? `${process.env.DIST_DIR.replace(/\/+$/, '')}/` : fileURLToPath(new URL('../../dist/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };

export function iniciarServidor({ porta = 0 } = {}) {
  const estado = { dados: montarEstado(1), requisicoes: [] };
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    estado.requisicoes.push(req.url);
    if (u.pathname.startsWith('/__estado/')) {
      const n = u.pathname.split('/').pop();
      estado.dados = n === 'atrasado' ? montarEstadoAtrasado() : n === 'vazio404' ? new Map() : montarEstado(Number(n));
      res.end('ok');
      return;
    }
    if (u.pathname.startsWith('/dados/')) {
      const corpo = estado.dados.get(decodeURIComponent(u.pathname.slice('/dados/'.length)));
      if (corpo == null) { res.writeHead(404); res.end('nao encontrado'); return; }
      res.writeHead(200, { 'content-type': u.pathname.endsWith('.gz') ? 'application/gzip' : 'application/json', 'cache-control': 'no-cache' });
      res.end(corpo);
      return;
    }
    let rel = normalize(u.pathname).replace(/^(\.\.[/\\])+/, '');
    if (rel.endsWith('/')) rel += 'index.html';
    try {
      const buf = await readFile(join(DIST, rel));
      res.writeHead(200, { 'content-type': TIPOS[extname(rel)] ?? 'application/octet-stream' });
      res.end(buf);
    } catch {
      const buf = await readFile(join(DIST, '404.html')).catch(() => Buffer.from('404'));
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(buf);
    }
  });
  return new Promise((ok) => server.listen(porta, '127.0.0.1', () => ok({ server, estado, url: `http://127.0.0.1:${server.address().port}`, fechar: () => new Promise((r) => server.close(r)) })));
}
