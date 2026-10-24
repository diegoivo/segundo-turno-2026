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

const CHAVE = 'locks/coletor.lock';

export async function adquirirLock(bucket, { agora = () => Date.now(), ttlMs = LOCK_TTL_MS, tentativas = 5, esperaMs = 200, sleep } = {}) {
  const dono = crypto.randomUUID();
  const corpo = () => JSON.stringify({ dono, expira_em: agora() + ttlMs });
  const meta = { httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' } };
  for (let i = 0; i < tentativas; i++) {
    const criado = await bucket.put(CHAVE, corpo(), { ...meta, onlyIf: { etagDoesNotMatch: '*' } });
    if (criado) return { dono, chave: CHAVE };
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
        if (tomado) return { dono, chave: CHAVE };
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
