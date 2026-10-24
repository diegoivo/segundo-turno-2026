/* Auditoria: cadeia de snapshots encadeados por SHA-256, verificável no navegador (Web Crypto, sem dependências).
   No mockup os snapshots são fictícios; em produção vêm de /history/AAAA-MM-DD/<seq>-<sha>.json. */
(function () {
  'use strict';
  var A = window.APP, enc = new TextEncoder();

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function sha(str) { return crypto.subtle.digest('SHA-256', enc.encode(str)).then(hex); }
  /* serialização canônica: chaves ordenadas, sem espaços */
  function canon(o) {
    if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
    if (o && typeof o === 'object') return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}';
    return JSON.stringify(o);
  }

  function clk(sec) { var m = 17 * 60 + Math.floor(sec / 60), q = sec % 60; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ':' + String(q).padStart(2, '0'); }

  /* monta N snapshots consecutivos terminando em vm.seq */
  A.buildChain = function (vm, n) {
    var snaps = [], i;
    for (i = 0; i < n; i++) {
      var seq = vm.seq - (n - 1 - i), k = (n - 1 - i);
      snaps.push({
        seq: seq, coletado_em: '2026-10-25T' + clk(vm.t * 60 + 36 - k * 20) + '-03:00',
        tse: { eleicao: '6258', dg_hg: '25/10/2026 ' + clk(vm.t * 60 + 14 - k * 20), sha256_raw: null },
        modelo: { versao: '1.0.0', sha_codigo: '3f9c2a1' },
        parcial: { pct_secoes: +(vm.pct - k * 0.04).toFixed(2), lula: vm.L - k * 5120, flavio: vm.R - k * 5390 },
        forecast: vm.fc.avail ? { lula_pct: +(vm.fc.L - k * 0.003).toFixed(3), faixa: +vm.fc.hw.toFixed(2) } : null,
        prev_sha256: null
      });
    }
    return Promise.all(snaps.map(function (s) { return sha('raw:' + s.seq); })).then(function (raws) {
      snaps.forEach(function (s, ix) { s.tse.sha256_raw = raws[ix]; });
      var p = Promise.resolve('0'.repeat(64));
      var out = [];
      snaps.forEach(function (s) {
        p = p.then(function (prev) { s.prev_sha256 = prev; return sha(canon(s)).then(function (h) { out.push({ snap: s, hash: h }); return h; }); });
      });
      return p.then(function () { return out; });
    });
  };

  /* recalcula a cadeia a partir do conteúdo e confere cada elo */
  A.verifyChain = function (chain) {
    var i = 0, prev = chain[0].snap.prev_sha256;
    function next() {
      if (i >= chain.length) return Promise.resolve({ ok: true, n: chain.length, head: chain[chain.length - 1].hash });
      var c = chain[i];
      if (c.snap.prev_sha256 !== prev) return Promise.resolve({ ok: false, at: c.snap.seq, reason: 'prev' });
      return sha(canon(c.snap)).then(function (h) {
        if (h !== c.hash) return { ok: false, at: c.snap.seq, reason: 'hash' };
        prev = h; i++; return next();
      });
    }
    return next();
  };

  A.chainHTML = function (chain, bad) {
    return '<ol class="chain" reversed>' + chain.slice().reverse().map(function (c, ix) {
      var isBad = bad && bad.indexOf(c.snap.seq) >= 0;
      return '<li class="' + (ix === 0 ? 'cur ' : '') + (isBad ? 'bad' : '') + '"><div class="h"><span style="color:var(--text);font-weight:600">#' + c.snap.seq + '</span><span>' + c.snap.coletado_em.slice(11, 19) + '</span></div>' +
        '<div><span class="lk">sha256 </span><code>' + A.shortHash(c.hash) + '</code></div>' +
        '<div><span class="lk">prev&nbsp;&nbsp;&nbsp; </span><code>' + (c.snap.prev_sha256.indexOf('000000') === 0 ? 'início da cadeia' : A.shortHash(c.snap.prev_sha256)) + '</code></div></li>';
    }).join('') + '</ol>';
  };

  /* liga botões: verificar, simular adulteração, baixar snapshot */
  A.initAudit = function (host, vm, line) {
    if (!window.crypto || !crypto.subtle) { host.querySelector('.result').textContent = 'Este navegador não expõe a Web Crypto. Use o verificador em Node (tools/verificar-cadeia.mjs).'; return; }
    A.buildChain(vm, 6).then(function (chain) {
      var list = document.querySelector('[data-chain]'), res = host.querySelector('.result'), tamper = host.querySelector('#adulterar');
      var cur = chain, bad = null, last0 = chain[chain.length - 1];
      var setLine = function (ok, at) { if (!line) return; line.className = 'sumline' + (ok ? '' : ' ko'); line.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-verified"/></svg>' + (ok ? 'Cadeia íntegra · ' + (last0.snap.seq + 1) + ' versões · último hash <code>' + last0.hash.slice(0, 6) + '…</code>' : 'Cadeia quebrada em #' + at + ' · confira o snapshot'); };
      A.verifyChain(chain).then(function (r) { setLine(r.ok, r.at); });
      list.innerHTML = A.chainHTML(cur);
      function view() { list.innerHTML = A.chainHTML(cur, bad); }
      function clone() { return chain.map(function (c) { return { snap: JSON.parse(JSON.stringify(c.snap)), hash: c.hash }; }); }
      tamper.checked = false; tamper.onchange = function () {
        cur = clone(); bad = null; res.className = 'result'; res.textContent = 'Clique em “Verificar a cadeia”.'; setLine(true);
        if (tamper.checked) { cur[2].snap.parcial.lula += 1; }
        view();
      };
      host.querySelector('#verificar').onclick = function () {
        res.textContent = 'Recalculando os hashes…';
        A.verifyChain(cur).then(function (r) {
          setLine(r.ok, r.at);
          if (r.ok) { bad = null; res.className = 'result ok'; res.innerHTML = '<b>Cadeia íntegra.</b> ' + r.n + ' snapshots recalculados (#' + cur[0].snap.seq + ' a #' + cur[r.n - 1].snap.seq + '). Hash da ponta: <code class="h">' + A.shortHash(r.head) + '</code>'; }
          else { bad = [r.at]; res.className = 'result ko'; res.innerHTML = '<b>Cadeia quebrada em #' + r.at + '.</b> O conteúdo do snapshot não bate com o hash registrado. Alterar 1 byte de um snapshot antigo invalida este e todos os seguintes.'; }
          view();
        });
      };
      res.className = 'result'; res.textContent = 'Clique em “Verificar a cadeia” para recalcular todos os hashes neste navegador.';
      var dl = host.querySelector('#baixar-snap');
      var last = chain[chain.length - 1];
      dl.href = URL.createObjectURL(new Blob([JSON.stringify(Object.assign({ sha256: last.hash }, last.snap), null, 2)], { type: 'application/json' }));
      dl.download = 'snapshot-' + last.snap.seq + '-' + last.hash.slice(0, 8) + '.json';
    });
  };
})();
