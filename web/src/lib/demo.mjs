// Modo demonstração (?demo): dados estáticos de simulação, servidos de /demo/. Nunca se mistura com /dados/.
export const DEMO_BASE = '/demo/';
export const DEMO_AVISO = 'Simulação com dados do 1º turno — não é resultado real';

/** `?demo`, `?demo=1`, `?demo=apurando` ligam a demonstração; `?demo=0|false|off|aguardando` ou ausência, não. */
export function modoDemo(search) {
  const q = new URLSearchParams(String(search || ''));
  if (!q.has('demo')) return false;
  return !['0', 'false', 'off', 'aguardando', 'no'].includes(q.get('demo').toLowerCase());
}

/** Mantém o modo demonstração ao navegar entre home e governadores (links internos de página). */
export function hrefDemo(href) {
  if (!/^\/(governador\/[a-z]{2}\/?)?(#.*)?$/.test(href || '/')) return href;
  const [corpo, hash = ''] = href.split(/(?=#)/);
  return `${corpo}?demo=1${hash}`;
}

/** Faixa fixa, sempre visível. Inserida só pelo cliente, no modo demo: o HTML normal nunca a contém. */
export const faixaDemoHTML = () => `<div class="demoband" id="demoband" role="note"><p><strong>${DEMO_AVISO}</strong><a href="/">Sair da simulação</a></p></div>`;
