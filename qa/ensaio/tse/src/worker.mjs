// TSE falso do ensaio geral. Mapeia /oficial/ele2026/... para o instante corrente do ensaio.
const PASSO_MS = 60_000;
const NO_STORE = 'no-store';

export function instanteAtual(env, agora = Date.now()) {
  const lista = String(env.ENSAIO_INSTANTES || '').split(',').filter(Boolean);
  const inicio = Number(env.ENSAIO_INICIO);
  if (!lista.length || !Number.isFinite(inicio)) throw new Error('ENSAIO_INSTANTES/ENSAIO_INICIO ausentes');
  const idx = Math.min(lista.length - 1, Math.max(0, Math.floor((agora - inicio) / PASSO_MS)));
  return { idx, hhmm: lista[idx], total: lista.length };
}

const PREFIXO = '/oficial/ele2026/';
export function caminhoDoAsset(pathname, hhmm) {
  if (!pathname.startsWith(PREFIXO) || pathname.includes('..')) return null;
  const resto = pathname.slice(PREFIXO.length);
  if (/^6260\/config\//.test(resto)) return `/_estatico/${resto}`;
  return `/${hhmm}${PREFIXO}${resto}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const inst = instanteAtual(env);
    if (url.pathname === '/_status') {
      return Response.json({ ...inst, agora: Date.now() }, { headers: { 'cache-control': NO_STORE } });
    }
    const alvo = caminhoDoAsset(url.pathname, inst.hhmm);
    if (!alvo || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return new Response('Not found', { status: 404, headers: { 'cache-control': NO_STORE } });
    }
    const resp = await env.ASSETS.fetch(new Request(new URL(alvo, url), { method: 'GET' }));
    if (resp.status !== 200) return new Response('Not found', { status: 404, headers: { 'cache-control': NO_STORE } });
    const etag = resp.headers.get('etag');
    const h = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': NO_STORE,
      'x-ensaio-instante': `${inst.idx}:${inst.hhmm}`,
    });
    if (etag) h.set('etag', etag);
    if (etag && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: h });
    return new Response(request.method === 'HEAD' ? null : resp.body, { status: 200, headers: h });
  },
};
