// Constantes do evento e dos candidatos. Nada aqui é número de apuração.
import PRIMEIRO_TURNO from '../data/primeiro-turno.json' with { type: 'json' };

/** 17h de Brasília de 25/10/2026 = 20h UTC (fechamento das urnas e início da divulgação). */
export const ALVO_MS = Date.UTC(2026, 9, 25, 20, 0, 0);
export const GOV_UFS = ['ac', 'am', 'df', 'es', 'rn', 'to'];
export const UF_NOME = { ac: 'Acre', am: 'Amazonas', df: 'Distrito Federal', es: 'Espírito Santo', rn: 'Rio Grande do Norte', to: 'Tocantins' };
export const REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

/** Intervalos do polling (ms). */
export const POLL = { intervaloMs: 20000, jitterMs: 3000, backoffMaxMs: 120000 };
/** Dado do TSE mais velho que isto (ou stale=true) = "dados do TSE atrasados". */
export const ATRASO_MS = 3 * 60 * 1000;
/** Botão de estrela do GitHub: repositório, API pública (sem token) e cache no navegador. */
export const GITHUB_REPO = 'diegoivo/segundo-turno-2026';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;
export const GITHUB_CACHE_MS = 60 * 60 * 1000;
export const GITHUB_CACHE_KEY = 'gh_stars';
/** Quantos snapshots a auditoria baixa e verifica. */
export const AUDITORIA_N = 6;
/** Limiar de eleitorado totalizado exigido pelo modelo (model/criterios.mjs). */
export const LIMIAR_APURACAO = { presidente: 10, governador: 20 };

export const LULA = { n: '13', nome: 'Lula', curto: 'Lula', completo: 'Luiz Inácio Lula da Silva', sg: 'PT', vice: 'Geraldo Alckmin', cor: 'red' };
export const FLAVIO = { n: '22', nome: 'Flávio Bolsonaro', curto: 'Flávio', completo: 'Flávio Nantes Bolsonaro', sg: 'PL', vice: 'Alfredo Gaspar', cor: 'blue' };

const RANK = { red: 0, n1: 1, n2: 2, blue: 3 };

/** Candidatos do 1º turno de uma UF, com o vermelho à esquerda e o azul à direita (neutros no lado que sobra). */
export function candidatosGov(uf) {
  const g = PRIMEIRO_TURNO.governadores[uf];
  if (!g) return null;
  const cs = g.candidatos.map((c) => ({ ...c, completo: c.completo, coligacao: c.coligacao, v1: c.votos1t, p1: c.pct1t, key: c.chave }));
  const [a, b] = cs;
  const [left, right] = RANK[a.cor] > RANK[b.cor] ? [b, a] : [a, b];
  return { left, right, ts: g.ts, te: g.te, validos1t: g.validos1t };
}

export { PRIMEIRO_TURNO };
