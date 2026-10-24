// Leitura e validacao de um arquivo `-u.json` do TSE (resultados.tse.jus.br).
// Puro: sem I/O. Devolve numeros normalizados (o TSE usa virgula decimal e strings).

const TOLERANCIA_VVC = 1e-4; // 0,01% de diferenca entre soma dos vap e vvc

export function numero(x) {
  const v = Number(String(x ?? 0).replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

// `dg`="05/10/2026", `hg`="12:51:47" (horario de Brasilia, UTC-3) -> epoch ms, ou null.
export function dataHoraTse(dg, hg) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dg ?? ''));
  const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(hg ?? ''));
  if (!m || !h) return null;
  const t = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${h[1]}:${h[2]}:${h[3]}-03:00`);
  return Number.isFinite(t) ? t : null;
}

export function extrairCandidatos(json) {
  const cargos = Array.isArray(json?.carg) ? json.carg : [];
  return cargos
    .flatMap((cg) => (Array.isArray(cg?.agr) ? cg.agr : []))
    .flatMap((ag) => (Array.isArray(ag?.par) ? ag.par : []))
    .flatMap((p) => (Array.isArray(p?.cand) ? p.cand : []).map((c) => ({ ...c, sgp: p.sg ?? c.sgp })))
    .map((c) => ({
      n: String(c.n ?? ''),
      nmu: String(c.nmu ?? ''),
      nm: String(c.nm ?? ''),
      sgp: c.sgp == null ? null : String(c.sgp),
      vap: numero(c.vap),
      st: c.st == null ? null : String(c.st),
      e: c.e == null ? null : String(c.e),
    }))
    .filter((c) => c.n !== '');
}

export function validarConsistencia(obs) {
  const erros = [];
  if (!(obs.te > 0)) erros.push('eleitorado_zero');
  if (!(obs.ts > 0)) erros.push('secoes_zero');
  if (obs.est > obs.te) erros.push('est_maior_que_te');
  if (obs.st > obs.ts) erros.push('st_maior_que_ts');
  if (obs.cands.length === 0) erros.push('sem_candidatos');
  const somaVap = obs.cands.reduce((s, c) => s + c.vap, 0);
  if (somaVap > obs.vvc * (1 + TOLERANCIA_VVC) + 1) erros.push('soma_vap_maior_que_vvc');
  if (obs.vvc > 0 && Math.abs(somaVap - obs.vvc) > obs.vvc * TOLERANCIA_VVC + 1) erros.push('soma_vap_diferente_de_vvc');
  if (obs.vvc > obs.comp && obs.comp > 0) erros.push('vvc_maior_que_comparecimento');
  if (obs.est === 0 && obs.vvc > 0) erros.push('votos_sem_eleitorado_totalizado');
  return erros;
}

// Converte o JSON do TSE em observacao plana. `esperado` = {eleicao, turno}.
export function parseTse(json, esperado = {}) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, erros: ['json_invalido'], obs: null };
  }
  const s = json.s ?? {};
  const e = json.e ?? {};
  const v = json.v ?? {};
  const erros = [];
  if (esperado.eleicao != null && String(json.ele) !== String(esperado.eleicao)) erros.push(`eleicao_inesperada:${json.ele}`);
  if (esperado.turno != null && String(json.t) !== String(esperado.turno)) erros.push(`turno_inesperado:${json.t}`);
  const obs = Object.freeze({
    ele: String(json.ele ?? ''),
    t: String(json.t ?? ''),
    tpabr: String(json.tpabr ?? ''),
    cdabr: String(json.cdabr ?? ''),
    dg: json.dg ?? null,
    hg: json.hg ?? null,
    idg: json.idg ?? null,
    tf: json.tf ?? null,
    and: json.and ?? null,
    geradoEm: dataHoraTse(json.dg, json.hg),
    ts: numero(s.ts),
    st: numero(s.st),
    te: numero(e.te),
    est: numero(e.est),
    comp: numero(e.c),
    vvc: numero(v.vvc),
    tv: numero(v.tv),
    cands: Object.freeze(extrairCandidatos(json)),
  });
  const todos = [...erros, ...validarConsistencia(obs)];
  return { ok: todos.length === 0, erros: todos, obs };
}
