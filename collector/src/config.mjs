// Configuracao estatica do coletor.
export const TSE_BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
export const USER_AGENT = 'segundo-turno-coletor/0.1 (+apuracao 2o turno 2026; contato: diego@conversion.com.br)';

export const UFS = [
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to',
];
export const GOV_UFS = ['ac', 'am', 'df', 'es', 'rn', 'to'];

export const CICLOS = 4;
export const INTERVALO_CICLO_MS = 15_000;
export const PACE_MS = 125; // >= 125 ms entre inicios de request => <= 8 req/s
export const CONCORRENCIA = 4;
export const FETCH_TIMEOUT_MS = 8_000;
export const FETCH_RETRIES = 2;
export const BACKOFF_BASE_MS = 300;
export const LOCK_TTL_MS = 45_000;
export const DATA_INICIO_PADRAO = '2026-10-25';
export const SERIE_INICIO_PADRAO = '2026-10-25T17:00:00-03:00'; // a serie do grafico comeca no 1o dado real apos 17h

// Municipais/zonais dos governadores (round-robin sem estado: o lote vem do relogio).
// Por invocacao: 4 ciclos x (35 BR/UF/zz/gov + 61 estratos) = 384 requests (+1 config na 1a vez) ao TSE (~6,4 req/s, pico 8 req/s).
// Uma passada completa nos 487 estratos leva 2 invocacoes (~2 min).
export const ESTRATOS_POR_CICLO = 61;
export const SUBREQUEST_ORCAMENTO = 800; // fetches ao TSE por invocacao; limite do Workers Paid = 10.000 (antigo: 1.000)
export const PRAZO_INVOCACAO_MS = 58_000; // nao inicia novo ciclo depois disso: evita sobrepor o cron seguinte
export const GOV_CFG_URL = `${TSE_BASE}/6260/config/mun-e006260-cm.json`;
export const CHAVE_ESTRATOS = 'state/estratos-6260.json';

export const CACHE_LIVE = 'public, max-age=5, s-maxage=10, stale-while-revalidate=30';
export const CACHE_IMUTAVEL = 'public, max-age=31536000, immutable';

const url = (eleicao, regiao, cargo) =>
  `${TSE_BASE}/${eleicao}/dados/${regiao}/${regiao}-c000${cargo}-e00${eleicao}-u.json`;

// Cadeias: uma por eleicao. `fontes` = arquivos do TSE; `opcional` = 404 e ignorado.
export function cadeias() {
  const pres = {
    eleicao: '6258',
    cargo: 'presidente',
    cd: '1',
    // com `gate` a cadeia so comeca quando este arquivo passa no criterio de inicio (producao)
    fonteGate: 'br',
    fontes: [
      { id: 'br', regiao: 'br', tpabr: 'br', kind: 'base', url: url('6258', 'br', 1), opcional: false },
      ...UFS.map((uf) => ({ id: uf, regiao: uf, tpabr: 'uf', kind: 'base', url: url('6258', uf, 1), opcional: false })),
      { id: 'zz', regiao: 'zz', tpabr: 'uf', kind: 'base', url: url('6258', 'zz', 1), opcional: false },
    ],
  };
  const gov = {
    eleicao: '6260',
    cargo: 'governador',
    cd: '3',
    fonteGate: null,
    gateDe: '6258', // so comeca (e so baixa municipais) depois que a presidencial passa no criterio de inicio
    commitNoFim: true, // municipais mudam o tempo todo: 1 commit por invocacao
    fontes: GOV_UFS.map((uf) => ({ id: uf, regiao: uf, tpabr: 'uf', kind: 'base', url: url('6260', uf, 3), opcional: false })),
  };
  return [pres, gov];
}

/**
 * Lista de estratos (municipios; zonas no DF) a partir de config/mun-e006260-cm.json.
 * Municipio: <uf><cd5>-c0003-e006260-u.json; DF: <uf><cd5>-z<zona>-c0003-e006260-u.json.
 */
export function estratosDoConfig(cfg) {
  const out = [];
  for (const abr of cfg?.abr ?? []) {
    const uf = String(abr.cd ?? '').toLowerCase();
    if (!GOV_UFS.includes(uf)) continue;
    for (const mu of abr.mu ?? []) {
      const base = `${uf}${mu.cd}`;
      const item = (id, arquivo, cdabr) => ({
        id, uf, kind: 'estrato', opcional: true, tpabr: cdabr ? 'mu' : null, cdabr,
        url: `${TSE_BASE}/6260/dados/${uf}/${arquivo}-c0003-e006260-u.json`,
      });
      if (uf === 'df') for (const z of mu.z ?? []) out.push(item(`${base}-z${z}`, `${base}-z${z}`, null));
      else out.push(item(base, base, mu.cd));
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
