# Engenharia reversa do modelo de projecao do 1o turno 2026

Site analisado: https://apuracao-2026-vs-2022.diegoivo.chatgpt.site/ (Next/Vinext SSR + React, bundle `page-CVpMEfRT.js`).
Data da analise: 2026-10-23. Convencoes deste documento:

- **[CODIGO]** = verificado no JS baixado. Linhas citadas referem-se a copia desminificada com prettier em
  `/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/pretty/page.pretty.js`
  (original minificado: `.../scratchpad/prev/page-CVpMEfRT.js`). Nomes de variavel sao os do bundle minificado (`c`, `s`, `E`...).
- **[MEDIDO]** = obtido por mim via GET nas fontes oficiais ou reexecutando o calculo em codigo proprio.
- **[ESTIMATIVA MINHA]** = calculo/sugestao nossa, NAO faz parte do modelo do site.
- **nao determinado** = nao da para saber pelo codigo entregue ao navegador.

Scripts de apoio (meus, isolados): `scratchpad/work/proj.py` (reimplementacao independente do modelo) e `scratchpad/work/bt.py` (backtests).

## Achado central (leia primeiro)

1. O modelo do site e um **extrapolador simples por UF**: em cada UF mantem a participacao e a divisao entre candidatos ja observadas e as aplica ao eleitorado ainda nao totalizado; soma as 28 abrangencias (26 UFs + DF + Exterior). **Nao usa a curva de totalizacao de 2022 para projetar.** Os dados de 2022 (`a.rounds`) so alimentam o painel "Explore 2022 e compare com 2026" e o texto "Jair Bolsonaro em 2022... com X% apurado: Y%" [CODIGO: `c(e,t)` linhas 42-105 nao recebe nenhum dado de 2022; `L`/`I` linhas ~800 so vao para os cards e para `y(...)`].
2. A "faixa de cenarios" e um deslocamento fixo de +-2 p.p. (slider 0-10) dos votos **pendentes** entre os dois candidatos. O proprio site diz que "nao e intervalo de confianca" e que nao ha probabilidade de vitoria nem calibracao historica.
3. **Nao ha limiar minimo de exibicao**: a projecao aparece sempre, mesmo com 0% apurado (ver secao 2.7). Isso e uma lacuna que a adaptacao do 2o turno deve corrigir.
4. Backtest (secao 4): no unico ponto intermediario reconstruivel por UF (64,8% das secoes), o modelo projetou Lula 44,42% / Flavio 47,65%; final 45,16% / 47,03% (erro -0,74 / +0,62 p.p.). A faixa de +-2 p.p. **nao cobriu** o resultado final. Um ajuste aditivo pela curva de 2022 (nosso, ESTIMATIVA MINHA) teria errado +0,13 / -0,07 nesse mesmo ponto.

---

## 1. Fontes de dados

### 1.1 2026 (tempo real) [CODIGO linhas 4-9 e 826; MEDIDO]

| Item | Valor |
|---|---|
| Eleicao 1o turno presidente | `ele=6257`, `t=1` (campos do JSON) |
| URL por abrangencia | `https://resultados.tse.jus.br/oficial/ele2026/6257/dados/<uf>/<uf>-c0001-e006257-u.json` |
| Abrangencias buscadas | `br` + 28: `ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz` (`zz` = Exterior) [CODIGO linha 46-49] |
| Uso de `br` | cabecalho/cards nacionais, curva e **fallback** de UF sem dado; a projecao em si usa so as 28 |
| Backend proprio | `GET /api/live` (rota `route:/api/live` listada no `segmentGraph` do `index-B4gf9Epp.js`). Retorna JSON `{fetchedAt, attemptedAt, results{<uf>:{url,fetchedAt,stale,data}}, history[], storageWarning}`. **Codigo do servidor nao e entregue ao navegador: nao determinado** (como busca o TSE, cache, onde guarda o historico). |
| Frequencia do cliente | `fetch('/api/live', {cache:'no-store', signal: AbortSignal.timeout(30000)})` no carregamento e a cada **60 s** (`setInterval(V, 6e4)`) enquanto o checkbox "Atualizar a cada 60s" estiver marcado; botao "Atualizar agora" [CODIGO linhas 822-860] |
| Frequencia de geracao no TSE | Observada nos arquivos: `idg`/`hg` mudam a cada ~30-90 s no pico (ver `history` do `/api/live`: 190 pontos nacionais entre 18:48 e 05/10 12:51). Cadencia oficial do TSE: nao determinado. |
| Historico 2026 | Nao vem do TSE: e **acumulado pelo proprio servidor do site** a cada leitura nova (`history`: 190 pontos nacionais, ids `6257:<idg>`). Os 2 primeiros pontos (47,26% e 64,81%) estao embutidos no bundle (`var b`, linha 707). O historico **so existe no nivel Brasil**; nao ha historico por UF. |

Campos do JSON TSE usados [CODIGO funcao `s`, linhas 18-40]:

| Variavel no codigo | Campo TSE | Significado |
|---|---|---|
| `lula` / `bolsonaro` | `carg[].agr[].par[].cand[]` com `n==="13"` / `n==="22"` -> `vap` | votos apurados do candidato (por NUMERO do candidato) |
| `valid` | `v.vvc` (fallback: soma dos `vap` dos candidatos) | votos validos |
| `counted` | `s.pstn` (fallback `s.pst`) | % de **secoes** totalizadas |
| `countedSections`/`totalSections` | `s.st` / `s.ts` | secoes totalizadas / totais |
| `electors` | `e.te` | eleitorado total (aptos) |
| `countedElectors` | `e.est` | eleitorado em secoes totalizadas |
| `electorPct` | `e.pestn` | % do eleitorado em secoes totalizadas |
| data/hora | `dg`/`hg` (geracao do arquivo), `ht` (totalizacao) | |

Numeros no TSE usam virgula decimal; o codigo normaliza (`o = e => Number(String(e??0).replace(',','.'))||0`).

### 1.2 2022 (curva historica) [CODIGO linhas 10-16; MEDIDO]

| Turno | Arquivo | Tamanho / data | Conteudo |
|---|---|---|---|
| 1o | https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/Historico_Totalizacao_Presidente_BR_1T_2022.zip | 1.625.754 bytes, Last-Modified 14/10/2022 | 1 CSV (`;`, latin-1, 51 colunas, **8.437 linhas** = `rawPointCount`) + `leiame.pdf` |
| 2o | https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/Historico_Totalizacao_Presidente_BR_2T_2022.zip | 825.276 bytes, Last-Modified 01/11/2022 | idem, 5.286 linhas |
| Pagina do dataset | https://dadosabertos.tse.jus.br/dataset/resultados-2022 | | |

- Colunas relevantes do CSV [MEDIDO]: `DT_TOTALIZACAO`, `QT_SECOES_TOTAL`, `QT_APTOS_TOTAL`, `QT_SECOES_TOT_ACUMULADO`, `PE_SECOES_TOT_ACUMULADO` (fracao 0-1, ex.: `0,000405`), `QT_APTOS_TOT_ACUMULADO`, `QT_VOTOS_CONCORRENTES_ACUMULADO` (validos), `<CANDIDATO>_QT_VOTOS_TOT_ACUMULADO`, `<CANDIDATO>_PE_VOTOS_TOT_ACUMULADO`.
- O site reduz o CSV a uma linha por minuto (o ultimo registro de cada minuto; "Os historicos usam o ultimo registro real de cada minuto, sem inventar observacoes"): 1o turno = **492 pontos** (17:04:51 de 02/10/2022 a 10:27:34 de 04/10/2022), 2o turno = **297 pontos** (17:00:55 a 00:18:04). A transformacao foi feita **fora do navegador** (pre-processamento embutido como constante `a` no bundle; script: nao determinado). Campos do ponto: `countedPercent` (= % de secoes), `electorsCountedPercent`, `lulaPercent`, `bolsonaroPercent`, `lulaVotes`, `bolsonaroVotes`, `validVotes`, secoes e eleitores.
- So Presidente/BR. **Nao ha curva por UF nem de governador** no que o site usa.

### 1.3 Disponibilidade de historico de totalizacao 2026 [MEDIDO em 2026-10-23]

- `.../eleicoes2026/Historico_Totalizacao_Presidente_BR_1T_2026.zip` e `..._2T_2026.zip` -> **HTTP 404**.
- API CKAN `dadosabertos.tse.jus.br` `resultados-2026` (61 recursos): so votacao por secao/munzona, detalhe de apuracao, Relatorio de Totalizacao (final por UF), BU etc. **Nenhum recurso de historico de totalizacao 2026.**
- Conclusao: **nao existe historico oficial de totalizacao do 1o turno 2026 por UF**. O unico historico intradia e o `history` do `/api/live` do site (190 pontos nacionais).

---

## 2. Algoritmo de projecao passo a passo

### 2.1 Pipeline [CODIGO]

```
a cada 60 s:   GET /api/live  ->  {results[28+br], history}
               F = c(results, t)            # t = slider de sensibilidade (default 2 p.p.)
               P = s(results.br.data)       # headline nacional (nao entra na projecao, exceto fallback)
render:        cards (P) + secao "Projecao do resultado final" (F) + comparacao 2022 + tabela por UF
```

### 2.2 Normalizacao por UF `s(data)` (linhas 18-40) e projecao `c(e, t=2)` (linhas 42-105)

Para cada abrangencia `u` em `[ac..zz]` (28 itens), com `m = s(data_u)`:

```
g = m.lula/m.valid                     # share de Lula entre validos ja contados   (0 se valid=0)
b = m.bolsonaro/m.valid                # idem Flavio
SE m.countedElectors > 0:
    h = max(0, m.electors - m.countedElectors) * m.valid / m.countedElectors    # votos VALIDOS pendentes
SENAO (UF sem eleitorado totalizado):  # fallback
    h = m.electors * (nac.countedElectors ? nac.valid / nac.countedElectors : 0)
    g = nac.lula/nac.valid ; b = nac.bolsonaro/nac.valid        # taxas nacionais atuais
    fallback.push(u)

total_valid += m.valid + h
lula        += m.lula       + h*g
bolsonaro   += m.bolsonaro  + h*b
pendente    += h
D += h * min(t/100, b)     # "d": quanto Flavio pode ceder a Lula
F += h * min(t/100, g)     # "f": quanto Lula pode ceder a Flavio
```

Trecho literal (desminificado, linhas 54-80):

```js
m.countedElectors > 0
  ? (h = (Math.max(0, m.electors - m.countedElectors) * m.valid) / m.countedElectors)
  : (a.push(r),
     (h = m.electors * (n.countedElectors ? n.valid / n.countedElectors : 0)),
     (g = n.valid ? n.lula / n.valid : 0), (_ = n.valid ? n.bolsonaro / n.valid : 0)),
(o += m.valid + h), (c += m.lula + h * g), (l += m.bolsonaro + h * _), (u += h),
(d += h * Math.min(t / 100, _)), (f += h * Math.min(t / 100, g)),
```

Depois da soma das 28 abrangencias [linhas 83-104]:

```
pct(x)       = missing.length ? NaN : (total_valid ? x/total_valid*100 : 0)
lulaPct      = pct(lula)            bolsonaroPct = pct(bolsonaro)
otherPct     = pct(total_valid - lula - bolsonaro)
lulaLow      = pct(lula - F)        lulaHigh      = pct(lula + D)
bolsonaroLow = pct(bolsonaro - D)   bolsonaroHigh = pct(bolsonaro + F)
counted      = sum(secoes totalizadas das UFs) / sum(secoes totais das UFs) * 100   # "Base da projecao"
earliest/latest = menor/maior horario de geracao (hg) entre as UFs
```

Equivalencias (para citar na metodologia):

- Votos projetados do candidato na UF = `votos * (1 + (electors-countedElectors)/countedElectors)` = `votos * electors / countedElectors` (o proprio texto do site: "votos observados x eleitorado total / eleitorado em secoes totalizadas").
- Como o share e mantido constante em cada UF, o ganho do modelo vem **apenas de recompor o peso das UFs** (estados mais apurados pesam menos no pendente; os pouco apurados pesam mais). Dentro de uma UF a projecao e igual ao percentual atual (identidade).

### 2.3 Respostas diretas as perguntas

| Pergunta | Resposta |
|---|---|
| Projeta por UF e agrega? | **Sim.** 28 abrangencias (27 UFs + Exterior `zz`), soma de votos, percentual nacional sobre o total valido projetado. |
| Usa a curva de totalizacao de 2022 como ajuste? | **Nao.** A curva de 2022 so e exibida (comparacao). Nenhum parametro de 2022 entra em `c()`. |
| Pondera pelo eleitorado restante? | **Sim**, e e o nucleo: o pendente de cada UF = `(te - est)` (eleitorado nao totalizado) x (validos por eleitor ja totalizado). Isto assume mesmo comparecimento e mesma taxa de validos (brancos/nulos) nas secoes pendentes. |
| Intervalo de confianca / probabilidade? | **Nao.** Apenas "Cenarios": transferencia de ate `t` p.p. (padrao 2, slider 0-10 passo 0,5) dos votos pendentes entre os dois candidatos, limitada ao share de quem cede. Texto: "e uma faixa de cenarios, nao um intervalo de confianca" e "Modelo sem probabilidade de vitoria ou calibracao historica". |
| Que "terceiros" considera? | `otherPct = 100 - L - B` projetado; os outros mantem seu share (so os dois sao movidos nos cenarios). |
| Peso do tempo/horario das UFs | Cada UF usa o ultimo arquivo; arquivos tem horarios distintos. Mostra "Arquivos gerados entre hh:mm:ss e hh:mm:ss. A soma estadual pode estar a frente do consolidado nacional acima." |
| Qual % mostra como base | `% de secoes` somado nas UFs (ex.: 73,58% no snapshot embutido, enquanto o BR exibia 64,81%). |

### 2.4 Faixa de cenarios (sensibilidade)

`lulaHigh = lula + D` e `bolsonaroLow = bolsonaro - D`; `lulaLow = lula - F` e `bolsonaroHigh = bolsonaro + F` (denominador = total valido projetado, que nao muda). Logo as faixas de Lula e Flavio sao espelhadas. Largura aproximada no snapshot: `+-t * pendente / total` = `+-2% * 33,19 mi / 119,65 mi` ~ **+-0,55 p.p.** do total. [MEDIDO: 43,87-44,98 para Lula; 47,09-48,20 para Flavio.]

### 2.5 Quando falta dado [CODIGO]

| Situacao | Tratamento |
|---|---|
| Uma UF sem `data` no resultado | vai para `missing`; **todas** as porcentagens projetadas viram `NaN` e a UI mostra "Indisponivel"; nota "Cobertura incompleta: <UFs>." (nao ha projecao parcial) |
| UF com `countedElectors = 0` | fallback: pendente = eleitorado x (validos/eleitor nacional) e shares nacionais; texto de metodologia lista "Regra usada em <UFs>." |
| Falha de atualizacao de algumas UFs | servidor devolve a ultima leitura boa com `stale:true`; UI marca "· mantido" na tabela e exibe "Projecao com leituras preservadas em N abrangencias; confira os horarios." e aviso "Falha na atualizacao de <UFs>. Essas abrangencias mantem a ultima leitura salva; confira os horarios antes de interpretar a projecao." |
| Todas as 29 em `stale` | "A fonte esta temporariamente indisponivel. Os numeros exibidos sao a ultima leitura valida salva, nos horarios indicados; a projecao tambem usa essa leitura." Selo do cabecalho vira "Leitura preservada" (em vez de "TSE consultado") |
| `fetch` falha / sem `results.br.data` | "Nao foi possivel atualizar. Os numeros e a projecao correspondem a ultima leitura disponivel, no horario exibido." (mantem o estado anterior; o estado inicial e o snapshot embutido no bundle) |
| Historico nao pode ser gravado | `storageWarning`: "Dados atualizados. O armazenamento do historico esta temporariamente indisponivel." |

### 2.6 Pontos de comparacao com 2022 (nao entram na projecao) [CODIGO linhas 202-775]

- Card de cada candidato: ponto da curva de 2022 (turno escolhido) **mais proximo em `countedPercent`** ao % de secoes atual do Brasil: `L = timeline.reduce(nearest)`; mostra "Com X% apurado: Y%".
- Painel "Explore 2022 e compare com 2026": slider/SVG (eixo x = % de secoes 0-100, y = 25-70%), seleciona ponto de 2022 e acha a coleta de 2026 mais proxima por **mesmo % apurado** (`nearest`, `null` se fora do intervalo observado em 2026) ou por **mesmo horario** (minutos desde 00:00 do dia da eleicao: 2026-10-04, 2022-10-02 ou 2022-10-30). Se a diferenca for grande: "Coleta distante; nao representa exatamente o ponto selecionado."

### 2.7 Criterios de exibicao e lacunas do modelo [CODIGO + MEDIDO]

- **Nenhum limiar minimo**: a secao "Projecao do resultado final" e renderizada incondicionalmente. Com 0% totalizado todas as UFs caem no fallback, a divisao `nac.valid/nac.countedElectors` e protegida (`? : 0`) e a UI exibiria `0,00%` em vez de "indisponivel" (`pct()` devolve 0 quando `total_valid` = 0). [CODIGO inferido; reproduzivel com o arquivo `6258/.../br-c0001-e006258-u.json` pre-eleicao, que tem `est=0`.]
- Sem aviso dependente do nivel de apuracao (so a nota generica "A ordem de apuracao dentro de cada estado pode mudar a projecao").
- Sem intervalo estatistico; a faixa nao tem calibracao (secao 4 mostra que ela falhou no ponto testado).
- Mistura de horarios entre UFs (ate ~3,5 min no snapshot) e a soma das UFs (73,58%) pode estar a frente do consolidado nacional (64,81%).
- Pressupoe comparecimento e taxa de validos iguais nas secoes pendentes e ignora que a apuracao nao e aleatoria dentro da UF (viés de ordem: o interior/regioes de perfil diferente chegam por ultimo). O proprio site declara isso.

---

## 3. Textos, rotulos e estrutura da UI (reaproveitamento)

Ordem de blocos [CODIGO linhas 870-1392 + HTML SSR `prev/index.html`]:

**3.0 `<title>`/meta**: "Apuracao 2026 x 2022" / descricao "Lula e Bolsonaro" (SSR).

**3.1 Cabecalho**: marca `◫ Apuracao 2026 × 2022`; direita: `04 OUT 2026 · 1º TURNO` + selo `● Verificando TSE` -> `● TSE consultado` | `● Leitura preservada`.

**3.2 Titulo**: `A disputa, voto a voto.` / subtitulo `Lula e Flavio Bolsonaro hoje · Lula e Jair Bolsonaro em 2022` / botao `↻ Atualizar agora` (`Atualizando…`).

**3.3 Frescor**: `Consolidado nacional: <dd/mm/aaaa> as <hh:mm:ss> (Brasilia)` + checkbox `Atualizar a cada 60s enquanto aberto`; faixa de aviso (`role=status`) com as mensagens de 2.5.

**3.4 Cards (visao geral)**
- `SECOES TOTALIZADAS · BRASIL` -> % gigante, barra, `323.539 de 499.248 secoes`, `Eleitorado em secoes totalizadas 63,25%`, `Votos validos computados 75,76 mi`.
- Por candidato: `PT · RESULTADO PARCIAL` / `PL · RESULTADO PARCIAL`, nome, %, `N votos`, bloco `Lula em 2022 · 1º turno / Com 64,48% apurado: 45,39%` (idem Jair Bolsonaro).
- Barra tripla (Lula vermelho `#cc4353`, Flavio azul `#2861c7`, outros cinza) + legenda `● Lula`, `● Flavio Bolsonaro`, `● Outros 8,17%`, `Vantagem parcial: 5.559.042 votos`.

**3.5 Painel "Projecao do resultado final"** (`section.panel.forecast`)
- eyebrow `ESTIMATIVA DOS VOTOS QUE FALTAM`; h2 `Projecao do resultado final`; tag `Modelo por UF + exterior`.
- Intro: `Mantem a participacao, a taxa de votos validos e a divisao entre candidatos ja observadas em cada estado para estimar seu eleitorado pendente.`
- Tres blocos: `Lula 44,42% · Cenarios: 43,87% a 44,98%` / `Flavio Bolsonaro 47,65% · Cenarios: 47,09% a 48,20%` / `Votos validos ainda esperados 33,19 mi · Outros candidatos: 7,93%`.
- Barra da projecao.
- Estado da fonte: `Projecao com leituras preservadas em N abrangencias; confira os horarios.` (condicional) · `Base da projecao: 73,58% das secoes na soma das UFs.` · `Arquivos gerados entre 19:13:49 e 19:17:16. A soma estadual pode estar a frente do consolidado nacional acima.`
- Slider: `Variacao nos votos pendentes ±2 p.p.` + `Transfere ate 2 p.p. dos votos restantes entre os dois candidatos. E uma faixa de cenarios, nao um intervalo de confianca.`
- Nota: `A ordem de apuracao dentro de cada estado pode mudar a projecao. Modelo sem probabilidade de vitoria ou calibracao historica. Cobertura: 28 de 28 abrangencias.` (ou `Cobertura incompleta: ...`).

**3.6 "Explore 2022 e compare com 2026"**: subtitulo `Arraste no grafico ou escolha um registro. Todos os valores sao observacoes reais.`; abas `1º turno | 2º turno` (2022); `Registro de 2022` (select), `Ir ao % apurado`, `↻ Comparar com agora`; legenda `━ Lula 2022`, `━ Jair 2022`, `● Registros de 2026: Lula / Flavio`, `┆ Ponto selecionado`; eixo `Percentual de secoes totalizadas · linhas: 2022 · pontos: coletas de 2026`; `Comparar a selecao com 2026 por:` (`Mesmo % apurado` | `Mesmo horario`); cartoes `2022 · 1º TURNO · SELECIONADO`, `2026 · REGISTRO MAIS PROXIMO` (`Sem observacao nesse ponto`, `X p.p. de diferenca no avanco` / `N min de diferenca no relogio`), `2026 · ULTIMO CONSOLIDADO NACIONAL`; select `Explorar uma coleta de 2026` / `Escolha um horario e compare com 2022…`.

**3.7 "Onde ainda faltam votos"** (`Estados com maior peso nos votos pendentes.`): busca `Buscar estado…`; ordenar `Mais votos pendentes | Menos apurado | Ordem alfabetica`; tabela `Estado | % apurado | Lula | Flavio | Validos restantes* | Geracao do arquivo` (+ ` · mantido`); nota `* Votos validos estimados pelo padrao observado de abstencoes, brancos e nulos. % apurado = secoes totalizadas / secoes totais. Geracao dos arquivos em Brasilia.`

**3.8 `<details>` "Metodologia, fontes e dados"**: (1) `Em cada UF: votos projetados do candidato = votos observados × eleitorado total ÷ eleitorado em secoes totalizadas. O mesmo calculo projeta os votos validos. Somamos os resultados das 27 UFs e do exterior. Os percentuais nacionais projetados usam essa soma, incluindo os outros candidatos. Se uma UF nao tiver eleitorado totalizado, usamos provisoriamente as taxas nacionais atuais. Regra usada em <UFs>. | Nenhuma UF usou essa regra nesta leitura.` (2) `A faixa de sensibilidade transfere participacao apenas nos votos pendentes entre os dois candidatos, respeitando os limites de cada participacao e mantendo os outros candidatos. Nao representa margem de erro nem previsao de segundo turno. Os historicos usam o ultimo registro real de cada minuto, sem inventar observacoes. Arquivos atuais do TSE podem atualizar em momentos diferentes.` Links: `Resultados oficiais do TSE` (resultados.tse.jus.br/oficial/app/index.html), `Documentacao de 2026` (tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados), `Historicos oficiais de 2022` (dadosabertos.tse.jus.br/dataset/resultados-2022); botao `↓ Baixar dados e projecao (JSON)` (`apuracao-2026.json` = `{snapshot, forecast}`).

**3.9 Rodape**: `Fonte: Tribunal Superior Eleitoral · Projecao independente` · `Ultima leitura nacional bem-sucedida: hh:mm:ss (Brasilia)`.

Observacao para o 2o turno: o texto da metodologia diz "Nao representa ... previsao de segundo turno" e o rotulo "Outros candidatos"/"Outros" deixam de existir com 2 candidatos.

---

## 4. Validacao [MEDIDO, salvo marcacao]

### 4.1 Reproducao do modelo

Reimplementei `s()`/`c()` em Python (`work/proj.py`) e rodei sobre o snapshot embutido no bundle (28 UFs + BR, `fetchedAt 2026-10-04T22:18:45Z`, BR = 64,81%). Resultado identico ao HTML SSR do site: Lula **44,42%** (cenario 43,87-44,98), Flavio **47,65%** (47,09-48,20), outros **7,93%**, pendente **33,19 mi**, base 73,58% das secoes. Isso confirma que o algoritmo da secao 2 e o que roda.

### 4.2 Limite do que e possivel validar

- **Nao ha historico por UF** (nem oficial, nem no `/api/live`). Portanto so e possivel reexecutar o modelo **em 1 ponto intermediario** (o snapshot embutido, ~64,8% BR / 73,6% somado nas UFs). Os demais 189 pontos do `history` sao so nacionais.
- Resultado final usado: arquivos `ele2026/6257/dados/<uf>/...-u.json` (29 baixados, todos HTTP 200; `br` gerado 05/10/2026 12:51:47, 100% das secoes): **Lula 45,1628% · Flavio 47,0278%** (validos 119.300.788).

### 4.3 Projecao do modelo (64,8%) vs final

| | Projecao | Final | Erro (proj - final) | Cobertura da faixa +-2 p.p. |
|---|---|---|---|---|
| Lula | 44,42% | 45,16% | **-0,74 p.p.** | 43,87-44,98 -> **NAO cobre** |
| Flavio | 47,65% | 47,03% | **+0,62 p.p.** | 47,09-48,20 -> **NAO cobre** |
| Validos totais | 119,65 mi | 119,30 mi | +0,29% | |
| Referencia ingenua (percentual observado, BR 64,81%) | 42,25 / 49,58 | | -2,92 / +2,56 | |

- O modelo reduziu o erro de ~2,9 p.p. para ~0,7 p.p. no ponto testado, mas **subestimou Lula sistematicamente**: o pendente tinha perfil mais lulista que o ja apurado (vies de ordem dentro das UFs).
- A faixa de +-2 p.p. so cobriria Lula e Flavio com `t >= 3 p.p.` (t=2,5 cobre so Flavio; t=3 cobre ambos) [MEDIDO com o proprio `proj.py` variando t]. Ou seja, a faixa padrao e **estreita demais** para este ponto (apenas 1 observacao: nao e calibracao).
- Erro por UF (proj - final, Lula) no mesmo ponto: pior em ZZ (+3,92 com 65,4% apurado), AM (-3,69; **vencedor errado**, 76,5% apurado), AL (+2,41, 42% apurado), CE (-1,94), PA (-1,78). Acertou o vencedor em **27 de 28**. UFs com >=90% apurado erraram <0,6 p.p. no candidato. Tabela completa em `work/proj.py` (saida).

### 4.4 Metodo alternativo com a curva de 2022 (ESTIMATIVA MINHA, nao e o modelo do site)

Backtest sobre os 190 pontos nacionais do `history` do `/api/live`, usando a curva de 2022 1T (ponto de 2022 mais proximo no % de secoes) e `proj = obs_2026 + (final_2022 - obs_2022_no_mesmo_%)`:

| % apurado BR | Erro Lula/Flavio, observado puro | Erro, ajuste aditivo 2022 |
|---|---|---|
| 47,26 | -3,53 / +3,18 | +0,34 / -0,23 |
| 64,81 | -2,92 / +2,56 | **+0,13 / -0,07** |
| 89,58 | -1,25 / +1,07 | +0,06 / -0,05 |
| 95,01 | -0,71 / +0,60 | +0,08 / -0,08 |
| 98,0 | -0,38 / +0,32 | +0,04 / -0,04 |
| 99,5 | -0,12 / +0,10 | ~0 |

MAE nos 46 pontos entre 90% e 99%: Lula 0,68 (puro) vs 0,07 (ajuste); Flavio 0,57 vs 0,06. Ressalvas: (a) so ha 1 eleicao de teste (2026 1T com curva de 2022 1T) e o padrao de apuracao de 2026 foi muito parecido com o de 2022; (b) so ha 4 pontos abaixo de 90%; (c) a variante multiplicativa teve erro de ate -0,29 em Flavio em 64,8%. Nao e evidencia de calibracao para outro turno.

### 4.5 Curvas de 2022 (para o 2o turno) [MEDIDO do JSON embutido; mudanca de Lula ate o final]

| % apurado | 1T: dL / dB ate o final | 2T: dL (= -dB, 2 candidatos) | 2T Lula - Bolsonaro no ponto (p.p.) |
|---|---|---|---|
| 10% | +5,53 / -5,13 | +2,95 | -4,09 |
| 25% | +5,00 / -4,60 | +2,16 | -2,51 |
| 50% | +3,74 / -3,29 | +1,20 | -0,60 |
| 65% | +3,03 / -2,62 | +0,96 | -0,12 |
| 75% | +2,33 / -1,99 | +0,72 | +0,36 |
| 85% | +1,74 / -1,48 | +0,49 | +0,83 |
| 90% | +1,32 / -1,13 | +0,37 | +1,06 |
| 95% | +0,80 / -0,68 | +0,24 | +1,32 |
| 98% | +0,42 / -0,36 | +0,13 | +1,54 |
| 99% | +0,24 / -0,20 | +0,07 | +1,67 |

Finais de 2022: 1T Lula 48,43 / Bolsonaro 43,20; 2T Lula 50,90 / Bolsonaro 49,10 (validos 118,55 mi). No 2T de 2022 a lideranca mudou de Bolsonaro para Lula em ~65-75% apurado.

---

## 5. Adaptacao proposta para o 2o turno (decisoes minhas; ESTIMATIVA/PROPOSTA)

### 5.1 O que se mantem

- Fonte e cadencia: GET dos JSON do TSE a cada ~60 s; um proxy/servidor proprio com cache e `stale`.
- Extracao pelos mesmos campos (`vap` por numero, `vvc`, `s.pstn`, `e.te`, `e.est`, `dg/hg/ht`), nomes por numero do candidato (**13 Lula, 22 Flavio**; confirmado no arquivo pre-eleicao do 2T).
- Projecao por abrangencia: `h = max(0, te - est) * validos / est` e soma das 28 abrangencias; fallback explicito; transparencia (horarios de geracao, `stale`, cobertura, botao JSON); painel de comparacao com 2022.
- Linguagem: "estimativa", "nao e intervalo de confianca", "nao e probabilidade de vitoria".

### 5.2 O que muda (Presidente 2T)

1. **Identificadores**: eleicao `6258` (`t=2`). Arquivos: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/<uf>/<uf>-c0001-e006258-u.json` (br, sp, zz, ac respondem 200 com `est=0` pre-eleicao [MEDIDO]; as 28 abrangencias restantes: nao testadas uma a uma).
2. **Dois candidatos**: `L + B = 100%` dos validos (os "outros" desaparecem). Remover "Outros candidatos"/`otherPct`; os validos incluem so Lula e Flavio. A transferencia de cenarios e simetrica exata.
3. **Curva de 2022**: usar `Historico_Totalizacao_Presidente_BR_2T_2022.zip` (297 pontos) como **ajuste** (opcional, ver 5.4) e como painel de comparacao; trocar o default das abas para "2º turno". O 1T 2022 deve sair do ajuste (contexto diferente).
4. **Base do 2T = 1T 2026** (a pedido): usar o resultado final por UF do 1T 2026 (arquivos `6257/.../*-u.json`, ja baixados em `work/final/`) como **prior de share por UF** apenas para (a) mostrar "esperado a partir do 1T" ao lado e (b) sanidade/alerta quando o share observado numa UF diverge muito. **Nao** misturar os dois na projecao sem backtest: nao ha dado que calibre a transferencia 1T->2T em 2026 (nao determinado). Em 2022, 1T->2T moveu Lula de 48,4% para 50,9% (+2,5 p.p.), Bolsonaro de 43,2% para 49,1% (+5,9 p.p., absorvendo terceiros) [MEDIDO].
5. **Textos**: titulo "2º turno · 25 OUT 2026"; remover "previsao de segundo turno" da metodologia; grafico do 2T de 2022 com duas linhas complementares.
6. **Corrigir a lacuna de exibicao** (5.4).

### 5.3 Governadores 2T (muito importante: o modelo atual degenera)

- Arquivos 1T governadores: `ele2026/6259/dados/<uf>/<uf>-c0003-e006259-u.json` (27 UFs, 200). 2T governadores: `ele2026/6260/dados/<uf>/<uf>-c0003-e006260-u.json` -> **encontrados para AC, AM, DF, ES, RN e TO** [MEDIDO; candidatos: AC Mailza Assis x Alan Rick; AM Omar Aziz x Professora Maria do Carmo; DF Celina Leao x Leandro Grass; ES Lorenzo Pazolini x Ricardo Ferraco; RN Cadu de Lula x Allyson; TO Vicentinho Junior x Professora Dorinha]. Nao testei outras eleicoes alem de 6259-6262 e nao ha lista oficial consultada; confirmar no TSE antes de publicar.
- **Problema estrutural**: a corrida de governador e de **uma UF so**. O modelo "por UF + soma" vira identidade (share projetado = share atual); so sobra o numero de votos pendentes. Projetar de verdade exige **sub-baldes** (municipios/zonas) com share proprio. Arquivos municipais existem: `.../dados/<uf>/<uf><cod_mun5>-c0003-e006260-u.json` (ex.: `ac01120`, 200 em 6260, 6259 e tambem `c0001`/6258 [MEDIDO]); lista de municipios e codigos em `ele2026/6257/config/mun-e006257-cm.json` (534 KB, 200). Modelo proposto [ESTIMATIVA/PROPOSTA]: por municipio, `votos_proj = votos_obs * aptos_mun / aptos_apurados_mun` (analogo ao atual, ainda por eleitorado) e soma na UF; municipios com 0% apurado usam share do 1T 2026 do proprio municipio deslocado pelo desvio observado da UF (o que precisa de backtest: **nao determinado**).
- **Nao ha curva de totalizacao de governador de 2022** no que o site usa; existe `Historico_Totalizacao_Presidente_BR` apenas. Se existir historico de governador no TSE: nao determinado. Sem ele, nao se pode usar ajuste por curva em governador; use somente a extrapolacao municipal, com faixa mais larga e criterios mais rigidos (5.4).
- Governador tem 1 fonte por UF; rotulos de partido/candidato devem vir do proprio JSON (`nmu`, numero), nao de constantes `13/22`.

### 5.4 Criterios minimos objetivos para publicar projecao (proposta; nunca forecast sem base)

A projecao so e exibida se **todas** as condicoes forem verdadeiras; caso contrario exibir apenas o parcial e o texto "Projecao indisponivel: <motivo>".

| # | Criterio | Presidente 2T | Governador 2T (por UF) |
|---|---|---|---|
| C1 | Arquivo valido do TSE para a abrangencia, com `t=2`, `ele` esperado, `vvc>0`, `e.est>0` | 28/28 abrangencias com leitura **nao `stale`** e `dg/hg` com ate 5 min de idade | UF com leitura nao `stale` |
| C2 | Apuracao minima (% de **secoes**) | BR >= **10%** e cada UF projetada com >= 5% (UF abaixo entra no fallback e e sinalizada); abaixo disso so mostrar parcial | UF >= **20%** e >= **50%** dos municipios com algum voto |
| C3 | Dispersao temporal | diferenca entre o arquivo mais antigo e o mais novo <= 5 min (o 1T chegou a ~3,5 min) | n/a |
| C4 | Consistencia | `candidato1 + candidato2 = vvc` (+-0,01%); `est <= te`; `sum(vap) <= vvc` | idem |
| C5 | Rotulo de confianca por nivel de apuracao: "baixa" (<25%), "media" (25-70%), "alta" (>70%) | exibir sempre junto da projecao | idem |
| C6 | Margem de erro empirica | **calibrar em backtest antes do dia 25/10**: usar a curva de 2022 2T (e o 1T 2026 so como teste do metodo) para publicar uma faixa de erro por faixa de % apurado, no lugar do +-2 p.p. arbitrario | idem, calibrado por simulacao em 2022 se existir historico (nao determinado) |
| C7 | Nunca declarar vencedor: so "tendencia" quando a margem projetada excede a faixa de erro da C6; caso contrario "indefinido" | | |
| C8 | Fallback para UF sem eleitorado totalizado deve ser **marcado na tabela** e, se afetar > 5% do eleitorado total, desligar a projecao | | |

Calibracao sugerida de partida (ESTIMATIVA MINHA, a ser confirmada): a faixa de erro nao deve ser menor que a diferenca historica da curva de 2022 2T, que a 50% apurado ainda movia ~1,2 p.p. e a 90% ~0,4 p.p. do candidato; no 1T 2026 o modelo por UF errou 0,74 p.p. em 64,8% e o `t=2` nao cobriu.

### 5.5 Ajuste pela curva de 2022 2T (opcional, requer teste antes de ligar)

`proj_L = obs_L + (L_final_2022 - L_2022(%apurado))` e `proj_B = 100 - proj_L` (2 candidatos). Funcionou muito bem no 1T 2026 (erro 0,13 p.p. a 64,8%), porem com 1 eleicao de teste e padrao de apuracao similar; no 2T 2022 vs 2T 2026 nao ha como validar antes da eleicao. Sugestao: exibir as duas estimativas lado a lado ("extrapolacao por eleitorado" e "ajuste pela curva de 2022") e divulgar somente a primeira como headline ate haver evidencia ao vivo; a divergencia entre as duas e, em si, um indicador de incerteza.

---

## 6. Lacunas / nao determinado

- Codigo do `/api/live` (como busca, cache, regras de `stale`, persistencia e dedupe do `history`) e script que gerou a timeline de 2022: **nao determinado**.
- Historico oficial de totalizacao 2026 por UF: **inexistente** (404/sem recurso); validacao do modelo por UF restrita a 1 ponto.
- Cadencia oficial de atualizacao dos JSON do TSE em 2026: **nao determinado** (so observada).
- Lista oficial de UFs com 2T de governador e historico de governador de 2022: **nao determinado** (6 UFs com arquivo `6260`).
- Taxa 1T->2T de transferencia de votos em 2026: **nao determinada**.
- Faixa de erro calibrada para o 2T: **a calcular** (C6).
