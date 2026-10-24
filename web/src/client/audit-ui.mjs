// Auditoria no navegador: baixa o manifest e os últimos N snapshots, recalcula os hashes (Web Crypto) e mostra o resultado.
import {
  cadeiaAdulterada, carregarCadeia, chainHTML, detalheFalha, detalheOk, resumoFalha, resumoOk, verificarCadeia,
} from '../lib/audit.mjs';
import { AUDITORIA_N } from '../lib/config.mjs';
import { $, quandoVisivel } from './dom.mjs';
import { baseComBarra, carregarManifest, carregarTexto, url } from './dados.mjs';

const ICONE = '<svg class="ic" aria-hidden="true"><use href="#i-verified"/></svg>';

/** @param secao <section data-cadeia> ; { n } quantidade de snapshots */
export function initAuditoria(secao, { n = AUDITORIA_N } = {}) {
  const cadeia = secao.dataset.cadeia;
  const host = $('details', secao);
  const linha = $('.a-line', secao);
  const vivo = $('.a-live', secao);
  const vazio = $('.a-empty', secao);
  const resultado = $('.result', secao);
  const lista = $('[data-chain]', secao);
  const chk = $('.a-chk', secao);
  const base = baseComBarra();
  $('.a-man', secao).href = url('live/manifest.json');
  let estado = { itens: [], ref: null, total: 0 };
  let usando = [];
  let ruins = null;

  const mostrarLinha = (ok, html) => { linha.className = `sumline a-line${ok ? '' : ' ko'}`; linha.innerHTML = ICONE + html; };
  const pintar = () => { lista.innerHTML = chainHTML(usando, ruins, base); };

  async function carregar() {
    try {
      const manifest = await carregarManifest();
      const { itens, ref, total } = await carregarCadeia({ manifest, cadeia, n, fetchTexto: carregarTexto });
      estado = { itens, ref, total };
      usando = chk.checked ? cadeiaAdulterada(itens) : itens;
      ruins = null;
      vivo.hidden = false;
      vazio.hidden = true;
      $('.a-snap', secao).href = `${base}${ref.chave}`;
      const sha = itens[itens.length - 1].snap.fontes?.[0]?.sha256_raw;
      const raw = $('.a-raw', secao);
      raw.hidden = !sha;
      if (sha) raw.href = `${base}raw/${sha}.json.gz`;
      pintar();
      const r = await verificarCadeia(usando, ref);
      mostrarLinha(r.ok, r.ok ? resumoOk(r, total) : resumoFalha(r));
      resultado.className = 'result';
      resultado.textContent = 'Clique em “Verificar a cadeia” para baixar de novo e recalcular todos os hashes neste navegador.';
    } catch {
      vivo.hidden = true;
      vazio.hidden = false;
      mostrarLinha(true, 'Aguardando o primeiro snapshot, às 17h');
    }
  }

  async function verificar() {
    resultado.className = 'result';
    resultado.textContent = 'Recalculando os hashes…';
    if (!chk.checked) await carregar();
    else usando = cadeiaAdulterada(estado.itens);
    if (!estado.itens.length) return;
    const r = await verificarCadeia(usando, estado.ref);
    mostrarLinha(r.ok, r.ok ? resumoOk(r, estado.total) : resumoFalha(r));
    ruins = r.ok ? null : [r.at];
    resultado.className = `result ${r.ok ? 'ok' : 'ko'}`;
    resultado.innerHTML = r.ok ? detalheOk(r) : detalheFalha(r);
    pintar();
  }

  $('.a-ver', secao).addEventListener('click', verificar);
  chk.addEventListener('change', () => {
    usando = chk.checked ? cadeiaAdulterada(estado.itens) : estado.itens;
    ruins = null;
    resultado.className = 'result';
    resultado.textContent = 'Clique em “Verificar a cadeia”.';
    pintar();
  });
  let iniciou = false;
  const iniciar = () => { if (!iniciou) { iniciou = true; carregar(); } };
  host.addEventListener('toggle', () => { if (host.open) iniciar(); });
  quandoVisivel(host, iniciar, '300px');
  if (host.open) iniciar();
}
