// Grafico SVG simples: projecao, faixa publicada e parcial ao longo do tempo (eixo X = relogio; Y = % de A na base de 2).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function graficoSvg(rows, { verdade, titulo, nomeA, yMin, yMax }) {
  const W = 920; const H = 440; const m = { l: 56, r: 16, t: 44, b: 52 };
  const pub = rows.filter((r) => r.publicado);
  const vals = [verdade, ...pub.flatMap((r) => [r.proj, ...r.faixa])];
  const lo = yMin ?? Math.floor(Math.min(...vals) - 1); const hi = yMax ?? Math.ceil(Math.max(...vals) + 1);
  const t0 = rows[0].t; const t1 = rows[rows.length - 1].t;
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - m.t - m.b);
  const f = (n) => n.toFixed(1);
  const segmentos = (pick) => {
    const out = []; let cur = [];
    for (const r of rows) {
      const v = pick(r);
      if (v == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(`${f(x(r.t))},${f(y(v))}`);
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const blocos = []; let cur = [];
  for (const r of rows) { if (r.publicado) cur.push(r); else if (cur.length) { blocos.push(cur); cur = []; } }
  if (cur.length) blocos.push(cur);
  const bandas = blocos.map((b) => `<polygon points="${[...b.map((r) => `${f(x(r.t))},${f(y(r.faixa[1]))}`), ...[...b].reverse().map((r) => `${f(x(r.t))},${f(y(r.faixa[0]))}`)].join(' ')}" fill="#2a78c8" fill-opacity="0.22"/>`);
  const linha = (pick, cor, extra = '') => segmentos(pick).map((s) => `<polyline points="${s.join(' ')}" fill="none" stroke="${cor}" stroke-width="1.6" ${extra}/>`);
  const passo = (hi - lo) > 30 ? 10 : (hi - lo) > 12 ? 5 : (hi - lo) > 6 ? 2 : 1;
  const grade = [];
  for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) {
    grade.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="#8884" stroke-width="0.6"/><text x="${m.l - 6}" y="${f(y(v) + 4)}" text-anchor="end" font-size="11" fill="#666">${v}</text>`);
  }
  const horas = [];
  for (let t = Math.ceil(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) {
    const d = new Date(t - 3 * 3600e3);
    horas.push(`<line x1="${f(x(t))}" x2="${f(x(t))}" y1="${m.t}" y2="${H - m.b}" stroke="#8883" stroke-width="0.5"/><text x="${f(x(t))}" y="${H - m.b + 16}" text-anchor="middle" font-size="11" fill="#666">${String(d.getUTCHours()).padStart(2, '0')}h</text>`);
  }
  const leg = [['#d6552b', 'parcial (so olhando a apuracao)'], ['#1a4f94', `projecao do modelo (${nomeA})`], ['#2a78c8', 'faixa publicada'], ['#2e8b57', 'resultado final']];
  const legenda = leg.map(([c, tx], i) => `<rect x="${m.l + i * 214}" y="${H - 22}" width="12" height="4" fill="${c}" ${i === 2 ? 'fill-opacity="0.4"' : ''}/><text x="${m.l + i * 214 + 17}" y="${H - 17}" font-size="11" fill="#555">${esc(tx)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${m.l}" y="22" font-size="14" font-weight="600" fill="#222">${esc(titulo)}</text>
<text x="${m.l}" y="37" font-size="11" fill="#666">Eixo Y: % de ${esc(nomeA)} sobre (A+B). Parcial truncada em [${lo}, ${hi}]. Trechos sem faixa = nao publicado.</text>
${grade.join('\n')}${horas.join('\n')}
${bandas.join('\n')}
<line x1="${m.l}" x2="${W - m.r}" y1="${f(y(verdade))}" y2="${f(y(verdade))}" stroke="#2e8b57" stroke-width="1.4" stroke-dasharray="6 3"/>
${linha((r) => r.parcial, '#d6552b').join('\n')}
${linha((r) => (r.publicado ? r.proj : null), '#1a4f94').join('\n')}
${legenda.join('\n')}
</svg>
`;
}
