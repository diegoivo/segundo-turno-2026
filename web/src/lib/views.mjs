// Visões: transformam os dados (latest, gov, série, panorama) no HTML de cada "slot" das páginas.
// O build usa estas funções para o pré-render (estado 1, sem dados) e o navegador para hidratar com dados reais.
import {
  cmpHTML, divRow, fcFinal, fcHTML, fcNA, headlineHTML, histSummary, kpis1TGov, kpis1TPresidente, raceRow, score1T, scoreLive,
} from './components.mjs';
import { cmpSVG, curva2022, fimDoEixo, histTable } from './chart.mjs';
import { GOV_UFS, PRIMEIRO_TURNO, UF_NOME } from './config.mjs';
import { esc, p } from './format.mjs';
import { linhas1T, regioesHTML, ufsHTML } from './panorama.mjs';
import { governador1T, governadorVM, presidente1T, presidenteVM } from './viewmodel.mjs';

const ICON_SENSORS = '<svg class="ic on" aria-hidden="true"><use href="#i-sensors"/></svg>';
const ICON_SENSORS_OFF = '<svg class="ic" aria-hidden="true"><use href="#i-sensors"/></svg>';

/** Selo do cabeçalho. status: { atrasado, offline } */
export function updHTML(vm, status = {}) {
  if (!vm || vm.vazio) return `${ICON_SENSORS_OFF}<span>Domingo, 25/10/2026</span>`;
  if (status.atrasado) return `${ICON_SENSORS_OFF}<span class="late"><b>Dados do TSE atrasados</b> · último arquivo ${esc(vm.hg ?? '—')}</span>`;
  if (status.offline) return `${ICON_SENSORS_OFF}<span class="late"><b>Sem conexão com os dados</b> · mostrando a última leitura (${esc(vm.hg ?? '—')})</span>`;
  return `${ICON_SENSORS}<span>Ao vivo · <b>${esc(vm.hg ?? '—')}</b></span>`;
}

const SIDES = (vm) => ({ left: { nome: vm.left.nome, curto: vm.left.curto, cor: vm.left.cor }, right: { nome: vm.right.nome, curto: vm.right.curto, cor: vm.right.cor } });

function histCfg(vm, lados) {
  const live = vm && !vm.vazio;
  return live
    ? { series: vm.series, tEnd: fimDoEixo(vm.series), ...SIDES(vm) }
    : { empty: true, tEnd: 300, series: [], ...lados };
}

function projecaoSlot(vm, tipo) {
  if (!vm || vm.vazio) return fcNA(null, tipo);
  if (vm.estado === 4) return fcFinal(vm);
  if (vm.fc.avail) return fcHTML(vm);
  return fcNA(vm, tipo);
}

// ---------- home ----------

/**
 * @param ctx { latest, serie (pontos do presidente), parcial (snapshot.parcial|null), panorama:{rows,exterior,modo}, status }
 */
export function homeView(ctx = {}) {
  const { latest = null, serie = [], status = {} } = ctx;
  const vm = presidenteVM(latest, serie);
  const live = !vm.vazio;
  const pr = presidente1T();
  const pano = ctx.panorama ?? { rows: linhas1T(), exterior: null, modo: '1t' };

  const itens = [live ? vm : { ...vm, vazio: true, nome: 'Presidente da República', href: '#placar', t1: pr }];
  for (const uf of GOV_UFS) {
    const g = governadorVM(uf, latest);
    itens.push(g.vazio ? { ...g, t1: governador1T(uf) } : g);
  }

  const histLados = { left: { nome: 'Lula', curto: 'Lula', cor: 'red' }, right: { nome: 'Flávio', curto: 'Flávio', cor: 'blue' } };
  const hist = histCfg(live ? vm : null, histLados);
  const cmpCfg = { curve: curva2022(), now: live ? vm.series.filter((q) => q.pct >= 3).map((q) => [q.pct, q.pm]) : null };

  const slots = {
    finding: headlineHTML(live ? vm : null, 'presidente'),
    upd: updHTML(vm, status),
    score: live
      ? `<div class="cardhead"><h2>Apuração oficial do TSE</h2><p>Parcial dos votos válidos no 2º turno. Lula sempre à esquerda, Flávio à direita.</p></div>${scoreLive(vm)}`
      : `<div class="cardhead"><h2>Resultado oficial do 1º turno</h2><p>Dado real do TSE (eleição 6257), 100% das seções. Flávio Bolsonaro e Lula passaram ao 2º turno.</p></div>${score1T(pr, kpis1TPresidente(pr))}`,
    fc: projecaoSlot(live ? vm : null, 'presidente'),
    histsum: histSummary(live ? vm : null),
    histtbl: live ? histTable(hist) : '',
    cmp: cmpHTML(live ? vm : null),
    regs: regioesHTML(pano.rows, pano.modo),
    ufs: ufsHTML(pano.rows, pano.modo, pano.exterior),
    mapsub: pano.modo === '1t'
      ? 'Hoje o mapa mostra quem liderou cada UF no 1º turno (dado real). Na apuração, passa a mostrar a parcial do 2º turno.'
      : 'Cada UF mostra quem lidera na parcial e quanto da apuração já foi feito. É a parcial, não a projeção.',
    maptitle: pano.modo === '1t' ? 'Panorama por região e UF: 1º turno' : 'Panorama por região e UF',
    vf: itens.map(raceRow).join(''),
    vfsub: live
      ? 'Para cada disputa: o que a urna já mostra e o que o modelo estima para o fim. Atualiza junto com o placar.'
      : 'Disponível a partir das 17h. Por enquanto, o resultado oficial do 1º turno de cada disputa.',
    vffoot: 'Cores: vermelho e azul seguem o alinhamento do candidato a governador com Lula e com Flávio; cinza e ocre são neutros. Governadores: projeção pela mesma lógica, aplicada aos municípios de cada UF.',
  };
  return { vm, estado: vm.estado, live, slots, hist, cmpCfg, panorama: pano };
}

// ---------- governador ----------

const DO = { ac: 'do Acre', am: 'do Amazonas', df: 'do Distrito Federal', es: 'do Espírito Santo', rn: 'do Rio Grande do Norte', to: 'do Tocantins' };
export const tituloGov = (uf) => `Governador ${DO[uf]}`;

function outrasDisputas(uf, latest) {
  return `<ul class="vf">${GOV_UFS.filter((u) => u !== uf).map((u) => {
    const vm = governadorVM(u, latest);
    const g1 = governador1T(u);
    const l = vm.vazio ? g1.left : vm.left;
    const r = vm.vazio ? g1.right : vm.right;
    const sl = vm.vazio ? g1.shareL : vm.shareL;
    const sr = vm.vazio ? g1.shareR : vm.shareR;
    const w = vm.winner === 'left' ? l : r;
    let chip = '<span class="chip">1º turno</span>';
    if (!vm.vazio) {
      if (vm.verdict === 'na') chip = '<span class="chip">Projeção indisponível</span>';
      else if (vm.verdict === 'indef') chip = '<span class="chip def">Disputa indefinida</span>';
      else chip = `<span class="chip win c-${w.cor}">${vm.verdict === 'def' ? 'Definido: ' : 'Projetado: '}${esc(w.nome)}</span>`;
    }
    const ln = (c, v) => `<p class="ln c-${c.cor}"><span class="sw"></span><b>${esc(c.nome)}</b> ${p(v)}</p>`;
    return `<li style="grid-template-columns:1fr;gap:8px"><div class="nm"><a href="/governador/${u}/">Governador · ${esc(UF_NOME[u])}</a>${chip}</div>${ln(l, sl)}${ln(r, sr)}</li>`;
  }).join('')}</ul>`;
}

function tabelaCmp(vm, g1) {
  const live = vm && !vm.vazio;
  const rows = [g1.left, g1.right].map((c, i) => {
    const p1 = i ? g1.shareR : g1.shareL;
    const ap = live ? (i ? vm.shareR : vm.shareL) : null;
    const fc = live && vm.fc.avail ? (i ? vm.fc.R : vm.fc.L) : null;
    const lo = live && vm.fc.avail && vm.fc.lo != null ? (i ? 100 - vm.fc.hi : vm.fc.lo) : null;
    const hi = live && vm.fc.avail && vm.fc.hi != null ? (i ? 100 - vm.fc.lo : vm.fc.hi) : null;
    return `<tr class="c-${c.cor}"><th scope="row"><span class="sw"></span> ${esc(c.nome)}<small>Nº ${esc(c.n)} · ${esc(c.sg)}</small></th><td>${p(p1)}</td>`
      + (live ? `<td>${p(ap)}</td><td>${fc == null ? '<span class="muted">—</span>' : `${p(fc, 1)}<small>entre ${p(lo, 1)} e ${p(hi, 1)}</small>`}</td>` : '<td class="muted">—</td><td class="muted">—</td>')
      + '</tr>';
  }).join('');
  return `<div class="tbwrap"><table class="tb"><thead><tr><th scope="col">Candidato</th><th scope="col">1º turno <small>(TSE, real)</small></th><th scope="col">Apurado agora</th><th scope="col">Projeção final</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p class="note">Em % dos votos válidos. No 1º turno havia outros candidatos (somam ${p(g1.other)}); no 2º turno, só estes dois.</p>`;
}

/** ctx { latest, gov (gov-<uf>.json|null), serie (pontos da UF), status } */
export function govView(uf, ctx = {}) {
  const { latest = null, gov = null, serie = [], status = {} } = ctx;
  const vm = governadorVM(uf, latest, gov, serie);
  const live = !vm.vazio;
  const g1 = governador1T(uf);
  const nome = UF_NOME[uf];
  const u1 = PRIMEIRO_TURNO.ufs.find((x) => x.uf.toLowerCase() === uf);
  const lados = { left: { nome: g1.left.nome, curto: g1.left.curto, cor: g1.left.cor }, right: { nome: g1.right.nome, curto: g1.right.curto, cor: g1.right.cor } };
  const hist = histCfg(live ? vm : null, lados);

  const slots = {
    finding: headlineHTML(live ? vm : null, 'governador'),
    upd: updHTML(vm, status),
    score: live
      ? `<div class="cardhead"><h2>Apuração oficial do TSE</h2><p>Parcial dos votos válidos para governador. Vermelho e azul seguem o alinhamento com Lula e com Flávio; cinza e ocre são neutros.</p></div>${scoreLive(vm)}`
      : `<div class="cardhead"><h2>Resultado oficial do 1º turno</h2><p>Dado real do TSE (eleição 6259). Nenhum candidato passou de 50% dos votos válidos.</p></div>${score1T(g1, kpis1TGov(g1))}`,
    fc: projecaoSlot(live ? vm : null, 'governador'),
    histsum: histSummary(live ? vm : null),
    histtbl: live ? histTable(hist) : '',
    cmp: tabelaCmp(vm, g1),
    prestitle: `Presidente em ${nome} no 1º turno`,
    pres: `<ul class="rows">${divRow('1º turno (resultado oficial)', 'dado real do TSE', u1.lula, u1.flavio)}</ul><p class="note">Barras: Lula (vermelho) e Flávio (azul) como % dos votos dos dois nesta UF. A disputa para governador não segue o presidente; o painel serve para comparar os dois resultados.</p>`,
    others: outrasDisputas(uf, latest),
  };
  return { vm, estado: vm.estado, live, slots, hist };
}

