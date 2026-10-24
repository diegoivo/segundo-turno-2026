// Lock simples sobre R2 (objeto `locks/coletor.lock`) com escrita condicional.
//
// Aquisicao:
//   1. put(onlyIf: etagDoesNotMatch '*')  -> so cria se o objeto nao existe;
//   2. se existe e expirou (expira_em < agora), toma conta com put(onlyIf: etagMatches <etag observado>):
//      de dois concorrentes, so um vence o compare-and-swap.
// Liberacao: delete se o dono ainda e o nosso.
// O lock so cobre a secao critica de commit (poucos segundos), nunca o fetch ao TSE.
// Rede de seguranca extra: o manifest e gravado com etagMatches (CAS), entao mesmo um lock
// vencido no meio do commit nao deixa dois escritores avancarem o mesmo seq.
import { LOCK_TTL_MS } from './config.mjs';

export const chaveLock = (nome) => `locks/${nome}.lock`;

// Um lock por cadeia (nome = eleicao): o commit lento de 6260 nao bloqueia o de 6258.
export async function adquirirLock(bucket, { nome = 'coletor', agora = () => Date.now(), ttlMs = LOCK_TTL_MS, tentativas = 5, esperaMs = 200, sleep } = {}) {
  const CHAVE = chaveLock(nome);
  const dono = crypto.randomUUID();
  const corpo = () => JSON.stringify({ dono, expira_em: agora() + ttlMs });
  const meta = { httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' } };
  for (let i = 0; i < tentativas; i++) {
    const criado = await bucket.put(CHAVE, corpo(), { ...meta, onlyIf: { etagDoesNotMatch: '*' } });
    if (criado) return { dono, chave: CHAVE, etag: criado.etag, ttlMs };
    const atual = await bucket.head(CHAVE);
    if (atual) {
      const obj = await bucket.get(CHAVE);
      let expiraEm = 0;
      try {
        expiraEm = JSON.parse(await obj.text()).expira_em ?? 0;
      } catch {
        expiraEm = 0; // lock corrompido conta como expirado
      }
      if (expiraEm < agora()) {
        const tomado = await bucket.put(CHAVE, corpo(), { ...meta, onlyIf: { etagMatches: obj.etag } });
        if (tomado) return { dono, chave: CHAVE, etag: tomado.etag, ttlMs };
      }
    }
    if (sleep) await sleep(esperaMs);
  }
  return null;
}

export async function conferirLock(bucket, lock) {
  const obj = await bucket.get(lock.chave);
  if (!obj) return false;
  try {
    return JSON.parse(await obj.text()).dono === lock.dono;
  } catch {
    return false;
  }
}

export async function liberarLock(bucket, lock) {
  if (await conferirLock(bucket, lock)) await bucket.delete(lock.chave);
}

/** Estende o TTL (put condicionado ao nosso etag). Retorna false se o lock foi perdido. */
export async function renovarLock(bucket, lock, agora = () => Date.now()) {
  const r = await bucket.put(lock.chave, JSON.stringify({ dono: lock.dono, expira_em: agora() + lock.ttlMs }), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    onlyIf: { etagMatches: lock.etag },
  });
  if (!r) return false;
  lock.etag = r.etag;
  return true;
}
