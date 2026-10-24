// Polling gentil: intervalo com jitter, pausa com a aba oculta, backoff exponencial em erro.
// IMPORTANTE: nunca adiciona query string à URL (o WAF bloqueia; o cache da CDN depende da URL exata).
// Usa fetch normal, sem opções: quem decide o cache é o CDN (Cache-Control da origem).
import { POLL } from './config.mjs';

export function proximoAtrasoMs({ falhas, intervaloMs = POLL.intervaloMs, jitterMs = POLL.jitterMs, backoffMaxMs = POLL.backoffMaxMs, random = Math.random }) {
  const jitter = (random() * 2 - 1) * jitterMs;
  if (falhas <= 0) return Math.max(1000, intervaloMs + jitter);
  return Math.min(backoffMaxMs, intervaloMs * 2 ** falhas) + Math.abs(jitter);
}

/** Junta a base configurável e o caminho, sem query string. */
export function urlDados(base, caminho) {
  const b = String(base || '/').replace(/\/+$/, '');
  const c = String(caminho).replace(/^\/+/, '').split('?')[0];
  return `${b}/${c}`;
}

export async function buscarJson(url, fetchFn = fetch) {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.json();
}

/**
 * @param opts { url, onData(json), onErro(err, falhas), validar(json)->bool, fetchFn, doc, setT, clearT, random }
 * @returns { iniciar(), parar(), atualizarAgora(), estado() }
 */
export function criarPoller(opts) {
  const {
    url, onData, onErro = () => {}, validar = () => true, fetchFn = (...a) => fetch(...a), doc = typeof document === 'undefined' ? null : document,
    setT = (f, ms) => setTimeout(f, ms), clearT = (t) => clearTimeout(t), random = Math.random, config = POLL,
  } = opts;
  let timer = null;
  let falhas = 0;
  let emVoo = false;
  let ativo = false;
  let ultimo = 0;

  const oculto = () => Boolean(doc && doc.hidden);
  const agendar = () => {
    clearT(timer);
    timer = null;
    if (!ativo || oculto()) return;
    timer = setT(tick, proximoAtrasoMs({ falhas, random, ...config }));
  };

  async function tick() {
    if (emVoo) return;
    emVoo = true;
    clearT(timer);
    try {
      const json = await buscarJson(url, fetchFn);
      if (!validar(json)) throw new Error('JSON fora do schema esperado');
      falhas = 0;
      ultimo = Date.now();
      onData(json);
    } catch (e) {
      falhas += 1;
      onErro(e, falhas);
    } finally {
      emVoo = false;
      agendar();
    }
  }

  const aoMudarVisibilidade = () => {
    if (!ativo) return;
    if (oculto()) { clearT(timer); timer = null; } else if (Date.now() - ultimo >= (config.intervaloMs ?? POLL.intervaloMs) / 2 || falhas > 0) tick(); else agendar();
  };

  return {
    iniciar() {
      if (ativo) return;
      ativo = true;
      if (doc) doc.addEventListener('visibilitychange', aoMudarVisibilidade);
      tick();
    },
    parar() {
      ativo = false;
      clearT(timer);
      if (doc) doc.removeEventListener('visibilitychange', aoMudarVisibilidade);
    },
    atualizarAgora() { return tick(); },
    estado: () => ({ falhas, emVoo, ativo, agendado: timer != null }),
  };
}
