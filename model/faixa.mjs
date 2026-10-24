// Faixa de erro empirica: meia-largura (p.p. da participacao do candidato) em funcao do % do eleitorado
// totalizado, por tipo de corrida. A tabela vem do backtest (model/calibracao.mjs), nao e um palpite.
// A faixa da MARGEM (A - B) e o dobro, porque com dois candidatos B = 100 - A.
import { CALIBRACAO } from './calibracao.mjs';

export function meiaLargura(tipo, pctApurado, calib = CALIBRACAO) {
  const tabela = calib.faixas[tipo] ?? calib.faixas.governador_uf;
  const pct = Math.min(100, Math.max(0, Number(pctApurado) || 0));
  const bin = tabela.find((b) => pct < b.ate) ?? tabela[tabela.length - 1];
  return bin.meia;
}

export function confianca(pctApurado) {
  if (pctApurado < 25) return 'baixa';
  if (pctApurado < 70) return 'media';
  return 'alta';
}

// Vencedor projetado so quando a margem projetada supera a faixa da margem.
export function tendencia({ pctA, pctB, meia }) {
  const margem = pctA - pctB;
  const faixaMargem = 2 * meia;
  if (Math.abs(margem) <= faixaMargem) return { lider: null, margem, faixaMargem };
  return { lider: margem > 0 ? 'A' : 'B', margem, faixaMargem };
}
