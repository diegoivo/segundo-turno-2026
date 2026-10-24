# Backtest reproduzível

Resultados e limitações: `docs/BACKTEST.md`. Relatório numérico: `relatorio.json` (gerado). Calibração usada em produção: `../calibracao.mjs` (gerado).

## Passos

1. Baixar os boletins de urna de 2022 (dataset `resultados-2022-boletim-de-urna`, só GET, ≤ 2 req/s, ~1,5 GB):
   - `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_2t_<UF>_311020221535.zip` (28 abrangências: 27 UFs + ZZ, ~70 MB)
   - `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_1t_<UF>_051020221321.zip` (28, ~1,4 GB)
2. Converter cada zip em eventos por seção (filtra presidente e governador em streaming; guarda `DT_BU_RECEBIDO`, aptos, comparecimento, votos por candidato):
   `python3 -I tools/bweb2events.py <zip> <dir_eventos>` → `<dir_eventos>/<1t|2t>/<UF>-c<1|3>.json`
2b. Holdout 1T 2026 (reconstrução oficial por seção em `backfill/1t2026/`): `python3 -I tools/csv2026_to_events.py ../../backfill/1t2026/secoes-presidente.csv.gz 1 <dir_eventos> ` e, para governadores, `python3 -I tools/csv2026_to_events.py ../../backfill/1t2026/secoes-governador-ac.csv.gz 3 <dir_eventos> ../../backfill/1t2026/secoes-governador-{am,df,es,rn,to}.csv.gz`. Baseline municipal do presidente: `node ../tools/gerar-baseline-municipios.mjs ../../backfill/1t2026/secoes-presidente.csv.gz <mun-e006258-cm.json>`.
3. Replay com o código do modelo (`../estratos.mjs`), passo de 60 s (inclui as corridas municipais do presidente e o holdout; ~70 s):
   `node replay.mjs <dir_eventos> replay.json 60`
4. Calibração e relatório (escolha da variante, faixas, cobertura, teste cruzado do ajuste pela curva):
   `node calibrar.mjs replay.json relatorio.json --escrever-calibracao` (reescreve `../calibracao.mjs`)
5. Testes do módulo: `node --test --experimental-test-coverage ../test/*.test.mjs`

Os dados brutos ficam fora do repositório (tamanho). A saída é determinística para os mesmos arquivos.

## Baselines do 1º turno 2026

`node ../tools/gerar-baselines.mjs <dir 6257 por UF> <dir 6259 municipal/zonas> <mun-e006260-cm.json> <dir 6259 por UF>` gera `../baselines/*.json` a partir dos arquivos finais `-u.json` do TSE (28 abrangências do presidente; 468 municípios + 19 zonas do DF para os 6 governadores).
