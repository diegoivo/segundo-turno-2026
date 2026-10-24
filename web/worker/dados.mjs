// Serve os JSON do R2 em /dados/* na mesma origem do front.
// Só é invocado para /dados/*: os assets estáticos são servidos sem Worker (grátis).
// Enquanto não houver domínio próprio (Cache Rules de zona), o cache é feito aqui via Cache API.

const PREFIXO = '/dados/';
const CHAVES_PERMITIDAS = /^(live|history|raw)\/[A-Za-z0-9._\/-]+$/;
const CACHE_PADRAO = 'public, max-age=5, s-maxage=10';

const erro = (status) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });

export function chaveDoCaminho(pathname) {
  if (!pathname.startsWith(PREFIXO)) return null;
  const chave = pathname.slice(PREFIXO.length);
  if (!CHAVES_PERMITIDAS.test(chave) || chave.includes('..')) return null;
  return chave;
}

function respostaDoObjeto(objeto) {
  const headers = new Headers();
  objeto.writeHttpMetadata(headers);
  headers.set('etag', objeto.httpEtag);
  if (!headers.has('cache-control')) headers.set('cache-control', CACHE_PADRAO);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(objeto.body, { headers });
}

export async function servirDados(request, env, ctx, cache = caches.default) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return erro(405);
  const url = new URL(request.url);
  // Query string furaria o cache: recusada.
  if (url.search) return erro(400);
  const chave = chaveDoCaminho(url.pathname);
  if (!chave) return erro(404);

  const chaveCache = new Request(url.toString(), { method: 'GET' });
  const emCache = await cache.match(chaveCache);
  if (emCache) {
    const r = new Response(emCache.body, emCache);
    r.headers.set('x-cache', 'HIT');
    return r;
  }

  const objeto = await env.DATA.get(chave);
  if (!objeto) return erro(404);
  const resposta = respostaDoObjeto(objeto);
  ctx.waitUntil(cache.put(chaveCache, resposta.clone()));
  resposta.headers.set('x-cache', 'MISS');
  return resposta;
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await servirDados(request, env, ctx);
    } catch (e) {
      console.error('dados: falha ao servir', request.url, e && e.stack);
      return erro(502);
    }
  },
};
