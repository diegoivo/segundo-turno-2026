// Home: hidrata a página pré-renderizada com os JSON reais (polling de latest.json).
import { ALVO_MS, POLL } from '../lib/config.mjs';
import { dadosAtrasados, estenderSerie, mesclarSerie } from '../lib/viewmodel.mjs';
import { criarPoller } from '../lib/poll.mjs';
import { homeView, updHTML } from '../lib/views.mjs';
import { pad2 } from '../lib/format.mjs';
import { $, aplicarSlots, observarTamanho } from './dom.mjs';
import { desenharCmp, desenharHist } from './chart-ui.mjs';
import { DEMO, carregarSerie, url, validarLatest } from './dados.mjs';
import { initPanorama } from './mapa-ui.mjs';

export function relogio(agoraMs = Date.now()) {
  const s = Math.floor(Math.max(0, ALVO_MS - agoraMs) / 1000);
  const v = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  return ['dias', 'horas', 'minutos', 'segundos'].map((l, i) => `<div><b>${pad2(v[i])}</b><span>${l}</span></div>`).join('');
}

export function initHome() {
  const est = { latest: null, serieBase: [], serieLatest: [], serieCarregada: false, offline: false, panorama: undefined };
  const cache = { ...homeView({}).slots };
  let ultimaChave = '';
  let relogioTimer = null;

  // na demo o dado é estático e antigo de propósito: nunca é "atrasado" nem "offline"
  const status = () => (DEMO ? { demo: true } : { atrasado: dadosAtrasados(est.latest, Date.now()), offline: est.offline });
  const serie = () => mesclarSerie(est.serieBase, est.serieLatest);

  function desenharGraficos(view, forcar = false) {
    const h = $('#histchart');
    const chave = JSON.stringify([view.hist, h?.clientWidth]);
    if (forcar || chave !== ultimaChave) { ultimaChave = chave; desenharHist(h, view.hist); }
    desenharCmp($('#cmpchart'), view.cmpCfg);
  }

  function render(forcar = false) {
    const view = homeView({ latest: est.latest, serie: serie(), status: status(), panorama: est.panorama });
    aplicarSlots(view.slots, cache);
    const contagem = $('#count');
    contagem.hidden = view.live;
    clearInterval(relogioTimer);
    if (!view.live) {
      const tick = () => {
        $('#clock').innerHTML = relogio();
        if (Date.now() >= ALVO_MS) $('#count-sub').textContent = 'As urnas já fecharam. Aguardando o primeiro boletim do TSE; esta página atualiza sozinha.';
      };
      tick();
      relogioTimer = setInterval(tick, 1000);
    }
    desenharGraficos(view, forcar);
    return view;
  }

  async function aoReceber(latest) {
    est.latest = latest;
    est.offline = false;
    est.serieLatest = estenderSerie(est.serieLatest, latest.presidente);
    if (!est.serieCarregada && latest.presidente?.pct_secoes > 0) {
      est.serieCarregada = true;
      const s = await carregarSerie();
      if (s?.presidente) est.serieBase = s.presidente;
    }
    render();
    if (DEMO) poller.parar(); // estático: uma leitura basta
  }

  const poller = criarPoller({
    url: url('live/latest.json'),
    validar: validarLatest,
    onData: aoReceber,
    onErro: () => { est.offline = est.latest != null; if (est.latest) $('#upd').innerHTML = updHTML(homeView({ latest: est.latest, serie: serie(), status: status() }).vm, status()); },
  });

  render(true);
  observarTamanho($('#histchart'), () => render(true));
  observarTamanho($('#cmpchart'), () => desenharCmp($('#cmpchart'), homeView({ latest: est.latest, serie: serie() }).cmpCfg));
  $('#atualizar')?.addEventListener('click', () => poller.atualizarAgora());
  // Reavalia "dados atrasados" sem esperar o próximo polling.
  if (!DEMO) setInterval(() => { if (est.latest) $('#upd').innerHTML = updHTML(homeView({ latest: est.latest, serie: serie(), status: status() }).vm, status()); }, POLL.intervaloMs / 2);

  initPanorama({ onPanorama: (p) => { est.panorama = p; render(); } });
  poller.iniciar();
}
