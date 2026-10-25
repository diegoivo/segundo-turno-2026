// Panorama (mapa IBGE + quadros por região/UF): carrega sob demanda; usa o snapshot mais recente para a parcial por UF.
import { linhas1T, linhasVivo, legendaMapa, mapaSVG, regioesHTML, ufsHTML } from '../lib/panorama.mjs';
import { $, $$, quandoVisivel } from './dom.mjs';
import { DEMO, MAPA_URL, carregarManifest, carregarSnapshot } from './dados.mjs';
import { buscarJson, proximoAtrasoMs } from '../lib/poll.mjs';
import { esc } from '../lib/format.mjs';


/** @param onPanorama (panorama) => void : devolve as linhas atuais para a home atualizar os quadros */
export function initPanorama({ onPanorama }) {
  const box = $('#mapbox');
  let mapa = null;
  let pano = { rows: linhas1T(), exterior: null, modo: '1t' };
  let regiao = '';
  let chave = null;
  let timer = null;

  const tipEl = () => $('.tip', box);
  function desenhar() {
    if (!mapa) return;
    box.innerHTML = mapaSVG(mapa, pano.rows, { regiao, modo: pano.modo });
    const leg = legendaMapa(pano.modo);
    $('#maplegend').innerHTML = leg;
    $('#maplegend2').innerHTML = leg;
    const tip = tipEl();
    const mostrar = (e, el) => {
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const x = e && e.clientX ? e.clientX - b.left : r.left - b.left + r.width / 2;
      const y = e && e.clientY ? e.clientY - b.top : r.top - b.top;
      const [t1, ...resto] = el.dataset.t.split(': ');
      tip.innerHTML = `<b>${esc(t1)}</b><br>${esc(resto.join(': '))}`;
      tip.hidden = false;
      tip.style.left = `${Math.max(4, Math.min(b.width - 240, x + 12))}px`;
      tip.style.top = `${Math.max(4, y - 8)}px`;
    };
    $$('.ufa', box).forEach((el) => {
      el.addEventListener('pointermove', (e) => mostrar(e, el));
      el.addEventListener('pointerdown', (e) => mostrar(e, el));
      el.addEventListener('focus', () => { mostrar(null, el); el.firstChild.classList.add('on'); });
      el.addEventListener('blur', () => { tip.hidden = true; el.firstChild.classList.remove('on'); });
      el.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
    $('svg', box).addEventListener('pointerleave', () => { tip.hidden = true; });
  }

  async function atualizarDados() {
    try {
      const manifest = await carregarManifest();
      const ref = manifest?.cadeias?.['6258'];
      if (!ref?.chave || ref.chave === chave) return;
      const snap = await carregarSnapshot(ref.chave);
      chave = ref.chave;
      const { rows, exterior } = linhasVivo(snap.parcial);
      pano = { rows, exterior, modo: 'vivo' };
      onPanorama(pano);
      desenhar();
    } catch { /* sem manifest/snapshot (antes das 17h): fica o 1º turno real */ }
  }

  function agendar() {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(async () => { await atualizarDados(); agendar(); }, proximoAtrasoMs({ falhas: 0, intervaloMs: 60000, jitterMs: 8000 }));
  }

  $$('.regsel button').forEach((b) => b.addEventListener('click', () => {
    regiao = b.dataset.r;
    $$('.regsel button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    desenhar();
  }));
  if (!DEMO) document.addEventListener('visibilitychange', () => { if (!document.hidden && mapa) { atualizarDados(); agendar(); } });

  quandoVisivel($('#estados'), async () => {
    try {
      mapa = await buscarJson(MAPA_URL);
    } catch {
      box.innerHTML = '<p class="sub">Não foi possível carregar o mapa. Use o quadro por região ao lado.</p>';
      return;
    }
    desenhar();
    await atualizarDados();
    if (!DEMO) agendar();
  });
}
