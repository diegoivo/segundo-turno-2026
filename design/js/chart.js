/* Gráficos em SVG inline, em pixels reais (sem biblioteca). Regras: ver DESIGN.md, "Regras de gráfico".
   APP.histChart: % de cada candidato nos votos válidos, por horário (17h em diante), apurado (linha cheia) × projeção (tracejada + faixa).
   APP.cmpChart: 2026 × 2022 por % das seções apuradas.
   Escala vertical FIXA (35% a 65%), sem zoom automático. Linha de 50% sempre marcada. */
(function () {
  'use strict';
  var A = window.APP;
  var f1 = function (v) { return v.toFixed(1); };
  var YMIN = 35, YMAX = 65;
  var pathOf = function (pts, X, Y) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + f1(X(p[0])) + ' ' + f1(Y(p[1])); }).join(''); };
  var clampV = function (v) { return Math.max(YMIN, Math.min(YMAX, v)); };

  /* afasta rótulos para que não se sobreponham (mantém a ordem vertical) */
  function spread(items, gap, top, bottom) {
    items.sort(function (a, b) { return a.y - b.y; });
    items.forEach(function (it, i) { if (i && it.y < items[i - 1].y + gap) it.y = items[i - 1].y + gap; });
    var over = items.length ? items[items.length - 1].y - bottom : 0;
    if (over > 0) { items.forEach(function (it) { it.y -= over; }); }
    items.forEach(function (it, i) { if (it.y < top) it.y = top + i * gap; });
    return items;
  }

  /* cfg: {series:[{t,pct,pm,fm,bd,on,seq}], tEnd, rel, def, left:{nome,curto,cor}, right:{...}, empty} */
  A.histChart = function (host, cfg) {
    var W = Math.max(280, host.clientWidth || 320), small = W < 560;
    var H = Math.max(small ? 320 : 330, host.clientHeight || 0); /* o CSS garante o mínimo (320/330) */
    var s = cfg.series || [], tEnd = cfg.tEnd, rel = cfg.rel;
    var hasDef = cfg.def != null && cfg.def <= tEnd;
    var L = 40, R = small ? 100 : 168, T = 52 + (hasDef ? 16 : 0), B = 30, pw = W - L - R, ph = H - T - B;
    var X = function (t) { return L + t / tEnd * pw; }, Y = function (v) { return T + (YMAX - clampV(v)) / (YMAX - YMIN) * ph; };
    var g = '', i;
    for (i = YMIN; i <= YMAX; i += 5) {
      g += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + f1(Y(i)) + '" y2="' + f1(Y(i)) + '" stroke="var(--grid)"' + (i === 50 ? '' : ' stroke-dasharray="3 3"') + '/>' +
        '<text x="' + (L - 6) + '" y="' + f1(Y(i) + 4) + '" text-anchor="end">' + i + '%</text>';
    }
    var step = (small && tEnd > 150) ? 60 : 30;
    for (i = 0; i <= tEnd; i += step) {
      var lbl = A.hhmm(i); if (lbl.slice(3) === '00') lbl = lbl.slice(0, 2) + 'h';
      g += '<text x="' + f1(X(i)) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' + lbl + '</text>';
    }
    /* área sem projeção: nada é inventado nem interpolado */
    var last = s.length ? s[s.length - 1] : null;
    var zoneEnd = cfg.empty || !last ? tEnd : (rel != null && s.some(function (p) { return p.on; }) ? rel : last.t);
    g += '<rect x="' + f1(X(0)) + '" y="' + T + '" width="' + f1(X(zoneEnd) - X(0)) + '" height="' + ph + '" fill="var(--zone)" opacity=".8"/>';
    if (!cfg.empty) {
      var zw = X(zoneEnd) - X(0), zl = zw > 150 ? ['aguardando dados suficientes'] : ['aguardando', 'dados suficientes'];
      zl.forEach(function (t, k) { g += '<text x="' + f1(X(0) + 6) + '" y="' + f1(Y(39) + k * 14) + '">' + t + '</text>'; });
    }
    /* linha de 50% */
    g += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + f1(Y(50)) + '" y2="' + f1(Y(50)) + '" stroke="var(--text)" stroke-width="2"/>' +
      (small ? '<text class="zl" x="' + (L + 6) + '" y="' + f1(Y(50) - 5) + '" style="fill:var(--text);font-size:11px">50% = vence</text>' : '<text class="zl" x="' + (L + 6) + '" y="' + f1(Y(50) - 6) + '" style="fill:var(--text)">50%: quem passar daqui vence</text>');
    /* marca das urnas (17h) */
    var marks = [[0, '17h · urnas fechadas', 'start']];
    if (rel != null && s.some(function (p) { return p.on; })) marks.push([rel, 'Projeção liberada ' + A.hhmm(rel), 'start']);
    if (hasDef) marks.push([cfg.def, 'Vitória definida ' + A.hhmm(cfg.def), 'end']);
    marks.sort(function (a, b) { return a[0] - b[0]; });
    marks.forEach(function (m, k) {
      var x = X(m[0]), y = T - 10 - (marks.length - 1 - k) * 16;
      g += '<line x1="' + f1(x) + '" x2="' + f1(x) + '" y1="' + (y - 8) + '" y2="' + (T + ph) + '" stroke="var(--text)" stroke-dasharray="2 3"/>' +
        '<text x="' + f1(x + (m[2] === 'end' ? -5 : 5)) + '" y="' + y + '" text-anchor="' + m[2] + '" style="fill:var(--text);font-weight:600">' + m[1] + '</text>';
    });
    var labels = [];
    if (cfg.empty) {
      g += '<text x="' + f1(L + pw / 2) + '" y="' + f1(Y(58)) + '" text-anchor="middle" style="font-size:14px;fill:var(--text);font-weight:600">A apuração começa às 17h</text>' +
        '<text x="' + f1(L + pw / 2) + '" y="' + f1(Y(58) + 18) + '" text-anchor="middle">Cada versão da projeção vira um ponto aqui.</text>';
    } else if (last) {
      var sides = [[cfg.left, 1], [cfg.right, -1]];
      var onP = s.filter(function (p) { return p.on; });
      /* faixas: preenchimento + borda pontilhada (não dependem só da cor) */
      sides.forEach(function (sd) {
        if (!onP.length) return;
        var hi = onP.map(function (p) { return [p.t, 50 + sd[1] * p.fm / 2 + p.bd / 2]; }), lo = onP.map(function (p) { return [p.t, 50 + sd[1] * p.fm / 2 - p.bd / 2]; });
        g += '<path d="' + pathOf(hi.concat(lo.slice().reverse()), X, Y) + 'Z" fill="var(--' + sd[0].cor + ')" fill-opacity=".16"/>' +
          '<path d="' + pathOf(hi, X, Y) + '" fill="none" stroke="var(--' + sd[0].cor + ')" stroke-opacity=".55" stroke-dasharray="1 3" stroke-width="1.5"/>' +
          '<path d="' + pathOf(lo, X, Y) + '" fill="none" stroke="var(--' + sd[0].cor + ')" stroke-opacity=".55" stroke-dasharray="1 3" stroke-width="1.5"/>';
      });
      sides.forEach(function (sd) {
        var c = 'var(--' + sd[0].cor + ')';
        var ap = s.map(function (p) { return [p.t, 50 + sd[1] * p.pm / 2]; });
        g += '<path d="' + pathOf(ap, X, Y) + '" fill="none" stroke="' + c + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
        if (onP.length) g += '<path d="' + pathOf(onP.map(function (p) { return [p.t, 50 + sd[1] * p.fm / 2]; }), X, Y) + '" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-dasharray="7 5" stroke-linecap="round"/>';
        var va = 50 + sd[1] * last.pm / 2;
        g += '<circle cx="' + f1(X(last.t)) + '" cy="' + f1(Y(va)) + '" r="4.5" fill="' + c + '" stroke="var(--surface)" stroke-width="2"/>';
        labels.push({ y: Y(va), x: X(last.t), txt: sd[0].curto + ' ' + A.p(va, 1), sub: small ? '' : ' apurado', cor: sd[0].cor, w: 700 });
        if (last.on) {
          var vp = 50 + sd[1] * last.fm / 2;
          g += '<circle cx="' + f1(X(last.t)) + '" cy="' + f1(Y(vp)) + '" r="4.5" fill="var(--surface)" stroke="' + c + '" stroke-width="2.5"/>';
          labels.push({ y: Y(vp), x: X(last.t), txt: sd[0].curto + ' ' + A.p(vp, 1), sub: small ? ' proj.' : ' projeção', cor: sd[0].cor, w: 400, dash: true });
        }
      });
      spread(labels, 15, T + 8, T + ph - 4).forEach(function (lb) {
        g += '<text x="' + f1(L + pw + 10) + '" y="' + f1(lb.y + 4) + '" style="fill:var(--' + lb.cor + ');font-weight:' + lb.w + ';font-size:12px">' + lb.txt + '<tspan style="font-weight:400;fill:var(--muted)">' + lb.sub + '</tspan></text>';
      });
    }
    g += '<line id="cur" y1="' + T + '" y2="' + (T + ph) + '" stroke="var(--text)" visibility="hidden"/>';
    var alt = cfg.empty ? 'Gráfico ainda vazio: a apuração começa às 17h. Eixo vertical de 35% a 65% dos votos válidos; a linha de 50% marca quem vence.' :
      'Histórico por horário a partir das 17h. Linhas cheias: percentual de cada candidato nos votos válidos já apurados. Linhas tracejadas e faixas: projeção. Eixo vertical de 35% a 65%; a linha de 50% marca quem vence. Há uma tabela com os mesmos dados logo abaixo.';
    host.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + A.esc(alt) + '">' + g + '</svg><div class="tip" hidden></div>';
    if (cfg.empty || !last) return;
    var svg = host.firstChild, cur = svg.querySelector('#cur'), tip = host.querySelector('.tip');
    function show(ev) {
      var r = svg.getBoundingClientRect(), t = (ev.clientX - r.left - L) / pw * tEnd, best = s[0];
      s.forEach(function (p) { if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; });
      cur.setAttribute('x1', f1(X(best.t))); cur.setAttribute('x2', f1(X(best.t))); cur.setAttribute('visibility', 'visible');
      var pl = 50 + best.pm / 2, fl = 50 + best.fm / 2, hw = best.bd / 2;
      tip.innerHTML = '<b>' + A.hhmm(best.t) + '</b> · ' + A.p(best.pct, 1) + ' das seções apuradas<br><b>Apurado:</b> ' + A.esc(cfg.left.curto) + ' ' + A.p(pl, 1) + ', ' + A.esc(cfg.right.curto) + ' ' + A.p(100 - pl, 1) +
        (best.on ? '<br><b>Projeção:</b> ' + A.esc(cfg.left.curto) + ' ' + A.p(fl, 1) + ' (entre ' + A.p(fl - hw, 1) + ' e ' + A.p(fl + hw, 1) + '), ' + A.esc(cfg.right.curto) + ' ' + A.p(100 - fl, 1) : '<br>Sem projeção ainda');
      tip.hidden = false;
      var tx = X(best.t) + 12; if (tx > W - 250) tx = X(best.t) - 252; tip.style.left = Math.max(4, tx) + 'px'; tip.style.top = (T + 6) + 'px';
    }
    svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', function () { cur.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  };

  /* tabela equivalente para leitores de tela (amostra a cada ~15 minutos) */
  A.histTable = function (cfg) {
    var s = (cfg.series || []).filter(function (p, i, a) { return p.t % 15 === 0 || i === a.length - 1; });
    if (!s.length) return '';
    var rows = s.map(function (p) {
      var pl = 50 + p.pm / 2, fl = 50 + p.fm / 2, hw = p.bd / 2;
      return '<tr><th scope="row">' + A.hhmm(p.t) + '</th><td>' + A.p(p.pct, 1) + '</td><td>' + A.p(pl, 1) + '</td><td>' + A.p(100 - pl, 1) + '</td><td>' + (p.on ? A.p(fl, 1) + ' (' + A.num(fl - hw, 1) + ' a ' + A.p(fl + hw, 1) + ')' : 'sem projeção') + '</td><td>' + (p.on ? A.p(100 - fl, 1) : '-') + '</td></tr>';
    }).join('');
    return '<details class="more tblx"><summary><span>Ver os dados do gráfico em tabela</span><svg class="ic chev" aria-hidden="true"><use href="#i-expand-more"/></svg></summary><div class="tbscroll"><table class="tb"><caption class="sr">Histórico por horário</caption><thead><tr><th scope="col">Hora</th><th scope="col">Seções apuradas</th><th scope="col">' + A.esc(cfg.left.curto) + ' apurado</th><th scope="col">' + A.esc(cfg.right.curto) + ' apurado</th><th scope="col">' + A.esc(cfg.left.curto) + ' projeção (faixa)</th><th scope="col">' + A.esc(cfg.right.curto) + ' projeção</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>';
  };

  /* comparação 2026 × 2022, eixo = % das seções apuradas. cfg: {curve:[[pct, margem Lula-Bolsonaro]], now:[[pct, margem]] | null} */
  A.cmpChart = function (host, cfg) {
    var W = Math.max(260, host.clientWidth || 300), small = W < 480, H = small ? 260 : 300, L = 40, R = small ? 98 : 120, T = 12, B = 44, pw = W - L - R, ph = H - T - B;
    var X = function (v) { return L + v / 100 * pw; }, Y = function (v) { return T + (YMAX - clampV(v)) / (YMAX - YMIN) * ph; };
    var g = '', i;
    for (i = YMIN; i <= YMAX; i += 5) g += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + f1(Y(i)) + '" y2="' + f1(Y(i)) + '" stroke="var(--grid)"' + (i === 50 ? '' : ' stroke-dasharray="3 3"') + '/><text x="' + (L - 6) + '" y="' + f1(Y(i) + 4) + '" text-anchor="end">' + i + '%</text>';
    for (i = 0; i <= 100; i += (small ? 50 : 25)) g += '<text x="' + f1(X(i)) + '" y="' + (T + ph + 16) + '" text-anchor="' + (i === 0 ? 'start' : i === 100 ? 'end' : 'middle') + '">' + i + '%</text>';
    g += '<text x="' + f1(L + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" style="fill:var(--text)">% das seções apuradas</text>';
    g += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + f1(Y(50)) + '" y2="' + f1(Y(50)) + '" stroke="var(--text)" stroke-width="2"/><text class="zl" x="' + (L + 4) + '" y="' + f1(Y(50) + 15) + '" style="fill:var(--text);font-size:11px">' + (small ? '50% = vence' : '50%: quem passar daqui vence') + '</text>';
    var labels = [], c22 = cfg.curve;
    [['Lula', 'red', 1], ['Bolsonaro', 'blue', -1]].forEach(function (sd) {
      var pts = c22.map(function (p) { return [p[0], 50 + sd[2] * p[1] / 2]; }), e = pts[pts.length - 1];
      g += '<path d="' + pathOf(pts, X, Y) + '" fill="none" stroke="var(--' + sd[1] + ')" stroke-opacity=".75" stroke-width="2.5" stroke-dasharray="1 5" stroke-linecap="round"/>';
      labels.push({ y: Y(e[1]), txt: sd[0] + ' 2022', cor: sd[1], w: 400 });
    });
    if (cfg.now && cfg.now.length) {
      var n = cfg.now.filter(function (p) { return p[0] >= 3; });
      [['Lula', 'red', 1], ['Flávio', 'blue', -1]].forEach(function (sd) {
        var pts = n.map(function (p) { return [p[0], 50 + sd[2] * p[1] / 2]; }), l = pts[pts.length - 1];
        g += '<path d="' + pathOf(pts, X, Y) + '" fill="none" stroke="var(--' + sd[1] + ')" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + f1(X(l[0])) + '" cy="' + f1(Y(l[1])) + '" r="4.5" fill="var(--' + sd[1] + ')" stroke="var(--surface)" stroke-width="2"/>';
        labels.push({ y: Y(l[1]), txt: sd[0] + ' 2026', cor: sd[1], w: 700 });
      });
    }
    spread(labels, 15, T + 8, T + ph - 4).forEach(function (lb) { g += '<text x="' + (L + pw + 8) + '" y="' + f1(lb.y + 4) + '" style="fill:var(--' + lb.cor + ');font-size:12px;font-weight:' + lb.w + '">' + lb.txt + '</text>'; });
    host.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Percentual de cada candidato nos votos válidos, conforme a porcentagem de seções apuradas. Pontilhado: 2022. Linha cheia: 2026. Eixo de 35% a 65%. Não é previsão.">' + g + '</svg>';
  };
})();
