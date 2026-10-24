// Revisao estatistica independente da v3 (docs/REVISAO-ESTATISTICA-V3.md). Uso: node model/backtest/tools/revisao-v3.mjs <replay.json> model/backtest/relatorio.json
import { readFileSync } from 'node:fs';
const D = JSON.parse(readFileSync(process.argv[2], "utf8"));
const R = JSON.parse(readFileSync(process.argv[3], "utf8"));
const C = Object.fromEntries(D.corridas.map((c) => [c.nome, c]));
const B = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99.5, 100.01];
const rot = (i) => `${B[i]}-${Math.min(100, B[i + 1])}`;
const bin = (p) => B.findIndex((b, i) => p >= b && p < B[i + 1]);
const med = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f = (x, d = 2) => (x == null ? '  -  ' : (x >= 0 ? '+' : '') + x.toFixed(d));
const serie = (nome, v, campo) => C[nome].serie.filter((s) => s.pctEl >= 10 && (campo ? s[campo] != null : s.erros[v] != null)).map((s) => ({ p: s.pctEl, e: campo ? s[campo] : s.erros[v] }));
const interp = (cv, x) => { if (x <= cv[0].x) return cv[0].y; for (let i = 1; i < cv.length; i++) if (x <= cv[i].x) { const a = cv[i - 1], b = cv[i]; return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return cv[cv.length - 1].y; };
const cv2t = R.curvas_deriva.A_2t2022, cv1t = R.curvas_deriva.A_1t2022;
const faixaV3 = R.faixas.presidente, faixaV2 = R.faixas.presidente_sem_correcao;
const meiaDe = (tab, p) => (tab.find((b) => p < b.ate) ?? tab[tab.length - 1]).meia;

// 1. deriva da parcial bruta (nacional) por turno, e quanto a estratificacao por UF captura
console.log('\n== 1. Deriva da PARCIAL BRUTA nacional (erro bruto, Lula entre os dois) e do modelo A, por faixa');
console.log('faixa     bruto1T22 A1T22  razao | bruto2T22 A2T22 razao | bruto1T26 A1T26 razao');
const br = { b1: serie('presidente_1t', null, 'bruto'), a1: serie('presidente_1t', 'M0_1T'), b2: serie('presidente_2t', null, 'bruto'), a2: serie('presidente_2t', 'M1_prior'), b3: serie('holdout_1t2026_uf', null, 'bruto'), a3: serie('holdout_1t2026_uf', 'M1_prior') };
for (let i = 0; i < B.length - 2; i++) {
  const m = (s) => med(s.filter((x) => bin(x.p) === i).map((x) => x.e));
  const r = (a, b) => (m(a) && m(b) ? (m(a) / m(b)).toFixed(2) : '-');
  console.log(rot(i).padEnd(9), f(m(br.b1)), f(m(br.a1)), r(br.a1, br.b1).padStart(5), ' |', f(m(br.b2)), f(m(br.a2)), r(br.a2, br.b2).padStart(5), ' |', f(m(br.b3)), f(m(br.a3)), r(br.a3, br.b3).padStart(5));
}
console.log('razao 1T/2T (modelo A, 2022) por faixa:', B.slice(0, -2).map((_, i) => { const m = (s) => med(s.filter((x) => bin(x.p) === i).map((x) => x.e)); return (m(br.a1) / m(br.a2)).toFixed(2); }).join(' '));
console.log('razao 1T26/1T22 (modelo A) por faixa:  ', B.slice(0, -2).map((_, i) => { const m = (s) => med(s.filter((x) => bin(x.p) === i).map((x) => x.e)); return (m(br.a3) / m(br.a1)).toFixed(2); }).join(' '));

// 2. curva 2T22 por faixa (max |y| dentro da faixa) e tolerancia da faixa v3 em termos de lambda (deriva 2T26 / deriva 2T22)
console.log('\n== 2. Faixa v3 vs curva 2T 2022: que multiplo da deriva (lambda) a faixa tolera');
console.log('faixa     |curva|max  v3    lambda tolerado      v2');
const curvaMax = B.slice(0, -1).map((_, i) => Math.max(...cv2t.filter((p) => bin(p.x) === i).map((p) => Math.abs(p.y)), 0));
for (let i = 0; i < B.length - 1; i++) {
  const c = curvaMax[i] || Math.abs(interp(cv2t, (B[i] + Math.min(100, B[i + 1])) / 2));
  const v3 = meiaDe(faixaV3, B[i]); const t = v3 / c;
  console.log(rot(i).padEnd(9), c.toFixed(2).padStart(6), v3.toFixed(2).padStart(6), `[${Math.max(0, 1 - t).toFixed(2)}, ${(1 + t).toFixed(2)}]`.padStart(14), meiaDe(faixaV2, B[i]).toFixed(2).padStart(8));
}

// 3. cenarios para o 2T 2026: residuo = (lambda-1)*curva2T22; coberto pela faixa? e risco de chamada errada por margem final M
console.log('\n== 3. Cenarios de deriva no 2T 2026 (residuo pos-correcao = (lambda-1) x curva 2T22, no centro da faixa)');
const lambdas = [0, 0.5, 0.75, 1.25, 1.5, 2, 2.8];
const faixaRec = B.slice(0, -1).map((_, i) => ({ ate: B[i + 1], meia: Math.max(meiaDe(faixaV3, B[i]), 0.75 * curvaMax[i]) }));
for (let i = faixaRec.length - 2; i >= 0; i--) faixaRec[i].meia = Math.max(faixaRec[i].meia, faixaRec[i + 1].meia);
console.log('faixa    ' + lambdas.map((l) => `l=${l}`.padStart(7)).join('') + '   v3    rec');
for (let i = 0; i < B.length - 2; i++) {
  const x = (B[i] + Math.min(100, B[i + 1])) / 2; const c = interp(cv2t, x);
  console.log(rot(i).padEnd(9) + lambdas.map((l) => f((l - 1) * c).padStart(7)).join('') + '  ' + meiaDe(faixaV3, B[i]).toFixed(2) + '  ' + faixaRec[i].meia.toFixed(2));
}
console.log('\n== 3b. Chamada ERRADA de tendencia? margem final M (Lula - Flavio, p.p.), por cenario lambda, faixa v3 | rec. Lista faixas de apuracao em que ocorre.');
for (const M of [-1, -0.5, 0.5, 1, 1.8, 3]) {
  const linha = [];
  for (const l of lambdas) {
    const erradas = (tab) => B.slice(0, -2).map((_, i) => { const x = (B[i] + Math.min(100, B[i + 1])) / 2; const resid = (l - 1) * interp(cv2t, x); const mp = M + 2 * resid; const meia = meiaDe(tab, B[i]); return Math.abs(mp) > 2 * meia && Math.sign(mp) !== Math.sign(M) ? rot(i) : null; }).filter(Boolean);
    const a = erradas(faixaV3), b = erradas(faixaRec);
    linha.push(`l=${l}: v3 ${a.length ? a.join(',') : 'ok'} | rec ${b.length ? b.join(',') : 'ok'}`);
  }
  console.log(`M=${M}: ` + linha.join(' ; '));
}

// 4. 2T 2022 em amostra com A+C: quando chamaria tendencia com v3 e rec; e com v2 sem correcao
console.log('\n== 4. 2T 2022 (margem final +1,80): primeira chamada de tendencia e chamadas erradas');
const a2c = br.a2.map((s) => ({ p: s.p, e: s.e - interp(cv2t, s.p) }));
const finalA = C.presidente_2t.pctFinalA; const Mf = 2 * finalA - 100;
for (const [nome, pts, tab] of [['A+C v3', a2c, faixaV3], ['A+C rec', a2c, faixaRec], ['A v2 (sem correcao)', br.a2, faixaV2]]) {
  const ch = pts.filter((s) => Math.abs(Mf + 2 * s.e) > 2 * meiaDe(tab, s.p));
  const err = ch.filter((s) => Math.sign(Mf + 2 * s.e) !== Math.sign(Mf));
  console.log(nome.padEnd(22), 'chamadas', ch.length, '/', pts.length, 'primeira a', ch.length ? Math.min(...ch.map((s) => s.p)).toFixed(1) + '%' : '-', 'erradas', err.length);
}
// holdout 1T26 (margem -2,02) com faixa rec
const hc = br.a3.map((s) => ({ p: s.p, e: s.e - interp(cv1t, s.p) }));
const Mh = 2 * C.holdout_1t2026_uf.pctFinalA - 100;
for (const [nome, tab] of [['holdout A+C v3', faixaV3], ['holdout A+C rec', faixaRec]]) {
  const ch = hc.filter((s) => Math.abs(Mh + 2 * s.e) > 2 * meiaDe(tab, s.p)); const err = ch.filter((s) => Math.sign(Mh + 2 * s.e) !== Math.sign(Mh));
  const cob = hc.filter((s) => Math.abs(s.e) <= meiaDe(tab, s.p)).length / hc.length;
  console.log(nome.padEnd(22), 'cobertura', (100 * cob).toFixed(1) + '%', 'chamadas', ch.length, '/', hc.length, 'primeira a', ch.length ? Math.min(...ch.map((s) => s.p)).toFixed(1) + '%' : '-', 'erradas', err.length);
}

// 5. autocorrelacao do residuo corrigido do holdout (lag 1 minuto) e n efetivo por faixa
console.log('\n== 5. Holdout A+C: autocorrelacao lag-1 do residuo por faixa (n efetivo ~ n(1-r)/(1+r))');
for (let i = 0; i < B.length - 2; i++) {
  const e = hc.filter((s) => bin(s.p) === i).map((s) => s.e); if (e.length < 4) { console.log(rot(i), 'n', e.length); continue; }
  const m = med(e); const num = e.slice(1).reduce((a, x, k) => a + (x - m) * (e[k] - m), 0); const den = e.reduce((a, x) => a + (x - m) ** 2, 0);
  const r = den ? num / den : 0; const neff = e.length * (1 - r) / (1 + r);
  console.log(rot(i).padEnd(9), 'n', String(e.length).padStart(3), 'r1', f(r), 'n_eff', neff.toFixed(1), 'dp', Math.sqrt(den / e.length).toFixed(3));
}

// 6. governador: cobertura no holdout 1T 2026 (relatorio) e corridas 2022 abaixo de 90%
console.log('\n== 6. Governador: cobertura por corrida (faixa q90 pooled)');
const cg = R.cobertura.governador; console.log('2022 (38 corridas): media', (100 * med(cg.map((c) => c.cobertura))).toFixed(1) + '%', '<90%:', cg.filter((c) => c.cobertura < 0.9).map((c) => `${c.corrida} ${(100 * c.cobertura).toFixed(0)}% M=${c.margem_final}`).join('; '));
console.log('2022 chamadas erradas total:', cg.reduce((a, c) => a + c.chamadas_erradas, 0));
for (const k of ['holdout_gov1t2026_M0', 'holdout_gov1t2026_zonas_M0', 'governador_1t_M0']) { const l = R.cobertura[k]; if (!l) continue; console.log(k, l.map((c) => `${c.corrida} ${(100 * c.cobertura).toFixed(0)}% ch=${c.chamadas} err=${c.chamadas_erradas} M=${c.margem_final}`).join('; ')); }

// 7. tabela recomendada final + MAE recomendado (max(MAE holdout, meia/2))
console.log('\n== 7. Faixa recomendada (max(v3, 0,75 x |curva 2T22|), monotona) e erro medio esperado recomendado');
console.log('faixa     v3     rec   maeV3  maeRec   razao rec/v3  v2');
for (let i = 0; i < B.length - 1; i++) {
  const maeV3 = (R.mae.presidente.find((b) => B[i] < b.ate) ?? {}).mae; const rec = faixaRec[i].meia; const maeRec = Math.max(maeV3 ?? 0.05, rec / 2);
  console.log(rot(i).padEnd(9), meiaDe(faixaV3, B[i]).toFixed(3), rec.toFixed(3), (maeV3 ?? 0).toFixed(3), maeRec.toFixed(3), (rec / meiaDe(faixaV3, B[i])).toFixed(2).padStart(8), meiaDe(faixaV2, B[i]).toFixed(2).padStart(8));
}
console.log(JSON.stringify(faixaRec.map((b) => ({ ate: b.ate, meia: Math.round(b.meia * 1000) / 1000 }))));
