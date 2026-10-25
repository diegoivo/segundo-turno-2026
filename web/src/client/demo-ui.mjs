// Modo demonstração: faixa fixa, noindex e links internos que preservam ?demo. O resto do app só troca a base dos dados.
import { faixaDemoHTML, hrefDemo } from '../lib/demo.mjs';

export function initDemo() {
  document.documentElement.classList.add('is-demo'); // já aplicada no <head> (reserva o espaço da faixa antes da 1ª pintura)
  document.body.insertAdjacentHTML('afterbegin', faixaDemoHTML());
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex';
  document.head.append(robots);
  document.title = `Simulação | ${document.title}`;
  // captura: roda antes da navegação; cobre também os links do mapa, desenhados depois
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="/"]') : null;
    if (!a || a.target === '_blank' || a.closest('#demoband')) return; // "Sair da simulação" segue o href puro
    const novo = hrefDemo(a.getAttribute('href'));
    if (novo !== a.getAttribute('href')) a.setAttribute('href', novo);
  }, true);
}
