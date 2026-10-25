// Botão "Star" do GitHub: contagem buscada no cliente (api.github.com), cache de 1 h no localStorage.
// Se falhar (rede, limite da API, bloqueio), o botão fica sem número. Nunca bloqueia nem gera erro visível.
import { $ } from './dom.mjs';
import { compacto } from '../lib/format.mjs';
import { GITHUB_API, GITHUB_CACHE_MS, GITHUB_CACHE_KEY } from '../lib/config.mjs';

const seguro = (fn, fb = null) => { try { return fn(); } catch { return fb; } };

export function lerCache(agora = Date.now()) {
  const c = seguro(() => JSON.parse(localStorage.getItem(GITHUB_CACHE_KEY)));
  return c && Number.isFinite(c.n) && agora - c.t < GITHUB_CACHE_MS ? c.n : null;
}

export async function buscarEstrelas(fetchFn = fetch) {
  const r = await fetchFn(GITHUB_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const n = (await r.json()).stargazers_count;
  if (!Number.isInteger(n) || n < 0) throw new Error('resposta inesperada');
  return n;
}

function mostrar(n) {
  const el = $('#gh-n');
  if (!el) return;
  el.textContent = compacto(n);
  el.hidden = false;
  $('#gh')?.setAttribute('aria-label', `Dar uma estrela no GitHub (${n} ${n === 1 ? 'estrela' : 'estrelas'})`);
}

export async function initGithub() {
  if (!$('#gh')) return;
  const cache = lerCache();
  if (cache != null) { mostrar(cache); return; }
  try {
    const n = await buscarEstrelas();
    seguro(() => localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify({ n, t: Date.now() })));
    mostrar(n);
  } catch { /* sem número: o botão continua funcionando como link */ }
}
