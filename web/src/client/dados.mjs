// Acesso aos JSON publicados. A base é configurada no build (DATA_BASE_URL). Nunca há query string.
import { buscarJson, urlDados } from '../lib/poll.mjs';

/* global __DATA_BASE__, __MAPA_URL__, __VERIFIER_URL__ */
export const BASE = __DATA_BASE__;
export const MAPA_URL = __MAPA_URL__;
export const VERIFICADOR_URL = __VERIFIER_URL__;
export const url = (caminho) => urlDados(BASE, caminho);
export const baseComBarra = () => `${BASE.replace(/\/+$/, '')}/`;

let seriePromise = null;
/** series.json: baixado 1× por visita; depois é estendido pelos pontos do latest. */
export function carregarSerie() {
  if (!seriePromise) seriePromise = buscarJson(url('live/series.json')).catch(() => { seriePromise = null; return null; });
  return seriePromise;
}

export const carregarGov = (uf) => buscarJson(url(`live/gov-${uf}.json`));
export const carregarManifest = () => buscarJson(url('live/manifest.json'));
export const carregarSnapshot = (chave) => buscarJson(url(chave));
export async function carregarTexto(caminho) {
  const r = await fetch(url(caminho));
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${caminho}`);
  return r.text();
}
export const validarLatest = (j) => Boolean(j) && j.schema === 1;
