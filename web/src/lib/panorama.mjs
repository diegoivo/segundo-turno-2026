// Panorama por região e UF: linhas (1º turno real ou parcial do snapshot), tabelas e SVG do mapa (malha do IBGE).
import { FLAVIO, GOV_UFS, LULA, PRIMEIRO_TURNO, REGIOES } from './config.mjs';
import { divRow } from './components.mjs';
import { esc, p } from './format.mjs';

/** Linhas do 1º turno (dado real, 100% das seções). */
export function linhas1T() {
  return PRIMEIRO_TURNO.ufs.map((u) => ({ uf: u.uf, nome: u.nome, regiao: u.regiao, pct: 100, L: u.lula, R: u.flavio, st: u.secoes, ts: u.secoes }));
}

/**
 * Linhas ao vivo a partir de `snapshot.parcial` (presidente). UF sem arquivo vira pct 0, L=R=0 ("sem votos").
 * Devolve também a linha do exterior (zz), quando existir.
 */
export function linhasVivo(parcial) {
  const voto = (par, n) => par?.candidatos?.find((c) => c.n === n)?.votos ?? 0;
  const rows = PRIMEIRO_TURNO.ufs.map((u) => {
    const par = parcial?.[u.uf.toLowerCase()];
    return {
      uf: u.uf, nome: u.nome, regiao: u.regiao,
      pct: par?.secoes?.pct_totalizadas ?? 0, L: voto(par, LULA.n), R: voto(par, FLAVIO.n),
      st: par?.secoes?.totalizadas ?? 0, ts: par?.secoes?.total ?? u.secoes,
    };
  });
  const zz = parcial?.zz;
  const exterior = zz ? { uf: 'ZZ', nome: 'Exterior', regiao: 'Exterior', pct: zz.secoes?.pct_totalizadas ?? 0, L: voto(zz, LULA.n), R: voto(zz, FLAVIO.n), st: zz.secoes?.totalizadas ?? 0, ts: zz.secoes?.total ?? 0 } : null;
  return { rows, exterior };
}

export function regioesHTML(rows, modo) {
  let h = '<ul class="rows">';
  for (const rg of REGIOES) {
    const rs = rows.filter((r) => r.regiao === rg);
    const L = rs.reduce((a, r) => a + r.L, 0);
    const R = rs.reduce((a, r) => a + r.R, 0);
    const st = rs.reduce((a, r) => a + r.st, 0);
    const ts = rs.reduce((a, r) => a + r.ts, 0);
    h += divRow(rg, modo === '1t' ? '1º turno' : `${p(ts ? (st / ts) * 100 : null, 1)} apurado`, L, R);
  }
  return `${h}</ul>`;
}

export function ufsHTML(rows, modo, exterior = null) {
  let h = '<ul class="rows ufl">';
  for (const rg of REGIOES) {
    rows.filter((r) => r.regiao === rg).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach((r) => {
      h += divRow(`${r.nome} (${r.uf})`, modo === '1t' ? rg : `${p(r.pct, 1)} · ${rg}`, r.L, r.R);
    });
  }
  if (exterior) h += divRow('Exterior', `${p(exterior.pct, 1)} apurado`, exterior.L, exterior.R);
  return `${h}</ul>`;
}

function textoUF(r, gov, modo) {
  const v = r.L + r.R;
  const none = r.pct < 1 && modo !== '1t';
  if (none || !(v > 0)) return `${r.nome} (${r.uf}): ainda sem votos apurados.${gov ? ' Tem governador no 2º turno: abrir a página.' : ''}`;
  const sl = (r.L / v) * 100;
  const lead = r.L >= r.R ? 'Lula' : 'Flávio';
  const pl = r.L >= r.R ? sl : 100 - sl;
  return `${r.nome} (${r.uf}): ${lead} na frente com ${p(pl, 1)} dos votos válidos${modo === '1t' ? ' no 1º turno' : `, com ${p(r.pct, 0)} das seções apuradas`}.${gov ? ' Tem governador no 2º turno: abrir a página.' : ''}`;
}

const lg = (k, c, t) => `<span class="c-${c}"><i style="--k:${k}"></i>${t}</span>`;

export function legendaMapa(modo) {
  return `<div class="maplegend">${lg(1, 'red', 'Lula na frente')}${lg(1, 'blue', 'Flávio na frente')}<span><i class="none"></i>sem votos apurados</span><span><i class="gv"></i>governador no 2º turno</span></div>`
    + (modo === '1t'
      ? '<div class="maplegend"><span>Resultado do 1º turno por UF (dado real).</span></div>'
      : `<div class="maplegend"><b style="color:var(--text);font-weight:600">Intensidade da cor = % das seções apuradas:</b>${lg('.38', 'red', 'menos de 50%')}${lg('.68', 'red', '50% a 90%')}${lg(1, 'red', 'mais de 90%')}</div><p class="note" style="margin-top:6px"><b>É a parcial da apuração, não a projeção.</b> O resultado de uma UF ainda pode mudar.</p>`);
}

/** SVG do mapa. `mapa` = conteúdo de mapa-br.json ({viewBox, ufs:{UF:{d,c,a}}}). */
export function mapaSVG(mapa, rows, { regiao = '', modo = '1t' } = {}) {
  const porUF = Object.fromEntries(rows.map((r) => [r.uf, r]));
  const partes = [];
  const rotulos = [];
  for (const uf of Object.keys(mapa.ufs)) {
    const r = porUF[uf];
    const u = mapa.ufs[uf];
    if (!r) continue;
    const gov = GOV_UFS.includes(uf.toLowerCase());
    const v = r.L + r.R;
    const lead = r.L >= r.R ? 'red' : 'blue';
    const none = modo !== '1t' && (r.pct < 1 || !(v > 0));
    const k = r.pct < 50 ? 0.38 : r.pct < 90 ? 0.68 : 1;
    const dim = regiao && r.regiao !== regiao;
    const txt = textoUF(r, gov, modo);
    const attrs = `class="ufa" data-uf="${uf}" data-t="${esc(txt)}" data-reg="${esc(r.regiao)}"${gov ? ` href="/governador/${uf.toLowerCase()}/"` : ' tabindex="0" role="img"'} aria-label="${esc(txt)}"`;
    partes.push([gov, `<a ${attrs}><path class="uf c-${lead}${none ? ' none' : ''}${gov ? ' gov' : ''}${dim ? ' dim' : ''}" style="--k:${k}" d="${u.d}"/></a>`]);
    if (u.a >= 1400 && !none) rotulos.push(`<text class="ufl-t${k < 1 ? ' lt' : ''}${dim ? ' dim' : ''}" x="${u.c[0]}" y="${u.c[1] + 3}">${uf}</text>`);
  }
  partes.sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0));
  return `<svg viewBox="${mapa.viewBox}" role="group" aria-label="Mapa do Brasil por UF: cor de quem lidera na parcial, intensidade pelo percentual de seções apuradas">${partes.map((x) => x[1]).join('')}${rotulos.join('')}</svg><div class="tip" hidden></div>`;
}
