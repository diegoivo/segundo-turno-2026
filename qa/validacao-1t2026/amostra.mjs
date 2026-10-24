// Re-calculo independente por amostra (sem usar o codigo do modelo): para estratos ja apurados e encolhimento 0,
// projecao do estrato = a * te / est (pendentes = (te-est)*vvc/est, divididos na proporcao observada). Presidente,
// 24 instantes igualmente espacados entre os publicados. Compara com resultados.json e a parcial com o arquivo BR.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, REPLAY, UFS27, lerJson } from './lib/io.mjs';
import { extrairCandidatos } from '../../model/parse.mjs'; // so leitura dos candidatos do JSON

const num = (x) => Number(String(x).replace(',', '.'));
const d = JSON.parse(readFileSync(join(RAIZ, 'qa/validacao-1t2026/resultados.json'), 'utf8'));
const rows = d.rows.filter((r) => r.corrida === 'presidente' && r.modo === 'B' && r.publicado);
const amostra = Array.from({ length: 24 }, (_, i) => rows[Math.round((i * (rows.length - 1)) / 23)]);
const saida = amostra.map((r) => {
  const dir = join(REPLAY, 'presidente', r.hhmm);
  let A = 0; let B = 0; let oA = 0; let oB = 0;
  for (const u of [...UFS27, 'zz']) {
    const j = lerJson(join(dir, `${u}-c0001-e006257-u.json`));
    const c = extrairCandidatos(j); const a = c.find((x) => x.n === '13').vap; const b = c.find((x) => x.n === '22').vap;
    const te = num(j.e.te); const est = num(j.e.est);
    oA += a; oB += b;
    if (est > 0 && a + b > 0) { A += (a * te) / est; B += (b * te) / est; }
  }
  const br = extrairCandidatos(lerJson(join(dir, 'br-c0001-e006257-u.json')));
  const ba = br.find((x) => x.n === '13').vap; const bb = br.find((x) => x.n === '22').vap;
  const projIndep = (A / (A + B)) * 100; const parcialBr = (ba / (ba + bb)) * 100;
  return { hhmm: r.hhmm, apurado: r.apurado, proj_modelo: r.proj, proj_indep: projIndep, dif_proj: Math.abs(projIndep - r.proj),
    parcial_modelo: r.parcial, parcial_soma_ufs: (oA / (oA + oB)) * 100, parcial_br: parcialBr, dif_parcial_br: Math.abs(parcialBr - r.parcial) };
});
writeFileSync(join(RAIZ, 'qa/validacao-1t2026/amostra.json'), JSON.stringify(saida, null, 1));
console.log(`max |dif projecao| = ${Math.max(...saida.map((x) => x.dif_proj)).toFixed(4)} pp; max |dif parcial vs BR| = ${Math.max(...saida.map((x) => x.dif_parcial_br)).toFixed(4)} pp`);
