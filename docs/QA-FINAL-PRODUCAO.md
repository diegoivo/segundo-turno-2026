# QA final da producao (24/10/2026, QA independente, somente leitura)

Front: https://segundo-turno-web.hosts5924.workers.dev. Nada foi alterado em producao (sem deploy, sem escrita no R2, cron intacto).

| # | Item | Resultado | Evidencia |
|---|---|---|---|
| 1 | 200 em /, /metodologia/, /auditoria/, /governador/{ac,am,df,es,rn,to}/ | PASS | Todos 200 text/html. Sem barra final, /governador/ac responde 307 para /governador/ac/ (ok). |
| 2 | /nao-existe = 404 HTML | PASS | 404 text/html, 9760 bytes, com titulo "Pagina nao encontrada". |
| 3 | Cache de latest.json | PASS | 4 requisicoes em ~6 s: HIT, HIT, MISS (expirou, s-maxage=10), HIT. cache-control `public, max-age=5, s-maxage=10, stale-while-revalidate=30`; content-type `application/json; charset=utf-8`; etag `ad0912d1a09d3dc4a8681e1c1e8c5442` (igual ao etag do objeto no R2). |
| 4 | ?t=1 / locks / POST | PASS | `?t=1` 400; `/dados/locks/qualquer` 404; POST 405. |
| 5 | Conteudo stub | PASS | latest.json = `{"schema":1,"ambiente":"production","presidente":null,"governadores":{}}`; manifest.json = `{"schema":1,"ambiente":"production","cadeias":{}}`. Sem percentuais nem forecast. series.json nao existe (404, aceitavel). |
| 6 | Coletor sem erro; ensaio sem cron | PASS (com ressalva) | `wrangler tail` ~95 s: 1 execucao do cron capturada, outcome ok, exceptions [], logs []. Schedules via API: producao `* * * * *`, staging `* * * * *`, **ensaio []** (sem cron). Ressalva: so 1 execucao observada em 95 s e wallTime de 47,7 s (cpu 8 ms), ver D2. |
| 7 | Historico | PASS | R2 `segundo-turno-prod` (listagem via API REST): apenas `live/latest.json` e `live/manifest.json` (stubs, modificados 03:01Z e nao reescritos a cada minuto). Sem history/ nem raw/. `node tools/verificar-cadeia.mjs <base>/dados` retorna "FALHA: manifest sem cadeias" (exit 1): esperado com cadeia vazia, nao ha o que verificar. |
| 8 | Playwright (Chrome) 1280 e 390 px | PASS | Home e /governador/ac/: 0 erros/warnings de console, 0 respostas >=400, sem overflow horizontal (scrollWidth = largura da viewport). Screenshots em docs/qa-final/ (home-1280.png, home-390.png, gov-ac-1280.png, gov-ac-390.png). |
| 9 | Bytes | PASS | Home 15.499 B gzip (62.379 B bruto); app.js 22.519 B gzip; latest.json 85 B. Carga inicial estimada ~38 KB + CSS e mapa (mapa-br.json nao medido). |

## Observacoes sobre o conteudo da home
Antes da eleicao a home mostra o resultado oficial do 1o turno (Lula 47,03%... ver pagina; cada bloco rotulado "1o turno"), contagem regressiva ate 25/10 17h e "Projecao disponivel a partir de 10% do eleitorado apurado". Nenhuma projecao ou percentual de 2o turno e exibido. Conforme o desenho.

## Defeitos
- D1 (baixa) Cache-control de latest.json vem do metadado do R2 (inclui stale-while-revalidate=30), nao da constante CACHE_PADRAO do worker; diverge do documentado no codigo. Sem impacto funcional.
- D2 (baixa, investigar) Execucao do cron com wallTime de ~47,7 s para cpu de 8 ms: provavel espera de rede ao TSE ainda sem dados. Se o fetch nao tiver timeout curto, execucoes podem se sobrepor a cada minuto no dia da eleicao. Observei so 1 invocacao em 95 s, entao nao confirmei se o cron dispara todo minuto sem falhas.
- D3 (informativa) O verificador sai com codigo 1 em cadeia vazia; se for usado em CI/monitoramento antes de 25/10, vai acusar falso negativo.
- D4 (informativa) A listagem de history/ precisou da API REST do R2 (wrangler 4.152 nao tem `r2 object list`).

Nenhum defeito critico, alto ou medio.
