// Esmaece a borda da navegação rolável onde ainda há itens escondidos (em vez de cortar uma letra no meio).
import { $ } from './dom.mjs';

export function initNavFade() {
  const nav = $('.top .nav');
  if (!nav) return;
  const atualizar = () => {
    const max = nav.scrollWidth - nav.clientWidth;
    nav.classList.toggle('fade-r', max > 1 && nav.scrollLeft < max - 1);
    nav.classList.toggle('fade-l', max > 1 && nav.scrollLeft > 1);
  };
  nav.addEventListener('scroll', atualizar, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(atualizar).observe(nav);
  addEventListener('resize', atualizar);
  atualizar();
}
