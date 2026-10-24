const W = 'https://segundo-turno-web-ensaio.hosts5924.workers.dev';
const T = 'https://segundo-turno-tse-ensaio.hosts5924.workers.dev';
const t0 = Date.now();
const get = async (u) => { const r = await fetch(u + '?', { cache: 'no-store' }).catch(() => null); return r; };
async function uma() {
  const l1 = await fetch(`${W}/dados/live/latest.json`); const xc1 = l1.headers.get('x-cache'); const lat = await l1.json();
  const l2 = await fetch(`${W}/dados/live/latest.json`); const xc2 = l2.headers.get('x-cache'); await l2.text();
  const man = await (await fetch(`${W}/dados/live/manifest.json`)).json();
  const st = await (await fetch(`${T}/_status`)).json();
  const p = lat.presidente;
  const f = p?.forecast;
  const linha = {
    hora: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    passo: `${st.idx}:${st.hhmm}`,
    seq: Object.fromEntries(Object.entries(man.cadeias || {}).map(([k, v]) => [k, v.seq])),
    pres: p ? { seq: p.seq, apurado_pct_secoes: p.pct_secoes, pct_eleitorado: p.pct_eleitorado, forecast: f, faixa_pp: p.faixa_meia_largura_pp, metodo: p.metodo, erro_esp: p.erro_medio_esperado, def: p.definido_matematicamente?.n ?? null, cands: p.candidatos } : null,
    gov: Object.fromEntries(Object.entries(lat.governadores || {}).map(([uf, g]) => [uf, g ? { seq: g.seq, pct: g.pct_secoes, metodo: g.metodo, erro: g.erro_medio_esperado } : null])),
    stale: lat.stale, xcache: [xc1, xc2],
  };
  console.log(JSON.stringify(linha));
}
for (;;) { try { await uma(); } catch (e) { console.log('ERRO monitor', String(e)); } await new Promise((r) => setTimeout(r, 150_000)); }
