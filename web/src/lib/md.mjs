// Renderizador mínimo de Markdown (títulos, parágrafos, listas, tabelas, citações, **negrito**, *itálico*, `código`, [links]).
// Cobre docs/METODOLOGIA.md. Todo texto é escapado antes de aplicar a marcação inline.
import { esc } from './format.mjs';

function inline(src) {
  const cods = [];
  let s = esc(src).replace(/`([^`]+)`/g, (m, c) => { cods.push(c); return `\u0000${cods.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*|#[^)\s]*)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${cods[+i]}</code>`);
}

const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const celulas = (linha) => linha.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const ehSeparador = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function mdParaHtml(md) {
  const linhas = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i += 1; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length} id="${slug(h[2])}">${inline(h[2])}</h${h[1].length}>`); i += 1; continue; }
    if (l.includes('|') && i + 1 < linhas.length && ehSeparador(linhas[i + 1])) {
      const cab = celulas(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && linhas[i].includes('|') && linhas[i].trim()) { corpo.push(celulas(linhas[i])); i += 1; }
      out.push(`<div class="tbscroll"><table><thead><tr>${cab.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${corpo.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const li = /^\s*([-*]|\d+\.)\s+/.exec(l);
    if (li) {
      const ord = /\d/.test(li[1]);
      const itens = [];
      while (i < linhas.length && /^\s*([-*]|\d+\.)\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i += 1;
        while (i < linhas.length && /^\s{2,}\S/.test(linhas[i]) && !/^\s*([-*]|\d+\.)\s+/.test(linhas[i])) { itens[itens.length - 1] += ` ${linhas[i].trim()}`; i += 1; }
      }
      const tag = ord ? 'ol' : 'ul';
      out.push(`<${tag}>${itens.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (l.startsWith('>')) {
      const q = [];
      while (i < linhas.length && linhas[i].startsWith('>')) { q.push(linhas[i].replace(/^>\s?/, '')); i += 1; }
      out.push(`<blockquote><p>${inline(q.join(' '))}</p></blockquote>`);
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|>)/.test(linhas[i]) && !/^\s*([-*]|\d+\.)\s+/.test(linhas[i])
      && !(linhas[i].includes('|') && i + 1 < linhas.length && ehSeparador(linhas[i + 1]))) { par.push(linhas[i].trim()); i += 1; }
    out.push(`<p>${inline(par.join(' '))}</p>`);
  }
  return out.join('\n');
}
