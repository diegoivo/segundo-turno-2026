/* Núcleo compartilhado: formatação, tema, estado do mockup, modelo de leitura (view-model) e componentes de HTML.
   Em produção o view-model vem de /live/latest.json; aqui vem de mock-data.js (window.MOCK). */
(function () {
  'use strict';
  var M = window.MOCK;
  var nf = new Intl.NumberFormat('pt-BR');
  var A = (window.APP = {});

  /* ---------- formatação (pt-BR, algarismos tabulares via CSS) ---------- */
  A.n = function (v) { return nf.format(Math.round(v)); };
  A.num = function (v, d) { d = d == null ? 2 : d; return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  A.p = function (v, d) { return A.num(v, d == null ? 2 : d) + '%'; };
  A.mi = function (v) { return A.num(v / 1e6, 2) + ' mi'; };
  A.pp = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + A.num(Math.abs(v), 1); };
  A.hhmm = function (t) { var m = 17 * 60 + t; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  A.hhmmss = function (t, s) { return A.hhmm(t) + ':' + pad(s || 0); };
  function pad(n) { return String(n).padStart(2, '0'); }
  A.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  A.$ = function (s, r) { return (r || document).querySelector(s); };
  A.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function safe(fn, fb) { try { return fn(); } catch (e) { return fb; } }

  /* redesenha um gráfico quando a largura do contêiner muda (ResizeObserver) */
  A.watch = function (sel, fn) {
    var el = A.$(sel); if (!el || !window.ResizeObserver) { window.addEventListener('resize', fn); return; }
    var w = el.clientWidth + 'x' + el.clientHeight, t;
    new ResizeObserver(function () { var n = el.clientWidth + 'x' + el.clientHeight; if (n !== w) { w = n; clearTimeout(t); t = setTimeout(function () { fn(); w = el.clientWidth + 'x' + el.clientHeight; }, 80); } }).observe(el);
  };

  /* ---------- tema ---------- */
  A.initTheme = function () {
    var saved = safe(function () { return localStorage.getItem('tema'); }, null);
    if (saved) document.documentElement.dataset.theme = saved;
    var btn = A.$('#tema');
    if (!btn) return;
    function label() {
      var dark = document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      btn.setAttribute('aria-pressed', dark);
      A.$('#tema-t').textContent = dark ? 'Tema claro' : 'Tema escuro';
      A.$('#tema-ic').setAttribute('href', dark ? '#i-light-mode' : '#i-dark-mode');
    }
    label();
    btn.addEventListener('click', function () {
      var dark = btn.getAttribute('aria-pressed') === 'true';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      safe(function () { localStorage.setItem('tema', document.documentElement.dataset.theme); });
      label(); if (A.onTheme) A.onTheme();
    });
  };

  /* abre a Auditoria (recolhida por padrão) quando a âncora aponta para ela ou para a metodologia */
  A.openOnHash = function () {
    var h = location.hash;
    if (h !== '#auditoria' && h !== '#metodologia') return;
    var d = A.$('#aud'); if (d) d.open = true;
    var m = A.$('#metodologia'); if (m && h === '#metodologia') m.open = true;
    var t = A.$(h); if (t && t.scrollIntoView) t.scrollIntoView();
  };
  window.addEventListener('hashchange', A.openOnHash);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#auditoria"],a[href="#metodologia"]');
    if (a) { var d = A.$('#aud'); if (d) d.open = true; var m = A.$('#metodologia'); if (m && a.getAttribute('href') === '#metodologia') m.open = true; }
  });

  /* ---------- estado do mockup (1 a 4) ---------- */
  A.state = '3';
  A.initState = function (onChange) {
    var q = new URLSearchParams(location.search).get('estado');
    var st = q || safe(function () { return localStorage.getItem('estado'); }, null) || '3';
    A.state = /^[1-4]$/.test(st) ? st : '3';
    document.documentElement.dataset.state = A.state;
    A.$$('.seg button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.s === A.state);
      b.addEventListener('click', function () {
        A.state = b.dataset.s; document.documentElement.dataset.state = A.state;
        safe(function () { localStorage.setItem('estado', A.state); });
        A.$$('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        onChange();
      });
    });
  };

  /* ---------- candidatos ---------- */
  A.LULA = { n: '13', nome: 'Lula', curto: 'Lula', full: 'Luiz Inácio Lula da Silva', sg: 'PT', vice: 'Geraldo Alckmin', col: 'Coligação Brasil Pronto Pra Mais', cor: 'red' };
  A.FLA = { n: '22', nome: 'Flávio Bolsonaro', curto: 'Flávio', full: 'Flávio Nantes Bolsonaro', sg: 'PL', vice: 'Alfredo Gaspar', col: 'PL (partido isolado)', cor: 'blue' };
  /* Cores dos governadores: docs/GOVERNADORES-ALINHAMENTO.md. red/blue = lado de Lula/Flávio; n1/n2 = neutras. */
  var GOV = {
    'ALAN RICK': ['Alan Rick', 'n2', 'Alan Rick'], 'MAILZA ASSIS': ['Mailza Assis', 'n1', 'Mailza'],
    'OMAR AZIZ': ['Omar Aziz', 'red', 'Omar'], 'PROFESSORA MARIA DO CARMO': ['Prof. Maria do Carmo', 'blue', 'Carmo'],
    'CELINA LEÃO': ['Celina Leão', 'blue', 'Celina'], 'LEANDRO GRASS': ['Leandro Grass', 'red', 'Grass'],
    'RICARDO FERRAÇO': ['Ricardo Ferraço', 'n1', 'Ferraço'], 'LORENZO PAZOLINI': ['Lorenzo Pazolini', 'blue', 'Pazolini'],
    'CADU DE LULA': ['Cadu de Lula', 'red', 'Cadu'], 'ALLYSON': ['Allyson', 'n1', 'Allyson'],
    'PROFESSORA DORINHA': ['Prof. Dorinha', 'blue', 'Dorinha'], 'VICENTINHO JÚNIOR': ['Vicentinho Júnior', 'n1', 'Vicentinho']
  };
  var RANK = { red: 0, n1: 1, n2: 2, blue: 3 };
  var UFNOME = { AC: 'Acre', AM: 'Amazonas', DF: 'Distrito Federal', ES: 'Espírito Santo', RN: 'Rio Grande do Norte', TO: 'Tocantins' };
  A.GOVUFS = ['AC', 'AM', 'DF', 'ES', 'RN', 'TO'];
  A.UFNOME = UFNOME;
  var title = function (s) { return s.toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (Da|De|Do|Dos|Das|E) /g, function (m) { return m.toLowerCase(); }); };

  function govCand(c) {
    var g = GOV[c.nmu];
    return { n: c.n, nome: g[0], curto: g[2], full: title(c.nm || c.nmu), sg: c.sg, vice: title(c.vice), col: 'Coligação ' + title(c.coligacao), cor: g[1], v1: c.v1, p1: parseFloat(c.p1.replace(',', '.')), key: c.nmu };
  }

  /* ---------- view-models ---------- */
  var T = M.sim.times;
  var K2T = { 2: T.s2, 3: T.s3, 4: T.s4 };
  var conf = function (pct) { return pct < 25 ? 'baixa' : pct <= 70 ? 'média' : 'alta'; };
  A.conf = conf;
  var cmpWinner = function (fcL, hw) { return Math.abs(fcL - 50) > hw ? (fcL > 50 ? 'left' : 'right') : null; };

  /* confere se a diferença apurada já supera os votos válidos que faltam (critério aritmético, sem modelo) */
  function defined(L, R, pend) { return pend < Math.abs(L - R); }

  A.president = function (k) {
    var s = M.states[k], t = K2T[k];
    var vm = { id: 'presidente', tipo: 'presidente', nome: 'Presidente da República', escopo: 'Brasil', href: '#placar', left: A.LULA, right: A.FLA, t: t, hhmm: s.hhmm, pct: s.pct, L: s.L, R: s.F, valid: s.L + s.F, pend: s.pend, ts: M.sim.ts, seq: t * 3, ufs: s.ufs, reg: s.reg, minUf: s.minUf };
    vm.shareL = vm.L / vm.valid * 100; vm.shareR = 100 - vm.shareL;
    vm.fc = { avail: t >= T.rel, L: s.fcL, R: 100 - s.fcL, hw: s.hw, lo: s.fcL - s.hw, hi: s.fcL + s.hw, ver: 'v' + (t * 3), hora: A.hhmmss(t, 14), conf: conf(s.pct) };
    vm.def = defined(vm.L, vm.R, vm.pend) && t >= T.def;
    vm.defHhmm = M.sim.defHhmm;
    vm.verdict = !vm.fc.avail ? 'na' : vm.def ? 'def' : (cmpWinner(s.fcL, s.hw) ? 'proj' : 'indef');
    vm.winner = vm.def ? (vm.L > vm.R ? 'left' : 'right') : cmpWinner(s.fcL, s.hw);
    vm.series = M.series.filter(function (r) { return r[0] <= t && r[0] >= 3 && r[3] + r[4] > 0; }).map(function (r) {
      return { t: r[0], pct: r[1], pm: (r[3] - r[4]) / (r[3] + r[4]) * 100, fm: 2 * (r[5] - 50), bd: 2 * r[6], on: r[0] >= T.rel, seq: r[0] * 3 };
    });
    return vm;
  };

  A.governor = function (uf, k) {
    var g = M.gov[uf], t = K2T[k], st = g.st[k];
    var cs = g.cands.map(govCand), a = cs[0], b = cs[1];
    var swap = RANK[a.cor] > RANK[b.cor];
    var left = swap ? b : a, right = swap ? a : b;
    var fixA = function (v) { return swap ? 100 - v : v; };
    var Lv = swap ? st.B : st.A, Rv = swap ? st.A : st.B;
    var vm = { id: uf.toLowerCase(), tipo: 'governador', uf: uf, nome: 'Governador · ' + UFNOME[uf], escopo: UFNOME[uf], href: 'governador-df.html?uf=' + uf.toLowerCase(), left: left, right: right, t: t, hhmm: A.hhmm(t), pct: st.pct, L: Lv, R: Rv, valid: Lv + Rv, pend: st.pend, ts: g.ts, seq: t * 3 };
    vm.shareL = vm.valid ? vm.L / vm.valid * 100 : 0; vm.shareR = 100 - vm.shareL;
    var fcL = fixA(st.fcA);
    vm.fc = { avail: st.avail, L: fcL, R: 100 - fcL, hw: st.hw, lo: fcL - st.hw, hi: fcL + st.hw, ver: 'v' + (t * 3), hora: A.hhmmss(t, 9), conf: conf(st.pct) };
    vm.def = st.pct >= 90 && defined(vm.L, vm.R, vm.pend);
    vm.verdict = !st.avail ? 'na' : vm.def ? 'def' : (cmpWinner(fcL, st.hw) ? 'proj' : 'indef');
    vm.winner = vm.def ? (vm.L > vm.R ? 'left' : 'right') : cmpWinner(fcL, st.hw);
    vm.series = g.ser.filter(function (r) { return r[0] <= t && r[0] >= 3 && r[1] > 0.3; }).map(function (r) {
      var part = fixA(r[2]), fc = fixA(r[3]);
      return { t: r[0], pct: r[1], pm: 2 * (part - 50), fm: 2 * (fc - 50), bd: 2 * r[4], on: !!r[5], seq: r[0] * 3 };
    });
    vm.munPct = Math.min(100, st.pct * 1.9);
    return vm;
  };

  /* resultado real do 1º turno (TSE, eleição 6257 / 6259) */
  A.pres1 = function () {
    var r = M.pres1, V = r.V;
    return { left: A.LULA, right: A.FLA, L: r.L, R: r.F, valid: V, shareL: r.L / V * 100, shareR: r.F / V * 100, other: 100 - (r.L + r.F) / V * 100, ts: r.ts, comp: r.comp, abst: r.abst, brancos: r.brancos, nulos: r.nulos };
  };
  A.gov1 = function (uf) {
    var g = M.gov[uf], cs = g.cands.map(govCand);
    var swap = RANK[cs[0].cor] > RANK[cs[1].cor], l = swap ? cs[1] : cs[0], r = swap ? cs[0] : cs[1];
    return { left: l, right: r, L: l.v1, R: r.v1, shareL: l.p1, shareR: r.p1, other: 100 - l.p1 - r.p1, valid: g.V1 };
  };

  /* ---------- componentes ---------- */
  var cls = function (c) { return 'c-' + c.cor; };

  A.candHTML = function (c, side, pct, votes, extra) {
    return '<div class="cand ' + cls(c) + (side === 'R' ? ' r' : '') + '">' +
      '<div class="id"><span class="nbr" aria-hidden="true">' + c.n + '</span><div><h3>' + A.esc(c.nome) + '</h3>' +
      '<p class="meta">Nº ' + c.n + ' · ' + c.sg + '<br>vice ' + A.esc(c.vice) + '</p></div></div>' +
      '<p class="pct" aria-label="' + A.esc(c.nome) + ': ' + A.p(pct) + '">' + A.p(pct) + '</p>' +
      '<p class="votes"><b>' + A.n(votes) + '</b> votos' + (extra || '') + '</p></div>';
  };

  A.barHTML = function (l, r, other) {
    var o = other ? '<i class="o" style="width:' + other + '%" title="Outros candidatos"></i>' : '';
    return '<div class="bar' + (other ? ' nomid' : '') + '" role="img" aria-label="Votos válidos: ' + A.esc(l.c.nome) + ' ' + A.p(l.v) + ', ' + A.esc(r.c.nome) + ' ' + A.p(r.v) + '">' +
      '<i class="' + cls(l.c) + '" style="width:' + l.v + '%"></i>' + o + '<i class="' + cls(r.c) + '" style="width:' + r.v + '%"></i></div>';
  };

  /* placar ao vivo: candidatos, barra, diferença e faixa de indicadores */
  A.scoreLive = function (vm, opts) {
    opts = opts || {};
    var lead = vm.L === vm.R ? null : (vm.L > vm.R ? vm.left : vm.right);
    var diff = Math.abs(vm.L - vm.R);
    var secs = Math.round(vm.ts * vm.pct / 100);
    return '<div class="cands">' + A.candHTML(vm.left, 'L', vm.shareL, vm.L) + A.candHTML(vm.right, 'R', vm.shareR, vm.R) + '</div>' +
      '<div class="balance">' + A.barHTML({ c: vm.left, v: vm.shareL }, { c: vm.right, v: vm.shareR }) +
      '<p class="barcap"><span>% dos votos válidos apurados · linha = 50%</span>' +
      '<span>' + (lead ? 'Diferença: <b>' + A.n(diff) + '</b> votos a favor de <b>' + A.esc(lead.nome) + '</b>' : 'Empate') + '</span></p></div>' +
      '<dl class="kpis">' +
      '<div class="kpi"><dt>Seções totalizadas</dt><dd>' + A.p(vm.pct) + '</dd><div class="track" role="img" aria-label="' + A.p(vm.pct) + ' das seções"><i style="width:' + vm.pct + '%"></i></div><p class="cap">' + A.n(secs) + ' de ' + A.n(vm.ts) + ' seções</p></div>' +
      '<div class="kpi"><dt>Votos válidos apurados</dt><dd>' + A.mi(vm.valid) + '</dd><p class="cap">' + A.n(vm.valid) + ' votos</p></div>' +
      '<div class="kpi"><dt>Votos válidos pendentes</dt><dd>' + A.mi(vm.pend) + '</dd><p class="cap">' + (opts.pendCap || 'estimativa, por UF') + '</p></div>' +
      '<div class="kpi"><dt>Arquivo do TSE</dt><dd>' + vm.hhmm + '<small>:' + pad(opts.sec || 12) + '</small></dd><p class="cap">leitura há 22 s · coletado ' + vm.hhmm + ':' + pad((opts.sec || 12) + 4) + '</p></div></dl>';
  };

  /* placar do 1º turno (dado real; três partes porque havia outros candidatos) */
  A.score1T = function (r, label, extraKpis) {
    return '<div class="cands">' + A.candHTML(r.left, 'L', r.shareL, r.L) + A.candHTML(r.right, 'R', r.shareR, r.R) + '</div>' +
      '<div class="balance">' + A.barHTML({ c: r.left, v: r.shareL }, { c: r.right, v: r.shareR }, r.other) +
      '<p class="barcap"><span>% dos votos válidos no 1º turno · cinza = outros candidatos (' + A.p(r.other) + ')</span><span>Diferença: <b>' + A.n(Math.abs(r.L - r.R)) + '</b> votos a favor de <b>' + A.esc((r.L > r.R ? r.left : r.right).nome) + '</b></span></p></div>' +
      (extraKpis || '');
  };

  A.conflevel = function (c) {
    var n = c === 'alta' ? 3 : c === 'média' ? 2 : 1;
    return '<span class="conf"><span class="lv" aria-hidden="true"><i class="' + (n > 0 ? 'on' : '') + '"></i><i class="' + (n > 1 ? 'on' : '') + '"></i><i class="' + (n > 2 ? 'on' : '') + '"></i></span>' + c.charAt(0).toUpperCase() + c.slice(1) + '</span>';
  };

  /* faixa de erro desenhada: eixo de 4 pontos percentuais em torno de 50% */
  A.rangeHTML = function (vm) {
    var f = vm.fc, a = Math.floor(Math.min(f.lo, 50) - 0.5), b = Math.ceil(Math.max(f.hi, 50) + 0.5);
    if (b - a < 4) { a -= Math.floor((4 - (b - a)) / 2); b = a + 4; }
    var step = b - a <= 6 ? 1 : 2, ticks = '';
    var pos = function (v) { return Math.max(0, Math.min(100, (v - a) / (b - a) * 100)); };
    for (var v = a; v <= b; v += step) ticks += '<span class="tk" style="left:' + pos(v) + '%">' + A.num(v, 0) + '%</span>';
    return '<div class="rng ' + cls(f.L >= 50 ? vm.left : vm.right) + '" role="img" aria-label="Faixa de erro de ' + A.esc(vm.left.nome) + ': de ' + A.p(f.lo, 1) + ' a ' + A.p(f.hi, 1) + '">' +
      '<span class="ax"></span><span class="mid" style="left:' + pos(50) + '%"></span>' +
      '<span class="bd" style="left:' + pos(f.lo) + '%;width:' + (pos(f.hi) - pos(f.lo)) + '%"></span><span class="pt" style="left:' + pos(f.L) + '%"></span>' + ticks + '</div>' +
      '<p class="rngcap" style="margin-top:22px">Faixa de ' + A.esc(vm.left.curto) + ' (retângulo), projeção (traço preto) e 50% (linha clara). <b>O resultado final deve ficar dentro da faixa em 9 de cada 10 casos</b> (calibrado com as eleições de 2022).</p>';
  };

  A.verdictHTML = function (vm) {
    var f = vm.fc, w = vm.winner ? vm[vm.winner] : null, ww = vm.winner === 'left' ? vm.left : vm.right;
    if (vm.verdict === 'def') {
      return '<div class="verdict win ' + cls(ww) + '"><b>Vitória matematicamente definida: ' + A.esc(ww.nome) + '</b>Os ' + A.n(vm.pend) + ' votos válidos pendentes não alcançam mais a diferença de ' + A.n(Math.abs(vm.L - vm.R)) + ' votos (cálculo aritmético, sem modelo).</div>';
    }
    if (vm.verdict === 'proj') {
      return '<div class="verdict win ' + cls(ww) + '"><b>Vencedor projetado: ' + A.esc(ww.nome) + '</b>A faixa de ' + A.esc(ww.curto) + ' fica toda acima de 50%. Ainda não é resultado oficial.</div>';
    }
    return '<div class="verdict"><b>Disputa indefinida</b>As faixas dos dois candidatos se cruzam na linha de 50% (margem de ' + A.num(f.hw, 1) + ' ponto percentual para mais ou para menos). Ainda não dá para apontar um vencedor.</div>';
  };

  A.fcHTML = function (vm) {
    var f = vm.fc;
    return '<h3 id="t-proj"><span>Projeção do resultado final</span><span class="ver num">forecast ' + f.ver + ' · ' + f.hora + '</span></h3>' +
      '<p class="sub">Votos pendentes de cada UF seguem a parcial da própria UF.</p>' +
      '<div class="fcfig">' + [vm.left, vm.right].map(function (c, i) {
        var v = i ? f.R : f.L, lo = i ? 100 - f.hi : f.lo, hi = i ? 100 - f.lo : f.hi;
        return '<div class="' + cls(c) + '"><p class="who"><span class="sw"></span>' + A.esc(c.nome) + '</p><p class="pct">' + A.p(v, 1) + '</p><p class="rg">entre <b>' + A.p(lo, 1) + '</b> e <b>' + A.p(hi, 1) + '</b></p></div>';
      }).join('') + '</div>' + A.rangeHTML(vm) + A.verdictHTML(vm) +
      '<dl class="dl"><div><dt>Votos válidos pendentes (estimativa)</dt><dd>' + A.mi(vm.pend) + '</dd></div>' +
      '<div><dt>Confiança no nível de apuração</dt><dd>' + A.conflevel(f.conf) + '</dd></div>' +
      '<div><dt>Versão e hora do forecast</dt><dd>' + f.ver + ' · ' + f.hora + ' <a href="#auditoria" style="font-weight:400">auditar</a></dd></div>' +
      '<div class="probslot" hidden><dt>Probabilidade de vitória</dt><dd>—</dd></div></dl>' +
      '<p class="note">Projeção estatística independente, não é resultado oficial. A faixa foi calibrada com as eleições de 2022: o resultado final deve ficar dentro dela em 9 de cada 10 casos, e ela diminui conforme a apuração avança.</p>';
  };

  /* critérios para publicar a projeção: dados reais do vm (estado 2) ou lista neutra (estado 1) */
  A.critHTML = function (vm, kind) {
    var items;
    if (kind === 'gov') {
      items = [
        { ok: vm && vm.pct >= 20, t: 'Pelo menos 20% das seções da UF totalizadas', d: vm ? 'Agora: <b>' + A.p(vm.pct, 1) + '</b>' : '' },
        { ok: vm && vm.munPct >= 50, t: 'Pelo menos 50% dos municípios com algum voto apurado', d: vm ? 'Agora: <b>' + A.p(vm.munPct, 0) + '</b>' : '' },
        { ok: !!vm, t: 'Arquivo do TSE válido e recente (até 5 minutos)', d: vm ? 'Leitura há <b>19 s</b>' : '' },
        { ok: !!vm, t: 'Resultados consistentes: candidatos somam o total de válidos', d: vm ? 'Diferença: <b>0</b> votos' : '' }
      ];
    } else {
      var low = vm ? Object.keys(vm.ufs).filter(function (u) { return vm.ufs[u][0] < 5; }).sort() : [];
      items = [
        { ok: vm && vm.pct >= 10, t: 'Pelo menos 10% das seções totalizadas no país', d: vm ? 'Agora: <b>' + A.p(vm.pct, 1) + '</b>' : '' },
        { ok: vm && low.length === 0, t: 'Pelo menos 5% das seções totalizadas em cada UF', d: vm ? (low.length ? low.length + ' UFs abaixo de 5%: <b>' + low.join(', ') + '</b>' : 'Todas as UFs acima de 5%') : '' },
        { ok: !!vm, t: 'Leitura recente das 27 UFs e do exterior (até 5 minutos de diferença entre arquivos)', d: vm ? 'Diferença entre o arquivo mais antigo e o mais novo: <b>2 min 40 s</b>' : '' },
        { ok: !!vm, t: 'Resultados consistentes: candidatos somam o total de válidos', d: vm ? 'Diferença: <b>0</b> votos' : '' }
      ];
    }
    return '<ul class="crit">' + items.map(function (i) {
      var s = !vm ? 'wait' : i.ok ? 'ok' : 'no';
      return '<li class="' + s + '"><span class="st" aria-hidden="true">' + (s === 'ok' ? '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 6.5l2.6 2.6L10 3.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : s === 'no' ? '!' : '') + '</span><span><span class="tg">' + (s === 'ok' ? 'Atendido. ' : s === 'no' ? 'Falta. ' : '') + '</span>' + i.t + '</span>' + (i.d ? '<span class="det">' + i.d + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
  };

  /* projeção indisponível (estado 2) ou ainda não iniciada (estado 1) */
  A.fcNA = function (vm, kind) {
    var wait = !vm;
    return '<h3 id="t-proj"><span>' + (wait ? 'Quando a projeção aparece' : 'Projeção indisponível') + '</span></h3>' +
      '<div class="na"><div><b>' + (wait ? 'Só depois de cumpridos quatro critérios' : 'Faltam critérios mínimos para publicar') + '</b><p class="sub">' + (wait ? 'Antes disso o site mostra apenas a parcial oficial do TSE. Não existe projeção sem base.' : 'Enquanto isso vale a parcial oficial, ao lado. Quando todos os critérios forem atendidos, a projeção entra sozinha.') + '</p></div></div>' +
      A.critHTML(vm, kind) +
      (wait ? '<h4 style="font-size:var(--fs-b);margin:18px 0 0;font-weight:700">O que aparece quando os critérios forem atendidos</h4><dl class="dl" style="margin-top:6px"><div><dt>Percentual projetado</dt><dd>de cada candidato</dd></div><div><dt>Faixa de erro</dt><dd>entre X% e Y%</dd></div><div><dt>Votos válidos pendentes</dt><dd>estimativa</dd></div><div><dt>Confiança</dt><dd>baixa, média ou alta</dd></div><div><dt>Versão e hora</dt><dd>auditável por hash</dd></div></dl>' : '') +
      '<p class="note">' + (wait ? 'A projeção é um cálculo estatístico independente e nunca será exibida como resultado oficial.' : 'Nenhum número de projeção é mostrado enquanto algum critério falha: é melhor não projetar do que projetar sem base.') + '</p>';
  };

  /* projeção final (estado 4): o que foi projetado × o que foi apurado */
  A.fcFinal = function (vm, early) {
    var f = vm.fc, e = early.fc;
    var rows = [vm.left, vm.right].map(function (c, i) {
      var pe = i ? e.R : e.L, lo = i ? 100 - e.hi : e.lo, hi = i ? 100 - e.lo : e.hi, real = i ? vm.shareR : vm.shareL;
      var inside = real >= lo && real <= hi;
      return '<li class="' + cls(c) + '"><p class="ln"><span class="sw"></span><b>' + A.esc(c.nome) + '</b><span class="v">apurado <b style="color:var(--c)">' + A.p(real) + '</b></span></p>' +
        '<p class="why">Projetado às ' + e.hora.slice(0, 5) + ': ' + A.p(pe, 1) + ' (entre ' + A.p(lo, 1) + ' e ' + A.p(hi, 1) + '). <b>' + (inside ? 'Resultado dentro da faixa.' : 'Resultado fora da faixa.') + '</b></p></li>';
    }).join('');
    return '<h3 id="t-proj"><span>Projeção final × apurado</span><span class="ver num">forecast ' + f.ver + ' · ' + f.hora + '</span></h3>' +
      '<p class="sub">O forecast fica congelado no fim da apuração. Veja se a projeção publicada antes acertou.</p>' +
      A.verdictHTML(vm) + '<ul class="fin" style="margin-top:14px">' + rows + '</ul>' +
      '<dl class="dl"><div><dt>Votos válidos pendentes (estimativa)</dt><dd>' + A.mi(vm.pend) + '</dd></div>' +
      '<div><dt>Confiança no nível de apuração</dt><dd>' + A.conflevel(f.conf) + '</dd></div>' +
      '<div><dt>Versão e hora do forecast</dt><dd>' + f.ver + ' · ' + f.hora + ' <a href="#auditoria" style="font-weight:400">auditar</a></dd></div></dl>' +
      '<p class="note">Projeção estatística independente, não é resultado oficial. O resultado oficial é o do TSE.</p>';
  };

  /* leitura curta para o título da página */
  A.finding = function (vm) {
    var lead = vm.L === vm.R ? null : (vm.L > vm.R ? vm.left : vm.right);
    var s = '<b>' + A.p(vm.pct, 1) + ' das seções totalizadas.</b> ';
    if (vm.def) {
      var w = vm.winner === 'left' ? vm.left : vm.right;
      return s + A.esc(w.nome) + ' tem a vitória matematicamente definida' + (vm.tipo === 'presidente' ? ' às ' + vm.defHhmm : '') + '.';
    }
    s += lead ? 'Na parcial, ' + A.esc(lead.nome) + ' tem ' + A.p(Math.max(vm.shareL, vm.shareR), 1) + ' dos válidos. ' : '';
    if (vm.verdict === 'na') return s + 'Projeção ainda indisponível.';
    if (vm.verdict === 'indef') return s + 'Projeção: disputa indefinida.';
    return s + 'Projeção: ' + A.esc((vm.winner === 'left' ? vm.left : vm.right).nome) + ' à frente, fora da faixa de erro.';
  };

  /* curva de 2022 (2º turno): margem de Lula sobre Bolsonaro por % de seções (TSE, histórico de totalização) */
  A.m2022 = function (pct) {
    var c = M.c2022, i = 0;
    while (i < c.length - 2 && c[i + 1][0] <= pct) i++;
    var a = c[i], b = c[i + 1], f = Math.max(0, Math.min(1, (pct - a[0]) / (b[0] - a[0])));
    return a[1] + (b[1] - a[1]) * f;
  };

  A.cmpHTML = function (vm) {
    var txt;
    if (!vm) {
      txt = '<p>No 2º turno de 2022, Jair Bolsonaro começou na frente e Lula passou à frente quando cerca de 70% das seções estavam apuradas. O resultado final foi <b>Lula 50,90% × Jair Bolsonaro 49,10%</b>.</p>' +
        '<p class="muted" style="margin-top:8px">O gráfico mostra, para cada ponto da apuração de 2022 (dado oficial do TSE), o percentual de cada um. Durante a apuração de 2026, ele ganha as linhas de 2026. <b>É uma comparação do ritmo da contagem, não uma previsão.</b></p>';
    } else {
      var m = A.m2022(vm.pct), lu = 50 + m / 2, bo = 50 - m / 2;
      txt = '<p>Quando <b>' + A.p(vm.pct, 1) + '</b> das seções estavam apuradas, o placar era:</p>' +
        '<div class="pair"><div><small>2º turno de 2022 (real)</small><i>Lula ' + A.p(lu) + '</i><b>Jair Bolsonaro ' + A.p(bo) + '</b></div>' +
        '<div><small>Hoje, no mesmo ponto' + (A.state === '1' ? '' : ' (simulação)') + '</small><i>Lula ' + A.p(vm.shareL) + '</i><b>Flávio Bolsonaro ' + A.p(vm.shareR) + '</b></div></div>' +
        '<p class="note">Em 2022 o resultado final foi Lula 50,90% × Jair Bolsonaro 49,10%. <b>Isto não é previsão:</b> só mostra que a contagem costuma mudar de lado ao longo da noite, porque cada região termina de apurar em um horário.</p>';
    }
    return '<div class="txt">' + txt + '</div><div><p class="note" style="margin:0 0 6px">' + (vm ? 'Eixo horizontal: % das seções apuradas (não é horário). Pontilhado: 2022. Linha cheia: 2026.' : 'Eixo horizontal: % das seções apuradas (não é horário). Pontilhado: 2022.') + '</p><div class="chart" id="cmpchart"></div></div>';
  };

  /* frase-resumo em português simples, acima do gráfico de histórico */
  A.histSummary = function (vm) {
    if (!vm) return 'A apuração começa às 17h. Este gráfico vai mostrar, hora a hora, o que já foi contado (linha cheia) e o que a projeção estima para o final (linha tracejada e faixa).';
    var f = vm.fc, pct = A.num(vm.pct, 0) + '%';
    if (!f.avail) return 'Com ' + pct + ' das seções apuradas, ainda não há projeção: faltam critérios mínimos de dados. A linha cheia mostra só o que já foi contado.';
    if (vm.def) return 'Resultado definido: os votos que faltam já não alcançam a diferença. A projeção publicada às ' + f.hora.slice(0, 5) + ' ficou ' + (Math.abs(f.L - vm.shareL) <= f.hw ? 'dentro' : 'fora') + ' da faixa.';
    if (vm.verdict === 'proj') { var w = vm.winner === 'left' ? vm.left : vm.right; return 'Com ' + pct + ' apurado, a projeção aponta ' + w.nome + ' à frente: a faixa dele está toda acima de 50%.'; }
    return 'Com ' + pct + ' apurado, a projeção ainda não permite apontar um vencedor: as faixas dos dois candidatos se cruzam na linha de 50%.';
  };

  A.divRow = function (name, right, l, r) {
    var sl = l / (l + r) * 100, m = sl - 50, w = Math.min(50, Math.abs(m) * 2 / 20 * 50);
    var bar = m >= 0 ? '<i class="c-red" style="right:50%;width:' + w + '%"></i>' : '<i class="c-blue" style="left:50%;width:' + w + '%"></i>';
    return '<li><div class="rowh"><b>' + A.esc(name) + '</b><span>' + (right || '') + '</span></div>' +
      '<div class="dv"><span>' + A.p(sl, 1) + '</span><div class="dvbar" role="img" aria-label="Lula ' + A.p(sl, 1) + ', Flávio ' + A.p(100 - sl, 1) + '">' + bar + '</div><span>' + A.p(100 - sl, 1) + '</span></div></li>';
  };

  A.shortHash = function (h) { return h.slice(0, 8) + '…' + h.slice(-6); };

  /* linha da lista "Votos apurados × forecast" */
  A.raceRow = function (vm, mode) {
    var sit;
    var chip = function (t, c) { return '<span class="chip ' + (c || '') + '">' + t + '</span>'; };
    if (mode === '1') {
      var r = vm.t1;
      return '<li><div class="nm"><a href="' + vm.href + '">' + vm.nome + '</a></div>' +
        '<div class="cols"><div class="col"><h4>Apurado agora</h4><p class="ln muted">A apuração começa às 17h.</p></div>' +
        '<div class="col"><h4>No 1º turno (resultado oficial)</h4>' + [[r.left, r.shareL, r.L], [r.right, r.shareR, r.R]].map(function (x) { return '<p class="ln ' + cls(x[0]) + '"><span class="sw"></span><b>' + A.esc(x[0].nome) + '</b> ' + A.p(x[1]) + '<span class="v">' + A.n(x[2]) + '</span></p>'; }).join('') + '</div></div>' +
        '<div class="sit">' + chip('Aguardando as 17h') + '</div></li>';
    }
    var f = vm.fc;
    if (vm.verdict === 'def') sit = chip('Definido: ' + A.esc((vm.winner === 'left' ? vm.left : vm.right).nome), 'win ' + cls(vm.winner === 'left' ? vm.left : vm.right));
    else if (vm.verdict === 'proj') sit = chip('Projetado: ' + A.esc((vm.winner === 'left' ? vm.left : vm.right).nome), 'win ' + cls(vm.winner === 'left' ? vm.left : vm.right));
    else if (vm.verdict === 'indef') sit = chip('Disputa indefinida', 'def');
    else sit = chip('Projeção indisponível');
    var ap = [[vm.left, vm.shareL, vm.L], [vm.right, vm.shareR, vm.R]].map(function (x) { return '<p class="ln ' + cls(x[0]) + '"><span class="sw"></span><b>' + A.esc(x[0].nome) + '</b> ' + A.p(x[1]) + '<span class="v">' + A.n(x[2]) + '</span></p>'; }).join('');
    var pj = f.avail ? [[vm.left, f.L, f.lo, f.hi], [vm.right, f.R, 100 - f.hi, 100 - f.lo]].map(function (x) { return '<p class="ln ' + cls(x[0]) + '"><span class="sw"></span><b>' + A.esc(x[0].nome) + '</b> ' + A.p(x[1], 1) + '<span class="v">' + A.num(x[2], 1) + ' a ' + A.p(x[3], 1) + '</span></p>'; }).join('')
      : '<p class="ln muted">Critérios mínimos ainda não atendidos.</p>';
    return '<li><div class="nm"><a href="' + vm.href + '">' + vm.nome + '</a><span class="muted" style="font-weight:400;font-size:var(--fs-b)">' + A.p(vm.pct, 1) + ' das seções</span></div>' +
      '<div class="cols"><div class="col"><h4>Apurado agora: % e votos válidos</h4>' + ap + '</div><div class="col"><h4>Projeção do resultado final' + (f.avail ? ' · faixa de erro' : '') + '</h4>' + pj + '</div></div>' +
      '<div class="sit">' + sit + '</div></li>';
  };
})();
