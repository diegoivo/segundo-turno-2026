// Auditoria no navegador (Web Crypto): baixa o manifest e os últimos N snapshots e confere a cadeia de SHA-256.
// Mesma regra do verificador público (tools/verificar-cadeia.mjs): o arquivo É o JSON canônico (chaves ordenadas),
// sha256(arquivo) = sha do nome = prev_sha256 do seguinte = manifest.
import { esc } from './format.mjs';
import { shortHash } from './components.mjs';

export function canonicalize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalize(x))).join(',')}]`;
  const ks = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${ks.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;
}

export async function sha256Hex(dados) {
  const buf = await crypto.subtle.digest('SHA-256', typeof dados === 'string' ? new TextEncoder().encode(dados) : dados);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const SHA_NOME = /-([0-9a-f]{64})\.json$/;

/**
 * Caminha da cabeça da cadeia para trás (prev_chave) até `n` snapshots.
 * @param fetchTexto (caminho relativo ao bucket) => Promise<string>
 * @returns itens do mais antigo ao mais novo: { chave, texto, snap, shaNome }
 */
export async function carregarCadeia({ manifest, cadeia, n, fetchTexto }) {
  const ref = manifest?.cadeias?.[cadeia];
  if (!ref?.chave) throw new Error(`cadeia ${cadeia} ausente no manifest`);
  const itens = [];
  let chave = ref.chave;
  while (chave && itens.length < n) {
    const texto = await fetchTexto(chave);
    const snap = JSON.parse(texto);
    itens.unshift({ chave, texto, snap, shaNome: SHA_NOME.exec(chave)?.[1] ?? null });
    chave = snap.prev_chave ?? null;
  }
  return { itens, ref, total: ref.seq + 1 };
}

/**
 * Recalcula os hashes. `itens` do mais antigo ao mais novo.
 * @returns { ok, n, head } ou { ok:false, at (seq), reason: 'hash'|'canonico'|'prev'|'seq'|'manifest' }
 */
export async function verificarCadeia(itens, ref) {
  if (!itens.length) return { ok: false, at: null, reason: 'vazia' };
  let anterior = null;
  for (const it of itens) {
    const sha = await sha256Hex(it.texto);
    it.shaCalc = sha;
    let canon = null;
    try { canon = canonicalize(JSON.parse(it.texto)); } catch { canon = null; }
    if (canon !== it.texto) return { ok: false, at: it.snap?.seq ?? null, reason: 'canonico' };
    if (sha !== it.shaNome) return { ok: false, at: it.snap.seq, reason: 'hash' };
    if (anterior) {
      if (it.snap.prev_sha256 !== anterior.shaCalc) return { ok: false, at: it.snap.seq, reason: 'prev' };
      if (it.snap.seq !== anterior.snap.seq + 1) return { ok: false, at: it.snap.seq, reason: 'seq' };
    }
    anterior = it;
  }
  if (ref?.sha256 && anterior.shaCalc !== ref.sha256) return { ok: false, at: anterior.snap.seq, reason: 'manifest' };
  return { ok: true, n: itens.length, head: anterior.shaCalc, de: itens[0].snap.seq, ate: anterior.snap.seq };
}

/** Altera 1 byte (um dígito) do texto de um snapshot, mantendo o JSON válido. */
export function adulterar(texto) {
  const i = texto.search(/\d/);
  if (i < 0) return `${texto} `;
  const d = (Number(texto[i]) + 1) % 10;
  return texto.slice(0, i) + d + texto.slice(i + 1);
}

/** Cópia da cadeia com 1 byte alterado no snapshot do meio (para demonstrar que a verificação pega). */
export function cadeiaAdulterada(itens) {
  const meio = Math.floor(itens.length / 2);
  return itens.map((it, i) => (i === meio ? { ...it, texto: adulterar(it.texto) } : it));
}

const MOTIVO = {
  hash: 'O conteúdo do snapshot não bate com o hash registrado.',
  canonico: 'O arquivo não está na forma canônica publicada.',
  prev: 'O elo com o snapshot anterior não confere.',
  seq: 'A numeração dos snapshots não é contínua.',
  manifest: 'O último snapshot não bate com o manifest.',
  vazia: 'Não há snapshots para conferir.',
};

export const resumoOk = (r, total) => `Cadeia íntegra · ${total ?? r.n} versões · último hash <code>${esc(r.head.slice(0, 6))}…</code>`;
export const resumoFalha = (r) => `Cadeia quebrada em #${esc(r.at)} · confira o snapshot`;
export const detalheOk = (r) => `<b>Cadeia íntegra.</b> ${r.n} snapshots recalculados (#${r.de} a #${r.ate}). Hash da ponta: <code class="h">${shortHash(r.head)}</code>`;
export const detalheFalha = (r) => `<b>Cadeia quebrada em #${esc(r.at)}.</b> ${MOTIVO[r.reason] ?? ''} Alterar 1 byte de um snapshot antigo invalida este e todos os seguintes.`;

/** Lista dos snapshots verificados, do mais novo ao mais antigo, com links de download. */
export function chainHTML(itens, ruins, base) {
  const raw = (it) => {
    const sha = it.snap.fontes?.[0]?.sha256_raw;
    return sha ? `<a href="${esc(base)}raw/${esc(sha)}.json.gz" download>raw</a>` : '';
  };
  return `<ol class="chain" reversed>${itens.slice().reverse().map((it, ix) => {
    const ruim = ruins?.includes(it.snap.seq);
    return `<li class="${ix === 0 ? 'cur ' : ''}${ruim ? 'bad' : ''}"><div class="h"><span style="color:var(--text);font-weight:600">#${it.snap.seq}</span><span>${esc(String(it.snap.coletado_em ?? '').slice(11, 19))}</span></div>`
      + `<div><span class="lk">sha256 </span><code>${shortHash(it.shaNome)}</code></div>`
      + `<div><span class="lk">prev&nbsp;&nbsp;&nbsp; </span><code>${it.snap.prev_sha256 ? shortHash(it.snap.prev_sha256) : 'início da cadeia'}</code></div>`
      + `<div class="dlrow"><a href="${esc(base)}${esc(it.chave)}" download>snapshot (JSON)</a> ${raw(it)}</div></li>`;
  }).join('')}</ol>`;
}
