// Metricas puras sobre as linhas de resultados.json (uma corrida x um modo, em ordem cronologica).
export const FAIXAS = [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, 60], [60, 70], [70, 80], [80, 90], [90, 95], [95, 99], [99, 100.0001]];
export const rotulo = ([a, b]) => `${a}-${Math.min(100, Math.round(b))}`;
export const binDe = (ap) => FAIXAS.findIndex(([a, b]) => ap >= a && ap < b);

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const maximo = (xs) => (xs.length ? Math.max(...xs) : null);
export function percentil(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// Cada linha carrega sua verdade em r.v (permite agrupar corridas).
const dentro = (r) => r.faixa != null && r.v >= r.faixa[0] && r.v <= r.faixa[1];

export function porFaixa(rows) {
  return FAIXAS.map((f, k) => {
    const rs = rows.filter((r) => binDe(r.apurado) === k);
    const pub = rs.filter((r) => r.publicado);
    const em = pub.map((r) => Math.abs(r.proj - r.v));
    const ep = pub.filter((r) => r.parcial != null).map((r) => Math.abs(r.parcial - r.v));
    const emPar = pub.filter((r) => r.parcial != null).map((r) => Math.abs(r.proj - r.v));
    return {
      faixa: rotulo(f), instantes: rs.length, publicados: pub.length,
      erro_modelo_medio: media(em), erro_modelo_max: maximo(em),
      erro_parcial_medio: media(ep), erro_parcial_max: maximo(ep),
      modelo_melhor: pub.length ? media(emPar) < media(ep) : null,
      cobertos: pub.filter((r) => dentro(r)).length,
      cobertura: pub.length ? pub.filter((r) => dentro(r)).length / pub.length : null,
      meia_media: media(pub.map((r) => r.meia)),
    };
  });
}

export function publicacao(rows) {
  const pub = rows.filter((r) => r.publicado);
  const primeiro = pub[0] ?? null;
  const contagem = {};
  rows.filter((r) => !r.publicado).forEach((r) => r.bloqueios.forEach((b) => { contagem[b] = (contagem[b] ?? 0) + 1; }));
  const transicoes = rows.slice(1).filter((r, i) => rows[i].publicado && !r.publicado).length;
  const antes = primeiro ? rows.filter((r) => r.t < primeiro.t && !r.publicado) : rows;
  const bloqPre = {};
  antes.forEach((r) => r.bloqueios.forEach((b) => { bloqPre[b] = (bloqPre[b] ?? 0) + 1; }));
  return {
    publicados: pub.length, total: rows.length,
    primeiro: primeiro ? { hhmm: primeiro.hhmm, apurado: primeiro.apurado } : null,
    bloqueios: contagem, bloqueios_antes_da_1a_publicacao: bloqPre, despublicacoes: transicoes,
  };
}

export function global(rows) {
  const pub = rows.filter((r) => r.publicado);
  const cob = pub.filter((r) => dentro(r)).length;
  const em = pub.map((r) => Math.abs(r.proj - r.v));
  const ep = pub.filter((r) => r.parcial != null).map((r) => Math.abs(r.parcial - r.v));
  return {
    publicados: pub.length, cobertos: cob, cobertura: pub.length ? cob / pub.length : null,
    erro_modelo_medio: media(em), erro_modelo_max: maximo(em), erro_parcial_medio: media(ep), erro_parcial_max: maximo(ep),
    fora_da_faixa: pub.filter((r) => !dentro(r)).map((r) => ({ hhmm: r.hhmm, apurado: r.apurado, proj: r.proj, faixa: r.faixa })),
  };
}

// Chamadas de vencedor. Verdade = lado de A na base de 2 candidatos (A vence se verdade > 50).
export function chamadas(rows, verdade, nomes) {
  const certo = verdade > 50 ? nomes.A : nomes.B;
  const tipo = (campo) => {
    const cs = rows.filter((r) => r[campo] != null);
    const erradas = cs.filter((r) => r[campo] !== certo);
    const viradas = cs.slice(1).filter((r, i) => cs[i][campo] !== r[campo]).length;
    return {
      total: cs.length, erradas: erradas.length, viradas,
      primeira: cs[0] ? { hhmm: cs[0].hhmm, apurado: cs[0].apurado, n: cs[0][campo] } : null,
      primeira_errada: erradas[0] ? { hhmm: erradas[0].hhmm, apurado: erradas[0].apurado, n: erradas[0][campo] } : null,
    };
  };
  return { vencedor_real: certo, tendencia: tipo('tendencia'), definido: tipo('definido') };
}

// Estabilidade: saltos |delta proj| entre instantes consecutivos AMBOS publicados (grade de 1 min ate 20:00, 5 min depois).
export function estabilidade(rows) {
  const saltos = []; const saltosParcial = []; let pioras = 0; let pares = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]; const b = rows[i];
    if (!a.publicado || !b.publicado) continue;
    pares++;
    const d = Math.abs(b.proj - a.proj);
    saltos.push({ d, de: a.hhmm, para: b.hhmm, apurado: b.apurado });
    if (a.parcial != null && b.parcial != null) saltosParcial.push(Math.abs(b.parcial - a.parcial));
    if (Math.abs(b.proj - b.v) > Math.abs(a.proj - a.v) + 0.05) pioras++;
  }
  const ds = saltos.map((s) => s.d);
  const maior = [...saltos].sort((x, y) => y.d - x.d)[0] ?? null;
  return {
    pares, salto_medio: media(ds), salto_p95: percentil(ds, 0.95), salto_max: maximo(ds), maior_salto: maior,
    acima_0_5pp: ds.filter((d) => d > 0.5).length, acima_1pp: ds.filter((d) => d > 1).length,
    salto_parcial_p95: percentil(saltosParcial, 0.95), salto_parcial_max: maximo(saltosParcial),
    pares_com_piora_gt_0_05pp: pioras,
  };
}
