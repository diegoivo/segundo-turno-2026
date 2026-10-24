// Nucleo da projecao estratificada (modelo do 1o turno, generalizado).
// Em cada estrato (UF, municipio ou zona): votos pendentes = eleitorado nao totalizado x validos por eleitor
// ja totalizado; a divisao desses votos segue a participacao ja observada no estrato. Estrato sem apuracao
// usa um prior: participacao do 1o turno 2026 dos dois finalistas deslocada pelo swing observado (logit),
// ou, sem baseline, a participacao agregada atual (fallback nacional, sinalizado).
// Puro, sem I/O. Objetos de entrada nao sao mutados.

export const CFG_PADRAO = Object.freeze({
  encolhimento: 0, // 0 = confia 100% no observado (modelo 1T); x em (0,1] = peso do observado = min(1, fracApurada/x)
  usarBaseline: true, // prior = baseline 1T + swing; false = fallback nacional (modelo 1T puro)
  pendenteBaseline: false, // false: pendentes do estrato sem apuracao = te x (validos/eleitor agregado)
  clamp: Object.freeze([0.005, 0.995]),
  minVotosSwing: 50, // estrato entra no calculo do swing so com este minimo de votos validos
  kSwing: null, // null = swing global unico; numero = swing hierarquico (estrato->UF->regiao->global) com peso K votos
});

const logit = (p) => Math.log(p / (1 - p));
const expit = (x) => 1 / (1 + Math.exp(-x));
const clampar = (p, [lo, hi]) => Math.min(hi, Math.max(lo, p));

function votosDe(obs, n) {
  const c = obs?.cands?.find((x) => x.n === n);
  return c ? c.vap : 0;
}

// Resume um estrato: eleitorado, totalizado, votos dos finalistas, participacao-base do 1T.
export function resumirEstrato(estrato, [n1, n2]) {
  const { id, obs, baseline, stale = false, nome = null } = estrato;
  const temDado = Boolean(obs);
  const a = temDado ? votosDe(obs, n1) : 0;
  const b = temDado ? votosDe(obs, n2) : 0;
  const base1 = baseline?.votos?.[n1] ?? 0;
  const base2 = baseline?.votos?.[n2] ?? 0;
  const base = base1 + base2 > 0 ? base1 / (base1 + base2) : null;
  const te = temDado && obs.te > 0 ? obs.te : (baseline?.te ?? 0);
  const est = temDado ? Math.min(obs.est, te) : 0;
  return Object.freeze({
    id, nome: nome ?? baseline?.nome ?? id, temDado, stale, te, est, a, b, vvc: a + b,
    st: temDado ? obs.st : 0, ts: temDado ? obs.ts : (baseline?.ts ?? 0),
    frac: te > 0 ? est / te : 0, base,
    validoBase: baseline?.vvc > 0 && baseline?.te > 0 ? baseline.vvc / baseline.te : null,
    grupo: estrato.grupo ?? baseline?.grupo ?? null,
  });
}

function agregados(itens) {
  const ap = itens.filter((x) => x.est > 0 && x.vvc > 0);
  const A = ap.reduce((s, x) => s + x.a, 0);
  const B = ap.reduce((s, x) => s + x.b, 0);
  const est = ap.reduce((s, x) => s + x.est, 0);
  const vvc = A + B;
  return { A, B, vvc, est, pNac: vvc > 0 ? A / vvc : null, ratio: est > 0 ? vvc / est : null };
}

// Swing em logit entre a participacao observada no 2T e a base do 1T, ponderado por votos validos.
export function calcularSwing(itens, cfg) {
  const usados = itens.filter((x) => x.est > 0 && x.vvc >= cfg.minVotosSwing && x.base != null);
  const peso = usados.reduce((s, x) => s + x.vvc, 0);
  if (peso === 0) return { swing: null, estratos: 0 };
  const soma = usados.reduce(
    (s, x) => s + x.vvc * (logit(clampar(x.a / x.vvc, cfg.clamp)) - logit(clampar(x.base, cfg.clamp))),
    0,
  );
  return { swing: soma / peso, estratos: usados.length };
}

// Swing hierarquico (estrato -> UF -> regiao -> global): em cada nivel, media ponderada encolhida para o nivel acima
// com peso K votos: s* = (V*s + K*s_pai)/(V + K). Exige `grupo: {uf, regiao}` nos estratos; sem grupo, usa o global.
export function swingHierarquico(itens, cfg, global) {
  const usados = itens.filter((x) => x.est > 0 && x.vvc >= cfg.minVotosSwing && x.base != null && x.grupo);
  const acumular = (chave) => {
    const m = new Map();
    for (const x of usados) {
      const k = chave(x);
      const d = x.vvc * (logit(clampar(x.a / x.vvc, cfg.clamp)) - logit(clampar(x.base, cfg.clamp)));
      const o = m.get(k) ?? { v: 0, s: 0 };
      m.set(k, { v: o.v + x.vvc, s: o.s + d });
    }
    return m;
  };
  const porUf = acumular((x) => x.grupo.uf);
  const porReg = acumular((x) => x.grupo.regiao);
  const K = cfg.kSwing;
  const encolher = (o, pai) => (o ? (o.s + K * pai) / (o.v + K) : pai);
  return (x) => {
    if (!x.grupo) return global;
    const reg = encolher(porReg.get(x.grupo.regiao), global);
    return encolher(porUf.get(x.grupo.uf), reg);
  };
}

function priorDe(x, swing, pNac, cfg) {
  const s = typeof swing === 'function' ? swing(x) : swing;
  if (cfg.usarBaseline && x.base != null && s != null) {
    return { prior: expit(logit(clampar(x.base, cfg.clamp)) + s), tipo: 'baseline+swing' };
  }
  return { prior: pNac, tipo: pNac == null ? null : 'nacional' };
}

function pendentesSemApuracao(x, agr, cfg) {
  if (cfg.pendenteBaseline && x.validoBase != null && agr.ratioRel != null) return x.te * x.validoBase * agr.ratioRel;
  return x.te * (agr.ratio ?? 0);
}

function projetarEstrato(x, { swing, agr, cfg }) {
  const { prior, tipo } = priorDe(x, swing, agr.pNac, cfg);
  if (x.est > 0 && x.vvc > 0) {
    const p = x.a / x.vvc;
    const h = Math.max(0, x.te - x.est) * (x.vvc / x.est);
    // Encolhimento so em direcao ao prior baseado no 1o turno (nunca para a taxa agregada, que e viesada no inicio).
    const w = cfg.encolhimento > 0 && tipo === 'baseline+swing' ? Math.min(1, x.frac / cfg.encolhimento) : 1;
    const q = w * p + (1 - w) * (prior ?? p);
    return { ...x, tipo: 'observado', h, q, projA: x.a + h * q, projB: x.b + h * (1 - q) };
  }
  const h = pendentesSemApuracao(x, agr, cfg);
  if (prior == null) return { ...x, tipo: 'sem_prior', h, q: null, projA: 0, projB: 0 };
  return { ...x, tipo: `fallback:${tipo}`, h, q: prior, projA: h * prior, projB: h * (1 - prior) };
}

function razaoValidosRelativa(itens, agr) {
  const ap = itens.filter((x) => x.est > 0 && x.vvc > 0 && x.validoBase != null);
  const esperado = ap.reduce((s, x) => s + x.est * x.validoBase, 0);
  const observado = ap.reduce((s, x) => s + x.vvc, 0);
  return esperado > 0 ? observado / esperado : null;
}

// estratos: [{id, nome?, obs|null, baseline|null, stale?}] ; finalistas: [n1, n2]
export function projetar({ estratos, finalistas, cfg = CFG_PADRAO }) {
  const c = { ...CFG_PADRAO, ...cfg };
  const itens = estratos.map((e) => resumirEstrato(e, finalistas));
  const agrBase = agregados(itens);
  const agr = { ...agrBase, ratioRel: razaoValidosRelativa(itens, agrBase) };
  const { swing, estratos: nSwing } = c.usarBaseline ? calcularSwing(itens, c) : { swing: null, estratos: 0 };
  const swingFn = c.kSwing != null && swing != null ? swingHierarquico(itens, c, swing) : swing;
  const proj = itens.map((x) => projetarEstrato(x, { swing: swingFn, agr, cfg: c }));
  const soma = (f) => proj.reduce((s, x) => s + f(x), 0);
  const te = soma((x) => x.te);
  const eleitoradoPct = (f) => (te > 0 ? (soma((x) => (f(x) ? x.te : 0)) / te) * 100 : 0);
  return Object.freeze({
    totais: {
      A: soma((x) => x.projA), B: soma((x) => x.projB), pendentes: soma((x) => x.h),
      validosProj: soma((x) => x.projA + x.projB), te, est: soma((x) => x.est),
      st: soma((x) => x.st), ts: soma((x) => x.ts), obsA: agr.A, obsB: agr.B,
    },
    swing, estratosSwing: nSwing, pNac: agr.pNac, ratio: agr.ratio,
    contagem: {
      total: proj.length,
      comDado: proj.filter((x) => x.temDado).length,
      apurados: proj.filter((x) => x.tipo === 'observado').length,
      fallbackBaseline: proj.filter((x) => x.tipo === 'fallback:baseline+swing').length,
      fallbackNacional: proj.filter((x) => x.tipo === 'fallback:nacional').length,
      semPrior: proj.filter((x) => x.tipo === 'sem_prior').length,
      stale: proj.filter((x) => x.stale).length,
    },
    eleitoradoPct: {
      semDado: eleitoradoPct((x) => !x.temDado),
      fallbackNacional: eleitoradoPct((x) => x.tipo === 'fallback:nacional'),
      semPrior: eleitoradoPct((x) => x.tipo === 'sem_prior'),
      stale: eleitoradoPct((x) => x.stale),
      apurado: te > 0 ? (soma((x) => x.est) / te) * 100 : 0,
    },
    estratos: proj,
  });
}
