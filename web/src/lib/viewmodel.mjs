// View-models derivados dos JSON publicados pelo coletor (live/latest.json, live/gov-<uf>.json, live/series.json)
// e do 1º turno real. Regra de ouro: campo ausente vira null (a UI mostra "—"); nunca um valor inventado.
import { ALVO_MS, ATRASO_MS, FLAVIO, GOV_UFS, LULA, PRIMEIRO_TURNO, UF_NOME, candidatosGov } from './config.mjs';
import { erroMedio } from './components.mjs';
import { finito, horaBrasilia, parseDgHg } from './format.mjs';

const num = (v) => (finito(v) ? v : null);
const confRotulo = { baixa: 'baixa', media: 'média', alta: 'alta' };

/** Estado da página: 1 pré-apuração, 2 sem projeção, 3 com projeção, 4 definido. */
export function estadoDe(race) {
  if (!race || !Array.isArray(race.candidatos) || race.candidatos.length < 2) return 1;
  if (!(race.pct_secoes > 0)) return 1;
  if (race.definido_matematicamente && race.definido_matematicamente.n != null) return 4;
  if (race.forecast && race.forecast.projecao) return 3;
  return 2;
}

/** Atraso do dado do TSE: stale=true, ou dg/hg com mais de 3 min enquanto a apuração não chegou a 100%. */
export function dadosAtrasados(latest, agoraMs) {
  if (!latest) return false;
  if (latest.stale === true) return true;
  const r = latest.presidente;
  if (!r) return false;
  if (r.pct_secoes >= 100) return false; // nada mais a mudar: sem heartbeat do coletor
  const t = parseDgHg(r.dg, r.hg);
  return t != null && agoraMs - t > ATRASO_MS;
}

const achar = (race, n) => race.candidatos.find((c) => c.n === n);

/**
 * View-model de uma disputa a partir de `race` (latest.presidente | latest.governadores[uf]).
 * `extra` = gov-<uf>.json (opcional). Devolve null se não há dado utilizável (estado 1).
 */
export function corridaVM({ tipo, uf = null, race, left, right, extra = null, serie = [] }) {
  const estado = estadoDe(race);
  const base = {
    id: tipo === 'presidente' ? 'presidente' : uf,
    tipo,
    uf,
    nome: tipo === 'presidente' ? 'Presidente da República' : `Governador · ${UF_NOME[uf]}`,
    escopo: tipo === 'presidente' ? 'Brasil' : UF_NOME[uf],
    href: tipo === 'presidente' ? '/#placar' : `/governador/${uf}/`,
    left,
    right,
    estado,
  };
  if (estado === 1) return { ...base, vazio: true };
  const cl = achar(race, left.n);
  const cr = achar(race, right.n);
  if (!cl || !cr) return { ...base, estado: 1, vazio: true };
  const L = num(cl.votos);
  const R = num(cr.votos);
  const valid = L != null && R != null ? L + R : null;
  const shareL = valid > 0 ? (L / valid) * 100 : null;
  const f = race.forecast;
  const lo = f?.faixa?.[left.n];
  const fcL = num(f?.projecao?.[left.n]);
  const hw = num(f?.meia_largura_pp ?? race.faixa_meia_largura_pp);
  const avail = estado >= 3 && fcL != null;
  const def = estado === 4;
  const winnerN = def ? race.definido_matematicamente.n : f?.tendencia?.n ?? null;
  const winner = winnerN === left.n ? 'left' : winnerN === right.n ? 'right' : null;
  const verdict = def ? 'def' : !avail ? 'na' : winner ? 'proj' : 'indef';
  const coletadoMs = race.coletado_em ? Date.parse(race.coletado_em) : null;
  const sec = extra?.parcial?.secoes ?? null;
  return {
    ...base,
    vazio: false,
    seq: race.seq,
    sha: race.sha256 ?? null,
    pct: num(race.pct_secoes),
    pctEleitorado: num(race.pct_eleitorado) > 0 ? race.pct_eleitorado : null,
    secTotal: num(sec?.total),
    secTotalizadas: num(sec?.totalizadas),
    L, R, valid, shareL, shareR: shareL == null ? null : 100 - shareL,
    dg: race.dg ?? null,
    hg: race.hg ?? null,
    tseMs: parseDgHg(race.dg, race.hg),
    coletadoMs: Number.isFinite(coletadoMs) ? coletadoMs : null,
    coletadoHora: horaBrasilia(coletadoMs),
    fc: {
      avail,
      L: fcL,
      R: fcL == null ? null : 100 - fcL,
      hw,
      lo: Array.isArray(lo) && finito(lo[0]) ? lo[0] : fcL != null && hw != null ? fcL - hw : null,
      hi: Array.isArray(lo) && finito(lo[1]) ? lo[1] : fcL != null && hw != null ? fcL + hw : null,
      conf: confRotulo[f?.confianca ?? race.confianca] ?? null,
      versao: race.modelo_versao ?? null,
      hora: horaBrasilia(coletadoMs),
      seq: race.seq,
    },
    erro: erroMedio(race),
    def,
    winner,
    verdict,
    criterios: Array.isArray(race.criterios_nao_atendidos) ? race.criterios_nao_atendidos : [],
    series: serieParaGrafico(serie, left, right),
  };
}

/** Candidatos de cada disputa (cor e rótulo vêm da configuração, o TSE só fornece número/nome/votos). */
export function ladosGov(uf, race = null) {
  const c = candidatosGov(uf);
  if (!c) return null;
  const nomeTse = race?.candidatos?.map((x) => x.n) ?? [];
  const ok = nomeTse.length === 0 || (nomeTse.includes(c.left.n) && nomeTse.includes(c.right.n));
  return ok ? c : null;
}

export function presidenteVM(latest, serie = []) {
  return corridaVM({ tipo: 'presidente', race: latest?.presidente ?? null, left: LULA, right: FLAVIO, serie });
}

export function governadorVM(uf, latest, extra = null, serie = []) {
  const race = latest?.governadores?.[uf] ?? null;
  const c = ladosGov(uf, race);
  if (!c) return { id: uf, tipo: 'governador', uf, estado: 1, vazio: true, nome: `Governador · ${UF_NOME[uf]}`, href: `/governador/${uf}/`, left: candidatosGov(uf).left, right: candidatosGov(uf).right };
  return corridaVM({ tipo: 'governador', uf, race, left: c.left, right: c.right, extra, serie });
}

/** Resultado real do 1º turno, presidente. */
export function presidente1T() {
  const r = PRIMEIRO_TURNO.presidente;
  const V = r.validos;
  return {
    left: LULA, right: FLAVIO, L: r.votosLula, R: r.votosFlavio, valid: V,
    shareL: (r.votosLula / V) * 100, shareR: (r.votosFlavio / V) * 100,
    other: 100 - ((r.votosLula + r.votosFlavio) / V) * 100,
    ts: r.secoes, te: r.eleitorado, comp: r.comparecimento, brancos: r.brancos, nulos: r.nulos,
  };
}

export function governador1T(uf) {
  const c = candidatosGov(uf);
  return { left: c.left, right: c.right, L: c.left.v1, R: c.right.v1, shareL: c.left.p1, shareR: c.right.p1, other: 100 - c.left.p1 - c.right.p1, valid: c.validos1t, ts: c.ts, te: c.te };
}

// ---------- séries ----------

/** Ponto compacto da série (formato do coletor) a partir do bloco `race` do latest. */
export function pontoDeRace(race) {
  if (!race || !race.coletado_em || !Array.isArray(race.candidatos)) return null;
  const t = Math.floor(Date.parse(race.coletado_em) / 1000);
  if (!Number.isFinite(t)) return null;
  const f = race.forecast?.projecao ? { p: race.forecast.projecao, m: race.forecast.meia_largura_pp ?? null, c: race.forecast.confianca ?? null } : null;
  return { s: race.seq, t, p: race.pct_secoes, c: race.candidatos.map((c) => [c.n, c.votos, c.pct]), f, d: race.definido_matematicamente?.n ?? null };
}

/** Estende a série baixada 1× com o ponto do latest (sem duplicar `seq`, sem imprimir antes das 17h). */
export function estenderSerie(pontos, race) {
  const novo = pontoDeRace(race);
  if (!novo || novo.t * 1000 < ALVO_MS) return pontos;
  if (pontos.some((x) => x.s === novo.s)) return pontos;
  return [...pontos, novo].sort((a, b) => a.s - b.s);
}

/** Pontos do gráfico: t em minutos desde as 17h; pm/fm/bd em pontos de margem (ver chart.mjs). */
export function serieParaGrafico(pontos, left, right) {
  const out = [];
  for (const pt of pontos ?? []) {
    const cl = pt.c?.find((c) => c[0] === left.n);
    const cr = pt.c?.find((c) => c[0] === right.n);
    if (!cl || !cr || !finito(cl[1]) || !finito(cr[1]) || cl[1] + cr[1] <= 0) continue;
    const t = (pt.t * 1000 - ALVO_MS) / 60000;
    if (t < 0) continue;
    const fl = pt.f?.p?.[left.n];
    const on = finito(fl);
    out.push({
      t, pct: pt.p, pm: ((cl[1] - cr[1]) / (cl[1] + cr[1])) * 100,
      fm: on ? 2 * (fl - 50) : 0, bd: on ? 2 * (pt.f.m ?? 0) : 0, on, seq: pt.s, def: pt.d != null,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** União de séries por `seq` (a baixada 1× + a estendida pelos latest), ordenada. */
export function mesclarSerie(...listas) {
  const porSeq = new Map();
  for (const l of listas) for (const pt of l ?? []) porSeq.set(pt.s, pt);
  return [...porSeq.values()].sort((a, b) => a.s - b.s);
}

export const UFS_COM_GOVERNADOR = GOV_UFS;
