# Metodologia da projeção — 2º turno 2026

Projeção independente, feita só com os dados oficiais de apuração do TSE. Não usa pesquisa eleitoral, boca de urna nem qualquer dado fora dos arquivos públicos de totalização. **Não é resultado oficial.** O código do modelo é público (`model/`), roda sem dependências e pode ser reexecutado por qualquer pessoa a partir dos arquivos brutos guardados no histórico do site.

## O que a projeção faz

Em cada instante da apuração, estima como terminará a votação quando 100% das seções estiverem totalizadas. O princípio é o mesmo do site do 1º turno: **os votos que faltam em cada lugar tendem a se dividir como os votos que já foram contados naquele mesmo lugar.**

1. **Divide a disputa em partes (estratos).** Presidente: 27 estados + Distrito Federal + exterior (28 partes, um arquivo do TSE por parte). Governador: os municípios do estado (22 no Acre, 62 no Amazonas, 78 no Espírito Santo, 167 no Rio Grande do Norte, 139 no Tocantins). Distrito Federal: as 19 zonas eleitorais, porque não há municípios.
2. **Em cada parte, estima os votos válidos que faltam:** eleitores ainda não totalizados × (votos válidos ÷ eleitores já totalizados na mesma parte). Isso assume que comparecimento, brancos e nulos nas seções pendentes serão parecidos com os já contados ali.
3. **Divide esses votos entre os dois candidatos na mesma proporção já observada na parte.** Se uma parte ainda não tem nenhum voto totalizado, usa a proporção que os dois finalistas tiveram **no 1º turno de 2026 naquela mesma parte**, deslocada pelo movimento médio ("swing") já observado nas partes apuradas (comparação 2º turno × 1º turno, em escala logit, ponderada por votos).
4. **Soma tudo.** Votos observados + votos estimados em todas as partes. O percentual projetado é sobre o total de válidos projetado. Como só há dois candidatos, A + B = 100%.
4b. **Corrige a deriva das urnas tardias (só presidente).** Mesmo dividindo por estado, as seções que chegam por último têm perfil diferente das primeiras, e o modelo erra de forma sistemática em função do % apurado: em 2022 (1º e 2º turnos) e no 1º turno de 2026, sempre no mesmo sentido (Lula subestimado no meio da apuração). A projeção publicada subtrai esse erro médio, medido no **2º turno de 2022** no mesmo nível de apuração (curva de 5 em 5 pontos, interpolada). Teste independente: a curva do 1º turno de 2022 aplicada ao 1º turno de 2026 reduziu o erro médio de 1,3 para 0,2 ponto entre 20% e 60% apurado. O valor sem a correção continua disponível (`sem_correcao`) e o tamanho da correção é exibido (`correcao_pp`). Governadores não têm essa correção (não há histórico comparável por estado).
5. **Faixa de erro.** Em torno de cada percentual, mostra uma faixa calibrada por backtest (abaixo). A faixa da margem (diferença A − B) é o dobro da faixa de cada candidato.
6. **"Tendência" (vencedor projetado)** só aparece quando a margem projetada é maior que a faixa da margem. Caso contrário o quadro mostra "indefinido", mesmo que um candidato esteja na frente.
7. **"Definido matematicamente"** é um critério aritmético separado, sem modelo: a vantagem em votos já é maior que todo o eleitorado ainda não totalizado, então não pode ser revertida.

Por que estratificar: o padrão do que falta não é aleatório. Em 2022, o interior do Nordeste chegou por último e a parcial nacional subestimou Lula em até 2,7 pontos a 20% apurado; dividir por estado reduz esse erro para ~0,8 ponto. Dentro de cada estado o mesmo acontece entre capital e interior, por isso governadores usam municípios (e zonas no DF).

## O que a projeção NÃO faz

- Não dá probabilidade de vitória. Dá um valor central e uma faixa de erro empírica.
- Não usa a curva de 2022 de um turno para corrigir o outro: a deriva do 1º turno tem o dobro da amplitude da do 2º. A correção usa só o mesmo tipo de turno (2º turno 2022 → 2º turno 2026), que foi o que passou no teste independente.
- Não projeta o presidente por município na configuração publicada. O modelo por município (que sabe "onde estão os votos que faltam") está implementado e calibrado, mas exige ~5.700 arquivos do TSE por leitura; liga automaticamente se a coleta municipal for ativada.
- Não usa pesquisas, boca de urna nem transferência de votos estimada entre candidatos eliminados.
- Não declara vencedor. "Tendência" é uma leitura estatística sujeita à faixa de erro; "definido matematicamente" é aritmética sobre a parcial oficial.
- Não projeta antes de a apuração atingir o mínimo (abaixo).

## Faixa de erro

Calibrada no replay da apuração de 2022 (1º e 2º turnos), usando a ordem real de chegada dos boletins de urna ao TSE (`docs/BACKTEST.md`). A faixa depende de quanto do eleitorado já foi totalizado e do tipo de disputa. Meia-largura em pontos percentuais do candidato:

| Eleitorado apurado | Presidente (com correção da deriva) · erro médio esperado | Governador (por município) | DF (por zona) | Governador sem municípios (modo degradado) |
|---|---|---|---|---|
| 10-20% | ±0,75 · 0,38 | (não publica) | (não publica) | (não publica) |
| 20-30% | ±0,75 · 0,38 | ±1,7 | ±0,4 | ±8,6 |
| 30-50% | ±0,75 a ±0,70 · 0,38 a 0,35 | ±1,6 a ±1,4 | ±0,3 | ±7,0 a ±5,5 |
| 50-70% | ±0,60 a ±0,51 · 0,30 a 0,26 | ±1,2 a ±0,95 | ±0,3 a ±0,2 | ±4,7 a ±4,3 |
| 70-90% | ±0,43 a ±0,37 · 0,22 a 0,18 | ±0,65 a ±0,4 | ±0,2 | ±3,6 a ±2,5 |
| 90-98% | ±0,21 a ±0,09 · 0,11 a 0,05 | ±0,25 a ±0,15 | ±0,1 | ±1,4 a ±0,85 |
| acima de 98% | ±0,06 a ±0,05 · 0,05 | ±0,07 a ±0,05 | ±0,06 | ±0,4 a ±0,1 |

Como ler: no presidente, a faixa é o maior entre (a) o **maior erro observado depois da correção** (2022, 1º e 2º turnos, e o teste independente no 1º turno de 2026) **mais o viés** que a curva de uma eleição deixou ao ser aplicada à seguinte, e (b) **75% do tamanho da própria correção** naquele nível de apuração. O item (b) veio da revisão estatística independente (`docs/REVISAO-ESTATISTICA-V3.md`): só existe **um** par de eleições para medir quanto a curva muda de uma eleição para a outra (1º turno 2022 → 1º turno 2026, em que a deriva de 2026 ficou entre 80% e 104% da de 2022), e nenhum par de 2º turno; a faixa publicada, portanto, tolera que a deriva do 2º turno de 2026 fique entre 25% e 175% da de 2022. **Não há medida de cobertura fora da amostra para essa faixa**: dimensionada só com 2022 ela cobriu 69% do teste de 2026; a versão publicada incorpora esse teste. Sem a correção, a faixa seria de ±2,3 a 10-20% e ±1,4 a 50-60% (essa faixa continua disponível como modo `presidente_sem_correcao`, acionável por configuração se a deriva de 2026 se mostrar diferente da de 2022 durante a noite). O "erro médio esperado" (`erro_medio_esperado.projecao`) é o maior entre o erro médio observado nos testes e metade da faixa; a interface o mostra como "**errou em média, nos testes, ±X ponto**", ao lado do erro médio da parcial bruta na mesma faixa (`erro_medio_esperado.parcial`, por exemplo 4,4 pontos a 10-20%). No governador, a faixa é o valor que cobriu 90% dos instantes em 38 corridas estaduais de 2022 (12 segundos turnos de governador reais + 26 simulações da disputa presidencial dentro de cada estado); nos 6 governadores do 1º turno de 2026 a cobertura ficou entre 81% (AM) e 100%, sem chamada errada. Essas faixas vêm de uma única eleição passada e **não garantem** cobertura em 2026; o primeiro teste real da faixa do presidente é a própria noite de 25/10, e a calibração fica congelada até o fim da apuração.

**O que são "os testes":** as eleições de 2022 (1º e 2º turnos) e o 1º turno de 2026, reproduzidos na ordem real de chegada dos boletins. A frase "a projeção errou em média ±X ponto nos testes" refere-se ao erro medido nesses replays, não a um erro já observado nesta apuração.

Rótulo de confiança exibido junto: **baixa** (< 25% do eleitorado apurado), **média** (25-70%), **alta** (> 70%).

## Quando a projeção não é publicada

Todos os critérios abaixo precisam valer; se algum falhar, o site mostra só a parcial oficial e a lista do que faltou (`criterios_nao_atendidos`).

| Critério | Presidente | Governador |
|---|---|---|
| Arquivos do TSE válidos e consistentes (eleição e turno certos, somas batem, totalizado ≤ eleitorado) | todos | todos |
| Eleitorado em seções totalizadas | ≥ 10% | ≥ 20% |
| Partes com algum voto totalizado | ≥ 50% das 28 | ≥ 50% dos municípios/zonas |
| Eleitorado em partes sem arquivo válido | 0% | ≤ 2% |
| Eleitorado projetado sem base do 1º turno (taxa agregada) | ≤ 5% | ≤ 5% |
| Eleitorado com leitura preservada (TSE não respondeu, usamos a anterior) | 0% | ≤ 2% |
| Diferença de horário entre os arquivos ainda em apuração (partes com 100% das seções totalizadas ficam isentas: o dado delas é final) | ≤ 5 min entre o mais antigo e o mais novo | ≤ 5 min entre cada município/zona e o arquivo da UF |
| Idade do arquivo de referência | ≤ 5 min (arquivo mais antigo entre as UFs) | ≤ 5 min (arquivo da UF) |

Governador sem os arquivos municipais (se o TSE não os publicar): a projeção vira a própria parcial com a faixa larga da última coluna da tabela de erro ("modo degradado"), sinalizada como tal.

## Fontes

- Apuração 2026: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/<uf>/<uf>-c0001-e006258-u.json` (presidente, por UF), `.../6260/dados/<uf>/<uf><município>-c0003-e006260-u.json` (governador, por município), `.../6260/dados/df/df97012-z<zona>-c0003-e006260-u.json` (DF, por zona).
- Base do 1º turno 2026 (participação dos finalistas por UF/município/zona): arquivos finais das eleições 6257 e 6259, pré-processados em `model/baselines/`.
- Calibração: boletins de urna de 2022 (`cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/`), ver `docs/BACKTEST.md`.

## Como auditar

Cada snapshot publicado guarda o JSON bruto do TSE, a versão do modelo (`modelo.versao`, `modelo.calibracao`) e a saída completa (`forecast`, `criterios`, `estratos`). Reexecute `model/index.mjs` sobre o bruto para obter os mesmos números. Versão atual do modelo: `3.1.0`; calibração `bt2022h26-v31-2026-10-24`, **congelada** para a apuração de 25/10/2026 — `model/calibracao.mjs` SHA-256 `09472377c7a0d3cc5abd2c6058f35b6a03ab45e2419c618007c4c446209b2593` (qualquer alteração durante a apuração muda o hash e será visível).
