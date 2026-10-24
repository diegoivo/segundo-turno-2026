// Gráficos em SVG (strings), em pixels reais. Regras: design/DESIGN.md, "Regras de gráfico".
// histSVG: % de cada candidato nos votos válidos por horário (17h em diante), apurado (cheio) × projeção (tracejada + faixa).
// cmpSVG: 2026 × 2022 por % das seções apuradas. Escala vertical FIXA de 35% a 65%, linha de 50% sempre marcada.
import { PRIMEIRO_TURNO } from './config.mjs';
import { esc, hhmm, p } from './format.mjs';

const f1 = (v) => v.toFixed(1);
export const YMIN = 35;
export const YMAX = 65;
const clampV = (v) => Math.max(YMIN, Math.min(YMAX, v));
const pathOf = (pts, X, Y) => pts.map((q, i) => `${i ? 'L' : 'M'}${f1(X(q[0]))} ${f1(Y(q[1]))}`).join('');

/** Afasta rótulos para que não se sobreponham (mantém a ordem vertical). */
export function spread(items, gap, top, bottom) {
  items.sort((a, b) => a.y - b.y);
  items.forEach((it, i) => { if (i && it.y < items[i - 1].y + gap) it.y = items[i - 1].y + gap; });
  const over = items.length ? items[items.length - 1].y - bottom : 0;
  if (over > 0) items.forEach((it) => { it.y -= over; });
  items.forEach((it, i) => { if (it.y < top) it.y = top + i * gap; });
  return items;
}

/** Fim do eixo (minutos desde as 17h): arredondado para cima em múltiplos de 10, nunca abaixo de 60. */
export const fimDoEixo = (series) => {
  const ult = series.length ? series[series.length - 1].t : 0;
  return Math.max(60, Math.ceil((ult + 8) / 10) * 10);
};

/**
 * cfg: { series:[{t,pct,pm,fm,bd,on,seq,def}], tEnd, left:{nome,curto,cor}, right, empty }
 * Devolve { svg, geom } onde geom = { W, H, L, pw, T, ph, tEnd } para o tooltip.
 */
export function histSVG(cfg, W0 = 640, H0 = 330) {
  const W = Math.max(280, W0);
  const small = W < 560;
  const H = Math.max(small ? 320 : 330, H0);
  const s = cfg.series || [];
  const tEnd = cfg.tEnd;
  const firstOn = s.find((q) => q.on);
  const rel = firstOn ? firstOn.t : null;
  const defPt = s.find((q) => q.def);
  const defT = defPt ? defPt.t : null;
  const hasDef = defT != null && defT <= tEnd;
  const L = 40;
  const R = small ? 100 : 168;
  const T = 52 + (hasDef ? 16 : 0);
  const B = 30;
  const pw = W - L - R;
  const ph = H - T - B;
  const X = (t) => L + (t / tEnd) * pw;
  const Y = (v) => T + ((YMAX - clampV(v)) / (YMAX - YMIN)) * ph;
  let g = '';
  for (let i = YMIN; i <= YMAX; i += 5) {
    g += `<line x1="${L}" x2="${L + pw}" y1="${f1(Y(i))}" y2="${f1(Y(i))}" stroke="var(--grid)"${i === 50 ? '' : ' stroke-dasharray="3 3"'}/>`
      + `<text x="${L - 6}" y="${f1(Y(i) + 4)}" text-anchor="end">${i}%</text>`;
  }
  const step = small && tEnd > 150 ? 60 : 30;
  for (let i = 0; i <= tEnd; i += step) {
    let lbl = hhmm(i);
    if (lbl.slice(3) === '00') lbl = `${lbl.slice(0, 2)}h`;
    g += `<text x="${f1(X(i))}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}">${lbl}</text>`;
  }
  // Área sem projeção: nada é inventado nem interpolado.
  const last = s.length ? s[s.length - 1] : null;
  const zoneEnd = cfg.empty || !last ? tEnd : rel != null ? rel : last.t;
  g += `<rect x="${f1(X(0))}" y="${T}" width="${f1(X(zoneEnd) - X(0))}" height="${ph}" fill="var(--zone)" opacity=".8"/>`;
  if (!cfg.empty) {
    const zw = X(zoneEnd) - X(0);
    const zl = zw > 150 ? ['aguardando dados suficientes'] : ['aguardando', 'dados suficientes'];
    zl.forEach((t, k) => { g += `<text x="${f1(X(0) + 6)}" y="${f1(Y(39) + k * 14)}">${t}</text>`; });
  }
  g += `<line x1="${L}" x2="${L + pw}" y1="${f1(Y(50))}" y2="${f1(Y(50))}" stroke="var(--text)" stroke-width="2"/>`
    + (small
      ? `<text class="zl" x="${L + 6}" y="${f1(Y(50) - 5)}" style="fill:var(--text);font-size:11px">50% = vence</text>`
      : `<text class="zl" x="${L + 6}" y="${f1(Y(50) - 6)}" style="fill:var(--text)">50%: quem passar daqui vence</text>`);
  const marks = [[0, '17h · urnas fechadas', 'start']];
  if (rel != null) marks.push([rel, `Projeção liberada ${hhmm(rel)}`, 'start']);
  if (hasDef) marks.push([defT, `Vitória definida ${hhmm(defT)}`, 'end']);
  marks.sort((a, b) => a[0] - b[0]);
  marks.forEach((m, k) => {
    const x = X(m[0]);
    const y = T - 10 - (marks.length - 1 - k) * 16;
    g += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${y - 8}" y2="${T + ph}" stroke="var(--text)" stroke-dasharray="2 3"/>`
      + `<text x="${f1(x + (m[2] === 'end' ? -5 : 5))}" y="${y}" text-anchor="${m[2]}" style="fill:var(--text);font-weight:600">${m[1]}</text>`;
  });
  const labels = [];
  if (cfg.empty) {
    g += `<text x="${f1(L + pw / 2)}" y="${f1(Y(58))}" text-anchor="middle" style="font-size:14px;fill:var(--text);font-weight:600">A apuração começa às 17h</text>`
      + `<text x="${f1(L + pw / 2)}" y="${f1(Y(58) + 18)}" text-anchor="middle">Cada versão da projeção vira um ponto aqui.</text>`;
  } else if (last) {
    const sides = [[cfg.left, 1], [cfg.right, -1]];
    const onP = s.filter((q) => q.on);
    sides.forEach(([sd, sg]) => {
      if (!onP.length) return;
      const hi = onP.map((q) => [q.t, 50 + (sg * q.fm) / 2 + q.bd / 2]);
      const lo = onP.map((q) => [q.t, 50 + (sg * q.fm) / 2 - q.bd / 2]);
      g += `<path d="${pathOf(hi.concat(lo.slice().reverse()), X, Y)}Z" fill="var(--${sd.cor})" fill-opacity=".16"/>`
        + `<path d="${pathOf(hi, X, Y)}" fill="none" stroke="var(--${sd.cor})" stroke-opacity=".55" stroke-dasharray="1 3" stroke-width="1.5"/>`
        + `<path d="${pathOf(lo, X, Y)}" fill="none" stroke="var(--${sd.cor})" stroke-opacity=".55" stroke-dasharray="1 3" stroke-width="1.5"/>`;
    });
    sides.forEach(([sd, sg]) => {
      const c = `var(--${sd.cor})`;
      g += `<path d="${pathOf(s.map((q) => [q.t, 50 + (sg * q.pm) / 2]), X, Y)}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (onP.length) g += `<path d="${pathOf(onP.map((q) => [q.t, 50 + (sg * q.fm) / 2]), X, Y)}" fill="none" stroke="${c}" stroke-width="2.5" stroke-dasharray="7 5" stroke-linecap="round"/>`;
      const va = 50 + (sg * last.pm) / 2;
      g += `<circle cx="${f1(X(last.t))}" cy="${f1(Y(va))}" r="4.5" fill="${c}" stroke="var(--surface)" stroke-width="2"/>`;
      labels.push({ y: Y(va), txt: `${sd.curto} ${p(va, 1)}`, sub: small ? '' : ' apurado', cor: sd.cor, w: 700 });
      if (last.on) {
        const vp = 50 + (sg * last.fm) / 2;
        g += `<circle cx="${f1(X(last.t))}" cy="${f1(Y(vp))}" r="4.5" fill="var(--surface)" stroke="${c}" stroke-width="2.5"/>`;
        labels.push({ y: Y(vp), txt: `${sd.curto} ${p(vp, 1)}`, sub: small ? ' proj.' : ' projeção', cor: sd.cor, w: 400 });
      }
    });
    spread(labels, 15, T + 8, T + ph - 4).forEach((lb) => {
      g += `<text x="${f1(L + pw + 10)}" y="${f1(lb.y + 4)}" style="fill:var(--${lb.cor});font-weight:${lb.w};font-size:12px">${esc(lb.txt)}<tspan style="font-weight:400;fill:var(--muted)">${lb.sub}</tspan></text>`;
    });
  }
  g += `<line id="cur" y1="${T}" y2="${T + ph}" stroke="var(--text)" visibility="hidden"/>`;
  const alt = cfg.empty
    ? 'Gráfico ainda vazio: a apuração começa às 17h. Eixo vertical de 35% a 65% dos votos válidos; a linha de 50% marca quem vence.'
    : 'Histórico por horário a partir das 17h. Linhas cheias: percentual de cada candidato nos votos válidos já apurados. Linhas tracejadas e faixas: projeção. Eixo vertical de 35% a 65%; a linha de 50% marca quem vence. Há uma tabela com os mesmos dados logo abaixo.';
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">${g}</svg><div class="tip" hidden></div>`;
  return { svg, geom: { W, H, L, pw, T, ph, tEnd, X } };
}

/** Texto do tooltip do ponto mais próximo (em palavras, repete o dado do gráfico). */
export function tooltipHTML(best, cfg) {
  const pl = 50 + best.pm / 2;
  const fl = 50 + best.fm / 2;
  const hw = best.bd / 2;
  return `<b>${hhmm(best.t)}</b> · ${p(best.pct, 1)} das seções apuradas<br><b>Apurado:</b> ${esc(cfg.left.curto)} ${p(pl, 1)}, ${esc(cfg.right.curto)} ${p(100 - pl, 1)}`
    + (best.on ? `<br><b>Projeção:</b> ${esc(cfg.left.curto)} ${p(fl, 1)} (entre ${p(fl - hw, 1)} e ${p(fl + hw, 1)}), ${esc(cfg.right.curto)} ${p(100 - fl, 1)}` : '<br>Sem projeção ainda');
}

/** Amostra para a tabela: um ponto por janela de 15 min, mais o último. */
export function amostra15(series) {
  const vistos = new Set();
  return series.filter((q, i, a) => {
    const k = Math.floor(q.t / 15);
    if (i === a.length - 1) return true;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Tabela equivalente para leitores de tela. */
export function histTable(cfg) {
  const s = amostra15(cfg.series || []);
  if (!s.length) return '';
  const rows = s.map((q) => {
    const pl = 50 + q.pm / 2;
    const fl = 50 + q.fm / 2;
    const hw = q.bd / 2;
    return `<tr><th scope="row">${hhmm(q.t)}</th><td>${p(q.pct, 1)}</td><td>${p(pl, 1)}</td><td>${p(100 - pl, 1)}</td><td>${q.on ? `${p(fl, 1)} (${p(fl - hw, 1)} a ${p(fl + hw, 1)})` : 'sem projeção'}</td><td>${q.on ? p(100 - fl, 1) : '-'}</td></tr>`;
  }).join('');
  return '<details class="more tblx"><summary><span>Ver os dados do gráfico em tabela</span><svg class="ic chev" aria-hidden="true"><use href="#i-expand-more"/></svg></summary><div class="tbscroll"><table class="tb"><caption class="sr">Histórico por horário</caption>'
    + `<thead><tr><th scope="col">Hora</th><th scope="col">Seções apuradas</th><th scope="col">${esc(cfg.left.curto)} apurado</th><th scope="col">${esc(cfg.right.curto)} apurado</th><th scope="col">${esc(cfg.left.curto)} projeção (faixa)</th><th scope="col">${esc(cfg.right.curto)} projeção</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

/** Comparação 2026 × 2022, eixo = % das seções. cfg: { curve:[[pct, margem]], now:[[pct, margem]]|null } */
export function cmpSVG(cfg, W0 = 640) {
  const W = Math.max(260, W0);
  const small = W < 480;
  const H = small ? 260 : 300;
  const L = 40;
  const R = small ? 98 : 120;
  const T = 12;
  const B = 44;
  const pw = W - L - R;
  const ph = H - T - B;
  const X = (v) => L + (v / 100) * pw;
  const Y = (v) => T + ((YMAX - clampV(v)) / (YMAX - YMIN)) * ph;
  let g = '';
  for (let i = YMIN; i <= YMAX; i += 5) g += `<line x1="${L}" x2="${L + pw}" y1="${f1(Y(i))}" y2="${f1(Y(i))}" stroke="var(--grid)"${i === 50 ? '' : ' stroke-dasharray="3 3"'}/><text x="${L - 6}" y="${f1(Y(i) + 4)}" text-anchor="end">${i}%</text>`;
  for (let i = 0; i <= 100; i += small ? 50 : 25) g += `<text x="${f1(X(i))}" y="${T + ph + 16}" text-anchor="${i === 0 ? 'start' : i === 100 ? 'end' : 'middle'}">${i}%</text>`;
  g += `<text x="${f1(L + pw / 2)}" y="${H - 6}" text-anchor="middle" style="fill:var(--text)">% das seções apuradas</text>`;
  g += `<line x1="${L}" x2="${L + pw}" y1="${f1(Y(50))}" y2="${f1(Y(50))}" stroke="var(--text)" stroke-width="2"/><text class="zl" x="${L + 4}" y="${f1(Y(50) + 15)}" style="fill:var(--text);font-size:11px">${small ? '50% = vence' : '50%: quem passar daqui vence'}</text>`;
  const labels = [];
  [['Lula', 'red', 1], ['Bolsonaro', 'blue', -1]].forEach(([nome, cor, sg]) => {
    const pts = cfg.curve.map((q) => [q[0], 50 + (sg * q[1]) / 2]);
    const e = pts[pts.length - 1];
    g += `<path d="${pathOf(pts, X, Y)}" fill="none" stroke="var(--${cor})" stroke-opacity=".75" stroke-width="2.5" stroke-dasharray="1 5" stroke-linecap="round"/>`;
    labels.push({ y: Y(e[1]), txt: `${nome} 2022`, cor, w: 400 });
  });
  if (cfg.now && cfg.now.length) {
    [['Lula', 'red', 1], ['Flávio', 'blue', -1]].forEach(([nome, cor, sg]) => {
      const pts = cfg.now.map((q) => [q[0], 50 + (sg * q[1]) / 2]);
      const l = pts[pts.length - 1];
      g += `<path d="${pathOf(pts, X, Y)}" fill="none" stroke="var(--${cor})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${f1(X(l[0]))}" cy="${f1(Y(l[1]))}" r="4.5" fill="var(--${cor})" stroke="var(--surface)" stroke-width="2"/>`;
      labels.push({ y: Y(l[1]), txt: `${nome} 2026`, cor, w: 700 });
    });
  }
  spread(labels, 15, T + 8, T + ph - 4).forEach((lb) => { g += `<text x="${L + pw + 8}" y="${f1(lb.y + 4)}" style="fill:var(--${lb.cor});font-size:12px;font-weight:${lb.w}">${lb.txt}</text>`; });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Percentual de cada candidato nos votos válidos, conforme a porcentagem de seções apuradas. Pontilhado: 2022. Linha cheia: 2026. Eixo de 35% a 65%. Não é previsão.">${g}</svg>`;
}

/** Curva de 2022 sem o ponto 0 (como no design). */
export const curva2022 = () => PRIMEIRO_TURNO.curva2022.slice(1);
