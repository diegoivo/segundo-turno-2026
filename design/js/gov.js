/* Página de governador (modelo reutilizável). UF vem de ?uf= (padrão: df). Em produção: /governador/<uf>. */
(function () {
  'use strict';
  var A = window.APP, M = window.MOCK, $ = A.$;
  var uf = (new URLSearchParams(location.search).get('uf') || 'df').toUpperCase();
  if (A.GOVUFS.indexOf(uf) < 0) uf = 'DF';
  var nomeUF = A.UFNOME[uf], timer = null;
  var TARGET = Date.UTC(2026, 9, 25, 20, 0, 0);

  function set(id, html) { var e = $('#' + id); if (e) e.innerHTML = html; }
  function clock() {
    var s = Math.floor(Math.max(0, TARGET - Date.now()) / 1000), v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60], b = $('#clock');
    if (b) b.innerHTML = ['dias', 'horas', 'minutos', 'segundos'].map(function (l, i) { return '<div><b>' + String(v[i]).padStart(2, '0') + '</b><span>' + l + '</span></div>'; }).join('');
  }
  var cls = function (c) { return 'c-' + c.cor; };
  var pres = function (st) {
    var u = M.ufs1.filter(function (x) { return x.uf === uf; })[0];
    if (st === '1') return { L: u.L, R: u.F, pct: 100 };
    var s = M.states[st].ufs[uf];
    return { L: s[1], R: s[2], pct: s[0] };
  };

  function cmpTable(vm, st, g1) {
    var rows = [vm.left, vm.right].map(function (c, i) {
      var p1 = i ? g1.shareR : g1.shareL, ap = i ? vm.shareR : vm.shareL, fc = vm.fc.avail ? (i ? vm.fc.R : vm.fc.L) : null;
      return '<tr class="' + cls(c) + '"><th scope="row"><span class="sw"></span> ' + A.esc(c.nome) + '<small>Nº ' + c.n + ' · ' + c.sg + '</small></th><td>' + A.p(p1) + '</td>' +
        (st === '1' ? '<td class="muted">—</td><td class="muted">—</td>' : '<td>' + A.p(ap) + '</td><td>' + (fc == null ? '<span class="muted">—</span>' : A.p(fc, 1)) + '</td>') + '</tr>';
    }).join('');
    return '<div class="tbwrap"><table class="tb"><thead><tr><th scope="col">Candidato</th><th scope="col">1º turno <small>(TSE, real)</small></th><th scope="col">Apurado agora</th><th scope="col">Projeção final</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="note">Em % dos votos válidos. No 1º turno havia ' + 'outros candidatos' + ' (somam ' + A.p(g1.other) + '); no 2º turno, só estes dois.</p>';
  }

  function others(st) {
    return '<ul class="vf">' + A.GOVUFS.filter(function (u) { return u !== uf; }).map(function (u) {
      var vm = st === '1' ? null : A.governor(u, +st), g1 = A.gov1(u);
      var l = vm ? vm.left : g1.left, r = vm ? vm.right : g1.right, sl = vm ? vm.shareL : g1.shareL, sr = vm ? vm.shareR : g1.shareR;
      var chip = !vm ? '<span class="chip">1º turno</span>' : vm.verdict === 'na' ? '<span class="chip">Projeção indisponível</span>' : vm.verdict === 'indef' ? '<span class="chip def">Disputa indefinida</span>' : '<span class="chip win ' + cls(vm.winner === 'left' ? l : r) + '">' + (vm.verdict === 'def' ? 'Definido: ' : 'Projetado: ') + A.esc((vm.winner === 'left' ? l : r).nome) + '</span>';
      return '<li style="grid-template-columns:1fr;gap:8px"><div class="nm"><a href="governador-df.html?uf=' + u.toLowerCase() + '">Governador · ' + A.UFNOME[u] + '</a>' + chip + '</div>' +
        '<p class="ln ' + cls(l) + '"><span class="sw"></span><b>' + A.esc(l.nome) + '</b> ' + A.p(sl) + '</p><p class="ln ' + cls(r) + '"><span class="sw"></span><b>' + A.esc(r.nome) + '</b> ' + A.p(sr) + '</p></li>';
    }).join('') + '</ul>';
  }

  function render() {
    var st = A.state, live = st !== '1', vm = live ? A.governor(uf, +st) : null, g1 = A.gov1(uf), cands = g1;
    clearInterval(timer); $('#count').hidden = live; if (!live) { clock(); timer = setInterval(clock, 1000); }
    document.title = 'Governador do ' + nomeUF + ' | Apuração do 2º turno 2026';
    $('#h1').textContent = 'Governador ' + (uf === 'DF' ? 'do Distrito Federal' : 'do ' + nomeUF);
    $('#finding').innerHTML = live ? A.finding(vm) : 'Segundo turno entre ' + A.esc(g1.left.nome) + ' (' + g1.left.sg + ') e ' + A.esc(g1.right.nome) + ' (' + g1.right.sg + '), a partir das 17h de domingo. Abaixo, o resultado oficial do 1º turno.';
    $('#upd').innerHTML = live ? '<svg class="ic on" aria-hidden="true"><use href="#i-sensors"/></svg><span>Ao vivo · <b>' + vm.hhmm + ':36</b></span>' : '<svg class="ic" aria-hidden="true"><use href="#i-sensors"/></svg><span>Domingo, 25/10/2026</span>';
    $('#uf-pill').textContent = uf;

    if (live) set('score', '<div class="cardhead"><h2>Placar do 2º turno</h2><p>Votos válidos apurados pelo TSE para governador. Vermelho e azul seguem o alinhamento com Lula e com Flávio; cinza e ocre são neutros.</p></div>' + A.scoreLive(vm, { pendCap: 'estimativa, por município' }));
    else set('score', '<div class="cardhead"><h2>Resultado oficial do 1º turno</h2><p>Dado real do TSE (eleição 6259). Nenhum candidato passou de 50% dos votos válidos.</p></div>' +
      A.score1T(g1, '', '<dl class="kpis"><div class="kpi"><dt>Votos válidos</dt><dd>' + A.n(g1.valid) + '</dd><p class="cap">no 1º turno</p></div><div class="kpi"><dt>Eleitorado</dt><dd>' + A.n(M.gov[uf].te) + '</dd><p class="cap">eleitores aptos</p></div><div class="kpi"><dt>Seções</dt><dd>' + A.n(M.gov[uf].ts) + '</dd><p class="cap">totalizadas: 100%</p></div><div class="kpi"><dt>Outros candidatos</dt><dd>' + A.p(g1.other) + '</dd><p class="cap">somados, no 1º turno</p></div></dl>'));

    $('#fc').innerHTML = !live ? A.fcNA(null, 'gov') : st === '2' || !vm.fc.avail ? A.fcNA(vm, 'gov') : st === '3' ? A.fcHTML(vm) : A.fcFinal(vm, A.governor(uf, 3));
    drawHist();
    set('cmp', cmpTable(live ? vm : { left: g1.left, right: g1.right, shareL: 0, shareR: 0, fc: { avail: false } }, st, g1));

    var pr = pres(st), tot = pr.L + pr.R, sl = pr.L / tot * 100;
    $('#pres-title').textContent = live ? 'Presidente em ' + nomeUF + ' agora' : 'Presidente em ' + nomeUF + ' no 1º turno';
    var u1 = M.ufs1.filter(function (x) { return x.uf === uf; })[0];
    set('pres', '<ul class="rows">' + (live ? A.divRow('Agora (2º turno)', A.p(pr.pct, 1) + ' apurado', pr.L, pr.R) : '') +
      A.divRow('1º turno (resultado oficial)', 'dado real do TSE', u1.L, u1.F) + '</ul><p class="note">Barras: Lula (vermelho) e Flávio (azul) como % dos votos dos dois nesta UF. A disputa para governador não segue o presidente; o painel serve para comparar os dois resultados.</p>');
    set('others', others(st));

    var au = $('#aud'), line = $('#audline');
    $('#audit-body').innerHTML = '';
    if (!live) line.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-verified"/></svg>Aguardando o primeiro snapshot, às 17h';
    $('.acts', au).hidden = !live;
    if (live) A.buildChain(vm, 2).then(function (ch) {
      var l = ch[1];
      line.className = 'sumline'; line.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-verified"/></svg>Forecast ' + vm.fc.ver + ' · hash <code>' + l.hash.slice(0, 6) + '…</code> · encadeado ao anterior';
      set('audit-body', '<dl class="dl"><div><dt>Versão do forecast</dt><dd>' + vm.fc.ver + '</dd></div><div><dt>Hash do snapshot</dt><dd><code class="h">' + A.shortHash(l.hash) + '</code></dd></div><div><dt>Hash do anterior</dt><dd><code class="h">' + A.shortHash(l.snap.prev_sha256) + '</code></dd></div></dl>');
      var a = $('#baixar-snap'); a.href = URL.createObjectURL(new Blob([JSON.stringify(Object.assign({ sha256: l.hash }, l.snap), null, 2)], { type: 'application/json' })); a.download = 'gov-' + uf.toLowerCase() + '-' + l.snap.seq + '.json';
    });
  }

  function drawHist() {
    var st = A.state, live = st !== '1', vm = live ? A.governor(uf, +st) : null, g1 = A.gov1(uf);
    var l = (vm ? vm.left : g1.left), r = (vm ? vm.right : g1.right);
    var firstOn = vm ? vm.series.filter(function (p) { return p.on; })[0] : null;
    var cfg = live ? { series: vm.series, tEnd: Math.ceil((vm.t + 8) / 10) * 10, rel: firstOn ? firstOn.t : null, def: null, left: l, right: r } : { empty: true, tEnd: 300, left: l, right: r };
    $('#histsum').textContent = A.histSummary(vm);
    $('#histtbl').innerHTML = live ? A.histTable(cfg) : '';
    A.histChart($('#histchart'), cfg);
  }

  A.watch('#histchart', drawHist);
  A.onTheme = drawHist;
  var rf = $('#atualizar'); if (rf) rf.addEventListener('click', render);
  A.initTheme(); A.initState(render); render(); A.openOnHash();
})();
