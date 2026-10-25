// Página de governador: mesmo polling do latest.json; gov-<uf>.json só aqui; série da UF baixada 1×.
import { POLL } from '../lib/config.mjs';
import { criarPoller } from '../lib/poll.mjs';
import { dadosAtrasados, estenderSerie, mesclarSerie } from '../lib/viewmodel.mjs';
import { govView, updHTML } from '../lib/views.mjs';
import { $, aplicarSlots, observarTamanho } from './dom.mjs';
import { desenharHist } from './chart-ui.mjs';
import { DEMO, carregarGov, carregarSerie, url, validarLatest } from './dados.mjs';
import { relogio } from './home.mjs';
import { ALVO_MS } from '../lib/config.mjs';

export function initGov(uf) {
  const est = { latest: null, gov: null, serieBase: [], serieLatest: [], serieCarregada: false, offline: false, govSeq: null };
  const cache = { ...govView(uf, {}).slots };
  let relogioTimer = null;
  let ultimaChave = '';

  const status = () => (DEMO ? { demo: true } : { atrasado: dadosAtrasados(est.latest, Date.now()), offline: est.offline });
  const view = () => govView(uf, { latest: est.latest, gov: est.gov, serie: mesclarSerie(est.serieBase, est.serieLatest), status: status() });

  function render(forcar = false) {
    const v = view();
    aplicarSlots(v.slots, cache);
    $('#count').hidden = v.live;
    clearInterval(relogioTimer);
    if (!v.live) {
      const tick = () => {
        $('#clock').innerHTML = relogio();
        if (Date.now() >= ALVO_MS) $('#count-sub').textContent = 'As urnas já fecharam. Aguardando o primeiro boletim do TSE; esta página atualiza sozinha.';
      };
      tick();
      relogioTimer = setInterval(tick, 1000);
    }
    const h = $('#histchart');
    const chave = JSON.stringify([v.hist, h?.clientWidth]);
    if (forcar || chave !== ultimaChave) { ultimaChave = chave; desenharHist(h, v.hist); }
  }

  async function aoReceber(latest) {
    est.latest = latest;
    est.offline = false;
    const race = latest.governadores?.[uf];
    est.serieLatest = estenderSerie(est.serieLatest, race);
    if (race?.pct_secoes > 0) {
      if (!est.serieCarregada) {
        est.serieCarregada = true;
        const s = await carregarSerie();
        if (s?.governadores?.[uf]) est.serieBase = s.governadores[uf];
      }
      if (race.seq !== est.govSeq) {
        est.govSeq = race.seq;
        try { est.gov = await carregarGov(uf); } catch { /* o latest já basta para o placar */ }
      }
    }
    render();
    if (DEMO) poller.parar();
  }

  const poller = criarPoller({
    url: url('live/latest.json'),
    validar: validarLatest,
    onData: aoReceber,
    onErro: () => { est.offline = est.latest != null; if (est.latest) $('#upd').innerHTML = updHTML(view().vm, status()); },
  });
  render(true);
  observarTamanho($('#histchart'), () => render(true));
  $('#atualizar')?.addEventListener('click', () => poller.atualizarAgora());
  if (!DEMO) setInterval(() => { if (est.latest) $('#upd').innerHTML = updHTML(view().vm, status()); }, POLL.intervaloMs / 2);
  poller.iniciar();
}
