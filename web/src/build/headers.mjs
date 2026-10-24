// Cabeçalhos para Cloudflare Workers Static Assets (arquivo _headers). Sem sobreposição de regras:
// cada caminho cai em exatamente um bloco, então o Cache-Control nunca é combinado.
export const CACHE_HTML = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';
export const CACHE_IMUTAVEL = 'public, max-age=31536000, immutable';
export const CACHE_ESTATICO = 'public, max-age=86400';

const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const bloco = (caminho, cache, extra = {}) => `${caminho}\n${Object.entries({ 'Cache-Control': cache, ...SEGURANCA, ...extra }).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;

export function gerarHeaders() {
  const html = ['/', '/index.html', '/governador/*', '/metodologia/*', '/metodologia', '/auditoria/*', '/auditoria', '/404.html'];
  const estaticos = ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/og.png', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml'];
  return [
    ...html.map((c) => bloco(c, CACHE_HTML)),
    bloco('/assets/*', CACHE_IMUTAVEL),
    ...estaticos.map((c) => bloco(c, CACHE_ESTATICO)),
  ].join('\n');
}
