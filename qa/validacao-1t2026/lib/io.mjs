// E/S do QA: leitura do replay e do resultado oficial. Somente leitura; nao altera model/ nem backfill/.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const REPLAY = join(RAIZ, 'backfill', '1t2026', 'replay');
export const OFICIAL = join(RAIZ, 'fixtures', 'tse', 'oficial', 'ele2026');
export const BACKFILL = join(RAIZ, 'backfill', '1t2026');
export const UFS27 = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to'.split(' ');

export const lerJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const existe = existsSync;

// Instantes do replay em ordem cronologica (1700..2355, depois 0000..0300 de 05/10).
export function listarInstantes() {
  const chave = (h) => (Number(h.slice(0, 2)) < 12 ? 2400 : 0) + Number(h);
  return readdirSync(join(REPLAY, 'presidente')).filter((d) => /^\d{4}$/.test(d)).sort((a, b) => chave(a) - chave(b));
}

// "04/10/2026" + "20:00:00" (Brasilia, UTC-3) -> epoch ms
export function epoch(dg, hg) {
  const [d, m, a] = dg.split('/');
  return Date.parse(`${a}-${m}-${d}T${hg}-03:00`);
}

// O modelo e de 2o turno e rejeita t != '2'. Copia rasa com t='2' (sem mutar o original).
export const como2T = (j) => ({ ...j, t: '2' });
