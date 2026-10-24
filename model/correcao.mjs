// Correcao de deriva das urnas tardias: as secoes que chegam por ultimo tem perfil diferente das primeiras, e o modelo
// estratificado erra de forma sistematica em funcao do % apurado (em 2022, 1T e 2T, e no 1T 2026, sempre no mesmo
// sentido). A curva (x = % do eleitorado apurado, y = erro medio do modelo em p.p. da participacao do candidato
// `candidato`) e estimada no MESMO tipo de turno de 2022 e subtraida da projecao. Puro, sem I/O.

// Interpolacao linear entre pontos ordenados por x; fora do intervalo, usa o extremo.
export function interpolar(curva, x) {
  if (!Array.isArray(curva) || curva.length === 0) return 0;
  if (x <= curva[0].x) return curva[0].y;
  for (let i = 1; i < curva.length; i += 1) {
    if (x <= curva[i].x) {
      const a = curva[i - 1];
      const b = curva[i];
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
  }
  return curva[curva.length - 1].y;
}

// pcts = { [n]: pct } dos dois finalistas (soma 100). Devolve novos pcts e o deslocamento aplicado ao candidato da curva.
export function aplicarCorrecao({ pcts, correcao, pctApurado }) {
  if (!correcao || !correcao.curva?.length || !(correcao.candidato in pcts)) return { pcts, delta: 0 };
  const delta = interpolar(correcao.curva, pctApurado);
  const alvo = correcao.candidato;
  const outro = Object.keys(pcts).find((n) => n !== alvo);
  const novo = Math.min(100, Math.max(0, pcts[alvo] - delta));
  return { pcts: { [alvo]: novo, [outro]: 100 - novo }, delta };
}
