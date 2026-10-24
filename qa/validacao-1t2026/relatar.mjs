// Le resultados.json (gerado por validar.mjs) e escreve docs/VALIDACAO-1T2026.md + graficos SVG. Todo numero vem dos dados.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './lib/io.mjs';
import { porFaixa, publicacao, global, chamadas, estabilidade, FAIXAS } from './lib/metricas.mjs';
import { graficoSvg } from './lib/svg.mjs';

const dados = JSON.parse(readFileSync(join(RAIZ, 'qa/validacao-1t2026/resultados.json'), 'utf8'));
const { meta, erros } = dados;
const n2 = (x) => (x == null ? '—' : x.toFixed(2).replace('.', ','));
const n3 = (x) => (x == null ? '—' : x.toFixed(3).replace('.', ','));
const pc = (x) => (x == null ? '—' : `${(x * 100).toFixed(1).replace('.', ',')}%`);
const hh = (h) => `${h.slice(0, 2)}:${h.slice(2)}`;
const tabela = (cab, linhas) => [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`, ...linhas.map((l) => `| ${l.join(' | ')} |`)].join('\n');

const corridas = meta.corridas;
const nomeA = (c) => `${c.A.nmu} (${c.A.n})`;
const rowsDe = (id, modo) => dados.rows.filter((r) => r.corrida === id && r.modo === modo)
  .map((r) => ({ ...r, v: corridas.find((c) => c.id === id).verdade_pct_A }));
const todos = (modo) => corridas.map((c) => ({ c, rows: rowsDe(c.id, modo) }));

function resumo(modo) {
  return todos(modo).map(({ c, rows }) => ({
    c, rows, pub: publicacao(rows), g: global(rows), ch: chamadas(rows, c.verdade_pct_A, { A: c.A.n, B: c.B.n }),
    est: estabilidade(rows), faixas: porFaixa(rows), estratificacao: rows[rows.length - 1].estratificacao,
  }));
}
const R = { A: resumo('A'), B: resumo('B') };

function veredito(res) {
  const pres = res.find((x) => x.c.id === 'presidente');
  const govs = res.filter((x) => x.c.cargo === 'governador');
  const comPub = pres.faixas.filter((f) => f.publicados > 0);
  const melhores = comPub.filter((f) => f.modelo_melhor).length;
  const erradas = res.reduce((s, x) => s + x.ch.tendencia.erradas + x.ch.definido.erradas, 0);
  const c1 = pres.g.cobertura; const c3 = melhores / comPub.length;
  const cobGov = govs.map((x) => x.g.cobertura);
  const k = { c1: c1 >= 0.9, c2: erradas === 0, c3: melhores > comPub.length / 2, c4: cobGov.every((x) => x >= 0.9) };
  const v = !k.c2 || c1 < 0.8 || !k.c3 ? 'REPROVADO' : (k.c1 && k.c4 ? 'APROVADO' : 'APROVADO COM RESSALVAS');
  return { v, k, c1, erradas, melhores, nFaixas: comPub.length, cobGov };
}
const V = { A: veredito(R.A), B: veredito(R.B) };

// Agrupa instantes consecutivos (na grade) em que o final ficou fora da faixa publicada.
function trechosFora(rows) {
  const trechos = []; let cur = null;
  for (const r of rows) {
    const fora = r.publicado && !(r.v >= r.faixa[0] && r.v <= r.faixa[1]);
    if (fora) { if (!cur) { cur = { de: r, ate: r, n: 0 }; trechos.push(cur); } cur.ate = r; cur.n++; } else cur = null;
  }
  return trechos;
}

const pres = R.B.find((x) => x.c.id === 'presidente');
const presA = R.A.find((x) => x.c.id === 'presidente');
const presIgual = JSON.stringify(pres.rows.map((r) => [r.publicado, r.proj, r.faixa])) === JSON.stringify(presA.rows.map((r) => [r.publicado, r.proj, r.faixa]));
const difAB = (id) => {
  const a = rowsDe(id, 'A'); const b = rowsDe(id, 'B');
  let m = 0; let np = 0;
  a.forEach((x, i) => { if (x.publicado !== b[i].publicado) np++; else if (x.publicado) m = Math.max(m, Math.abs(x.proj - b[i].proj)); });
  return { max: m, publicacao_diferente: np };
};

// ---- SVG
const svgPath = (modo) => join(RAIZ, `qa/validacao-1t2026/presidente-${modo}.svg`);
writeFileSync(svgPath('B'), graficoSvg(pres.rows, { verdade: pres.c.verdade_pct_A, titulo: 'Presidente 1T 2026 - projecao x faixa x parcial (modo B, sem baseline)', nomeA: 'Lula (13)' }));
writeFileSync(svgPath('A'), graficoSvg(presA.rows, { verdade: presA.c.verdade_pct_A, titulo: 'Presidente 1T 2026 - projecao x faixa x parcial (modo A, producao)', nomeA: 'Lula (13)' }));

// ---- Tabelas
const tabPublicacao = (res) => tabela(['Corrida', 'Estratificacao (final)', 'Publicados / 265', '1a publicacao', '% eleit. apurado na 1a', 'Despublicacoes', 'Bloqueios antes da 1a publicacao (instantes)'],
  res.map((x) => [x.c.id, x.estratificacao, `${x.pub.publicados}`, x.pub.primeiro ? hh(x.pub.primeiro.hhmm) : 'nunca', x.pub.primeiro ? n2(x.pub.primeiro.apurado) : '—',
    `${x.pub.despublicacoes}`, Object.entries(x.pub.bloqueios_antes_da_1a_publicacao).map(([k, v]) => `${k}: ${v}`).join('; ') || '—']));

const tabFaixas = (faixas) => tabela(['% apurado', 'Instantes', 'Publicados', 'Erro modelo medio (pp)', 'Erro modelo max (pp)', 'Erro parcial medio (pp)', 'Erro parcial max (pp)', 'Modelo < parcial?', 'Cobertura', 'Meia-largura media (pp)'],
  faixas.map((f) => [f.faixa, f.instantes, f.publicados, n3(f.erro_modelo_medio), n3(f.erro_modelo_max), n3(f.erro_parcial_medio), n3(f.erro_parcial_max),
    f.modelo_melhor == null ? '—' : f.modelo_melhor ? 'sim' : 'NAO', f.publicados ? `${f.cobertos}/${f.publicados} (${pc(f.cobertura)})` : '—', n3(f.meia_media)]));

const governadoresPool = (modo) => {
  const rows = R[modo].filter((x) => x.c.cargo === 'governador').flatMap((x) => x.rows);
  return porFaixa(rows);
};

const tabGlobal = (res) => tabela(['Corrida', 'Candidato A', 'Final (% de A em A+B)', 'Erro modelo medio', 'Erro modelo max', 'Erro parcial medio', 'Erro parcial max', 'Cobertura', 'Meta >= 90%'],
  res.map((x) => [x.c.id, nomeA(x.c), n2(x.c.verdade_pct_A), n3(x.g.erro_modelo_medio), n3(x.g.erro_modelo_max), n3(x.g.erro_parcial_medio), n3(x.g.erro_parcial_max),
    `${x.g.cobertos}/${x.g.publicados} (${pc(x.g.cobertura)})`, x.g.cobertura >= 0.9 ? 'ok' : 'NAO']));

const tabChamadas = (res) => tabela(['Corrida', 'Vencedor real (base 2)', 'Tendencia: instantes', 'Tendencia: erradas', 'Tendencia: 1a chamada', 'Tendencia: viradas', 'Definido mat.: instantes', 'Definido mat.: erradas', 'Definido mat.: 1a chamada', 'Definido mat.: viradas'],
  res.map((x) => {
    const f = (t) => (t.primeira ? `${hh(t.primeira.hhmm)} (${n2(t.primeira.apurado)}%)` : 'nunca');
    return [x.c.id, x.ch.vencedor_real, x.ch.tendencia.total, x.ch.tendencia.erradas, f(x.ch.tendencia), x.ch.tendencia.viradas, x.ch.definido.total, x.ch.definido.erradas, f(x.ch.definido), x.ch.definido.viradas];
  }));

const tabEstab = (res) => tabela(['Corrida', 'Pares consecutivos publicados', 'Salto medio (pp)', 'Salto p95 (pp)', 'Salto max (pp)', 'Onde (de -> para, % apurado)', 'Saltos > 0,5 pp', 'Saltos > 1 pp', 'Salto p95 da parcial (pp)', 'Salto max da parcial (pp)', 'Pares em que o erro piorou > 0,05 pp'],
  res.map((x) => [x.c.id, x.est.pares, n3(x.est.salto_medio), n3(x.est.salto_p95), n3(x.est.salto_max), x.est.maior_salto ? `${hh(x.est.maior_salto.de)} -> ${hh(x.est.maior_salto.para)} (${n2(x.est.maior_salto.apurado)}%)` : '—',
    x.est.acima_0_5pp, x.est.acima_1pp, n3(x.est.salto_parcial_p95), n3(x.est.salto_parcial_max), x.est.pares_com_piora_gt_0_05pp]));

const crit = (V1) => tabela(['Criterio', 'Limite', 'Resultado', 'Passa?'], [
  ['C1 Cobertura no presidente', '>= 90%', pc(V1.c1), V1.k.c1 ? 'sim' : 'NAO'],
  ['C2 Chamadas erradas (tendencia + definido mat., 7 corridas)', '= 0', `${V1.erradas}`, V1.k.c2 ? 'sim' : 'NAO'],
  ['C3 Presidente: faixas com erro do modelo < erro da parcial', '> metade das faixas com publicacao', `${V1.melhores}/${V1.nFaixas}`, V1.k.c3 ? 'sim' : 'NAO'],
  ['C4 Cobertura >= 90% em cada uma das 6 UFs de governador', 'todas', V1.cobGov.map((x) => pc(x)).join(' / '), V1.k.c4 ? 'sim' : 'NAO'],
]);

const trechos = trechosFora(pres.rows);
const trechosTxt = trechos.length ? tabela(['De', 'Ate', 'Instantes', '% apurado (de -> ate)'], trechos.map((t) => [hh(t.de.hhmm), hh(t.ate.hhmm), t.n, `${n2(t.de.apurado)} -> ${n2(t.ate.apurado)}`])) : 'Nenhum instante fora da faixa.';
const foraGov = R.B.filter((x) => x.c.cargo === 'governador').map((x) => [x.c.id, `${x.g.publicados - x.g.cobertos}`, trechosFora(x.rows).map((t) => `${hh(t.de.hhmm)}-${hh(t.ate.hhmm)} (${t.n})`).join('; ') || '—']);

let amostraTxt = 'amostra.json ausente (rode amostra.mjs).';
try {
  const am = JSON.parse(readFileSync(join(RAIZ, 'qa/validacao-1t2026/amostra.json'), 'utf8'));
  const mx = (k) => Math.max(...am.map((x) => x[k]));
  amostraTxt = `${am.length} instantes publicados do presidente, igualmente espacados. Projecao recalculada sem o codigo do modelo (soma por estrato de A x te/est, que e a regra do modelo com encolhimento 0 para estrato apurado) e parcial lida do arquivo BR do replay. Maior diferenca de projecao vs modelo: ${n3(mx('dif_proj'))} pp (o modelo publica com 2 casas, ou seja, ate 0,005 de arredondamento); maior diferenca da parcial do modelo vs arquivo BR: ${n3(mx('dif_parcial_br'))} pp.\n\n` +
    tabela(['Instante', '% apurado', 'Projecao modelo', 'Projecao recalculada', 'Parcial modelo', 'Parcial BR'], am.map((x) => [hh(x.hhmm), n2(x.apurado), n2(x.proj_modelo), n3(x.proj_indep), n2(x.parcial_modelo), n3(x.parcial_br)]));
} catch { /* sem amostra */ }

const md = `# Validacao cega do modelo no holdout do 1o turno 2026

Gerado por \`qa/validacao-1t2026/validar.mjs\` + \`relatar.mjs\` (reprodutivel; sem dependencias). QA independente: nao participou da construcao do modelo nem do backfill, nao editou \`model/\` nem \`backfill/\`. Modelo: \`model/index.mjs\` v${meta.modelo}. Execucao: ${meta.gerado_em}. ${meta.instantes} instantes (17:00 a 03:00), ${meta.corridas.length} corridas, 2 modos, ${dados.rows.length} avaliacoes; erros de execucao do modelo: ${erros.length}.

## 1. Veredito

**Veredito (modo B, cego): ${V.B.v}.** Modo A (producao, nao cego): ${V.A.v}.

Regras do veredito (fixadas antes de olhar os resultados):
- REPROVADO se houver qualquer chamada de vencedor errada (C2), ou cobertura do presidente < 80%, ou C3 falhar.
- APROVADO se C1, C2, C3 e C4 passarem.
- APROVADO COM RESSALVAS nos demais casos (C2 e C3 ok, cobertura do presidente entre 80% e 90%, ou alguma UF de governador abaixo de 90%).

Modo B (cego, usado no veredito):

${crit(V.B)}

Modo A (producao, baseline = resultado final do 1T; nao cego, so referencia):

${crit(V.A)}

## 2. Base e metodo (o que exatamente foi medido)

**Adaptacao 1T -> modelo de 2T.** O modelo projeta a participacao de dois finalistas. Foi usado o proprio mecanismo dele: os finalistas vem de \`baselines/*.json\` (\`corrida.finalistas\`) e o modelo ignora os demais candidatos; \`pct_proj\` = A / (A + B) projetado, ou seja, **share entre os dois candidatos, re-normalizado nos votos validos dos dois**. O modelo recebe os arquivos completos (12 candidatos no presidente); ele so soma os votos de A e B.
- **Presidente:** A = LULA (13), B = FLAVIO BOLSONARO (22). Verdade = share de Lula entre Lula e Flavio no arquivo oficial final 6257 (BR) = **${n2(pres.c.verdade_pct_A)}%** (vencedor na base de 2: ${pres.ch.vencedor_real === '13' ? 'Lula' : 'Flavio (22)'}).
- **Governadores (os 2 primeiros do 1T = finalistas do 2T):** ${corridas.filter((c) => c.cargo === 'governador').map((c) => `${c.uf.toUpperCase()}: A=${c.A.nmu} (${c.A.n}) x B=${c.B.nmu} (${c.B.n}), final de A = ${n2(c.verdade_pct_A)}%`).join('; ')}. Verdade = arquivo oficial final 6259 da UF (c0003), mesma base A/(A+B).
- **Parcial ("so olhar a apuracao")** = votos de A / (A + B) somados nos arquivos do instante, na mesma base de 2 candidatos. Erro = |valor - final| em p.p.
- **Instantes:** os 265 snapshots do replay. \`agora\` = horario do snapshot (frescor sempre 0 s: o replay nao tem atraso entre geracao e leitura; o criterio de frescor, portanto, nao foi testado).
- **Ajuste tecnico obrigatorio:** o parser do modelo rejeita \`t != '2'\` e \`ele\` diferente do esperado. Cada JSON do replay foi copiado em memoria com \`t:'2'\` e \`entrada.eleicao\` = 6257/6259. Nenhum outro campo foi alterado.
- **Presidente:** \`entrada.ufs\` = 27 UFs + ZZ do replay (estratificacao por UF).
- **Governador:** \`entrada.ufs[uf]\` = arquivo da UF do replay e \`entrada.estratos\` = arquivos municipais do replay que existem no instante (municipio sem BU ainda = sem arquivo; o modelo trata como \`semDado\`).
- **DF (zonas):** o modelo exige zonas no DF (baseline por zona, ids \`df97012-zNNNN\`). Sem replay zonal, as zonas foram construidas por \`lib/df-zonas.mjs\` a partir de \`secoes-governador-df.csv.gz\` (NR_ZONA): para cada instante T, cada zona com >= 1 BU recebido (\`dt_bu_recebido <= T\`, Brasilia) vira um \`-u.json\` minimo com \`s.ts\`/\`e.te\` = soma de todas as secoes da zona, \`s.st\`/\`e.est\` = BUs recebidos, votos = soma dos candidatos (sem o nulo tecnico v_55). O municipal unico do replay do DF foi descartado. Estratificacao efetiva do DF: \`${R.B.find((x) => x.c.id === 'gov-df').estratificacao}\`.

**Dois modos.**
- **A = producao como entregue.** O modelo traz \`baselines/\` gerados do **resultado final do proprio 1T 2026** (\`model/tools/gerar-baselines.mjs\`). No holdout isso e vazamento: o prior de qualquer estrato ainda sem apuracao e a resposta final dele. Por isso o modo A **nao e cego**.
- **B = cego.** \`cfg.usarBaseline=false\` (o mesmo modo \`M0_1T\` que o backtest 2022 usa para 1o turno): estrato sem apuracao usa a taxa agregada observada. Nenhum dado do resultado final entra. O criterio \`fallback_nacional\` (<= 5% do eleitorado) segue valendo.
- Diferenca A x B: presidente ${presIgual ? 'IDENTICO em todos os 265 instantes (publicacao, projecao e faixa)' : 'diferente (ver tabelas)'}; governadores (max |A-B| na projecao; instantes com publicacao diferente): ${corridas.filter((c) => c.cargo === 'governador').map((c) => { const d = difAB(c.id); return `${c.uf.toUpperCase()} ${n2(d.max)} pp / ${d.publicacao_diferente}`; }).join('; ')}. Ou seja, nos instantes publicados quase todos os estratos ja tem apuracao e o prior pouco entra; o vazamento teve efeito pequeno.

**Faixas por % do eleitorado apurado** (campo \`apurado.eleitorado_pct\` do modelo): ${FAIXAS.map(([a, b]) => `${a}-${Math.min(100, Math.round(b))}`).join(', ')}; limite inferior inclusivo.
**Cobertura** = fracao dos instantes publicados em que o final ficou em [min, max] da faixa publicada do candidato A (valores arredondados a 2 casas, como o modelo publica). **Chamadas de vencedor** = \`forecast.tendencia\` (so existe com forecast publicado) e \`parcial.definido_matematicamente\` (calculado pelo modelo mesmo sem forecast publicado); errada = candidato chamado != vencedor final na base de 2.

## 3. Presidente (modo B)

### 3.1 Publicacao

${tabPublicacao(R.B.filter((x) => x.c.id === 'presidente'))}

### 3.2 Erro e cobertura por faixa de % apurado

${tabFaixas(pres.faixas)}

Global:

${tabGlobal([pres])}

Instantes publicados com o final **fora** da faixa (trechos consecutivos na grade):

${trechosTxt}

### 3.3 Chamadas de vencedor

${tabChamadas([pres])}

### 3.4 Estabilidade

${tabEstab([pres])}

### 3.5 Grafico

![Presidente, modo B](../qa/validacao-1t2026/presidente-B.svg)

Modo A (identico em projecao/faixa, ver 2): \`qa/validacao-1t2026/presidente-A.svg\`.

## 4. Governadores (modo B)

### 4.1 Publicacao

${tabPublicacao(R.B.filter((x) => x.c.cargo === 'governador'))}

### 4.2 Erro e cobertura globais por UF

${tabGlobal(R.B.filter((x) => x.c.cargo === 'governador'))}

Instantes publicados com o final fora da faixa:

${tabela(['UF', 'Instantes fora', 'Trechos (hh:mm-hh:mm, n)'], foraGov)}

### 4.3 Agregado das 6 UFs por faixa de % apurado (instantes empilhados)

${tabFaixas(governadoresPool('B'))}

### 4.4 Chamadas de vencedor

${tabChamadas(R.B.filter((x) => x.c.cargo === 'governador'))}

### 4.5 Estabilidade

${tabEstab(R.B.filter((x) => x.c.cargo === 'governador'))}

## 5. Modo A (producao, nao cego), para comparacao

${tabPublicacao(R.A)}

${tabGlobal(R.A)}

${tabChamadas(R.A)}

## 6. Limitacoes

- **1o turno != 2o turno.** O modelo foi desenhado e calibrado (faixas) com o 2o turno de 2022, com baseline do 1o turno anterior. Aqui ha 12 candidatos no presidente, e a base de 2 candidatos (Lula x Flavio) exclui o resto dos votos validos; a metrica compara o share entre os dois, nao o share nos validos totais. As chamadas "definido matematicamente" do modelo usam a vantagem entre os dois contra todo o eleitorado pendente, o que e conservador nessa base.
- **Baseline vazada no modo A.** A producao usa o resultado final do proprio 1T como baseline; por isso o veredito usa o modo B. O modo B nao testa o mecanismo baseline+swing do 2T, que depende de um 1T anterior real e nao existe neste holdout.
- **Replay != TSE ao vivo.** O replay ordena os BUs por \`DT_BU_RECEBIDO\`; o TSE totaliza de ~0,2 a 1 min depois do recebimento no fim e ate ~10 min no comeco (docs/BACKFILL-1T2026.md 3b). Ou seja, o replay esta alguns minutos a frente da totalizacao real, principalmente no inicio, e as curvas aqui sao ligeiramente otimistas no tempo (um % apurado sai antes do que sairia ao vivo). A ordem de chegada foi validada contra a serie real so a partir de 18:48.
- Premissas nao confirmadas do backfill: fuso do \`DT_BU_RECEBIDO\`, semantica de \`e.est\` em parcial (soma de aptos dos BUs recebidos), arquivo municipal inexistente antes do 1o BU, 42 secoes sem BU (replay termina em 99,99% das secoes), \`and\`/\`tf\` em parcial presumidos.
- O criterio de frescor/dispersao de horario nao foi exercitado de forma realista: todos os arquivos de um instante tem o mesmo \`dg/hg\` e \`agora\` = esse horario.
- DF: zonas sintetizadas por mim a partir do CSV (convencao igual a dos municipais do backfill), nao um replay oficial.
- Os instantes sao fortemente autocorrelacionados (grade de 1 min ate 20:00, 5 min depois); cobertura sobre ${pres.pub.publicados} instantes nao equivale a ${pres.pub.publicados} experimentos independentes. A comparacao e sobre uma unica eleicao por corrida.
- Governadores: so 6 corridas, todas com final de A entre ${n2(Math.min(...corridas.filter((c) => c.cargo === 'governador').map((c) => c.verdade_pct_A)))}% e ${n2(Math.max(...corridas.filter((c) => c.cargo === 'governador').map((c) => c.verdade_pct_A)))}%.

## 7. Re-calculo independente por amostra

${amostraTxt}

## 8. Reproducao

\`\`\`
node qa/validacao-1t2026/validar.mjs   # ~30 s; escreve qa/validacao-1t2026/resultados.json
node qa/validacao-1t2026/amostra.mjs   # re-calculo independente por amostra (amostra.json)
node qa/validacao-1t2026/relatar.mjs   # escreve este arquivo e os SVGs
\`\`\`
`;
writeFileSync(join(RAIZ, 'docs/VALIDACAO-1T2026.md'), md);
console.log(JSON.stringify({ B: V.B, A: V.A }, null, 1));
