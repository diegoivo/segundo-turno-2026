// Criterios minimos objetivos para publicar uma projecao. Todos precisam passar; senao `forecast: null`.
// Limiares por tipo de corrida. Valores em % do eleitorado ou segundos. Puro, sem I/O.

export const LIMIARES = Object.freeze({
  presidente: Object.freeze({
    apuracaoMinPct: 0, // projeta com qualquer dado (> 0); a faixa larga do inicio expressa a incerteza (decisao do Diego, 25/10)
    semDadoMaxPct: 0, // % do eleitorado em estratos sem arquivo valido
    fallbackNacionalMaxPct: 5, // % do eleitorado projetado pela taxa nacional (sem baseline)
    semPriorMaxPct: 0,
    staleMaxPct: 0,
    frescorMaxS: 3600, // idade maxima do arquivo mais antigo (quando `agora` e informado)
    dispersaoMaxS: 3600, // diferenca entre o arquivo mais antigo e o mais novo
    estratosApuradosMinPct: 0, // % dos estratos com algum voto totalizado
  }),
  // presidente com estratos MUNICIPAIS (modelo B): ~5.700 arquivos, tolera faltas pequenas como o governador
  presidente_mun: Object.freeze({
    apuracaoMinPct: 0,
    semDadoMaxPct: 2,
    fallbackNacionalMaxPct: 5,
    semPriorMaxPct: 0,
    staleMaxPct: 2,
    frescorMaxS: 3600,
    dispersaoMaxS: 3600,
    estratosApuradosMinPct: 0,
  }),
  governador: Object.freeze({
    apuracaoMinPct: 0,
    semDadoMaxPct: 2,
    fallbackNacionalMaxPct: 5,
    semPriorMaxPct: 0,
    staleMaxPct: 2,
    frescorMaxS: 3600,
    dispersaoMaxS: 3600,
    estratosApuradosMinPct: 0,
  }),
});

const crit = (id, ok, valor, limite, detalhe) => Object.freeze({ id, ok: Boolean(ok), valor, limite, detalhe });
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

function criteriosDeDados({ erros, estratosEsperados, proj }) {
  return [
    crit('arquivos_validos', erros.length === 0, erros.length, 0,
      erros.length ? `Arquivos invalidos ou inconsistentes: ${erros.slice(0, 5).map((e) => `${e.id}(${e.erros.join(',')})`).join('; ')}` : 'Todos os arquivos passaram na validacao'),
    crit('estratos_esperados', estratosEsperados > 0, estratosEsperados, 1,
      estratosEsperados > 0 ? `${estratosEsperados} estratos esperados` : 'Sem lista de estratos (baseline ausente)'),
    crit('finalistas_identificados', proj != null, proj ? 2 : 0, 2,
      proj ? 'Dois finalistas identificados' : 'Nao foi possivel identificar exatamente dois finalistas'),
  ];
}

function criteriosDeCobertura(proj, lim) {
  const e = proj.eleitoradoPct;
  const pctEstratos = proj.contagem.total ? (proj.contagem.apurados / proj.contagem.total) * 100 : 0;
  return [
    crit('apuracao_minima', e.apurado > 0 && e.apurado >= lim.apuracaoMinPct, r2(e.apurado), lim.apuracaoMinPct,
      `${r2(e.apurado)}% do eleitorado em secoes totalizadas (minimo ${lim.apuracaoMinPct}%)`),
    crit('estratos_apurados', pctEstratos >= lim.estratosApuradosMinPct, r2(pctEstratos), lim.estratosApuradosMinPct,
      `${proj.contagem.apurados} de ${proj.contagem.total} estratos com votos totalizados`),
    crit('cobertura_dados', e.semDado <= lim.semDadoMaxPct, r2(e.semDado), lim.semDadoMaxPct,
      `${r2(e.semDado)}% do eleitorado sem arquivo valido`),
    crit('fallback_nacional', e.fallbackNacional <= lim.fallbackNacionalMaxPct, r2(e.fallbackNacional), lim.fallbackNacionalMaxPct,
      `${r2(e.fallbackNacional)}% do eleitorado projetado pela taxa agregada (sem baseline)`),
    crit('estratos_sem_prior', e.semPrior <= lim.semPriorMaxPct, r2(e.semPrior), lim.semPriorMaxPct,
      `${r2(e.semPrior)}% do eleitorado sem nenhuma base para projetar`),
    crit('leituras_preservadas', e.stale <= lim.staleMaxPct, r2(e.stale), lim.staleMaxPct,
      `${r2(e.stale)}% do eleitorado com leitura preservada (stale)`),
  ];
}

// Estratos com 100% das secoes totalizadas nao entram (`geracao.abertos` conta so os demais). Com `referencia`
// (arquivo da UF, governador): dispersao = maior desvio dos estratos em relacao a ela e frescor = idade da referencia.
function criteriosDeTempo({ geracao, agora }, lim) {
  const semAbertos = geracao.abertos === 0;
  const temHorario = semAbertos || (geracao.min != null && geracao.max != null);
  const comRef = geracao.referencia != null;
  const dispersaoS = semAbertos ? 0 : comRef ? geracao.desvioRef / 1000 : temHorario ? (geracao.max - geracao.min) / 1000 : null;
  const base = comRef ? geracao.referencia : geracao.min;
  const idadeS = base != null && agora != null ? (agora - base) / 1000 : null;
  const okHorarios = temHorario && geracao.semHorario === 0;
  return [
    crit('horarios_presentes', okHorarios, geracao.semHorario, 0,
      okHorarios ? 'Todos os arquivos nao finais com dg/hg validos' : `${geracao.semHorario} arquivo(s) nao final(is) sem horario de geracao`),
    crit('dispersao_horarios', dispersaoS != null && dispersaoS <= lim.dispersaoMaxS, r2(dispersaoS), lim.dispersaoMaxS,
      dispersaoS == null ? 'Sem horarios' : semAbertos ? 'Todos os estratos com 100% das secoes totalizadas'
        : comRef ? `${Math.round(dispersaoS)} s de desvio maximo em relacao ao arquivo da UF` : `${Math.round(dispersaoS)} s entre o arquivo mais antigo e o mais novo`),
    crit('frescor', idadeS == null || idadeS <= lim.frescorMaxS, r2(idadeS), lim.frescorMaxS,
      idadeS == null ? 'Idade nao verificada (sem `agora` ou sem arquivos nao finais)' : `${comRef ? 'Arquivo da UF' : 'Arquivo mais antigo'} tem ${Math.round(idadeS)} s`),
  ];
}

// Devolve a lista completa de criterios avaliados (ok ou nao).
export function avaliarCriterios({ tipo, erros, estratosEsperados, proj, geracao, agora }) {
  const lim = LIMIARES[tipo] ?? LIMIARES.governador;
  const base = criteriosDeDados({ erros, estratosEsperados, proj });
  if (!proj) return Object.freeze(base);
  return Object.freeze([...base, ...criteriosDeCobertura(proj, lim), ...criteriosDeTempo({ geracao, agora }, lim)]);
}

export const naoAtendidos = (criterios) => criterios.filter((c) => !c.ok).map((c) => c.id);
