# Backtest do modelo de projeção do 2º turno 2026

Documento técnico. Números gerados por `model/backtest/replay.mjs` + `model/backtest/calibrar.mjs` em 24/10/2026 (relatório completo em `model/backtest/relatorio.json`; reprodução em `model/backtest/README.md`). Tudo o que é **simulação** ou **proxy** está marcado assim.

## 1. Pergunta e método

Pergunta: a cada instante da apuração, qual é o erro da projeção do modelo (participação do candidato A entre os dois finalistas, em pontos percentuais) em relação ao resultado final, e qual faixa cobre esse erro em ≥ 90% dos instantes?

Método: **replay com ordem real de chegada dos boletins de urna (BU) de 2022.** O TSE publica, por seção eleitoral, o campo `DT_BU_RECEBIDO` (horário em que o BU chegou ao TSE) junto com aptos, comparecimento e votos por candidato e cargo (`bweb_1t_<UF>_051020221321.zip`, `bweb_2t_<UF>_311020221535.zip`, dataset "resultados-2022-boletim-de-urna"). Ordenando as seções por esse horário reconstruímos a apuração parcial a cada 60 s, por UF, município e zona, e rodamos o **mesmo código** do modelo (`model/estratos.mjs`) em cada instante.

- Não existe histórico oficial de totalização por UF/município (o `Historico_Totalizacao_Presidente_BR_*_2022` é só nacional). O replay por BU é a melhor reconstrução disponível, mas é uma **aproximação**: a ordem de recepção do BU não é idêntica à ordem de totalização nem ao horário em que o arquivo `-u.json` da UF é gerado (há atraso de minutos). Marcamos isto como **PROXY DE ORDEM**.
- Seções do exterior (ZZ) sem horário (573 de 1.018 no 2T; 455 no 1T) entram só no resultado final.
- Totais do bweb batem com o oficial a menos de votos anulados sub judice (ex.: AC 2T Bolsonaro 70,30% no bweb vs 70,33% oficial; nacional 2T Lula 50,902% vs 50,90%).
- Instantes com 0% apurado são descartados. Erro = projeção − final, em p.p. da participação do candidato A **entre os dois finalistas** (nos testes de 1º turno, A e B são os dois primeiros colocados; a participação é entre eles, não sobre todos os válidos).
- **Dados do 1º turno de 2026 não foram usados** em nenhuma etapa (calibração ou escolha). Ficam como holdout para validação independente.

## 2. Corridas avaliadas (todas de 2022, ordem real por BU)

| Conjunto | Corridas | Estratos | Uso |
|---|---|---|---|
| `presidente_2t` | 2º turno presidente (Lula × Bolsonaro) | 28 (27 UFs + ZZ), baseline = 1º turno 2022 por UF | escolha de variante + faixa `presidente` |
| `presidente_1t` | 1º turno presidente (sem baseline anterior; só o modelo sem prior) | 28 | faixa `presidente` (máximo) |
| `gov_2t_<UF>` | 2º turno governador em 12 UFs: AL(102 mun.), AM(62), BA(417), ES(78), MS(79), PB(223), PE(185), RO(52), RS(497), SC(295), SE(75), SP(645); baseline = 1º turno 2022 por município | municípios | escolha de variante + faixa `governador` |
| `pres2t_uf_<UF>` | **PROXY**: 2º turno presidente dentro de cada UF (26 UFs), estratos = municípios, baseline = 1º turno por município. Simula uma corrida estadual de 2 candidatos nas UFs que não tiveram 2º turno de governador em 2022 (inclui AC, AM, ES, RN e TO) | municípios | faixa `governador` |
| `pres2t_zonas_DF` | **PROXY**: 2º turno presidente no DF, estratos = 19 zonas | zonas | faixa `governador_zonas` |
| `*_ufunico_*` | as mesmas 39 corridas estaduais com **um único estrato** (= participação parcial da UF) | 1 | faixa `governador_uf` (modo degradado) |
| `gov_1t_<UF>`, `gov_1t_zonas_DF` | 1º turno governador (26 UFs + DF por zona), sem prior, 2 primeiros colocados | municípios/zonas | verificação secundária |

Total: 7.752 instantes avaliados (≥ 10% apurado) no conjunto `governador` (38 corridas), 404 no `presidente` (2T) e 1.495 (1T).

## 3. Escolha da variante (critério: MAE médio por faixa de apuração, ≥ 10% apurado)

Variantes testadas sobre o modelo estratificado do 1º turno (pendentes = eleitorado não totalizado × válidos por eleitor; divisão = participação já observada no estrato):

| Variante | Estrato sem apuração | Estrato com apuração | MAE governador (38 corridas) | MAE presidente 2T |
|---|---|---|---|---|
| `M0_1T` (modelo do 1º turno) | participação agregada atual (taxa nacional/UF) | observado | 0,615 | 0,515 |
| **`M1_prior` (escolhida)** | **participação do 1º turno 2026 dos dois finalistas + swing observado (logit, ponderado por votos)** | observado | **0,424** | 0,515 |
| `M1_prior_turnout` | idem + pendentes pela taxa de válidos do 1º turno do estrato | observado | 0,426 | 0,515 |
| `M2_enc25/50/100` | idem M1 | encolhido para o prior enquanto o estrato tem < 25/50/100% apurado | 0,415 / 0,417 / 0,417 | 0,541 / 0,540 / 0,529 |

MAE por faixa, governador, `M0_1T` → `M1_prior` (p.p.): 10-20%: 1,52 → 1,07 · 20-30: 1,34 → 0,87 · 30-40: 1,18 → 0,81 · 40-50: 0,99 → 0,75 · 50-60: 0,78 → 0,55 · 60-70: 0,61 → 0,41 · 70-80: 0,43 → 0,28 · 80-90: 0,27 → 0,16 · 90-95: 0,16 → 0,10 · 95-98: 0,08 → 0,06.

Decisões:
- **(a) prior do 1º turno + swing: ADOTADO.** Reduz o MAE em 31% nas corridas estaduais, onde municípios inteiros ficam sem apuração por muito tempo. No presidente não muda nada acima de 10% (as 28 abrangências têm votos em minutos), e não piora.
- **Encolhimento (M2): REJEITADO** por parcimônia: ganho de 0,009 p.p. no MAE médio (regra: fica a variante mais simples a até 2,5% do melhor), e piora nas faixas 5-20% e 70-95%.
- **Pendentes pela taxa de válidos do 1º turno: REJEITADO** (sem ganho).
- **(b) ajuste pela curva de totalização de 2022: REJEITADO para a projeção publicada.** O modelo estratificado por UF tem viés sistemático no presidente (Lula subprojetado enquanto o interior do Nordeste chega por último): erro médio do `M1_prior` no 2T 2022 de −0,77 (10-20%), −0,83, −0,98, −0,90, −0,77, −0,66, −0,53, −0,33 (80-90%), −0,21, −0,12, −0,06 (98-99,5%); no 1T 2022: −2,23, −2,17, −1,90, −1,59, −1,31, −1,06, −0,85, −0,67, −0,41, −0,25, −0,09. Teste cruzado do ajuste aditivo: curva ajustada no 2T e aplicada ao 1T reduz o MAE (10-20%: 2,23 → 1,46; 60-70%: 1,06 → 0,40), mas curva ajustada no 1T e aplicada ao 2T **piora** até 30% (10-20%: 0,77 → 1,46; 20-30%: 0,83 → 1,34) e só melhora de 30% a 98%. A magnitude do viés muda de turno para turno (fator ~2), então o ajuste pode sobrecorrigir. Em vez de corrigir, a faixa de erro do presidente usa o **máximo** observado nos dois turnos, que cobre o viés. A curva de 2022 segue disponível só para comparação visual.
- **(c) governador estratificado por município: ADOTADO**; DF estratificado por **zona eleitoral** (19 zonas; arquivos `df97012-z<zona>-c0003-e006260-u.json` existem no TSE e foram verificados).

## 4. Faixa de erro calibrada (meia-largura, p.p. da participação do candidato; faixa da margem = 2×)

Regras: `governador` (38 corridas) = quantil 90% pooled do |erro| por faixa; `presidente` e `governador_zonas` (1 corrida de 2º turno cada) = |erro| **máximo** observado em 2022 nos dois turnos, porque um quantil de uma única trajetória autocorrelacionada não é cobertura de 90%; `governador_uf` (estrato único) = máximo (o quantil 90% deixou 72 chamadas erradas de vencedor no AM-2022, margem final 2,2 p.p.). Faixas forçadas a não crescer com mais apuração; piso 0,05.

| % do eleitorado apurado | presidente (máx. 2T / 1T) | governador (q90; máx.) | governador por zonas (DF) | governador estrato único |
|---|---|---|---|---|
| 10-20 | **2,29** (0,86 / 2,29) | **2,10** (máx. 5,46) | 0,46 | 10,74 |
| 20-30 | **2,28** (0,98 / 2,28) | **1,74** (3,67) | 0,36 | 8,61 |
| 30-40 | **2,07** (1,01 / 2,07) | **1,62** (3,30) | 0,33 | 7,01 |
| 40-50 | **1,73** (0,95 / 1,73) | **1,45** (2,76) | 0,33 | 5,49 |
| 50-60 | **1,41** (0,84 / 1,41) | **1,23** (2,07) | 0,33 | 4,74 |
| 60-70 | **1,19** (0,72 / 1,19) | **0,95** (1,45) | 0,21 | 4,31 |
| 70-80 | **0,94** (0,61 / 0,94) | **0,65** (1,08) | 0,21 | 3,59 |
| 80-90 | **0,77** (0,42 / 0,77) | **0,39** (0,74) | 0,20 | 2,52 |
| 90-95 | **0,51** (0,26 / 0,51) | **0,25** (0,35) | 0,13 | 1,39 |
| 95-98 | **0,32** (0,16 / 0,32) | **0,15** (0,29) | 0,06 | 0,85 |
| 98-99,5 | **0,17** (0,09 / 0,17) | **0,07** (0,18) | 0,06 | 0,44 |
| 99,5-100 | 0,05 | 0,05 | 0,05 | 0,11 |

Abaixo de 10% (presidente) e 20% (governador) a projeção não é publicada (seção 6), por isso as faixas 0-10% não aparecem (ficam na tabela de `model/calibracao.mjs` só por completude).

## 5. Cobertura e chamadas de vencedor (instantes com ≥ 10% apurado; "chamada" = margem projetada > faixa da margem)

| Conjunto | Corridas | Instantes | Cobertura média por corrida | Corridas com cobertura ≥ 90% | Chamadas | Chamadas **erradas** |
|---|---|---|---|---|---|---|
| presidente 2T 2022 (`M1_prior`) | 1 | 404 | 100% | 1/1 | 308 | **0** |
| presidente 1T 2022 (`M0`, faixa `presidente`) | 1 | 1.495 | 100% | 1/1 | 1.432 | **0** |
| governador (12 gov. 2T + 26 proxies presidente-na-UF) | 38 | 7.752 | 94,0% (mín. 62,4%) | 31/38 | 7.530 | **0** |
| governador por zonas (DF, proxy) | 1 | 169 | 100% | 1/1 | 169 | **0** |
| governador estrato único (faixa máx.) | 39 | 7.921 | 100% | 39/39 | 6.798 | **0** (72 com q90) |
| verificação secundária: gov. 1T 2022 sem prior, 2 primeiros | 26 | 9.788 | 82,6% | 14/26 | 9.726 | **0** |

Cobertura por corrida abaixo de 90% no conjunto governador: SE 2T (62%, margem final 3,4 p.p., viés do interior), PI (70%), RR (70%), MS (70%), MA (77%), AM-presidente (79%), CE (87%). As piores são corridas com margens enormes (40-54 p.p.), em que o erro é grande mas irrelevante para o vencedor. Cobertura de 100% no presidente e no DF é **em amostra** (a faixa é o máximo dessas mesmas trajetórias) e não deve ser lida como garantia.

Momento da primeira chamada correta (% do eleitorado) nas corridas apertadas: AP-presidente (margem −2,7) a 64,6%; MG-presidente (0,4) a 95,1%; AM-presidente (2,2) a 10,2%; TO-presidente (2,7) a 11,8%; AL governador (4,7) a 20,2%; RO governador (4,9) a 25,6%; SE governador (3,4) a 10,0%. Presidente 2T 2022 (margem final 1,8): o valor central do modelo passou a mostrar Lula na frente de forma definitiva a partir de 44,2% do eleitorado (na curva nacional bruta a liderança só mudou entre ~65% e 75% das seções, cf. `docs/MODELO-1T-ENGENHARIA-REVERSA.md` §4.5); a primeira chamada (margem projetada > faixa da margem) só ocorreu a **90,3%** do eleitorado, e em nenhum instante houve chamada para Bolsonaro. Ou seja: numa disputa apertada como a de 2022 a faixa do presidente é conservadora e a "tendência" chega tarde, por desenho.

## 6. Critérios mínimos (justificativa pelos números)

- Presidente: ≥ 10% do eleitorado apurado → faixa 2,29 (margem 4,6 p.p.). Governador: ≥ 20% → faixa 1,74 (margem 3,5). Abaixo disso a faixa supera 2,3/2,1 p.p. e só cresce.
- ≥ 50% dos estratos com algum voto; ≤ 0% (presidente) / ≤ 2% (governador) do eleitorado sem arquivo válido; ≤ 5% do eleitorado projetado pela taxa agregada (sem baseline); 0% sem base; leituras preservadas 0%/≤ 2%; arquivos a ≤ 5 min de distância entre si e ≤ 5 min de idade. Lista completa e valores: `model/criterios.mjs`, `docs/METODOLOGIA.md`.

## 7. Limitações (leia antes de confiar)

1. **Uma eleição de calibração (2022).** A faixa do presidente vem de 2 trajetórias (1T e 2T 2022); a do governador, de 38 corridas, mas 26 delas são proxies (presidente dentro da UF). O 2º turno de 2026 pode ter ordem de apuração e geografia de voto diferentes (Flávio Bolsonaro não é Jair Bolsonaro; os governadores de 2026 não são os de 2022).
2. **Ordem = recepção do BU (proxy).** O horário em que o TSE gera os arquivos `-u.json` fica alguns minutos atrás e varia por UF. O replay não simula `stale`, atraso de arquivo nem dispersão de horários.
3. **Faixas em amostra.** `presidente`, `governador_zonas` e `governador_uf` usam o máximo observado nos próprios dados; `governador` usa o q90 pooled, com cobertura média de 94% mas 7 corridas abaixo de 90%.
4. **Viés sistemático não corrigido.** No presidente, o modelo subestima Lula no meio da apuração em 2022 (até −1,0 p.p. de média). A faixa cobre, mas o ponto central tende a estar deslocado nessa direção se o padrão se repetir.
5. **Holdout.** O 1º turno de 2026 não foi usado; a validação às cegas com os BUs de 2026 (bweb 2026) fica a cargo de outro agente. O ponto do 1º turno 2026 citado em `docs/MODELO-1T-ENGENHARIA-REVERSA.md` (erro −0,74 p.p. a 64,8%) é compatível com a faixa `presidente` de 1,19 (60-70%), mas isso não é teste.
6. **Governador 2026 em UFs sem histórico de 2º turno** (AC, DF, RN, TO) foi avaliado só por proxy presidencial; AM e ES têm corridas reais de governador 2022.
7. O bweb exclui votos anulados sub judice (diferenças ≤ 0,03 p.p. nos finais).

## 8. Rodada v3 (24/10): deriva das urnas tardias — modelos B e C, holdout real do 1º turno 2026

Pergunta do Diego: as urnas que chegam por último favorecem Lula de forma sistemática; dá para projetar isso? Diagnóstico confirmado em três eleições (erro do modelo A, Lula entre os dois, p.p.): 1T 2022 −2,23 (10-20%) … −0,41 (90-95%); 2T 2022 −0,77 … −0,21; **1T 2026 (holdout) −2,32 … −0,34**. O perfil do 1T 2026 é quase idêntico ao do 1T 2022, e o do 2T 2022 tem a metade da amplitude: a deriva é estável **dentro do mesmo tipo de turno**.

**Holdout real:** reconstrução do 1T 2026 a partir dos boletins de urna oficiais (`backfill/1t2026/secoes-presidente.csv.gz`, 499.206 seções com `DT_BU_RECEBIDO`), convertida para eventos por `model/backtest/tools/csv2026_to_events.py`. Nenhum número do 1T 2026 entrou na estimativa das curvas; só em (i) validar a transferência entre eleições e (ii) dimensionar a faixa pós-correção (declarado abaixo).

Modelos avaliados (todos com o mesmo código, `model/estratos.mjs` + `model/correcao.mjs`):
- **A** = v2 (28 UFs, prior do 1T + swing).
- **B** = presidente com **estratos municipais** (5.716 municípios), voto pendente de cada município pela participação do turno anterior naquele município + swing. No backtest 2022: baseline 1T 2022 → 2T 2022. No holdout: baseline 2T 2022 → 1T 2026 (quatro anos de distância, teste **mais difícil** que o uso real, cuja baseline é o 1T 2026, três semanas antes). Swing hierárquico (município → UF → região → BR, encolhimento com K = 20 mil, 100 mil e 500 mil votos) **não** superou o swing global; fica o global (mais simples).
- **C** = correção aditiva da deriva: curva do erro médio do modelo por % do eleitorado apurado (bins de 5%, interpolação linear), estimada no **mesmo tipo de turno de 2022**, subtraída da projeção. Produção (2T 2026) usa a curva do 2T 2022. Validação fora da amostra: curva do 1T 2022 aplicada ao 1T 2026.
- **B+C**: C sobre B. Para o holdout só existe a curva de B no 2T 2022 (não há baseline anterior ao 1T 2022), então o teste do B+C é **cruzado** (turno diferente) e mais fraco.

### 8.1 Holdout 1T 2026 — erro de Lula (proj − final, p.p. da participação entre os dois), por % do eleitorado apurado

| Faixa | A: viés / MAE | B: viés / MAE | **A+C: viés / MAE** | B+C (curva cruzada): viés / MAE |
|---|---|---|---|---|
| 10-20 | −2,32 / 2,32 | −0,36 / 0,36 | **−0,09 / 0,12** | −0,36 / 0,36 |
| 20-30 | −1,90 / 1,90 | −0,58 / 0,58 | **+0,26 / 0,26** | −0,29 / 0,29 |
| 30-40 | −1,60 / 1,60 | −0,52 / 0,52 | **+0,28 / 0,28** | −0,11 / 0,13 |
| 40-50 | −1,31 / 1,31 | −0,32 / 0,32 | **+0,26 / 0,26** | +0,11 / 0,11 |
| 50-60 | −1,10 / 1,10 | −0,34 / 0,34 | **+0,23 / 0,23** | +0,07 / 0,07 |
| 60-70 | −0,88 / 0,88 | −0,30 / 0,30 | **+0,18 / 0,18** | +0,02 / 0,02 |
| 70-80 | −0,68 / 0,68 | −0,21 / 0,21 | **+0,17 / 0,17** | −0,01 / 0,02 |
| 80-90 | −0,49 / 0,49 | −0,16 / 0,16 | **+0,17 / 0,17** | −0,06 / 0,06 |
| 90-95 | −0,34 / 0,34 | −0,13 / 0,13 | **+0,09 / 0,09** | −0,07 / 0,07 |
| 95-99 | −0,15 / 0,15 | −0,05 / 0,05 | **−0,01 / 0,03** | −0,05 / 0,05 |
| Total ≥ 10% (590 instantes) | −0,33 / 0,33 | −0,09 / 0,09 | **+0,05 / 0,065** | −0,04 / 0,047 |

Leitura: a correção pela curva do mesmo tipo de turno (A+C) remove ~90% do viés; o resíduo troca de sinal (+0,2 a +0,3 p.p. entre 20% e 60%: a deriva de 2026 foi um pouco menor que a de 2022). B sozinho reduz o erro 3 a 6 vezes mesmo com baseline de quatro anos, mas mantém viés negativo (há deriva **dentro** dos municípios também). B+C é o melhor de 30% em diante, mas no holdout a curva não é do mesmo tipo de turno.

Em amostra (2022, para referência): B no 2T 2022 com baseline do 1T 2022 teve MAE 0,06 (10-20) / 0,31 / 0,42 / 0,43 / 0,41 / 0,32 / 0,20 / 0,10 / 0,05 — viés sempre negativo; A corrigido pela própria curva fica com dispersão residual ≤ 0,1-0,2 p.p.

### 8.2 Faixa de erro pós-correção e MAE esperado (produção, v3.1 após a revisão estatística independente)

Regra v3 (por faixa): **maior |erro corrigido| observado** (holdout 1T 2026 com curva 1T 2022; 2T 2022 e 1T 2022 corrigidos em amostra) **+ |viés de transferência| do holdout**. Justificativa: a única medida fora da amostra de "quanto a curva de uma eleição erra na seguinte" é o holdout (até 0,34 p.p. de erro, 0,28 de viés). Faixas só com os resíduos de 2022 (sem o holdout) seriam de 0,1-0,2 p.p. e **cobriram 69% do holdout (0% entre 20% e 90% apurado)**: a dispersão em torno da própria curva não mede a incerteza da transferência.

**Correção v3.1** (`docs/REVISAO-ESTATISTICA-V3.md` §2, obrigatória): a regra v3 ficou **sem nenhum teste independente** depois de incorporar o holdout (n efetivo por faixa 2-4, autocorrelação 0,44-0,94), e para 2º turno → 2º turno não existe par de validação. Faixa final = `max(regra v3, 0,75 × max|curva 2T 2022| na faixa)`, monotônica, piso 0,05 — gerada por `faixaPosCorrecao` em `model/backtest/analise.mjs`, não editada à mão. Tolera deriva do 2T 2026 entre 25% e 175% da de 2022 (o único par observado, 1T 2022 → 1T 2026, ficou em 80-104%). MAE exibido = `max(MAE observado, meia/2)` (razão faixa/MAE ≈ 2). `presidente_mun` e `presidente_sem_correcao` inalterados.

| % eleitorado apurado | **A+C v3.1 (`presidente`): meia-largura / MAE exibido** | regra v3 (antes da revisão) | B+C (`presidente_mun`, desligado): meia / MAE | v2 (`presidente_sem_correcao`) | MAE da parcial bruta |
|---|---|---|---|---|---|
| 10-20 | **0,752 / 0,38** | 0,61 / 0,12 | 0,99 / 0,50 | 2,29 | 4,45 |
| 20-30 | **0,752 / 0,38** | 0,61 / 0,26 | 0,75 / 0,38 | 2,28 | 3,94 |
| 30-40 | **0,752 / 0,38** | 0,58 / 0,28 | 0,35 / 0,17 | 2,07 | 3,48 |
| 40-50 | **0,702 / 0,35** | 0,54 / 0,26 | 0,31 / 0,15 | 1,73 | 3,19 |
| 50-60 | **0,604 / 0,30** | 0,47 / 0,23 | 0,16 / 0,08 | 1,41 | 2,81 |
| 60-70 | **0,513 / 0,26** | 0,38 / 0,18 | 0,14 / 0,07 | 1,19 | 2,33 |
| 70-80 | **0,431 / 0,22** | 0,37 / 0,17 | 0,14 / 0,07 | 0,94 | 1,86 |
| 80-90 | **0,368 / 0,18** | 0,37 / 0,17 | 0,14 / 0,07 | 0,77 | 1,42 |
| 90-95 | **0,213 / 0,11** | 0,21 / 0,09 | 0,14 / 0,07 | 0,51 | 0,87 |
| 95-98 | **0,089 / 0,05** | 0,09 / 0,05 | 0,13 / 0,06 | 0,32 | 0,46 |
| 98-99,5 | **0,058 / 0,05** | 0,06 / 0,05 | 0,08 / 0,05 | 0,17 | 0,15 |

Cobertura: a faixa foi **dimensionada com o holdout (em amostra)**; não há medida fora da amostra. No holdout, com a faixa v3.1: 100% dos 590 instantes, 530/547 chamadas de tendência a partir de 10% apurado, **0 erradas** (margem final do 1T 2026 entre os dois: −2,0 p.p.). Comportamento a conhecer: com A+C, o 2T 2022 (margem +1,8) teria tendência chamada desde 10,3% apurado (em amostra); com a v2, só a partir de 90,3%. Cenários não cobertos (revisão §4.2-4.3): deriva ausente (λ = 0) ou dobrada (λ ≥ 2) entre 10% e 70% — por isso o interruptor operacional `cfg.metodoPresidente = 'sem_correcao'` (faixa v2) existe, para ser acionado se até ~40% apurado a parcial bruta de Lula **não** estiver subindo com a apuração (em 2022 subiu ~1 p.p. entre 25% e 55%). `erro_medio_esperado = {projecao, parcial}` é exportado por faixa; para governador, MAE pooled das 38 corridas de 2022 com o mesmo `max(·, meia/2)` (1,05 em 10-20 … 0,13 em 90-95; parcial 2,72 … 0,30). **Calibração congelada** para 25/10: `model/calibracao.mjs` SHA-256 `09472377c7a0d3cc5abd2c6058f35b6a03ab45e2419c618007c4c446209b2593`; depois do resultado final, medir a cobertura real com o `history/` do coletor e registrar aqui.

Verificação extra no holdout (governadores 1T 2026, 6 UFs, sem prior, dois primeiros, faixa `governador`): cobertura AC 100%, AM 81%, DF 94% (zonas), ES 100%, RN 96% (margem final 1,07 p.p.), TO 100% (margem 1,77); 0 chamadas erradas.

### 8.3 Decisão e viabilidade de B

- **Produção (v3.0.0): A+C** como projeção publicada do presidente — exige só o que o coletor já busca (28 arquivos de UF). `forecast.sem_correcao` e `forecast.correcao_pp` expõem o bruto e o deslocamento aplicado; `erro_medio_esperado_pp` o MAE esperado.
- **B+C fica implementado e calibrado** (`metodo: 'presidente_mun'`, baseline municipal do 1T 2026 embutida a partir dos BUs oficiais, 5.716 municípios, soma idêntica aos totais do TSE) e liga automaticamente se o coletor passar `entrada.estratos` com os ~5.700 arquivos `<uf><cd5>-c0001-e006258-u.json`. Viabilidade da coleta: cada passada são ~5.700 GET (304 com `If-None-Match` ainda conta como requisição); no ritmo atual do coletor (4 req/s) uma passada leva ~24 min; para passadas a cada 5 min seriam ~19 req/s (o TSE anuncia `x-ratelimit-limit: 5000/s`, folga grande), e cada invocação do Worker precisa respeitar o limite de subrequests do plano (o valor publicado que conheço para o Workers Paid é 1.000 por invocação; o coordenador citou 10.000 — confirmar na conta antes de decidir), o que obriga a fatiar as passadas em várias invocações ou coletar só municípios com seções pendentes (a lista cai rápido depois de 70%). Dado o prazo (~36 h) e que o ganho de B+C sobre A+C no holdout aparece só de 30% em diante (e com curva cruzada), **recomendo não mudar a coleta agora**; se o coletor municipal for ligado em staging e validado, a troca é só de entrada.
- Governadores: sem mudança (não há curva por UF de 2022 para o mesmo tipo de disputa); faixas e MAE de 2022 mantidos.
- Risco residual declarado: a curva do 2T 2026 pode diferir da do 2T 2022 mais do que o 1T 2026 diferiu do 1T 2022 (candidato diferente). A faixa v3.1 (±0,75 até 40% apurado) admite deriva entre 25% e 175% da de 2022; fora disso o ponto central fica deslocado, e a "tendência" só é chamada quando a margem supera a faixa dobrada. Contingência: `cfg.metodoPresidente = 'sem_correcao'` (§8.2).

## 9. Reprodução

`model/backtest/README.md`. Em resumo: baixar os 56 zips bweb de 2022 (~1,5 GB; só GET, ≤ 2 req/s), `python3 -I model/backtest/tools/bweb2events.py <zip> <dir>` para cada um (filtra presidente/governador em streaming), `python3 -I model/backtest/tools/csv2026_to_events.py backfill/1t2026/secoes-presidente.csv.gz 1 <dir>` (holdout), `node model/backtest/replay.mjs <dir> replay.json 60`, `node model/backtest/calibrar.mjs replay.json model/backtest/relatorio.json --escrever-calibracao`. Tempo total: ~15 min de download e pré-processamento, ~70 s de replay.
