const W = 'https://segundo-turno-web-ensaio.hosts5924.workers.dev';
let max = -1, n = 0, reg = 0; const fim = Date.now() + 2000000;
while (Date.now() < fim) {
  const r = await fetch(`${W}/dados/live/latest.json`); const l = await r.json(); const s = l.presidente?.seq ?? -1; n++;
  if (s < max) { reg++; console.log('REGRESSAO', new Date().toISOString(), 'visto', s, 'max', max, r.headers.get('x-cache'), r.headers.get('age'), r.headers.get('cf-ray')); }
  max = Math.max(max, s); await new Promise((x) => setTimeout(x, 3000));
}
console.log({ n, reg, max });
