# Backfill da apuração parcial do 1º turno 2026 (replay)

Dataset sintético que reconstrói, a partir dos boletins de urna (BU) do TSE, como a apuração parcial do 04/10/2026 evoluiu. Serve para validar às cegas um modelo de projeção. Este documento não avalia o modelo.

Todo JSON de replay tem o campo extra `"_sintetico_backfill": true`.

## 1. Fonte e método

- Fonte: pacote `resultados-2026-boletim-de-urna` (API CKAN do TSE). São 28 zips (27 UFs + `ZZ` exterior), todos `bweb_1t_<UF>_051020261403.zip`, gerados em 05/10/2026 14:03. Só GET, sequencial, sem paralelismo.
- Processamento em streaming: `unzip -p | grep -E` (só `CD_CARGO_PERGUNTA` 1 e 3) e agregação em Python. Governador só para AC, AM, DF, ES, RN e TO. Os zips foram apagados após a agregação.
- Granularidade: uma linha por (cargo, UF, município TSE, zona, seção). A chave da agregação é essa; não houve duplicata de BU, de votável nem mais de um `DT_BU_RECEBIDO` por seção. Todos os BU são `DS_TIPO_URNA = Apurada`.
- `DT_BU_RECEBIDO` existe em todas as linhas, inclusive no exterior (`ZZ`), no formato `AAAA-MM-DD HH:MM:SS`. Intervalo: 04/10 17:08:44 a 05/10 02:58:30.
- Fuso horário: assumido horário de Brasília. Indício: no AC o `DT_ENCERRAMENTO` das seções é 15:01 (horário local) e o primeiro BU do AC chega às 17:08. Se `DT_BU_RECEBIDO` fosse horário local, o primeiro BU seria às ~15:0x. Não há documentação explícita confirmando (não confirmado).
- Seções agregadas: `DS_SECOES_AGREGADAS` lista seções que votaram juntas sob o BU da seção principal. O `s.ts` oficial de cada UF é igual ao número de BUs da UF (conferido nas 27 UFs), então as agregadas não contam à parte.
- Nulos técnicos (`vnt`): o BU traz 95 (branco), 96 (nulo) e um número extra que não é candidato (presidente 28; governador DF 55, RN 50, TO 35). Inferi que é o nulo técnico porque o total bate exatamente com o `v.vnt` oficial (BR 5.246; DF 8.456; RN 2.151; TO 1.027).

### Construção dos snapshots

- Grade: a cada 1 min de 17:00 a 20:00 (181 pontos) e a cada 5 min de 20:05 a 03:00 (84 pontos). Total 265 snapshots (`HHMM` de 1700 a 0300; os de 0000 a 0300 são de 05/10, a data fica em `dg`).
- Um snapshot em T inclui todo BU com `DT_BU_RECEBIDO <= T`. `dg`/`hg` = T (segundos 00). `dt`/`ht` = horário do último BU incluído no escopo (vazio se nenhum).
- Os campos vêm do arquivo oficial final como molde (candidatos, federações, vice etc.). O que muda por snapshot: `s.*`, `e.*`, `v.*`, `vap`/`pvap`/`pvapn`/`tvtn`/`tvan` por candidato, `seq`, `e`/`st`, `dt`/`ht`, `tf`, `and`.
- Formatos de número: igual ao oficial (vírgula decimal; `pvap` com 2 casas, `*n` com até 9 casas e sem zeros à direita).
- Código de geração e validação: `/Users/diego/Claude/segundo-turno/backfill/1t2026/scripts/` (`agg_uf.py`, `run_all.sh`, `build_csv.py`, `build_replay.py`, `validate_a.py`, `validate_b.py`).

### Premissas de campos parciais (NÃO confirmadas contra o TSE, só inferidas)

| Campo | O que fiz | Confirmado? |
|---|---|---|
| `s.st`, `s.si`, `s.sa` | nº de BUs recebidos até T | Sim no final por UF. No BR final há diferença de 42 seções (ver 3a) |
| `s.ts`, `e.te` | totais do arquivo oficial final (UF/BR); `ZZ` = BR menos a soma das 27 UFs; município = soma dos BUs | Município conferido só em `ac01392` |
| `e.est` | soma de `QT_APTOS` dos BUs recebidos | Hipótese |
| `e.pc`, `e.pa` | `c / est` e `a / est` (eleitorado já totalizado) | Hipótese. Só coincide com o oficial no final |
| `v.tv` | soma de todos os votos dos BUs recebidos | Final confere |
| `v.vn` / `v.vnt` | `vn` = nulos (96); `vnt` = número extra; `tvn` = soma | Final confere |
| `v.van`, `v.vansj`, `vsan`, `vscv` | sempre 0 | Errado em DF (`vansj` oficial 1.843) e RN (227) |
| `and` / `tf` | `"n"/"n"` sem BU; `"p"/"n"` em parcial; `"f"/"s"` quando todos os BUs do escopo entraram | `"p"` é presumido; o TSE não documenta |
| `e` / `st` por candidato | `"n"` e `""` em parcial; valores do oficial quando o escopo completa | Hipótese |
| `seq` | ranking por votos no snapshot. Nos arquivos UF/ZZ/município de presidente = ranking nacional (BR) do mesmo snapshot; no município de governador = ranking da UF | Confirmado só no final (nos oficiais o `seq` da UF é o ranking nacional) |
| `idg` | `"0"` (sintético) | n/a |

Arquivos municipais de governador só são gerados a partir do primeiro BU do município (antes disso o arquivo não existe). Não sei como o TSE serviria um município sem BU (404 ou zeros).

## 2. Volumes

CSVs por seção (`/Users/diego/Claude/segundo-turno/backfill/1t2026/`):

| Arquivo | Seções | Tamanho |
|---|---|---|
| `secoes-presidente.csv.gz` (27 UFs + ZZ) | 499.206 | 10,8 MB |
| `secoes-governador-ac.csv.gz` | 2.270 | 43 KB |
| `secoes-governador-am.csv.gz` | 8.157 | 166 KB |
| `secoes-governador-df.csv.gz` | 6.969 | 141 KB |
| `secoes-governador-es.csv.gz` | 9.844 | 184 KB |
| `secoes-governador-rn.csv.gz` | 8.115 | 164 KB |
| `secoes-governador-to.csv.gz` | 4.384 | 87 KB |

Colunas: `uf, cd_municipio, nm_municipio, zona, secao, dt_bu_recebido, aptos, comparecimento, secoes_agregadas, v_<NR>... , brancos, nulos`. `nulos` = coluna 96; o nulo técnico aparece como a coluna `v_<NR>` do número extra (presidente `v_28`; governador DF `v_55`, RN `v_50`, TO `v_35`).

Replay (`replay/`):

- `presidente/<HHMM>/{br, <27 uf>, zz}-c0001-e006257-u.json`: 265 snapshots x 29 arquivos = 7.685 arquivos.
- `governador/<uf>/<HHMM>/<uf>-c0003-e006259-u.json` (UF) e `<uf><cd5>-c0003-e006259-u.json` (município): 106.838 arquivos. Municípios por UF: AC 22, AM 62, DF 1, ES 78, RN 167, TO 139.
- Total: 114.523 arquivos, ~612 MB (bytes aparentes; `du` mostra ~895 MB por causa do tamanho de bloco).

## 3. Validação de fidelidade

### (a) Último snapshot (0300) vs resultado final oficial (fixtures 6257/6259)

Resultado: **votos por candidato com diferença 0 em todos os casos**.

- Presidente BR: 12 candidatos, 0 diferenças. 27 UFs: 12 candidatos cada, 0 diferenças (324 comparações).
- ZZ: não há arquivo oficial. O snapshot final de ZZ bate exatamente com BR menos a soma das 27 UFs oficiais, nos 12 candidatos.
- Governador (AC, AM, DF, ES, RN, TO): 0 diferenças em todos os candidatos. Município `ac01392` (governador): 0 diferenças, e `s.ts`/`e.te` também batem.
- `v.tv`, `v.vvc`, `v.vb`, `v.tvn`, `v.vn`, `v.vnt`, `e.c`, `pvap`, `seq` e `e`/`st` batem em todos os 35 arquivos comparados (BR, 27 UFs, 6 UFs de governador, 1 município).
- Integridade interna: em todos os 538.945 registros seção x cargo, a soma dos votos é igual a `QT_COMPARECIMENTO`.
- Diferenças em campos não-voto, explicadas:
  - BR `s.st`: 499.206 contra 499.248 oficial, 42 seções a menos. São seções sem BU (provavelmente não instaladas, no exterior: o `ts` de ZZ derivado é 1.351 contra 1.309 BUs). `pst` final do replay = 99,9916%, não 100%.
  - BR `e.est`: 158.745.007 contra 158.745.502 (-495 eleitores) e `e.a` 33.469.172 contra 33.469.244: mesma causa.
  - BR `s.si`/`s.sni`: 499.206/42 contra 499.207/41 oficial. Diferença de 1 que **não consegui explicar**.
  - `v.vansj` DF (1.843) e RN (227): o BU não permite separar esses votos, ficou 0.
- Os 12 candidatos de presidente batem; o BU não traz candidatos extras além do nulo técnico (28).

### (b) Série reconstruída do BR vs série real ao vivo (190 pontos, `live.json` `history`)

A série real vai de 04/10 18:48:59 (47,26%) a 05/10 12:51:47 (100%). Não há ponto real entre 17:00 e 18:48, então essa fase não foi validada.

Três pareamentos, porque o `sectionsCounted` real conta 499.248 seções e só existem 499.206 BUs (as 42 seções sem BU entram na contagem real em instante desconhecido).

**1. Mesmo % de seções** (k-ésimo BU por `DT_BU_RECEBIDO`, k = `sectionsCounted` real; mais fiel à instrução, mas enviesado pelas 42 seções):

| Métrica (recon - real) | média | mediana | máx. absoluto |
|---|---|---|---|
| Lula, p.p. nos válidos | +0,0023 | +0,0021 | 0,0265 (ponto de 19:14:08, 64,8%) |
| Flávio, p.p. nos válidos | -0,0019 | -0,0017 | 0,0217 (mesmo ponto) |
| Lula, votos | +6.664 | +6.819 | 14.106 |

O sinal é sistemático: com a mesma contagem, o recon já tem ~40 BUs a mais que o real (as 42 seções sem BU), então Lula fica ligeiramente à frente. A defasagem de horário calculada neste pareamento é inválida acima de ~499.160 seções (mediana -0,7 min, mínimo -209 min), porque o contador real passa a incluir seções sem BU.

**2. Mesmo horário** (estado reconstruído em `totalizedAt` vs ponto real):

- % de seções (recon - real): mediana -0,006 p.p. (o -0,008 é o efeito das 42 seções), p90 +0,43 p.p., **máximo +9,87 p.p. às 19:14:08**. Ou seja, no início o recon está à frente: o BU já chegou, mas o TSE ainda não tinha totalizado.
- Lula: mediana +0,0005 p.p., máx. 0,54 p.p.; Flávio: mediana -0,0004 p.p., máx. -0,51 p.p. (ambos no começo, quando o recon está adiantado).

**3. Mesmos votos válidos reais** (pareia o prefixo de BUs cujos válidos mais se aproximam do `validVotes` real; robusto às 42 seções):

- **115 dos 190 pontos reais coincidem exatamente, ao voto, com um prefixo da ordem por `DT_BU_RECEBIDO`**. Os outros 75 diferem em até 148 votos válidos (média de |diferença| = 25 votos, em 119 milhões).
- Lula: mediana 0,0000 p.p., p5 -0,0005, p95 +0,0036, máx. 0,0281. Flávio: mediana 0,0000, p5 -0,0030, p95 +0,0005, máx. 0,0230. Os máximos estão nos primeiros pontos (<95% das seções).
- Defasagem (`totalizedAt` menos `DT_BU_RECEBIDO` do último BU do prefixo): mediana 0,45 min, p5 0,23, p95 2,57. Por faixa:
  - até 95% das seções (26 pontos): mediana 2,4 min, p90 4,5, máx. 10,2 (19:14:08).
  - 95 a 99,9% (96 pontos): mediana 0,3 min, p90 0,6, máx. 1,3.
  - 99,9 a 100% (66 pontos): mediana 0,6 min, p90 1,0, máx. 3,5.
  - Os dois últimos pontos a 100%: 02:59:31, 1,0 min depois do último BU (02:58:30), e o arquivo final de 12:51:47, 593 min depois (publicação da totalização final, não é recebimento de BU).
- Seções reais menos prefixo de BUs: mediana 42, p5 34, p95 43. Isso quantifica as seções sem BU já contadas no real. O mínimo de -73 e o máximo de 52 vêm de pontos iniciais, onde o pareamento por votos é menos preciso.

**Conclusão sobre a ordem**: a ordem por `DT_BU_RECEBIDO` reproduz a ordem real de totalização com erro de no máximo ~0,03 p.p. nos candidatos e ~150 votos válidos em 119 milhões. A principal divergência é de horário, não de ordem. O TSE totaliza ~0,2 a 1 min depois do recebimento no fim da apuração e até ~10 min depois no começo (fila de BUs).

Observações: até 194 BUs compartilham o mesmo segundo de `DT_BU_RECEBIDO`; a ordem entre eles é arbitrária (ordem do arquivo) e explica parte dos desvios pequenos. Os pontos reais são irregulares (mediana 1 min entre pontos, máx. 592 min).

## 4. Limitações

1. Sem série real de 17:00 a 18:48; a fase inicial do replay é validada só por coerência interna e pelo final.
2. Não confirmado: fuso do `DT_BU_RECEBIDO` (assumido horário de Brasília), semântica de `pc`/`pest`/`pa` em parcial, valor de `and` em parcial ("p"), `e`/`st` em parcial, e se o arquivo municipal existe antes do primeiro BU.
3. As 42 seções sem BU nunca entram: o replay termina em 99,9916% de seções, não em 100%. Não sei em que instante o TSE as totalizou.
4. `vansj`/`van`/`vsan`/`vscv` ficam 0 (DF e RN têm `vansj` oficial > 0 no final).
5. Para `ZZ`, `ts`/`te` oficiais são derivados (BR menos UFs). Para município, `ts`/`te` vêm dos BUs (conferido só em `ac01392`).
6. Presidente por município não foi gerado (não pedido). Governador só para 6 UFs. Os snapshots de município só existem após o primeiro BU.
7. O replay usa o BU final como verdade: não contém retotalizações, seções anuladas ou recuperadas posteriores. Todos os BUs são `Apurada`; não há tipo de urna alternativo no pacote.
8. O pacote de BU é de 05/10 14:03; qualquer alteração posterior do TSE não está refletida (os votos batem com os fixtures oficiais salvos, que são os que tenho).
9. Houve um bug na 1ª passada (perda de ~8 KB de linhas no início do stream por buffer de leitura do cabeçalho; 121 seções com votos faltando, 608 votos no total). Foi corrigido (cabeçalho passa pelo mesmo `grep`) e todos os zips foram baixados e processados de novo. A conferência `soma dos votos == comparecimento` em 538.945 registros é o teste que pega esse tipo de erro.
