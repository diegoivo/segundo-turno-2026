// Calibracao a partir do replay (v3): escolha da variante, correcao de deriva das urnas tardias, faixas e MAE por faixa.
// Uso: node model/backtest/calibrar.mjs <replay.json> <relatorio.json> [--escrever-calibracao]
// Regras (explicitas, para auditoria; detalhes em docs/BACKTEST.md):
//  - Governador (38 corridas 2022, estratos municipais): variante = menor MAE medio (>= 10%) com parcimonia (variante
//    mais simples a ate 2,5% do melhor). Faixa = q90 pooled do |erro|. Sem correcao de deriva (nao ha serie por UF).
//  - Presidente A (28 UFs): correcao de deriva = curva do erro medio do 2T 2022 (mesmo tipo de turno). Validacao fora
//    da amostra: curva do 1T 2022 aplicada ao 1T 2026 (holdout). Faixa = maior |erro corrigido| (holdout, 2T 2022 e
//    1T 2022 corrigidos) + |vies de transferencia| do holdout por faixa; MAE esperado = MAE corrigido no holdout.
//  - Presidente B (municipios, swing global): idem, curva do 2T 2022 com estratos municipais; validacao do B+C no
//    holdout so com curva cruzada (nao ha baseline anterior ao 1T 2022), marcada como tal.
//  - 'governador_uf' (estrato unico) e 'governador_zonas': maximo observado. Faixas monotonicas, piso 0,05.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BORDAS, r, media, binDe, rotulo, serie, curvaDeriva, corrigir, tabela, faixaPosCorrecao, monotona, maePorFaixa, cobertura, quantil } from './analise.mjs';

const [entrada, saida, flag] = process.argv.slice(2);
const dados = JSON.parse(readFileSync(entrada, 'utf8'));
const corridas = dados.corridas;
const C = Object.fromEntries(corridas.map((c) => [c.nome, c]));
const porTipo = (tipo) => corridas.filter((c) => c.tipo === tipo);
const TOLERANCIA_PARCIMONIA = 0.025;

// ---- governador (inalterado da v2) ----
function maePorFaixaCorridas(lista, variante) {
  return BORDAS.slice(0, -1).map((_, i) => {
    const porCorrida = lista.map((c) => media(c.serie.filter((s) => binDe(s.pctEl) === i && s.erros[variante] != null).map((s) => Math.abs(s.erros[variante])))).filter((x) => x != null);
    return { faixa: rotulo(i), corridas: porCorrida.length, mae: r(media(porCorrida)) };
  });
}
function compararVariantes(lista, variantes) {
  const tabelaV = Object.fromEntries(variantes.map((v) => [v, maePorFaixaCorridas(lista, v)]));
  const resumo = Object.fromEntries(variantes.map((v) => [v, r(media(tabelaV[v].filter((f, i) => BORDAS[i] >= 10 && f.mae != null).map((f) => f.mae)))]));
  const validas = Object.entries(resumo).filter(([, m]) => m != null);
  const melhor = Math.min(...validas.map(([, m]) => m));
  return { tabela: tabelaV, resumo, melhor_mae: melhor, tolerancia: TOLERANCIA_PARCIMONIA, escolhida: validas.find(([, m]) => m <= melhor * (1 + TOLERANCIA_PARCIMONIA))[0] };
}
function faixaPooled(lista, variante, metodo) {
  return BORDAS.slice(0, -1).map((_, i) => {
    const erros = lista.flatMap((c) => c.serie.filter((s) => binDe(s.pctEl) === i && s.erros[variante] != null).map((s) => Math.abs(s.erros[variante])));
    const meia = erros.length ? (metodo === 'max' ? Math.max(...erros) : quantil(erros, 0.9)) : null;
    return { faixa: rotulo(i), ate: BORDAS[i + 1], n: erros.length, corridas: lista.filter((c) => c.serie.some((s) => binDe(s.pctEl) === i)).length, q90: r(quantil(erros, 0.9)), max: r(erros.length ? Math.max(...erros) : null), meia: r(meia) };
  });
}
const mesclarMax = (a, b) => a.map((x, i) => ({ ...x, n: x.n + (b[i]?.n ?? 0), meia: Math.max(x.meia ?? 0, b[i]?.meia ?? 0) || null }));
function coberturaCorridas(lista, variante, bins) {
  return lista.map((c) => ({ corrida: c.nome, estratos: c.estratos, ...cobertura(serie(c, variante), bins, c.pctFinalA) })).map(({ por_faixa, ...x }) => x);
}
const gov = porTipo('governador');
const compGov = compararVariantes(gov, Object.keys(dados.variantes));
const V = compGov.escolhida;
const maePooled = (lista, v) => maePorFaixa(lista.flatMap((c) => serie(c, v)));

// ---- presidente: A (UF) e B (municipios), correcao de deriva, holdout ----
const VB = 'B_global';
const A2t = serie(C.presidente_2t, V);
const A1t = serie(C.presidente_1t, 'M0_1T');
const B2t = C.presidente_2t_mun ? serie(C.presidente_2t_mun, VB) : null;
const HA = C.holdout_1t2026_uf ? serie(C.holdout_1t2026_uf, 'M1_prior') : null;
const HB = C.holdout_1t2026_mun ? serie(C.holdout_1t2026_mun, VB) : null;
const curvas = { A_2t2022: curvaDeriva(A2t), A_1t2022: curvaDeriva(A1t), B_2t2022: B2t ? curvaDeriva(B2t) : null };
const HAc = HA ? corrigir(HA, curvas.A_1t2022) : null; // validacao fora da amostra (mesmo tipo de turno)
const HBc = HB && curvas.B_2t2022 ? corrigir(HB, curvas.B_2t2022) : null; // cruzada (unica disponivel)
const holdoutFinal = C.holdout_1t2026_uf?.pctFinalA ?? null;
const tabHoldout = HA ? {
  A: tabela(HA), B: HB ? tabela(HB) : null, A_mais_C: tabela(HAc), B_mais_C: HBc ? tabela(HBc) : null,
  variantesB: C.holdout_1t2026_mun ? Object.fromEntries(Object.keys(dados.variantes_b ?? C.holdout_1t2026_mun.serie[0].erros).map((v) => [v, tabela(serie(C.holdout_1t2026_mun, v))])) : null,
  resumo: {
    A: { mae: r(media(HA.map((s) => Math.abs(s.e)))), vies: r(media(HA.map((s) => s.e))) },
    B: HB ? { mae: r(media(HB.map((s) => Math.abs(s.e)))), vies: r(media(HB.map((s) => s.e))) } : null,
    A_mais_C: { mae: r(media(HAc.map((s) => Math.abs(s.e)))), vies: r(media(HAc.map((s) => s.e))) },
    B_mais_C: HBc ? { mae: r(media(HBc.map((s) => Math.abs(s.e)))), vies: r(media(HBc.map((s) => s.e))) } : null,
  },
} : null;

// faixas pos-correcao (producao: curva do 2T 2022 aplicada ao 2T 2026)
const faixas = {
  presidente: monotona(faixaPosCorrecao({ conjuntos: [corrigir(A2t, curvas.A_2t2022), corrigir(A1t, curvas.A_1t2022), ...(HAc ? [HAc] : [])], holdout: HAc })),
  presidente_sem_correcao: monotona(mesclarMax(faixaPooled([C.presidente_2t], V, 'max'), faixaPooled([C.presidente_1t], 'M0_1T', 'max'))),
  presidente_mun: B2t ? monotona(faixaPosCorrecao({ conjuntos: [corrigir(B2t, curvas.B_2t2022), ...(HBc ? [HBc] : [])], holdout: HBc })) : null,
  governador: monotona(faixaPooled(gov, V, 'q90')),
  governador_zonas: monotona(mesclarMax(faixaPooled(porTipo('governador_zonas'), V, 'max'), faixaPooled(porTipo('governador_zonas_1t'), 'M0_1T', 'max'))),
  governador_uf: monotona(faixaPooled(porTipo('governador_uf'), 'M0_1T', 'max')),
};
const mae = {
  presidente: HAc ? maePorFaixa(HAc) : maePorFaixa(corrigir(A2t, curvas.A_2t2022)),
  presidente_mun: HBc ? maePorFaixa(HBc) : B2t ? maePorFaixa(corrigir(B2t, curvas.B_2t2022)) : null,
  governador: maePooled(gov, V), governador_zonas: maePooled(porTipo('governador_zonas'), V), governador_uf: maePooled(porTipo('governador_uf'), 'M0_1T'),
};
// faixas so com 2022 (sem o holdout) para medir cobertura fora da amostra no holdout
const faixaPres2022 = monotona(faixaPosCorrecao({ conjuntos: [corrigir(A2t, curvas.A_2t2022), corrigir(A1t, curvas.A_1t2022)], holdout: null }));
const faixaPresMun2022 = B2t ? monotona(faixaPosCorrecao({ conjuntos: [corrigir(B2t, curvas.B_2t2022)], holdout: null })) : null;

const relatorio = {
  gerado_em: new Date().toISOString(), fonte: entrada, passo_s: dados.passo_s, variante_escolhida: V, variante_B: VB, cfg: dados.variantes[V],
  comparacao_variantes: { governador: compGov, presidente: compararVariantes(porTipo('presidente'), Object.keys(dados.variantes)) },
  curvas_deriva: curvas,
  holdout_1t2026: tabHoldout && {
    final_A: holdoutFinal, ...tabHoldout,
    cobertura_faixa_final: { A_mais_C: cobertura(HAc, faixas.presidente, holdoutFinal), B_mais_C: HBc ? cobertura(HBc, faixas.presidente_mun, holdoutFinal) : null, A_sem_correcao: cobertura(HA, faixas.presidente_sem_correcao, holdoutFinal) },
    cobertura_faixa_so2022: { A_mais_C: cobertura(HAc, faixaPres2022, holdoutFinal), B_mais_C: HBc ? cobertura(HBc, faixaPresMun2022, holdoutFinal) : null },
  },
  em_amostra_2022: { A_2t_corrigido: tabela(corrigir(A2t, curvas.A_2t2022)), A_1t_corrigido: tabela(corrigir(A1t, curvas.A_1t2022)), B_2t: B2t ? tabela(B2t) : null, B_2t_corrigido: B2t ? tabela(corrigir(B2t, curvas.B_2t2022)) : null, A_2t: tabela(A2t), A_1t: tabela(A1t) },
  faixas, mae,
  cobertura: {
    governador: coberturaCorridas(gov, V, faixas.governador), governador_zonas: coberturaCorridas(porTipo('governador_zonas'), V, faixas.governador_zonas),
    governador_uf: coberturaCorridas(porTipo('governador_uf'), 'M0_1T', faixas.governador_uf), governador_1t_M0: coberturaCorridas(porTipo('governador_1t'), 'M0_1T', faixas.governador),
    holdout_gov1t2026_M0: coberturaCorridas(porTipo('holdout_gov'), 'M0_1T', faixas.governador), holdout_gov1t2026_zonas_M0: coberturaCorridas(porTipo('holdout_gov_zonas'), 'M0_1T', faixas.governador_zonas),
  },
  corridas: corridas.map((c) => ({ nome: c.nome, tipo: c.tipo, estratos: c.estratos, pontos: c.serie.length, final_A: c.pctFinalA })),
};
writeFileSync(saida, JSON.stringify(relatorio, null, 1));
console.error('variante governador:', V, compGov.resumo, '| holdout:', JSON.stringify(tabHoldout?.resumo));

if (flag === '--escrever-calibracao') {
  const limpar = (bins) => bins.map((b) => ({ ate: b.ate, meia: r(b.meia) }));
  const limparMae = (bins) => bins.map((b) => ({ ate: b.ate, mae: r(b.mae) }));
  const texto = [
    '// GERADO por model/backtest/calibrar.mjs a partir do replay dos boletins de urna de 2022 e do holdout 1T 2026. Nao editar a mao.',
    `// Variante: ${V} (estratos) + correcao de deriva (presidente). Faixas = meia-largura (p.p.) por % do eleitorado apurado (< ate).`,
    `// mae = erro medio esperado (p.p.) por faixa. Detalhes: docs/BACKTEST.md e model/backtest/relatorio.json (${relatorio.gerado_em}).`,
    'export const CALIBRACAO = Object.freeze({',
    `  versao: 'bt2022h26-${relatorio.gerado_em.slice(0, 10)}',`,
    `  cfg: ${JSON.stringify(dados.variantes[V])},`,
    `  cfgMunicipal: ${JSON.stringify(dados.variantes_b?.[VB] ?? { usarBaseline: true, encolhimento: 0, pendenteBaseline: false, kSwing: null })},`,
    '  // curva de deriva (x = % eleitorado apurado, y = erro medio do modelo no candidato 13 em 2022, mesmo tipo de turno)',
    '  correcao: {',
    `    presidente: { candidato: '13', fonte: '2T 2022, estratos por UF', curva: ${JSON.stringify(curvas.A_2t2022)} },`,
    `    presidente_mun: { candidato: '13', fonte: '2T 2022, estratos municipais', curva: ${JSON.stringify(curvas.B_2t2022 ?? [])} },`,
    '  },',
    '  faixas: {',
    ...Object.entries(faixas).filter(([, b]) => b).map(([k, bins]) => `    ${k}: ${JSON.stringify(limpar(bins))},`),
    '  },',
    '  mae: {',
    ...Object.entries(mae).filter(([, b]) => b).map(([k, bins]) => `    ${k}: ${JSON.stringify(limparMae(bins))},`),
    '  },',
    '});',
    '',
  ].join('\n');
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'calibracao.mjs'), texto);
  console.error('model/calibracao.mjs atualizado');
}
