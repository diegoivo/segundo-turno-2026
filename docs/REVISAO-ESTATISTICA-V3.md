# Revisão estatística independente — modelo v3.0.0 (correção de deriva + faixa do presidente)

Revisor: sub-agent Fable, independente do worker que construiu a v3 (não editou `model/`). Data: 24/10/2026. Base: `model/backtest/relatorio.json` (gerado 2026-10-24T02:46Z), `docs/BACKTEST.md` §8, `docs/VALIDACAO-1T2026.md`, e o replay v3 (`replay_v3b.json`, 60 s, mesmo arquivo citado em `relatorio.fonte`). Nenhum dado novo foi baixado. Análises complementares: `model/backtest/tools/revisao-v3.mjs` (reprodução na §7).

Motivo da revisão (alerta do orquestrador): a faixa do presidente na v3 (±0,61 a 10-30%) foi dimensionada **usando o holdout do 1º turno de 2026**; a cobertura de "100% no holdout" declarada no BACKTEST §9.2 passou a ser em amostra. Perguntas respondidas: (1) a correção de deriva A+C é estatisticamente defensável? (2) a faixa da v3 é válida e qual é a cobertura honesta? (3) qual faixa recomendo? (4) o que muda nas chamadas de "tendência"? (5) o que mais deve mudar (MAE exibido, texto, salvaguardas)?

## 1. Veredito

**APROVADO COM CORREÇÕES OBRIGATÓRIAS.**

- **A correção A+C (ponto central) fica.** É a parte da v3 que tem validação fora da amostra de verdade: a curva do 1T 2022 aplicada ao 1T 2026 reduziu o MAE de 0,33 para 0,065 p.p. e o viés de −0,33 para +0,05, sem nenhum número de 2026 na curva. A deriva aparece com o mesmo sinal em 3 eleições e, no mesmo tipo de turno, com amplitude 2026/2022 entre 0,80 e 1,04 por faixa (§4.1). A deriva é um fato dos dados, não do modelo: está na parcial bruta nacional (−5,5 p.p. a 10-20% no 1T 2022, −4,6 no 1T 2026, −2,7 no 2T 2022), e a estratificação por UF só remove 30-60% dela.
- **A faixa da v3 não é validada fora da amostra e está otimista na primeira metade da apuração.** A única faixa pós-correção que foi testada às cegas (dimensionada só com 2022) cobriu **69%** do holdout e **0% entre 20% e 90% apurado** (`relatorio.holdout_1t2026.cobertura_faixa_so2022`). A v3 corrigiu isso incorporando o holdout — o que é legítimo como calibração, mas deixa a faixa final **sem nenhum teste independente**, e para o tipo de transferência que importa em produção (2º turno → 2º turno) existe **zero** par de validação. Os "590 instantes" do holdout são uma trajetória: a autocorrelação lag-1 do resíduo é 0,44-0,94 e o n efetivo por faixa é **2 a 4** (§4.4). "Cobertura 100%" aí significa "a única trajetória ficou dentro", não 90% de frequência.
- **Recomendação aplicável agora (tabela na §2):** alargar a faixa do presidente em 17-37% entre 10% e 80% apurado, pela regra `meia = max(regra v3, 0,75 × |curva 2T 2022| na faixa)`, monotônica, piso 0,05. A regra admite que a deriva do 2T 2026 fique entre 25% e 175% da de 2022 (a v3 admitia 40-160% nas faixas centrais; o 1T 2026 ficou em 80-104% da de 2022). Acima de 80% as faixas da v3 não mudam. **Não** recomendo voltar à faixa v2 (±2,3): ela protege contra um cenário implausível (deriva do 2T igual à do 1T) ao custo de só chamar tendência a 90% apurado numa disputa como a de 2022.
- **O "erro médio esperado" exibido na UI deve subir** para `max(MAE do holdout, meia/2)` — "±0,4 ponto" em vez de "±0,1" a 10-30% (§5). Dizer "erra em média ±0,1" com faixa de ±0,75 é inconsistente (razão 6:1; para cobertura ~90% a razão típica é ~2:1) e apoia-se em n efetivo ≈ 3.
- Governadores: sem mudança nas faixas (§4.5); ressalva de que AM teve 81% de cobertura no holdout e 7 das 38 corridas de 2022 ficaram abaixo de 90%, todas sem chamada errada.

## 2. Tabela de faixas recomendada (presidente, meia-largura em p.p. da participação do candidato; faixa da margem = 2×)

| % eleitorado apurado | v3 atual | **Recomendada** | Razão | Tolera deriva 2T26 / 2T22 em | v2 (sem correção) | Erro médio esperado: v3 → **recomendado** |
|---|---|---|---|---|---|---|
| 10-20 | 0,605 | **0,75** | 1,24 | [0,02 ; 1,98] | 2,29 | 0,12 → **0,38** |
| 20-30 | 0,605 | **0,75** | 1,24 | [0,17 ; 1,83] | 2,27 | 0,26 → **0,38** |
| 30-40 | 0,582 | **0,75** | 1,29 | [0,25 ; 1,75] | 2,07 | 0,28 → **0,38** |
| 40-50 | 0,538 | **0,70** | 1,30 | [0,25 ; 1,75] | 1,73 | 0,26 → **0,35** |
| 50-60 | 0,474 | **0,60** | 1,27 | [0,25 ; 1,75] | 1,41 | 0,23 → **0,30** |
| 60-70 | 0,375 | **0,51** | 1,37 | [0,25 ; 1,75] | 1,19 | 0,18 → **0,26** |
| 70-80 | 0,368 | **0,43** | 1,17 | [0,25 ; 1,75] | 0,94 | 0,17 → **0,22** |
| 80-90 | 0,368 | 0,37 | 1,00 | [0,04 ; 1,96] | 0,77 | 0,17 → **0,18** |
| 90-95 | 0,213 | 0,21 | 1,00 | [0,00 ; 2,04] | 0,51 | 0,09 → **0,11** |
| 95-98 | 0,085 | 0,09 | 1,05 | [0,25 ; 1,75] | 0,32 | 0,05 → 0,05 |
| 98-99,5 | 0,058 | 0,06 | 1,00 | — | 0,17 | 0,05 → 0,05 |
| 99,5-100 | 0,05 | 0,05 | 1,00 | — | 0,05 | 0,05 → 0,05 |

Valores exatos para `model/calibracao.mjs` (`faixas.presidente`): `[{"ate":5,"meia":0.752},{"ate":10,"meia":0.752},{"ate":20,"meia":0.752},{"ate":30,"meia":0.752},{"ate":40,"meia":0.752},{"ate":50,"meia":0.702},{"ate":60,"meia":0.604},{"ate":70,"meia":0.513},{"ate":80,"meia":0.431},{"ate":90,"meia":0.368},{"ate":95,"meia":0.213},{"ate":98,"meia":0.089},{"ate":99.5,"meia":0.058},{"ate":100.01,"meia":0.05}]`. `mae.presidente`: 10-20 0,376 · 20-30 0,376 · 30-40 0,376 · 40-50 0,351 · 50-60 0,302 · 60-70 0,257 · 70-80 0,216 · 80-90 0,184 · 90-95 0,106 · ≥ 95 0,05.

Regra, para ficar auditável em `model/backtest/analise.mjs` (`faixaPosCorrecao`) em vez de editada à mão: por faixa, `meia = max( maior |erro corrigido| (2022 em amostra + holdout) + |viés de transferência do holdout| , 0,75 × max |curva 2T 2022| dentro da faixa )`, depois `monotona()` e piso 0,05. MAE esperado: `max(MAE corrigido do holdout, meia/2)`. `presidente_mun` (modelo B, desligado) e `presidente_sem_correcao` não precisam mudar.

Por que 0,75 da curva e não outro número: é um julgamento, declarado como tal. O único par de transferência observado (1T 2022 → 1T 2026) teve razão de amplitude 0,80-1,04, ou seja, erro relativo de até 20-25%. Com n = 1 não há como estimar a dispersão dessa razão; dobrar a margem observada dá ±50% (que a v3 já cobre nas faixas centrais) e dobrar de novo, por ser um tipo de turno **sem nenhum par observado**, dá ±75%. Não fui além porque o que resta (deriva do 2T com cara de 1T, λ ≈ 2,8) só é coberto pela faixa v2, e as evidências contra esse cenário são fortes (§4.1).

## 3. Respostas às perguntas

**(1) A correção A+C é defensável?** Sim. (a) Três eleições, mesmo sinal, forma monotônica da curva. (b) Validação fora da amostra no mesmo tipo de turno: MAE 0,33 → 0,065, viés −0,33 → +0,05, cobertura da própria curva (não da faixa) com resíduo ≤ 0,34 p.p. em todas as faixas, sem nenhum número de 2026 na curva. (c) A deriva está na parcial bruta (−4,6 a −5,5 p.p. a 10-20% nos dois 1ºs turnos) e a razão 1T 2026 / 1T 2022 da deriva bruta é 0,84 — o fenômeno é logístico-geográfico (ordem de chegada × voto de Lula), e se reproduziu com adversário diferente (Flávio × Jair). (d) A alternativa "aplicar só parte da correção" (λ = 0,75) é pior quando a deriva se repete (resíduo −0,25 × curva, como as três eleições sugerem) e só ajuda se a deriva sumir; prefiro ponto central cheio e faixa mais larga.

**(2) A faixa da v3 é válida? Qual é a cobertura honesta?** Não está validada. Fatos: faixa dimensionada só com 2022 → 69% de cobertura no holdout (0% entre 20 e 90%); faixa final inclui o holdout → 100% **em amostra**, n efetivo 2-4 por faixa. A regra "máximo + viés" equivale a ~2× o único erro de transferência observado, o que é razoável, mas para 2T → 2T não há observação alguma; o que sabemos sobre a estabilidade do 2T vem de **um** 2º turno. Cobertura honesta a declarar: "sem medida fora da amostra; a faixa é desenhada para tolerar uma deriva entre 25% e 175% da de 2022". A primeira medida real de cobertura será a própria noite de 25/10 (§6).

**(3) Faixa recomendada:** §2.

**(4) O que muda nas chamadas de tendência?** Com A+C e qualquer das duas faixas (v3 ou recomendada), o 2T 2022 (margem final +1,80) teria chamada de tendência em **404/404 instantes a partir de 10,3%** apurado (em amostra); com a v2, só a partir de 90,3%. É uma mudança de comportamento grande que o dono do projeto precisa saber: numa disputa como 2022, o site "chamaria" Lula desde o início da publicação. Risco de chamada **errada** por cenário (§4.3): com a v3, há chamada errada se a deriva sumir (λ = 0) e a margem for de ~0,5 p.p., ou se a deriva dobrar (λ = 2) com margem de ~0,5; a faixa recomendada elimina esses dois casos. Nenhuma das duas protege contra deriva de 2T igual à de 1T (λ ≈ 2,8) com margem até ~1,8 — só a v2 protege, e esse cenário contradiz os dados brutos (§4.1). No holdout, a faixa recomendada mantém 100% de cobertura (em amostra) e 530/547 chamadas, 0 erradas.

**(5) Outras correções:** erro médio esperado (§5); texto da UI e da METODOLOGIA (§5); salvaguarda manual (§6).

## 4. Evidências

### 4.1 A deriva está nos dados; a razão 1T/2T também

Erro médio (Lula entre os dois, proj − final, p.p.) da **parcial bruta nacional** e do modelo A, por faixa:

| Faixa | bruta 1T22 | A 1T22 | bruta 2T22 | A 2T22 | bruta 1T26 | A 1T26 | A 1T26 / A 1T22 | A 1T22 / A 2T22 |
|---|---|---|---|---|---|---|---|---|
| 10-20 | −5,54 | −2,23 | −2,71 | −0,77 | −4,63 | −2,32 | 1,04 | 2,9 |
| 20-30 | −5,25 | −2,17 | −2,20 | −0,83 | −4,38 | −1,90 | 0,88 | 2,6 |
| 30-40 | −4,76 | −1,90 | −1,75 | −0,98 | −4,06 | −1,60 | 0,85 | 1,9 |
| 40-50 | −4,13 | −1,59 | −1,39 | −0,90 | −3,67 | −1,31 | 0,82 | 1,8 |
| 50-60 | −3,52 | −1,31 | −1,11 | −0,77 | −3,32 | −1,10 | 0,84 | 1,7 |
| 60-70 | −2,97 | −1,06 | −0,95 | −0,66 | −2,87 | −0,88 | 0,83 | 1,6 |
| 70-80 | −2,33 | −0,85 | −0,73 | −0,53 | −2,31 | −0,68 | 0,80 | 1,6 |
| 80-90 | −1,68 | −0,67 | −0,47 | −0,33 | −1,58 | −0,49 | 0,73 | 2,0 |
| 90-95 | −1,00 | −0,41 | −0,30 | −0,21 | −0,99 | −0,34 | 0,84 | 2,0 |

Leitura: (i) a parcial bruta do 1T 2026 reproduz a do 1T 2022 (razão 0,84 a 10-20%, 0,97 a 70-80%); (ii) a deriva do 2T 2022 é metade da do 1T **já na parcial bruta** (−2,7 vs −5,5), portanto a "meia amplitude" do 2º turno não é artefato do prior do modelo (M0 e M1_prior dão erros idênticos acima de 10%), e sim de como a ordem de chegada se relaciona com o voto quando só há dois nomes na urna; (iii) a estratificação por UF remove 60% da deriva no 1T mas só 30-45% no 2T entre 30% e 90% — no 2T, mais da deriva é intra-UF, o que torna a correção C (e, se um dia houver coleta, o modelo B) mais importante, não menos.

### 4.2 O que a faixa tolera (λ = deriva do 2T 2026 / deriva do 2T 2022)

Resíduo pós-correção no centro da faixa = (λ − 1) × curva 2T 2022:

| Faixa | λ=0 | λ=0,5 | λ=0,75 | λ=1,25 | λ=1,5 | λ=2 | λ=2,8 (≈1T) | v3 | rec. |
|---|---|---|---|---|---|---|---|---|---|
| 10-20 | +0,77 | +0,38 | +0,19 | −0,19 | −0,38 | −0,77 | −1,38 | 0,60 | 0,75 |
| 20-30 | +0,83 | +0,42 | +0,21 | −0,21 | −0,42 | −0,83 | −1,50 | 0,60 | 0,75 |
| 30-40 | +0,98 | +0,49 | +0,25 | −0,25 | −0,49 | −0,98 | −1,77 | 0,58 | 0,75 |
| 40-50 | +0,90 | +0,45 | +0,22 | −0,22 | −0,45 | −0,90 | −1,62 | 0,54 | 0,70 |
| 50-60 | +0,77 | +0,39 | +0,19 | −0,19 | −0,39 | −0,77 | −1,39 | 0,47 | 0,60 |
| 60-70 | +0,66 | +0,33 | +0,17 | −0,17 | −0,33 | −0,66 | −1,19 | 0,38 | 0,51 |
| 70-80 | +0,53 | +0,26 | +0,13 | −0,13 | −0,26 | −0,53 | −0,95 | 0,37 | 0,43 |
| 80-90 | +0,34 | +0,17 | +0,09 | −0,09 | −0,17 | −0,34 | −0,61 | 0,37 | 0,37 |

A v3 cobre λ ∈ [0,4 ; 1,6] nas faixas 30-70%; a recomendada, [0,25 ; 1,75]. O par 1T 2022 → 1T 2026 ficou em λ = 0,80-1,04. Nenhuma das duas cobre λ = 0 (deriva ausente) nem λ ≥ 2 entre 10% e 70%.

### 4.3 Chamadas erradas por cenário (margem final M = Lula − Flávio, p.p.; chamada = |margem projetada| > 2 × meia)

| M | v3: cenários com chamada errada | Recomendada: cenários com chamada errada |
|---|---|---|
| −1 | nenhum | nenhum |
| −0,5 | λ=0 (30-70% apurado) | nenhum |
| +0,5 | λ=2 (30-70%); λ=2,8 (10-80%) | λ=2,8 (10-80%) |
| +1 | λ=2,8 (10-80%) | λ=2,8 (10-80%) |
| +1,8 | λ=2,8 (30-60%) | λ=2,8 (30-50%) |
| +3 | nenhum | nenhum |

### 4.4 Autocorrelação do resíduo no holdout (A+C, curva 1T 2022)

| Faixa | n instantes | r(lag 1 min) | n efetivo | desvio-padrão do resíduo |
|---|---|---|---|---|
| 10-20 | 23 | 0,79 | 2,8 | 0,103 |
| 20-30 | 11 | 0,63 | 2,5 | 0,062 |
| 30-40 | 11 | 0,44 | 4,3 | 0,013 |
| 40-50 | 10 | 0,60 | 2,5 | 0,007 |
| 50-60 | 14 | 0,57 | 3,8 | 0,012 |
| 60-70 | 10 | 0,71 | 1,7 | 0,015 |
| 70-80 | 10 | 0,47 | 3,6 | 0,006 |
| 80-90 | 58 | 0,94 | 1,8 | 0,021 |
| 90-95 | 33 | 0,89 | 1,9 | 0,016 |

O resíduo dentro de cada faixa é quase constante (desvio ≤ 0,1): a incerteza relevante é a do **nível** da curva (transferência entre eleições), não a dispersão minuto a minuto. Por isso qualquer quantil "por instante" exagera a cobertura, e a faixa tem de ser desenhada em termos de erro de transferência (λ), como na §4.2.

### 4.5 Governadores (sem mudança recomendada)

- 2022, 38 corridas, faixa q90 pooled: cobertura média 94,0%; abaixo de 90%: pres-na-UF AM 79% (M = 2,2), CE 87%, MA 77%, MS 70%, PI 70%, RR 70%, gov SE 62% (M = 3,4). 0 chamadas erradas em 7.530.
- Holdout 1T 2026 (sem prior, dois primeiros, faixa `governador`): AC 100%, AM 81% (M = 24,8), ES 100%, RN 96% (M = 1,07), TO 100% (M = 1,77), DF por zonas 94%. 0 chamadas erradas em 1.408 (`relatorio.cobertura.holdout_gov1t2026_M0`). A VALIDACAO independente (modo cego) deu AM 89,5%, RN 96,9%.
- As duas corridas apertadas do holdout (RN, TO) ficaram dentro da faixa em 96-100% dos instantes e sem chamada errada. A faixa de governador é a única do sistema com algo parecido com um teste fora da amostra (6 UFs em 2026 + 38 corridas de 2022), e o resultado é compatível com ~90%. Ressalva a manter no texto: cobertura por UF pode ficar em 80-90%, como no AM.

## 5. Erro médio esperado e texto

- `erro_medio_esperado_pp` (presidente) hoje = MAE corrigido do holdout por faixa (0,12 a 10-20%; 0,26-0,28 entre 20 e 50%). É a melhor estimativa pontual, mas vem de n efetivo ≈ 3 e de um tipo de turno diferente do de produção. Recomendo `max(MAE holdout, meia/2)` (§2, última coluna): sob incerteza uniforme no λ tolerado, o |erro| médio esperado é metade da meia-largura; e mantém a razão faixa/MAE ≈ 2, que é a razão que torna coerente dizer "erra em média ±X" ao lado de "faixa ±2X".
- UI (`web/src/lib/components.mjs`: "Neste ponto da apuração, a projeção erra em média ±X ponto; a parcial, ±Y"): com os valores recomendados a frase passa a "±0,4" nas primeiras faixas em vez de "±0,1". Sugiro ainda trocar "erra em média" por "errou em média, nos testes," para não prometer frequência.
- `docs/METODOLOGIA.md` ("Como ler") e `docs/BACKTEST.md` §9.2: substituir "Cobertura no holdout com a faixa final: A+C 100%" por "faixa dimensionada com o holdout (em amostra); a faixa dimensionada só com 2022 cobriu 69% do holdout; para 2º turno → 2º turno não há par de validação; a faixa publicada tolera deriva entre 25% e 175% da de 2022". A frase "Faixa do presidente recalibrada (±0,6 …)" no EXECUCAO passa a ±0,75.

## 6. Salvaguarda operacional e o teste que falta

- A noite de 25/10 é o primeiro teste fora da amostra da faixa. Para que ele valha, **congelar** `calibracao.mjs` antes do primeiro dado real e não reajustar durante a apuração; depois do resultado final, rodar a cobertura por faixa com `history/` (o replay do coletor) e registrar em `docs/BACKTEST.md`.
- Gatilho manual de contingência (não exige código novo): a projeção já expõe `sem_correcao` e `correcao_pp`. Se até ~40% apurado a parcial bruta de Lula **não** estiver subindo com o avanço da apuração (o sinal da deriva for o oposto do de 2022 — em 2022 a parcial bruta de Lula sobe ~1 p.p. entre 25% e 55% apurado (erro bruto de −2,20 a −1,11)), o cenário é λ ≤ 0 e a correção passa a deslocar na direção errada; nesse caso, trocar o tipo de faixa/correção do presidente para `presidente_sem_correcao` (curva vazia + faixa v2) e redeployar. A checagem é uma leitura do histórico, sem modelo.
- Se o coletor municipal (`entrada.estratos`, modelo B+C) for ligado, repetir esta revisão: a faixa `presidente_mun` tem o mesmo problema (dimensionada com o holdout, e com curva cruzada), e o resíduo de B+C no holdout a 10-20% foi de até 0,62 p.p. (faixa 0,99).

## 7. Reprodução

```
node model/backtest/tools/revisao-v3.mjs <replay_v3.json> model/backtest/relatorio.json
```
`<replay_v3.json>` é a saída de `node model/backtest/replay.mjs <dir eventos> replay.json 60` (eventos 2022 via `bweb2events.py` + holdout via `csv2026_to_events.py`; ver `model/backtest/README.md`). O script imprime as §4.1-4.5 e a tabela da §2 (bloco 7, inclusive o JSON para `calibracao.mjs`). Os números de 2022/holdout da §1 e §3 vêm direto de `relatorio.json` (`holdout_1t2026.cobertura_faixa_so2022`, `holdout_1t2026.A_mais_C`, `em_amostra_2022`, `curvas_deriva`).
