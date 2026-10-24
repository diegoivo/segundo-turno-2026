/* Home: monta cada bloco a partir do view-model do estado (1 a 4). */
(function () {
  'use strict';
  var A = window.APP, M = window.MOCK, $ = A.$, timer = null;
  var REGS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
  var GRID = { RR: [2, 0], AP: [4, 0], AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1], AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2], MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], AL: [6, 3], SP: [3, 4], MG: [4, 4], ES: [5, 4], SE: [6, 4], PR: [3, 5], RJ: [4, 5], SC: [3, 6], RS: [3, 7] };
  var TARGET = Date.UTC(2026, 9, 25, 20, 0, 0); /* 17h de Brasília = 20h UTC */

  function set(id, html) { var e = $('#' + id); if (e) e.innerHTML = html; }
  function ufRows(state) {
    /* devolve [{uf,nome,regiao,pct,L,R}] do estado, ou do 1º turno real */
    return M.ufs1.map(function (u) {
      if (state === '1') return { uf: u.uf, nome: u.nome, regiao: u.regiao, pct: 100, L: u.L, R: u.F };
      var s = M.states[state].ufs[u.uf];
      return { uf: u.uf, nome: u.nome, regiao: u.regiao, pct: s[0], L: s[1], R: s[2] };
    });
  }

  /* ---------- mapa (malha do IBGE, carregada sob demanda) ---------- */
  var mapState = { rows: null, region: '' }, mapLoading = false, tip = null;
  function loadMap(cb) {
    if (window.MAPA) return cb();
    if (mapLoading) return;
    mapLoading = true;
    var sc = document.createElement('script'); sc.src = 'js/mapa-br.js'; sc.onload = cb;
    sc.onerror = function () { $('#mapbox').innerHTML = '<p class="sub">Não foi possível carregar o mapa. Use o quadro por região ao lado.</p>'; };
    document.head.appendChild(sc);
  }
  function drawMap() {
    if (!window.MAPA || !mapState.rows) return;
    var st = A.state, M2 = window.MAPA, rows = mapState.rows, reg = {};
    rows.forEach(function (r) { reg[r.uf] = r; });
    var parts = [], labels = [];
    Object.keys(M2.ufs).forEach(function (uf) {
      var r = reg[uf], u = M2.ufs[uf], v = r.L + r.R, sl = v ? r.L / v * 100 : 50, lead = r.L >= r.R ? 'red' : 'blue';
      var none = r.pct < 1, k = r.pct < 50 ? .38 : r.pct < 90 ? .68 : 1, gov = A.GOVUFS.indexOf(uf) >= 0;
      var dim = mapState.region && r.regiao !== mapState.region;
      var leader = lead === 'red' ? 'Lula' : 'Flávio', pl = lead === 'red' ? sl : 100 - sl;
      var txt = r.nome + ' (' + uf + '): ' + (none ? 'ainda sem votos apurados' : leader + ' na frente com ' + A.p(pl, 1) + ' dos votos válidos' + (st === '1' ? ' no 1º turno' : ', com ' + A.p(r.pct, 0) + ' das seções apuradas') + '.') + (gov ? ' Tem governador no 2º turno: abrir a página.' : '');
      var attrs = 'class="ufa" data-uf="' + uf + '" data-t="' + A.esc(txt) + '" data-reg="' + r.regiao + '"' + (gov ? ' href="governador-df.html' + (uf === 'DF' ? '' : '?uf=' + uf.toLowerCase()) + '"' : ' tabindex="0" role="img"') + ' aria-label="' + A.esc(txt) + '"';
      parts.push([gov, '<a ' + attrs + '><path class="uf c-' + lead + (none ? ' none' : '') + (gov ? ' gov' : '') + (dim ? ' dim' : '') + '" style="--k:' + k + '" d="' + u.d + '"/></a>']);
      if (u.a >= 1400 && !none) labels.push('<text class="ufl-t' + (k < 1 && !document.documentElement.dataset.theme && true ? ' lt' : '') + (k < 1 ? ' lt' : '') + (dim ? ' dim' : '') + '" x="' + u.c[0] + '" y="' + (u.c[1] + 3) + '">' + uf + '</text>');
    });
    parts.sort(function (a, b) { return (a[0] ? 1 : 0) - (b[0] ? 1 : 0); });
    $('#mapbox').innerHTML = '<svg viewBox="' + M2.viewBox + '" role="group" aria-label="Mapa do Brasil por UF: cor de quem lidera na parcial, intensidade pelo percentual de seções apuradas">' + parts.map(function (x) { return x[1]; }).join('') + labels.join('') + '</svg><div class="tip" hidden></div>';
    tip = $('#mapbox .tip');
    var svg = $('#mapbox svg');
    function show(e, el) {
      var b = $('#mapbox').getBoundingClientRect(), r = el.getBoundingClientRect(), x = e && e.clientX ? e.clientX - b.left : r.left - b.left + r.width / 2, y = e && e.clientY ? e.clientY - b.top : r.top - b.top;
      tip.innerHTML = '<b>' + A.esc(el.dataset.t.split(':')[0]) + '</b><br>' + A.esc(el.dataset.t.split(': ').slice(1).join(': '));
      tip.hidden = false; tip.style.left = Math.max(4, Math.min(b.width - 240, x + 12)) + 'px'; tip.style.top = Math.max(4, y - 8) + 'px';
    }
    A.$$('.ufa', svg).forEach(function (el) {
      el.addEventListener('pointermove', function (e) { show(e, el); }); el.addEventListener('pointerdown', function (e) { show(e, el); });
      el.addEventListener('focus', function () { show(null, el); el.firstChild.classList.add('on'); });
      el.addEventListener('blur', function () { tip.hidden = true; el.firstChild.classList.remove('on'); });
      el.addEventListener('pointerleave', function () { tip.hidden = true; });
    });
    svg.addEventListener('pointerleave', function () { tip.hidden = true; });
    var lg = function (k, c, t) { return '<span class="c-' + c + '"><i style="--k:' + k + '"></i>' + t + '</span>'; };
    var lgHTML = '<div class="maplegend">' + lg(1, 'red', 'Lula na frente') + lg(1, 'blue', 'Flávio na frente') + '<span><i class="none"></i>sem votos apurados</span>' + '<span><i class="gv"></i>governador no 2º turno</span></div>' +
      (st === '1' ? '<div class="maplegend"><span>Resultado do 1º turno por UF (dado real).</span></div>' : '<div class="maplegend"><b style="color:var(--text);font-weight:600">Intensidade da cor = % das seções apuradas:</b><span class="c-red"><i style="--k:.38"></i>menos de 50%</span><span class="c-red"><i style="--k:.68"></i>50% a 90%</span><span class="c-red"><i style="--k:1"></i>mais de 90%</span></div><p class="note" style="margin-top:6px"><b>É a parcial da apuração, não a projeção.</b> O resultado de uma UF ainda pode mudar.</p>');
    $('#maplegend').innerHTML = lgHTML; $('#maplegend2').innerHTML = lgHTML;
  }
  function mapInit(rows) {
    mapState.rows = rows;
    if (window.MAPA) { drawMap(); return; }
    var box = $('#mapbox');
    if (!('IntersectionObserver' in window)) { loadMap(drawMap); return; }
    if (!mapInit.io) { mapInit.io = new IntersectionObserver(function (en) { if (en.some(function (e) { return e.isIntersecting; })) { mapInit.io.disconnect(); loadMap(drawMap); } }, { rootMargin: '400px' }); mapInit.io.observe(box); }
  }
  $$('.regsel button').forEach(function (b) {
    b.addEventListener('click', function () {
      mapState.region = b.dataset.r;
      $$('.regsel button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      drawMap();
    });
  });

  function regions(rows, state) {
    var h = '<ul class="rows">';
    REGS.forEach(function (rg) {
      var rs = rows.filter(function (r) { return r.regiao === rg; }), L = 0, R = 0, sec = 0, ts = 0;
      rs.forEach(function (r) { L += r.L; R += r.R; var u = M.ufs1.filter(function (x) { return x.uf === r.uf; })[0]; sec += u.ts * r.pct / 100; ts += u.ts; });
      h += A.divRow(rg, state === '1' ? '1º turno' : A.p(sec / ts * 100, 1) + ' apurado', L, R);
    });
    return h + '</ul>';
  }
  function ufList(rows, state) {
    var h = '<ul class="rows ufl">';
    REGS.forEach(function (rg) { rows.filter(function (r) { return r.regiao === rg; }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).forEach(function (r) {
      h += A.divRow(r.nome + ' (' + r.uf + ')', state === '1' ? rg : A.p(r.pct, 1) + ' · ' + rg, r.L, r.R);
    }); });
    return h + '</ul>';
  }

  function clock() {
    var d = Math.max(0, TARGET - Date.now()), s = Math.floor(d / 1000);
    var v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
    var b = $('#clock'); if (!b) return;
    b.innerHTML = ['dias', 'horas', 'minutos', 'segundos'].map(function (l, i) { return '<div><b>' + String(v[i]).padStart(2, '0') + '</b><span>' + l + '</span></div>'; }).join('');
  }

  function render() {
    var st = A.state, vm = st === '1' ? null : A.president(+st), rows = ufRows(st), isLive = st !== '1';
    var cd = $('#count'); cd.hidden = isLive;
    clearInterval(timer);
    if (!isLive) { clock(); timer = setInterval(clock, 1000); }

    /* título e leitura */
    $('#finding').innerHTML = isLive ? A.finding(vm) :
      'A apuração começa quando as urnas fecham, às 17h de Brasília. Até lá, o resultado oficial do 1º turno.';
    $('#upd').innerHTML = isLive
      ? '<svg class="ic on" aria-hidden="true"><use href="#i-sensors"/></svg><span>Ao vivo · <b>' + vm.hhmm + ':36</b></span>'
      : '<svg class="ic" aria-hidden="true"><use href="#i-sensors"/></svg><span>Domingo, 25/10/2026</span>';

    /* placar */
    if (isLive) {
      set('score', '<div class="cardhead"><h2>Placar nacional</h2><p>Votos válidos apurados pelo TSE no 2º turno. Lula sempre à esquerda, Flávio à direita.</p></div>' + A.scoreLive(vm));
    } else {
      var r = A.pres1(), p1 = M.pres1;
      set('score', '<div class="cardhead"><h2>Resultado oficial do 1º turno</h2><p>Dado real do TSE (eleição 6257), 100% das seções. Flávio Bolsonaro e Lula passaram ao 2º turno.</p></div>' +
        A.score1T(r, '', '<dl class="kpis"><div class="kpi"><dt>Seções totalizadas</dt><dd>100,00%</dd><p class="cap">' + A.n(p1.ts) + ' seções</p></div>' +
        '<div class="kpi"><dt>Comparecimento</dt><dd>' + p1.comp + '%</dd><p class="cap">de ' + A.n(p1.te) + ' eleitores</p></div>' +
        '<div class="kpi"><dt>Votos brancos</dt><dd>' + A.n(p1.brancos) + '</dd><p class="cap">1,84% dos votos</p></div>' +
        '<div class="kpi"><dt>Votos nulos</dt><dd>' + A.n(p1.nulos) + '</dd><p class="cap">brancos e nulos não entram nos válidos</p></div></dl>'));
    }

    /* projeção */
    var fc = $('#fc');
    fc.innerHTML = st === '1' ? A.fcNA(null) : st === '2' ? A.fcNA(vm) : st === '3' ? A.fcHTML(vm) : A.fcFinal(vm, A.president(3));

    /* histórico */
    drawHist();

    /* 2022 */
    set('cmp', A.cmpHTML(vm));
    drawCmp();

    /* panorama */
    mapInit(rows);
    set('regs', regions(rows, st));
    set('ufs', ufList(rows, st));
    $('#mapsub').textContent = isLive ? 'Cada UF mostra quem lidera na parcial e quanto da apuração já foi feito. É a parcial, não a projeção.' : 'Hoje o mapa mostra quem liderou cada UF no 1º turno (dado real). Na apuração, passa a mostrar a parcial do 2º turno.';
    $('#maptitle span').textContent = isLive ? 'Panorama por região e UF' : 'Panorama por região e UF: 1º turno';

    /* auditoria */
    $('#audit-live').hidden = !isLive; $('#audit-empty').hidden = isLive;
    if (isLive) A.initAudit($('#audit-live'), vm, $('#audline')); else $('#audline').innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-verified"/></svg>Aguardando o primeiro snapshot, às 17h';

    /* votos × forecast */
    var items = [vm ? vm : { nome: 'Presidente da República', href: '#placar', t1: A.pres1() }];
    A.GOVUFS.forEach(function (uf) {
      items.push(isLive ? A.governor(uf, +st) : { nome: 'Governador · ' + A.UFNOME[uf], href: 'governador-df.html' + (uf === 'DF' ? '' : '?uf=' + uf.toLowerCase()), t1: A.gov1(uf) });
    });
    set('vf', items.map(function (v) { return A.raceRow(v, isLive ? '' : '1'); }).join(''));
    $('#vfsub').textContent = isLive ? 'Para cada disputa: o que a urna já mostra e o que o modelo estima para o fim. Atualiza junto com o placar.' : 'Disponível a partir das 17h. Por enquanto, o resultado oficial do 1º turno de cada disputa.';
    $('#vffoot').textContent = isLive ? 'Governadores: projeção pela mesma lógica, aplicada aos municípios de cada UF. Cores provisórias dos candidatos: vermelho e azul seguem o alinhamento com Lula e com Flávio; cinzas e ocres são neutros.' : 'Cores: vermelho e azul seguem o alinhamento do candidato a governador com Lula e com Flávio; cinza e ocre são neutros.';
  }
  function $$(s, r) { return A.$$(s, r); }

  var HL = { nome: 'Lula', curto: 'Lula', cor: 'red' }, HR = { nome: 'Flávio', curto: 'Flávio', cor: 'blue' };
  function drawHist() {
    var st = A.state, host = $('#histchart'), live = st !== '1';
    var vm = live ? A.president(+st) : null;
    var cfg = live ? { series: vm.series, tEnd: Math.ceil((vm.t + 8) / 10) * 10, rel: vm.fc.avail ? M.sim.times.rel : null, def: st === '4' ? M.sim.times.def : null, left: HL, right: HR }
      : { empty: true, tEnd: 300, left: HL, right: HR };
    $('#histsum').textContent = A.histSummary(vm);
    $('#histtbl').innerHTML = live ? A.histTable(cfg) : '';
    A.histChart(host, cfg);
  }
  function drawCmp() {
    var st = A.state, vm = st === '1' ? null : A.president(+st);
    A.cmpChart($('#cmpchart'), { curve: M.c2022.slice(1), now: vm ? vm.series.map(function (p) { return [p.pct, p.pm]; }) : null });
  }

  A.watch('#histchart', drawHist); A.watch('#cmpchart', drawCmp);
  A.onTheme = function () { drawHist(); drawCmp(); };

  var rf = $('#atualizar'); if (rf) rf.addEventListener('click', function () { render(); });
  A.initTheme();
  A.initState(render);
  render();
  A.openOnHash();
})();
