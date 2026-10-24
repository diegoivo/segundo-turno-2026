// Utilitários de DOM do navegador.
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Aplica o HTML de cada slot (id do elemento) só quando mudou. `cache` é mutado de propósito (estado local do cliente). */
export function aplicarSlots(slots, cache) {
  for (const [id, html] of Object.entries(slots)) {
    if (cache[id] === html) continue;
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
    cache[id] = html;
  }
}

export function observarTamanho(el, fn) {
  if (!el || typeof ResizeObserver === 'undefined') { addEventListener('resize', fn); return; }
  let w = `${el.clientWidth}x${el.clientHeight}`;
  let t;
  new ResizeObserver(() => {
    const nw = `${el.clientWidth}x${el.clientHeight}`;
    if (nw === w) return;
    w = nw;
    clearTimeout(t);
    t = setTimeout(() => { fn(); w = `${el.clientWidth}x${el.clientHeight}`; }, 80);
  }).observe(el);
}

/** Executa `fn` uma vez quando o elemento chega perto da tela. */
export function quandoVisivel(el, fn, margem = '400px') {
  if (!el) return;
  if (typeof IntersectionObserver === 'undefined') { fn(); return; }
  const io = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margem });
  io.observe(el);
}
