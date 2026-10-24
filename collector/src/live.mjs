// Construcao dos arquivos de leitura publica (live/*). Funcoes puras.
import { parseDgHg } from './canonical.mjs';
import { GOV_UFS } from './config.mjs';

const CAMPOS_FORECAST_LIVE = ['metodo', 'projecao', 'faixa', 'meia_largura_pp', 'margem_pp', 'faixa_margem_pp', 'tendencia', 'confianca'];

/** Subconjunto do forecast do modelo que cabe no latest.json (limite de 3 KB gz). */
export function resumoForecast(f) {
  if (!f || typeof f !== 'object') return null;
  return Object.fromEntries(CAMPOS_FORECAST_LIVE.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
}

const resumoCands = (p) => (p?.candidatos ?? []).map((c) => ({ n: c.n, nome: c.nome, votos: c.votos, pct: c.pct_validos }));

// Acessores por cadeia: presidente guarda objetos; governador guarda mapas por UF.
const porCargo = {
  presidente: (snap) => ({ forecast: snap.forecast, criterios: snap.criterios_nao_atendidos ?? [], analise: snap.analise ?? null }),
  governador: (snap, uf) => ({
    forecast: snap.forecast?.[uf] ?? null,
    criterios: snap.criterios_nao_atendidos?.[uf] ?? [],
    analise: snap.analise?.[uf] ?? null,
  }),
};

function resumoSnapshot(snap, sha, id) {
  const p = snap.parcial[id];
  if (!p) return null;
  const m = porCargo[snap.cargo](snap, id);
  return {
    seq: snap.seq,
    sha256: sha,
    coletado_em: snap.coletado_em,
    dg: p.dg,
    hg: p.hg,
    pct_secoes: p.secoes.pct_totalizadas,
    pct_eleitorado: m.analise?.apurado?.eleitorado_pct ?? null,
    candidatos: resumoCands(p),
    forecast: resumoForecast(m.forecast),
    faixa_meia_largura_pp: m.forecast?.meia_largura_pp ?? null,
    confianca: m.forecast?.confianca ?? null,
    definido_matematicamente: m.analise?.definido_matematicamente ?? null,
    criterios_nao_atendidos: m.criterios,
    metodo: m.forecast?.metodo ?? null,
    erro_medio_esperado: m.forecast?.erro_medio_esperado ?? null,
    correcao_pp: m.forecast?.correcao_pp ?? null,
    modelo_versao: snap.modelo?.versao ?? null,
    modelo_calibracao: snap.modelo?.calibracao ?? null,
  };
}

export function construirLatest({ ambiente, agora, stale, heads }) {
  const pres = heads['6258'];
  const gov = heads['6260'];
  const governadores = {};
  if (gov) for (const uf of GOV_UFS) governadores[uf] = resumoSnapshot(gov.snapshot, gov.sha, uf);
  return {
    schema: 1,
    ambiente,
    atualizado_em: agora,
    stale: stale.fontes.length > 0 || stale.estratos > 0,
    stale_fontes: stale.fontes,
    estratos_stale: stale.estratos,
    presidente: pres ? resumoSnapshot(pres.snapshot, pres.sha, 'br') : null,
    governadores,
  };
}

export function construirGov({ ambiente, uf, head, stale, estratosUf }) {
  const { snapshot, sha } = head;
  const fonte = snapshot.fontes.find((f) => f.id === uf);
  const m = porCargo.governador(snapshot, uf);
  return {
    schema: 1,
    ambiente,
    uf,
    seq: snapshot.seq,
    sha256: sha,
    coletado_em: snapshot.coletado_em,
    stale: stale.fontes.includes(`6260:${uf}`),
    estratos_stale: stale.estratosPorUf?.[uf] ?? 0,
    estratos_coletados: estratosUf ?? 0,
    fonte: fonte ? { url: fonte.url, dg: fonte.dg, hg: fonte.hg, etag: fonte.etag } : null,
    parcial: snapshot.parcial[uf],
    forecast: m.forecast,
    definido_matematicamente: m.analise?.definido_matematicamente ?? null,
    apurado: m.analise?.apurado ?? null,
    parcial_modelo: m.analise?.parcial ?? null,
    estratificacao: m.analise?.estratificacao ?? null,
    metodo: m.forecast?.metodo ?? null,
    erro_medio_esperado: m.forecast?.erro_medio_esperado ?? null,
    correcao_pp: m.forecast?.correcao_pp ?? null,
    criterios_nao_atendidos: m.criterios,
    modelo: snapshot.modelo,
  };
}

// Ponto compacto: {s: seq, t: epoch s, p: % secoes, c: [[n, votos, pct]], f: {p: projecao, m: meia-largura, c: confianca}|null, d: n do definido|null}
export function pontoSerie(snapshot, id, forecast, analise) {
  const p = snapshot.parcial[id];
  const f = forecast?.projecao
    ? { p: forecast.projecao, m: forecast.meia_largura_pp ?? null, c: forecast.confianca ?? null }
    : null;
  return {
    s: snapshot.seq,
    t: Math.floor(new Date(snapshot.coletado_em).getTime() / 1000),
    p: p.secoes.pct_totalizadas,
    c: p.candidatos.map((c) => [c.n, c.votos, c.pct_validos]),
    f,
    d: analise?.definido_matematicamente?.n ?? null,
  };
}

/**
 * Acrescenta o ponto do snapshot na serie. A serie so comeca no 1o dado real depois de `inicioMs`
 * (horario de geracao dg/hg do arquivo principal do ponto).
 */
export function anexarSerie(serie, snapshot, { forecastPorId, analisePorId = {}, inicioMs = 0 }) {
  const base = serie && serie.schema === 1 ? serie : { schema: 1, presidente: [], governadores: {} };
  const out = { ...base, governadores: { ...base.governadores }, presidente: [...base.presidente] };
  const apos = (id) => {
    const p = snapshot.parcial[id];
    const t = parseDgHg(p?.dg, p?.hg);
    return t !== null && t.getTime() >= inicioMs;
  };
  if (snapshot.cargo === 'presidente') {
    if (apos('br') && !out.presidente.some((x) => x.s === snapshot.seq)) {
      out.presidente.push(pontoSerie(snapshot, 'br', forecastPorId.br, analisePorId.br));
    }
  } else {
    for (const uf of GOV_UFS) {
      if (!snapshot.parcial[uf] || !apos(uf)) continue;
      const lista = [...(out.governadores[uf] ?? [])];
      if (!lista.some((x) => x.s === snapshot.seq)) lista.push(pontoSerie(snapshot, uf, forecastPorId[uf], analisePorId[uf]));
      out.governadores[uf] = lista;
    }
  }
  return out;
}
