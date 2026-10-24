// Busca condicional no TSE com timeout, retry com backoff e pacing.
import { BACKOFF_BASE_MS, CONCORRENCIA, FETCH_RETRIES, FETCH_TIMEOUT_MS, PACE_MS, USER_AGENT } from './config.mjs';

const sleepPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @returns {{status:number, notModified?:boolean, body?:Uint8Array, etag?:string, lastModified?:string, erro?:string}}
 * status 0 = falha de rede/timeout/5xx apos os retries.
 */
export async function buscarArquivo(url, condicional, deps) {
  const { fetchFn = fetch, sleep = sleepPadrao, timeoutMs = FETCH_TIMEOUT_MS, retries = FETCH_RETRIES } = deps;
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  if (condicional?.etag) headers['If-None-Match'] = condicional.etag;
  if (condicional?.lastModified) headers['If-Modified-Since'] = condicional.lastModified;

  let ultimoErro = 'desconhecido';
  for (let tentativa = 0; tentativa <= retries; tentativa++) {
    if (tentativa > 0) await sleep(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetchFn(url, { headers, signal: ctrl.signal, cf: { cacheTtl: 0 } });
      if (resp.status === 304) return { status: 304, notModified: true };
      if (resp.status === 200) {
        const body = new Uint8Array(await resp.arrayBuffer());
        return {
          status: 200,
          body,
          etag: resp.headers.get('etag') ?? null,
          lastModified: resp.headers.get('last-modified') ?? null,
        };
      }
      if (resp.status === 404) return { status: 404 };
      ultimoErro = `HTTP ${resp.status}`;
      if (resp.status < 500 && resp.status !== 429) return { status: resp.status, erro: ultimoErro };
    } catch (e) {
      ultimoErro = e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e);
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 0, erro: ultimoErro };
}

/**
 * Executa `tarefas` (funcoes async) com concorrencia limitada e pacing entre inicios.
 * Resultado na mesma ordem das tarefas.
 */
export async function executarPaced(tarefas, deps = {}) {
  const { sleep = sleepPadrao, paceMs = PACE_MS, concorrencia = CONCORRENCIA } = deps;
  const resultados = new Array(tarefas.length);
  let proximo = 0;
  let ultimoInicio = 0;
  const operario = async () => {
    while (proximo < tarefas.length) {
      const i = proximo++;
      const espera = ultimoInicio + paceMs - Date.now();
      ultimoInicio = Math.max(Date.now(), ultimoInicio + paceMs);
      if (espera > 0) await sleep(espera);
      resultados[i] = await tarefas[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concorrencia, tarefas.length) }, operario));
  return resultados;
}
