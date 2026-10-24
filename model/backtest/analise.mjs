// Helpers puros do backtest v3: series de erro, curvas de deriva (bins finos), tabelas por faixa, regra da faixa pos-correcao.
import { interpolar } from '../correcao.mjs';

export const BORDAS = [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99.5, 100.01];
export const BINS_FINOS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 98, 99.5, 100.01];
export const PISO = 0.05;
export const r = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
export const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const quantil = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
export const binDe = (pct, bordas = BORDAS) => bordas.findIndex((b, i) => pct >= b && pct < bordas[i + 1]);
export const rotulo = (i, bordas = BORDAS) => `${bordas[i]}-${Math.min(100, bordas[i + 1])}`;

// Serie {p: % eleitorado, e: erro (proj - final, p.p. do candidato A)} de uma corrida/variante, a partir de pctMin.
export const serie = (corrida, variante, pctMin = 10) =>
  corrida.serie.filter((s) => s.erros?.[variante] != null && s.pctEl >= pctMin).map((s) => ({ p: s.pctEl, e: s.erros[variante] }));

// Curva de deriva: erro medio por bin fino, ponto no centro do bin.
export function curvaDeriva(pts, bins = BINS_FINOS) {
  return bins.slice(0, -1)
    .map((lo, i) => ({ x: r((lo + Math.min(100, bins[i + 1])) / 2, 3), y: r(media(pts.filter((s) => s.p >= lo && s.p < bins[i + 1]).map((s) => s.e)), 4) }))
    .filter((p) => p.y != null);
}

export const corrigir = (pts, curva) => pts.map((s) => ({ p: s.p, e: s.e - interpolar(curva, s.p) }));

// Tabela por faixa (BORDAS): n, vies, MAE, max |e|, q90 |e|.
export function tabela(pts, bordas = BORDAS) {
  return bordas.slice(0, -1).map((_, i) => {
    const e = pts.filter((s) => binDe(s.p, bordas) === i).map((s) => s.e);
    const abs = e.map(Math.abs);
    return { faixa: rotulo(i, bordas), ate: bordas[i + 1], n: e.length, vies: r(media(e)), mae: r(media(abs)), max: r(abs.length ? Math.max(...abs) : null), q90: r(quantil(abs, 0.9)) };
  });
}

// Faixa pos-correcao: por bin, maior |erro corrigido| entre os conjuntos + |vies de transferencia| observado no holdout.
// Justificativa: a unica medida fora da amostra da transferencia entre eleicoes (curva 1T 2022 -> 1T 2026) mostra vies
// residual de ate ~0,3 p.p.; somamos esse vies ao maior erro para admitir que a transferencia 2T 2022 -> 2T 2026 erre
// igual em qualquer sentido. Sem o holdout (conjunto vazio), fica so o maximo.
// v3.1 (revisao estatistica independente, docs/REVISAO-ESTATISTICA-V3.md §2): alem disso, a meia-largura nunca fica
// abaixo de `fracaoCurva` x max|curva de deriva| dentro da faixa, para tolerar que a deriva do 2T 2026 fique entre
// (1 - fracaoCurva) e (1 + fracaoCurva) da de 2022 (so ha UM par de transferencia observado, e de outro tipo de turno).
export const FRACAO_CURVA = 0.75;
export function faixaPosCorrecao({ conjuntos, holdout, curva = null, fracaoCurva = FRACAO_CURVA, bordas = BORDAS }) {
  const tabs = conjuntos.map((pts) => tabela(pts, bordas));
  const th = holdout ? tabela(holdout, bordas) : null;
  return bordas.slice(0, -1).map((_, i) => {
    const maximos = tabs.map((t) => t[i].max).filter((x) => x != null);
    const maior = maximos.length ? Math.max(...maximos) : null;
    const vies = th?.[i]?.vies == null ? 0 : Math.abs(th[i].vies);
    const naFaixa = (curva ?? []).filter((p) => p.x >= bordas[i] && p.x < bordas[i + 1]).map((p) => Math.abs(p.y));
    const pisoCurva = naFaixa.length ? fracaoCurva * Math.max(...naFaixa) : 0;
    const regra = maior == null ? null : maior + vies;
    return { faixa: rotulo(i, bordas), ate: bordas[i + 1], n: tabs.reduce((s, t) => s + t[i].n, 0), max: r(maior), vies_holdout: r(vies), regra_v3: r(regra), piso_curva: r(pisoCurva), meia: regra == null && !naFaixa.length ? null : r(Math.max(regra ?? 0, pisoCurva)) };
  });
}

// Erro medio exibido = max(MAE observado, meia-largura/2): mantem a razao faixa/MAE ~ 2 (revisao §5).
export function maeExibido(maeBins, faixaBins) {
  return maeBins.map((b, i) => ({ ...b, mae_observado: b.mae, mae: b.mae == null ? null : r(Math.max(b.mae, (faixaBins[i]?.meia ?? 0) / 2)) }));
}

// Serie do erro da PARCIAL bruta (sem modelo), para o MAE comparativo "parcial ±Y".
export const serieBruto = (corrida, pctMin = 10) =>
  corrida.serie.filter((s) => s.bruto != null && s.pctEl >= pctMin).map((s) => ({ p: s.pctEl, e: s.bruto }));

export function monotona(bins) {
  const out = bins.map((b) => ({ ...b }));
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const prox = out[i + 1]?.meia ?? null;
    const atual = out[i].meia ?? prox ?? PISO;
    out[i].meia = Math.max(PISO, atual, prox ?? 0);
  }
  return out;
}

// MAE por faixa (erro medio esperado para a UI), com piso.
export const maePorFaixa = (pts, bordas = BORDAS) => tabela(pts, bordas).map((t) => ({ faixa: t.faixa, ate: t.ate, n: t.n, mae: t.mae == null ? null : Math.max(PISO, t.mae) }));

// Cobertura e chamadas com uma faixa (bins {ate, meia}) sobre uma serie corrigida; margem final da corrida em p.p.
export function cobertura(pts, bins, pctFinalA) {
  const meia = (pct) => (bins.find((b) => pct < b.ate) ?? bins[bins.length - 1]).meia;
  const dentro = pts.filter((s) => Math.abs(s.e) <= meia(s.p)).length;
  const finalMargem = 2 * pctFinalA - 100;
  const chamadas = pts.filter((s) => Math.abs(2 * (pctFinalA + s.e) - 100) > 2 * meia(s.p));
  const erradas = chamadas.filter((s) => Math.sign(2 * (pctFinalA + s.e) - 100) !== Math.sign(finalMargem));
  const porBin = BORDAS.slice(0, -1).map((_, i) => {
    const b = pts.filter((s) => binDe(s.p) === i);
    return { faixa: rotulo(i), n: b.length, cobertura: r(b.length ? b.filter((s) => Math.abs(s.e) <= meia(s.p)).length / b.length : null) };
  });
  return { pontos: pts.length, cobertura: r(pts.length ? dentro / pts.length : null), chamadas: chamadas.length, chamadas_erradas: erradas.length, primeira_chamada_pctEl: r(chamadas.length ? Math.min(...chamadas.map((s) => s.p)) : null), margem_final: r(finalMargem), por_faixa: porBin };
}
