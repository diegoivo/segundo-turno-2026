// Helpers de gravacao no R2 (Content-Type e Cache-Control corretos) e chaves.
import { CACHE_IMUTAVEL, CACHE_LIVE } from './config.mjs';

export const JSON_UTF8 = 'application/json; charset=utf-8';

export const chaveRaw = (sha) => `raw/${sha}.json.gz`;
export const chaveHistory = (eleicao, dataIso, seq, sha) =>
  `history/${eleicao}/${dataIso}/${String(seq).padStart(6, '0')}-${sha}.json`;
export const CHAVE_MANIFEST = 'live/manifest.json';
export const CHAVE_LATEST = 'live/latest.json';
export const CHAVE_SERIES = 'live/series.json';
export const chaveGov = (uf) => `live/gov-${uf}.json`;

/** Grava objeto imutavel so se nao existir. Retorna true se gravou, false se ja existia. */
export async function gravarImutavel(bucket, chave, corpo, contentType) {
  try {
    const r = await bucket.put(chave, corpo, {
      httpMetadata: { contentType, cacheControl: CACHE_IMUTAVEL },
      onlyIf: { etagDoesNotMatch: '*' },
    });
    return r !== null;
  } catch (e) {
    // Bucket Lock: regravar chave existente falha (409). Se o objeto ja existe, e o mesmo que ja foi gravado.
    if (await bucket.head(chave)) return false;
    throw e;
  }
}

/** Grava objeto "live" (mutavel). `onlyIf` opcional para CAS. Retorna o objeto gravado ou null. */
export async function gravarLive(bucket, chave, valor, onlyIf) {
  const opts = { httpMetadata: { contentType: JSON_UTF8, cacheControl: CACHE_LIVE } };
  if (onlyIf) opts.onlyIf = onlyIf;
  return bucket.put(chave, typeof valor === 'string' ? valor : JSON.stringify(valor), opts);
}

export async function lerJson(bucket, chave) {
  const obj = await bucket.get(chave);
  if (!obj) return { valor: null, etag: null };
  return { valor: JSON.parse(await obj.text()), etag: obj.etag };
}
