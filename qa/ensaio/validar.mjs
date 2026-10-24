import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validarArquivo } from '/Users/diego/Claude/segundo-turno/collector/src/validate.mjs';
const raiz = process.argv[2]; let n = 0, ruins = 0;
function* ar(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? yield* ar(p) : yield p; } }
for (const p of ar(raiz)) {
  if (!p.endsWith('-u.json')) continue;
  const j = JSON.parse(readFileSync(p, 'utf8')); const m = p.match(/ele2026\/(\d+)\/dados\/(\w+)\/([a-z0-9-]+)-c000(\d)-/);
  const [, ele, uf, nome] = m;
  const esperado = { ele, cd: m[4] === '1' ? '1' : '3', nCandidatos: 2,
    tpabr: nome === 'br' ? 'br' : (nome === uf || nome === 'zz') ? 'uf' : 'mu' };
  if (esperado.tpabr === 'mu') esperado.cdabr = nome.slice(2, 7);
  const e = validarArquivo(j, esperado); n++;
  if (e.length) { ruins++; if (ruins < 10) console.log(p, e); }
}
console.log({ n, ruins });
