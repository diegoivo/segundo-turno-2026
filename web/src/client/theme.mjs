import { $ } from './dom.mjs';

const seguro = (fn, fb = null) => { try { return fn(); } catch { return fb; } };

export function initTema() {
  const btn = $('#tema');
  if (!btn) return;
  const raiz = document.documentElement;
  const escuro = () => raiz.dataset.theme === 'dark' || (!raiz.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const rotulo = () => {
    const d = escuro();
    btn.setAttribute('aria-pressed', String(d));
    $('#tema-t').textContent = d ? 'Tema claro' : 'Tema escuro';
    $('#tema-ic').setAttribute('href', d ? '#i-light-mode' : '#i-dark-mode');
  };
  rotulo();
  btn.addEventListener('click', () => {
    raiz.dataset.theme = escuro() ? 'light' : 'dark';
    seguro(() => localStorage.setItem('tema', raiz.dataset.theme));
    rotulo();
  });
}

