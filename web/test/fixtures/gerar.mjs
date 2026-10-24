// Gera arquivos de exemplo (formato do coletor) para os 4 estados do front. DADOS DE TESTE: números arbitrários,
// nunca vão para dist/ nem para um bucket de produção. As cadeias de hash são reais (SHA-256 do JSON canônico).
import { createHash } from 'node:crypto';
import { canonicalize } from '../../src/lib/audit.mjs';

const sha = (t) => createHash('sha256').update(t).digest('hex');
const T0 = Date.UTC(2026, 9, 25, 20, 0, 0); // 17h BRT
const iso = (ms) => new Date(ms).toISOString();
const hg = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(11, 19);

const PRES = { esq: '13', dir: '22', nomes: { 13: 'LULA', 22: 'FLAVIO BOLSONARO' } };
const GOVS = {
  ac: ['11', 'MAILZA ASSIS', '10', 'ALAN RICK'], am: ['55', 'OMAR AZIZ', '22', 'PROFESSORA MARIA DO CARMO'], df: ['11', 'CELINA LEÃO', '13', 'LEANDRO GRASS'],
  es: ['15', 'RICARDO FERRAÇO', '10', 'LORENZO PAZOLINI'], rn: ['13', 'CADU DE LULA', '44', 'ALLYSON'], to: ['45', 'VICENTINHO JÚNIOR', '44', 'PROFESSORA DORINHA'],
};
const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to'];

// Cada estado: minutos desde as 17h, % de seções, parcial de Lula (%), projeção (%), meia-largura, definido
const ESTADOS = {
  2: { min: 51, pct: 12.19, lulaPct: 46.0, fc: null, def: null, criterios: ['apuracao_minima', 'estratos_apurados'] },
  3: { min: 99, pct: 78.78, lulaPct: 50.2, fc: 50.4, hw: 0.8, def: null, criterios: [] },
  4: { min: 170, pct: 99.79, lulaPct: 50.9, fc: 50.9, hw: 0.1, def: '13', criterios: [] },
};

function cands(nL, nR, total, shareL) {
  const l = Math.round(total * shareL / 100);
  return [{ n: nL, votos: l, pct: shareL }, { n: nR, votos: total - l, pct: 100 - shareL }];
}

function bloco(e, tipo, uf) {
  const [gl, gnl, gr, gnr] = GOVS[uf ?? 'ac'];
  const total = tipo === 'presidente' ? 60_000_000 * (e.pct / 100) : 900_000 * (e.pct / 100);
  const nL = tipo === 'presidente' ? PRES.esq : gl;
  const nR = tipo === 'presidente' ? PRES.dir : gr;
  const nomes = tipo === 'presidente' ? PRES.nomes : { [gl]: gnl, [gr]: gnr };
  const shareL = tipo === 'presidente' ? e.lulaPct : 100 - e.lulaPct + 3;
  const cs = cands(nL, nR, total, shareL).map((c) => ({ ...c, nome: nomes[c.n] }));
  const f = e.fc == null ? null : {
    metodo: 'teste', projecao: { [nL]: tipo === 'presidente' ? e.fc : 100 - e.fc + 3, [nR]: 100 - (tipo === 'presidente' ? e.fc : 100 - e.fc + 3) },
    faixa: {}, meia_largura_pp: e.hw, margem_pp: 0.8, faixa_margem_pp: 2 * e.hw, tendencia: e.def ? { n: nL, nmu: nomes[nL] } : (e.hw < 0.5 ? { n: nL, nmu: nomes[nL] } : null), confianca: 'alta',
  };
  if (f) {
    const pl = f.projecao[nL];
    f.faixa = { [nL]: [pl - e.hw, pl + e.hw], [nR]: [100 - pl - e.hw, 100 - pl + e.hw] };
    if (tipo === 'governador') f.tendencia = null;
  }
  return {
    seq: e.seq, sha256: e.sha, coletado_em: iso(T0 + e.min * 60e3 + 4000), dg: '25/10/2026', hg: hg(T0 + e.min * 60e3),
    pct_secoes: e.pct, pct_eleitorado: e.pct - 1.5, candidatos: cs, forecast: f, faixa_meia_largura_pp: f ? e.hw : null, confianca: f ? 'alta' : null,
    definido_matematicamente: e.def && tipo === 'presidente' ? { n: e.def, nmu: nomes[e.def] } : null, criterios_nao_atendidos: tipo === 'presidente' ? e.criterios : (e.fc == null ? ['apuracao_minima'] : []), modelo_versao: '2.0.1',
  };
}

function serie(e, tipo, uf) {
  const pts = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const frac = (i + 1) / n;
    const min = 3 + (e.min - 3) * frac;
    const b = bloco({ ...e, pct: e.pct * frac, min, lulaPct: 46 + (e.lulaPct - 46) * frac, fc: e.fc != null && frac > 0.4 ? e.fc : null, seq: i }, tipo, uf);
    pts.push({ s: i, t: Math.floor((T0 + min * 60e3) / 1000), p: b.pct_secoes, c: b.candidatos.map((c) => [c.n, c.votos, c.pct]), f: b.forecast ? { p: b.forecast.projecao, m: e.hw, c: 'alta' } : null, d: null });
  }
  return pts;
}

function snapshot(seq, e, cadeia, prev) {
  const min = e.min - (3 - seq) * 0.5;
  const parcial = {};
  const lista = cadeia === '6258' ? ['br', ...UFS, 'zz'] : Object.keys(GOVS);
  for (const id of lista) {
    const tipo = cadeia === '6258' ? 'presidente' : 'governador';
    const b = bloco({ ...e, seq, min }, tipo, id in GOVS ? id : undefined);
    parcial[id] = { secoes: { total: 1000, totalizadas: Math.round(10 * b.pct_secoes), pct_totalizadas: b.pct_secoes }, candidatos: b.candidatos.map((c) => ({ n: c.n, nome: c.nome, votos: c.votos, pct_validos: c.pct })), dg: '25/10/2026', hg: hg(T0 + min * 60e3) };
    if (cadeia === '6258' && id !== 'br') parcial[id].candidatos = cands('13', '22', 1_000_000 * (e.pct / 100), 40 + (UFS.indexOf(id) * 1.1) % 25).map((c) => ({ ...c, nome: PRES.nomes[c.n], pct_validos: c.pct }));
  }
  const body = {
    seq, coletado_em: iso(T0 + min * 60e3 + 4000), fontes: [{ id: cadeia === '6258' ? 'br' : 'df', sha256_raw: sha(`raw:${cadeia}:${seq}`), dg: '25/10/2026', hg: hg(T0 + min * 60e3) }],
    modelo: { versao: '2.0.1' }, parcial, forecast: null, prev_sha256: prev ? prev.sha : null, prev_chave: prev ? prev.chave : null, cargo: cadeia === '6258' ? 'presidente' : 'governador',
  };
  const texto = canonicalize(body);
  const h = sha(texto);
  return { texto, sha: h, chave: `history/${cadeia}/2026-10-25/${String(seq).padStart(6, '0')}-${h}.json`, seq };
}

/** @returns Map<caminho relativo a /dados/, string|null> ; null = 404 */
export function montarEstado(n) {
  const arq = new Map();
  if (n === 1) {
    arq.set('live/latest.json', JSON.stringify({ schema: 1, ambiente: 'staging', atualizado_em: iso(T0 - 3600e3), stale: false, stale_fontes: [], estratos_stale: 0, presidente: null, governadores: Object.fromEntries(Object.keys(GOVS).map((u) => [u, null])) }));
    arq.set('live/series.json', JSON.stringify({ schema: 1, presidente: [], governadores: {} }));
    arq.set('live/manifest.json', JSON.stringify({ schema: 1, ambiente: 'staging', stale: false, cadeias: {} }));
    return arq;
  }
  const e = { ...ESTADOS[n] };
  const cadeias = {};
  const heads = {};
  for (const cadeia of ['6258', '6260']) {
    let prev = null;
    for (let s = 0; s < 4; s++) {
      const sn = snapshot(s, e, cadeia, prev);
      arq.set(sn.chave, sn.texto);
      arq.set(`raw/${sha(`raw:${cadeia}:${s}`)}.json.gz`, 'x');
      prev = sn;
    }
    heads[cadeia] = prev;
    cadeias[cadeia] = { seq: prev.seq, sha256: prev.sha, chave: prev.chave, coletado_em: iso(T0 + e.min * 60e3) };
  }
  const base = { ...e, seq: 3 };
  const governadores = Object.fromEntries(Object.keys(GOVS).map((u) => [u, bloco({ ...base, sha: heads['6260'].sha, fc: e.fc == null ? null : e.fc, def: null }, 'governador', u)]));
  const latest = { schema: 1, ambiente: 'staging', atualizado_em: iso(T0 + e.min * 60e3 + 5000), stale: false, stale_fontes: [], estratos_stale: 0, presidente: bloco({ ...base, sha: heads['6258'].sha }, 'presidente'), governadores };
  arq.set('live/latest.json', JSON.stringify(latest));
  arq.set('live/manifest.json', JSON.stringify({ schema: 1, ambiente: 'staging', atualizado_em: latest.atualizado_em, stale: false, cadeias }));
  arq.set('live/series.json', JSON.stringify({ schema: 1, presidente: serie({ ...e }, 'presidente'), governadores: Object.fromEntries(Object.keys(GOVS).map((u) => [u, serie({ ...e, def: null }, 'governador', u)])) }));
  for (const u of Object.keys(GOVS)) {
    const b = governadores[u];
    arq.set(`live/gov-${u}.json`, JSON.stringify({ schema: 1, uf: u, seq: 3, sha256: heads['6260'].sha, coletado_em: b.coletado_em, stale: false, parcial: { secoes: { total: 6969, totalizadas: Math.round(69.69 * e.pct), pct_totalizadas: e.pct }, candidatos: b.candidatos }, forecast: b.forecast }));
  }
  return arq;
}

export { ESTADOS, GOVS };

/** Variante com `stale: true` e dg/hg velho, para o indicador de atraso. */
export function montarEstadoAtrasado() {
  const arq = montarEstado(3);
  const l = JSON.parse(arq.get('live/latest.json'));
  l.stale = true;
  arq.set('live/latest.json', JSON.stringify(l));
  return arq;
}
