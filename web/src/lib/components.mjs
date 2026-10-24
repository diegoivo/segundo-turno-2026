// Componentes de HTML (strings). Isomórficos: o build os usa para pré-renderizar e o navegador para hidratar.
// Todo texto vindo de dado passa por esc(). Valor ausente aparece como "—".
import { LIMIAR_APURACAO, PRIMEIRO_TURNO } from './config.mjs';
import { NA, esc, finito, hhmm, mi, n, num, p } from './format.mjs';

const cls = (c) => `c-${c.cor}`;
const lado = (vm, side) => (side === 'left' ? vm.left : vm.right);

export function candHTML(c, side, pct, votes) {
  return `<div class="cand ${cls(c)}${side === 'R' ? ' r' : ''}"><div class="id"><span class="nbr" aria-hidden="true">${esc(c.n)}</span><div><h3>${esc(c.nome)}</h3>`
    + `<p class="meta">Nº ${esc(c.n)} · ${esc(c.sg)}<br>vice ${esc(c.vice)}</p></div></div>`
    + `<p class="pct" aria-label="${esc(c.nome)}: ${p(pct)}">${p(pct)}</p>`
    + `<p class="votes"><b>${n(votes)}</b> votos</p></div>`;
}

export function barHTML(l, r, other) {
  const o = other ? `<i class="o" style="width:${other}%" title="Outros candidatos"></i>` : '';
  const w = (v) => (finito(v) ? v : 0);
  return `<div class="bar${other ? ' nomid' : ''}" role="img" aria-label="Votos válidos: ${esc(l.c.nome)} ${p(l.v)}, ${esc(r.c.nome)} ${p(r.v)}">`
    + `<i class="${cls(l.c)}" style="width:${w(l.v)}%"></i>${o}<i class="${cls(r.c)}" style="width:${w(r.v)}%"></i></div>`;
}

/** Placar ao vivo: candidatos, barra, diferença e indicadores. */
export function scoreLive(vm) {
  const lead = vm.L === vm.R ? null : vm.L > vm.R ? vm.left : vm.right;
  const diff = finito(vm.L) && finito(vm.R) ? Math.abs(vm.L - vm.R) : null;
  const secCap = vm.secTotal != null && vm.secTotalizadas != null ? `${n(vm.secTotalizadas)} de ${n(vm.secTotal)} seções` : 'das seções do território';
  const coletado = vm.coletadoMs != null ? `coletado às ${vm.coletadoHora}` : 'coleta indisponível';
  return `<div class="cands">${candHTML(vm.left, 'L', vm.shareL, vm.L)}${candHTML(vm.right, 'R', vm.shareR, vm.R)}</div>`
    + `<div class="balance">${barHTML({ c: vm.left, v: vm.shareL }, { c: vm.right, v: vm.shareR })}`
    + `<p class="barcap"><span>% dos votos válidos apurados · linha = 50%</span><span>${lead && diff != null ? `Diferença: <b>${n(diff)}</b> votos a favor de <b>${esc(lead.nome)}</b>` : diff === 0 ? 'Empate' : NA}</span></p></div>`
    + '<dl class="kpis">'
    + `<div class="kpi"><dt>Seções totalizadas</dt><dd>${p(vm.pct)}</dd><div class="track" role="img" aria-label="${p(vm.pct)} das seções"><i style="width:${finito(vm.pct) ? vm.pct : 0}%"></i></div><p class="cap">${secCap}</p></div>`
    + `<div class="kpi"><dt>Votos válidos apurados</dt><dd>${mi(vm.valid)}</dd><p class="cap">${n(vm.valid)} votos</p></div>`
    + `<div class="kpi"><dt>Eleitorado totalizado</dt><dd>${p(vm.pctEleitorado, 1)}</dd><p class="cap">eleitores das seções já totalizadas</p></div>`
    + `<div class="kpi"><dt>Arquivo do TSE</dt><dd>${esc(vm.hg ?? NA)}</dd><p class="cap">${esc(coletado)}</p></div></dl>`;
}

/** Placar do 1º turno (dado real; três partes porque havia outros candidatos). */
export function score1T(r, kpis = '') {
  const lead = r.L > r.R ? r.left : r.right;
  return `<div class="cands">${candHTML(r.left, 'L', r.shareL, r.L)}${candHTML(r.right, 'R', r.shareR, r.R)}</div>`
    + `<div class="balance">${barHTML({ c: r.left, v: r.shareL }, { c: r.right, v: r.shareR }, r.other)}`
    + `<p class="barcap"><span>% dos votos válidos no 1º turno · cinza = outros candidatos (${p(r.other)})</span><span>Diferença: <b>${n(Math.abs(r.L - r.R))}</b> votos a favor de <b>${esc(lead.nome)}</b></span></p></div>${kpis}`;
}

export function kpis1TPresidente(r) {
  const brancosPct = (r.brancos / (r.valid + r.brancos + r.nulos)) * 100;
  return `<dl class="kpis"><div class="kpi"><dt>Seções totalizadas</dt><dd>100,00%</dd><p class="cap">${n(r.ts)} seções</p></div>`
    + `<div class="kpi"><dt>Comparecimento</dt><dd>${esc(r.comp)}%</dd><p class="cap">de ${n(r.te)} eleitores</p></div>`
    + `<div class="kpi"><dt>Votos brancos</dt><dd>${n(r.brancos)}</dd><p class="cap">${p(brancosPct)} dos votos</p></div>`
    + `<div class="kpi"><dt>Votos nulos</dt><dd>${n(r.nulos)}</dd><p class="cap">brancos e nulos não entram nos válidos</p></div></dl>`;
}

export function kpis1TGov(r) {
  return `<dl class="kpis"><div class="kpi"><dt>Votos válidos</dt><dd>${n(r.valid)}</dd><p class="cap">no 1º turno</p></div>`
    + `<div class="kpi"><dt>Eleitorado</dt><dd>${n(r.te)}</dd><p class="cap">eleitores aptos</p></div>`
    + `<div class="kpi"><dt>Seções</dt><dd>${n(r.ts)}</dd><p class="cap">totalizadas: 100%</p></div>`
    + `<div class="kpi"><dt>Outros candidatos</dt><dd>${p(r.other)}</dd><p class="cap">somados, no 1º turno</p></div></dl>`;
}

export function conflevel(c) {
  if (!c) return NA;
  const k = c === 'alta' ? 3 : c === 'média' ? 2 : 1;
  const i = (x) => `<i class="${k >= x ? 'on' : ''}"></i>`;
  return `<span class="conf"><span class="lv" aria-hidden="true">${i(1)}${i(2)}${i(3)}</span>${esc(c.charAt(0).toUpperCase() + c.slice(1))}</span>`;
}

/** Faixa de erro desenhada: eixo em torno de 50%. */
export function rangeHTML(vm) {
  const f = vm.fc;
  if (f.lo == null || f.hi == null) return '';
  let a = Math.floor(Math.min(f.lo, 50) - 0.5);
  let b = Math.ceil(Math.max(f.hi, 50) + 0.5);
  if (b - a < 4) { a -= Math.floor((4 - (b - a)) / 2); b = a + 4; }
  const step = b - a <= 6 ? 1 : 2;
  const pos = (v) => Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100));
  let ticks = '';
  for (let v = a; v <= b; v += step) ticks += `<span class="tk" style="left:${pos(v)}%">${num(v, 0)}%</span>`;
  const lead = f.L >= 50 ? vm.left : vm.right;
  return `<div class="rng ${cls(lead)}" role="img" aria-label="Faixa de erro de ${esc(vm.left.nome)}: de ${p(f.lo, 1)} a ${p(f.hi, 1)}">`
    + `<span class="ax"></span><span class="mid" style="left:${pos(50)}%"></span><span class="bd" style="left:${pos(f.lo)}%;width:${pos(f.hi) - pos(f.lo)}%"></span><span class="pt" style="left:${pos(f.L)}%"></span>${ticks}</div>`
    + `<p class="rngcap" style="margin-top:22px">Faixa de ${esc(vm.left.curto)} (retângulo), projeção (traço preto) e 50% (linha clara). <b>O resultado final deve ficar dentro da faixa em 9 de cada 10 casos</b> (calibrado com as eleições de 2022).</p>`;
}

export function verdictHTML(vm) {
  const f = vm.fc;
  const w = vm.winner === 'left' ? vm.left : vm.winner === 'right' ? vm.right : null;
  if (vm.verdict === 'def' && w) {
    return `<div class="verdict win ${cls(w)}"><b>Vitória matematicamente definida: ${esc(w.nome)}</b>A diferença de ${n(Math.abs(vm.L - vm.R))} votos já é maior que todo o eleitorado que ainda não foi totalizado (cálculo aritmético, sem modelo).</div>`;
  }
  if (vm.verdict === 'proj' && w) {
    return `<div class="verdict win ${cls(w)}"><b>Vencedor projetado: ${esc(w.nome)}</b>A faixa de ${esc(w.curto)} fica toda acima de 50%. Ainda não é resultado oficial.</div>`;
  }
  return `<div class="verdict"><b>Disputa indefinida</b>As faixas dos dois candidatos se cruzam na linha de 50% (margem de ${num(f.hw, 1)} ponto percentual para mais ou para menos). Ainda não dá para apontar um vencedor.</div>`;
}

const verHora = (f) => `${f.versao ? `v${esc(f.versao)} · ` : ''}#${f.seq} · ${esc(f.hora)}`;

function dlProjecao(vm) {
  const f = vm.fc;
  return `<dl class="dl"><div><dt>Eleitorado totalizado</dt><dd>${p(vm.pctEleitorado, 1)}</dd></div>`
    + `<div><dt>Confiança no nível de apuração</dt><dd>${conflevel(f.conf)}</dd></div>`
    + `<div><dt>Versão e hora do forecast</dt><dd>${verHora(f)} <a href="/auditoria/" style="font-weight:400">auditar</a></dd></div></dl>`;
}

export function fcHTML(vm) {
  const f = vm.fc;
  const parte = vm.tipo === 'presidente' ? 'de cada UF' : 'de cada município';
  return `<h3 id="t-proj"><span>Projeção do resultado final</span><span class="ver num">forecast ${verHora(f)}</span></h3>`
    + `<p class="sub">Votos pendentes ${parte} seguem a parcial da própria parte.</p>`
    + `<div class="fcfig">${[vm.left, vm.right].map((c, i) => {
      const v = i ? f.R : f.L;
      const lo = f.lo == null ? null : i ? 100 - f.hi : f.lo;
      const hi = f.hi == null ? null : i ? 100 - f.lo : f.hi;
      return `<div class="${cls(c)}"><p class="who"><span class="sw"></span>${esc(c.nome)}</p><p class="pct">${p(v, 1)}</p><p class="rg">entre <b>${p(lo, 1)}</b> e <b>${p(hi, 1)}</b></p></div>`;
    }).join('')}</div>${rangeHTML(vm)}${verdictHTML(vm)}${dlProjecao(vm)}`
    + '<p class="note">Projeção estatística independente, não é resultado oficial. A faixa foi calibrada com as eleições de 2022: o resultado final deve ficar dentro dela em 9 de cada 10 casos, e ela diminui conforme a apuração avança.</p>';
}

// Critérios do modelo (model/criterios.mjs) agrupados em frases simples. Falta = algum id do grupo em criterios_nao_atendidos.
const GRUPOS = [
  { ids: ['apuracao_minima'], t: (k) => `Pelo menos ${LIMIAR_APURACAO[k]}% do eleitorado em seções totalizadas`, d: (vm) => (vm.pctEleitorado != null ? `Agora: <b>${p(vm.pctEleitorado, 1)}</b>` : '') },
  { ids: ['estratos_apurados'], t: (k) => (k === 'governador' ? 'Pelo menos metade dos municípios (ou zonas, no DF) com algum voto totalizado' : 'Pelo menos metade das 28 partes (27 UFs e exterior) com algum voto totalizado') },
  { ids: ['arquivos_validos', 'estratos_esperados', 'finalistas_identificados', 'cobertura_dados'], t: () => 'Arquivos do TSE válidos, completos e consistentes (os candidatos somam o total de válidos)' },
  { ids: ['fallback_nacional', 'estratos_sem_prior'], t: () => 'Base do 1º turno disponível em todas as partes' },
  { ids: ['leituras_preservadas', 'horarios_presentes', 'dispersao_horarios', 'frescor'], t: () => 'Leitura recente e simultânea: arquivos de até 5 minutos e gerados em horários próximos' },
];

const ICON_OK = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 6.5l2.6 2.6L10 3.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

export function critHTML(vm, tipo) {
  const falhas = vm ? vm.criterios : [];
  const conhecidos = GRUPOS.flatMap((g) => g.ids);
  const items = GRUPOS.map((g) => ({ ok: vm ? !g.ids.some((id) => falhas.includes(id)) : false, t: g.t(tipo), d: vm && g.d ? g.d(vm) : '' }));
  for (const id of falhas) if (!conhecidos.includes(id)) items.push({ ok: false, t: `Critério do modelo: ${esc(id.replace(/_/g, ' '))}`, d: '' });
  return `<ul class="crit">${items.map((i) => {
    const s = !vm ? 'wait' : i.ok ? 'ok' : 'no';
    return `<li class="${s}"><span class="st" aria-hidden="true">${s === 'ok' ? ICON_OK : s === 'no' ? '!' : ''}</span><span><span class="tg">${s === 'ok' ? 'Atendido. ' : s === 'no' ? 'Falta. ' : ''}</span>${i.t}</span>${i.d ? `<span class="det">${i.d}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

/** Projeção indisponível (estado 2) ou ainda não iniciada (estado 1). */
export function fcNA(vm, tipo) {
  const wait = !vm;
  return `<h3 id="t-proj"><span>${wait ? 'Quando a projeção aparece' : 'Projeção indisponível'}</span></h3>`
    + `<div class="na"><div><b>${wait ? 'Só depois de cumpridos os critérios mínimos' : 'Faltam critérios mínimos para publicar'}</b><p class="sub">${wait ? 'Antes disso o site mostra apenas a parcial oficial do TSE. Não existe projeção sem base.' : 'Enquanto isso vale a parcial oficial, ao lado. Quando todos os critérios forem atendidos, a projeção entra sozinha.'}</p></div></div>`
    + critHTML(vm, tipo)
    + (wait ? '<h4 style="font-size:var(--fs-b);margin:18px 0 0;font-weight:700">O que aparece quando os critérios forem atendidos</h4><dl class="dl" style="margin-top:6px"><div><dt>Percentual projetado</dt><dd>de cada candidato</dd></div><div><dt>Faixa de erro</dt><dd>entre X% e Y%</dd></div><div><dt>Eleitorado totalizado</dt><dd>% já apurado</dd></div><div><dt>Confiança</dt><dd>baixa, média ou alta</dd></div><div><dt>Versão e hora</dt><dd>auditável por hash</dd></div></dl>' : '')
    + `<p class="note">${wait ? 'A projeção é um cálculo estatístico independente e nunca será exibida como resultado oficial.' : 'Nenhum número de projeção é mostrado enquanto algum critério falha: é melhor não projetar do que projetar sem base.'}</p>`;
}

/** Última projeção publicada antes da definição (ou a primeira, se todas vieram depois). */
export function projecaoAnterior(series) {
  const on = (series ?? []).filter((x) => x.on);
  if (!on.length) return null;
  const antes = on.filter((x) => !x.def);
  return antes.length ? antes[antes.length - 1] : on[0];
}

/** Estado 4: o que foi projetado antes × o que foi apurado. */
export function fcFinal(vm) {
  const f = vm.fc;
  const e = projecaoAnterior(vm.series);
  let rows = '';
  if (e) {
    const fl = 50 + e.fm / 2;
    const hw = e.bd / 2;
    rows = [vm.left, vm.right].map((c, i) => {
      const pe = i ? 100 - fl : fl;
      const lo = pe - hw;
      const hi = pe + hw;
      const real = i ? vm.shareR : vm.shareL;
      const dentro = real != null && real >= lo && real <= hi;
      return `<li class="${cls(c)}"><p class="ln"><span class="sw"></span><b>${esc(c.nome)}</b><span class="v">apurado <b style="color:var(--c)">${p(real)}</b></span></p>`
        + `<p class="why">Projetado às ${hhmm(e.t)}: ${p(pe, 1)} (entre ${p(lo, 1)} e ${p(hi, 1)}). <b>${dentro ? 'Resultado dentro da faixa.' : 'Resultado fora da faixa.'}</b></p></li>`;
    }).join('');
  }
  return `<h3 id="t-proj"><span>Projeção final × apurado</span><span class="ver num">forecast ${verHora(f)}</span></h3>`
    + '<p class="sub">O forecast fica congelado no fim da apuração. Veja se a projeção publicada antes acertou.</p>'
    + verdictHTML(vm) + (rows ? `<ul class="fin" style="margin-top:14px">${rows}</ul>` : '')
    + dlProjecao(vm)
    + '<p class="note">Projeção estatística independente, não é resultado oficial. O resultado oficial é o do TSE.</p>';
}

/** Precisão em linguagem simples. Só aparece se o modelo exportar `erro_medio_esperado`; nunca inventa o número. */
export function erroMedio(race) {
  const e = race?.forecast?.erro_medio_esperado ?? race?.erro_medio_esperado ?? null;
  if (!e || typeof e !== 'object') return null;
  const proj = e.projecao ?? e.proj ?? null;
  const parc = e.parcial ?? null;
  return finito(proj) && finito(parc) ? { proj, parcial: parc } : null;
}

export function precisaoHTML(vm) {
  const e = vm?.erro;
  if (!e) return '';
  return `<p class="precisao">Neste ponto da apuração, a projeção erra em média ±${num(e.proj, 1)} ponto; a parcial, ±${num(e.parcial, 1)}.</p>`;
}

const ESTADO_PROJ = { def: 'Vitória matematicamente definida', proj: 'Tendência de vitória', indef: 'Disputa indefinida' };

/** Manchete: a projeção estatística é a proposta do site; a parcial do TSE vem logo abaixo como apoio. */
export function headlineHTML(vm, tipo) {
  const min = LIMIAR_APURACAO[tipo];
  if (!vm || vm.vazio || !vm.fc.avail) {
    const apoio = vm && !vm.vazio ? `<p class="apoio">Apuração oficial: <b>${p(vm.pct, 1)} das seções</b> totalizadas. Na parcial${vm.L === vm.R ? ', empate.' : `, ${esc((vm.L > vm.R ? vm.left : vm.right).nome)} tem ${p(Math.max(vm.shareL, vm.shareR), 1)} dos válidos.`}</p>`
      : '<p class="apoio">A apuração começa às 17h de Brasília. Até lá, o resultado oficial do 1º turno.</p>';
    return `<p class="proj-h"><b>Projeção disponível a partir de ${min}% do eleitorado apurado</b></p>${apoio}`;
  }
  const f = vm.fc;
  const lados = [[vm.left, f.L, f.lo, f.hi], [vm.right, f.R, f.hi == null ? null : 100 - f.hi, f.lo == null ? null : 100 - f.lo]].sort((x, y) => y[1] - x[1]);
  const itens = lados.map(([c, v, lo, hi]) => `<span class="${cls(c)} pj"><span class="sw"></span><b>${esc(c.nome)} ${p(v, 1)}</b><small>entre ${p(lo, 1)} e ${p(hi, 1)}</small></span>`).join('<span class="sep" aria-hidden="true">·</span>');
  const w = vm.winner === 'left' ? vm.left : vm.winner === 'right' ? vm.right : null;
  const estado = `${ESTADO_PROJ[vm.verdict] ?? ''}${w && vm.verdict !== 'indef' ? `: ${esc(w.nome)}` : ''}`;
  return `<p class="proj-h">Projeção:</p><div class="proj-v">${itens}</div>`
    + `<p class="proj-s"><span class="chip ${vm.verdict === 'indef' ? 'def' : `win ${w ? cls(w) : ''}`}">${estado}</span> <span>Confiança ${esc(f.conf ?? '—')}</span></p>`
    + `${precisaoHTML(vm)}<p class="apoio">Apuração oficial: <b>${p(vm.pct, 1)} das seções</b> totalizadas.</p>`;
}

/** Margem de Lula sobre Bolsonaro em 2022, interpolada por % de seções apuradas (TSE). */
export function m2022(pct) {
  const c = PRIMEIRO_TURNO.curva2022;
  let i = 0;
  while (i < c.length - 2 && c[i + 1][0] <= pct) i++;
  const [a, b] = [c[i], c[i + 1]];
  const f = Math.max(0, Math.min(1, (pct - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * f;
}

export function cmpHTML(vm) {
  let txt;
  if (!vm) {
    txt = '<p>No 2º turno de 2022, Jair Bolsonaro começou na frente e Lula passou à frente quando cerca de 70% das seções estavam apuradas. O resultado final foi <b>Lula 50,90% × Jair Bolsonaro 49,10%</b>.</p>'
      + '<p class="muted" style="margin-top:8px">O gráfico mostra, para cada ponto da apuração de 2022 (dado oficial do TSE), o percentual de cada um. Durante a apuração de 2026, ele ganha as linhas de 2026. <b>É uma comparação do ritmo da contagem, não uma previsão.</b></p>';
  } else {
    const m = m2022(vm.pct);
    txt = `<p>Quando <b>${p(vm.pct, 1)}</b> das seções estavam apuradas, o placar era:</p>`
      + `<div class="pair"><div><small>2º turno de 2022 (real)</small><i>Lula ${p(50 + m / 2)}</i><b>Jair Bolsonaro ${p(50 - m / 2)}</b></div>`
      + `<div><small>Hoje, no mesmo ponto</small><i>Lula ${p(vm.shareL)}</i><b>Flávio Bolsonaro ${p(vm.shareR)}</b></div></div>`
      + '<p class="note">Em 2022 o resultado final foi Lula 50,90% × Jair Bolsonaro 49,10%. <b>Isto não é previsão:</b> só mostra que a contagem costuma mudar de lado ao longo da noite, porque cada região termina de apurar em um horário.</p>';
  }
  return `<div class="txt">${txt}</div><div><p class="note" style="margin:0 0 6px">${vm ? 'Eixo horizontal: % das seções apuradas (não é horário). Pontilhado: 2022. Linha cheia: 2026.' : 'Eixo horizontal: % das seções apuradas (não é horário). Pontilhado: 2022.'}</p><div class="chart" id="cmpchart"></div></div>`;
}

/** Frase-resumo em português simples acima do gráfico de histórico. */
export function histSummary(vm) {
  if (!vm) return 'A apuração começa às 17h. Este gráfico vai mostrar, hora a hora, o que já foi contado (linha cheia) e o que a projeção estima para o final (linha tracejada e faixa).';
  const f = vm.fc;
  const pct = `${num(vm.pct, 0)}%`;
  if (!f.avail && !vm.def) return `Com ${pct} das seções apuradas, ainda não há projeção: faltam critérios mínimos de dados. A linha cheia mostra só o que já foi contado.`;
  if (vm.def) return `Resultado definido: os votos que faltam já não alcançam a diferença.${f.avail ? ' A linha tracejada é a última projeção publicada.' : ''}`;
  if (vm.verdict === 'proj') {
    const w = vm.winner === 'left' ? vm.left : vm.right;
    return `Com ${pct} apurado, a projeção aponta ${w.nome} à frente: a faixa dele está toda acima de 50%.`;
  }
  return `Com ${pct} apurado, a projeção ainda não permite apontar um vencedor: as faixas dos dois candidatos se cruzam na linha de 50%.`;
}

/** Linha divergente a partir do 50%. Sem votos, mostra "—". */
export function divRow(name, right, l, r) {
  const tot = l + r;
  if (!(tot > 0)) return `<li><div class="rowh"><b>${esc(name)}</b><span>${esc(right || '')}</span></div><p class="sub">${NA} sem votos apurados</p></li>`;
  const sl = (l / tot) * 100;
  const m = sl - 50;
  const w = Math.min(50, ((Math.abs(m) * 2) / 20) * 50);
  const bar = m >= 0 ? `<i class="c-red" style="right:50%;width:${w}%"></i>` : `<i class="c-blue" style="left:50%;width:${w}%"></i>`;
  return `<li><div class="rowh"><b>${esc(name)}</b><span>${esc(right || '')}</span></div><div class="dv"><span>${p(sl, 1)}</span>`
    + `<div class="dvbar" role="img" aria-label="Lula ${p(sl, 1)}, Flávio ${p(100 - sl, 1)}">${bar}</div><span>${p(100 - sl, 1)}</span></div></li>`;
}

export const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : NA);

const chip = (t, c = '') => `<span class="chip ${c}">${t}</span>`;
const linhaCand = (c, pct, v, dec = 2) => `<p class="ln ${cls(c)}"><span class="sw"></span><b>${esc(c.nome)}</b> ${p(pct, dec)}<span class="v">${v}</span></p>`;

export function situacao(vm) {
  const w = vm.winner === 'left' ? vm.left : vm.winner === 'right' ? vm.right : null;
  if (vm.verdict === 'def' && w) return chip(`Definido: ${esc(w.nome)}`, `win ${cls(w)}`);
  if (vm.verdict === 'proj' && w) return chip(`Projetado: ${esc(w.nome)}`, `win ${cls(w)}`);
  if (vm.verdict === 'indef') return chip('Disputa indefinida', 'def');
  return chip('Projeção indisponível');
}

/** Linha da lista "Votos apurados × forecast". `vm` ou `{nome, href, t1}` antes das 17h. */
export function raceRow(vm) {
  if (vm.vazio || vm.t1) {
    const r = vm.t1;
    return `<li><div class="nm"><a href="${esc(vm.href)}">${esc(vm.nome)}</a></div><div class="cols"><div class="col"><h4>Apurado agora</h4><p class="ln muted">A apuração começa às 17h.</p></div>`
      + `<div class="col"><h4>No 1º turno (resultado oficial)</h4>${[[r.left, r.shareL, r.L], [r.right, r.shareR, r.R]].map((x) => linhaCand(x[0], x[1], n(x[2]))).join('')}</div></div>`
      + `<div class="sit">${chip('Aguardando as 17h')}</div></li>`;
  }
  const f = vm.fc;
  const ap = [[vm.left, vm.shareL, vm.L], [vm.right, vm.shareR, vm.R]].map((x) => linhaCand(x[0], x[1], n(x[2]))).join('');
  const pj = f.avail
    ? [[vm.left, f.L, f.lo, f.hi], [vm.right, f.R, f.hi == null ? null : 100 - f.hi, f.lo == null ? null : 100 - f.lo]].map((x) => linhaCand(x[0], x[1], `${num(x[2], 1)} a ${p(x[3], 1)}`, 1)).join('')
    : '<p class="ln muted">Critérios mínimos ainda não atendidos.</p>';
  return `<li><div class="nm"><a href="${esc(vm.href)}">${esc(vm.nome)}</a><span class="muted" style="font-weight:400;font-size:var(--fs-b)">${p(vm.pct, 1)} das seções</span></div>`
    + `<div class="cols"><div class="col"><h4>Apurado agora: % e votos válidos</h4>${ap}</div><div class="col"><h4>Projeção do resultado final${f.avail ? ' · faixa de erro' : ''}</h4>${pj}</div></div>`
    + `<div class="sit">${situacao(vm)}</div></li>`;
}
