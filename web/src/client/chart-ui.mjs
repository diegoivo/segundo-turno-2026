// Desenho dos gráficos no DOM (tamanho real do contêiner) e tooltip.
import { cmpSVG, histSVG, tooltipHTML } from '../lib/chart.mjs';

export function desenharHist(host, cfg) {
  if (!host) return;
  const { svg, geom } = histSVG(cfg, host.clientWidth || 640, host.clientHeight || 330);
  host.innerHTML = svg;
  if (cfg.empty || !cfg.series.length) return;
  const el = host.firstChild;
  const cur = el.querySelector('#cur');
  const tip = host.querySelector('.tip');
  const { L, pw, T, tEnd, X, W } = geom;
  const mostrar = (ev) => {
    const r = el.getBoundingClientRect();
    const t = ((ev.clientX - r.left - L) / pw) * tEnd;
    let best = cfg.series[0];
    for (const q of cfg.series) if (Math.abs(q.t - t) < Math.abs(best.t - t)) best = q;
    cur.setAttribute('x1', X(best.t).toFixed(1));
    cur.setAttribute('x2', X(best.t).toFixed(1));
    cur.setAttribute('visibility', 'visible');
    tip.innerHTML = tooltipHTML(best, cfg);
    tip.hidden = false;
    let tx = X(best.t) + 12;
    if (tx > W - 250) tx = X(best.t) - 252;
    tip.style.left = `${Math.max(4, tx)}px`;
    tip.style.top = `${T + 6}px`;
  };
  el.addEventListener('pointermove', mostrar);
  el.addEventListener('pointerdown', mostrar);
  el.addEventListener('pointerleave', () => { cur.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}

export function desenharCmp(host, cfg) {
  if (host) host.innerHTML = cmpSVG(cfg, host.clientWidth || 640);
}
