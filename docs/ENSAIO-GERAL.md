# Ensaio geral (24/10/2026)

Prova na infraestrutura real da Cloudflare de coletor, modelo, R2, Worker de dados e front, com TSE falso e dados sintéticos do 2º turno (6258/6260). Nenhum recurso de produção ou staging foi tocado.

## Resultado em uma linha

A cadeia funcionou de ponta a ponta (cadeia íntegra, 30 passos, front mudou sozinho, lock 409). O ensaio achou **1 defeito ALTO (latest.json regride)** e **1 ALTO/MÉDIO (commit do governador perde a corrida do lock/CAS)**, ambos em `collector/src/collect.mjs`, não corrigidos (fora do escopo pedido).

## Recursos criados (sufixo -ensaio)

| Recurso | Nome / URL |
|---|---|
| TSE falso (Worker + Static Assets, 12.876 arquivos) | `segundo-turno-tse-ensaio` (https://segundo-turno-tse-ensaio.hosts5924.workers.dev) |
| Coletor | `segundo-turno-coletor-ensaio` (ENV=production, START_DATE=2026-10-25, cron `* * * * *`, sem HTTP público). **Cron desligado ao fim** (`crons = []`) |
| Bucket R2 | `segundo-turno-ensaio`, locks `history/` e `raw/` com retenção de 1 dia, stubs de produção em `live/latest.json` e `live/manifest.json` |
| Front + Worker de dados | `segundo-turno-web-ensaio` (https://segundo-turno-web-ensaio.hosts5924.workers.dev), build com `SITE_URL` do ensaio, assets de `dist-ensaio` (o `dist` de produção não foi alterado) |

Alterações em código: `collector/src/config.mjs` (`resolverTseBase`, `govCfgUrl`, `cadeias(base)`, `estratosDoConfig(cfg, base)`; padrão = TSE oficial) e a fiação mínima em `collector/src/collect.mjs` (3 linhas: `resolverTseBase(env)` e uso da base). Teste unitário novo em `collector/test/unidades.test.mjs`; suíte: 41/41 passam. `[env.ensaio]` em `collector/wrangler.toml` e `web/wrangler.toml`. Scripts do ensaio em `qa/ensaio/`.

## Replay sintético

- Gerado de `backfill/1t2026/replay` por `qa/ensaio/gerar_replay.py`: 30 instantes (1700, 1711, 1716, 1724, 1733, 1740, 1745, 1750, 1755, 1800, 1812, 1817, 1822, 1828, 1834, 1841, 1847, 1857, 1903, 1909, 1914, 1920, 1931, 2005, 2035, 2050, 2055, 2105, 2140, 0300), escolhidos por % de seções (0%, 0,3%, 0,8% ... 99,5%, 100%), densos no início.
- 6258: BR, 27 UFs e ZZ (29 arquivos/instante). 6260: 6 UFs + 487 estratos (municípios; zonas no DF). Zonas do DF (19) derivadas do município por partição determinística (a fonte do 1T não tem zona).
- Só 2 candidatos por disputa (Lula 13 / Flávio 22; AC 11/10, AM 55/22, DF 11/13, ES 10/15, RN 44/13, TO 44/45). Os votos dos demais foram redistribuídos na proporção dos 2, então válidos, comparecimento, brancos e nulos ficam iguais ao 1T e `válidos = soma dos 2` em cada arquivo. `_sintetico_ensaio: true` (a trava de produção só olha `_sintetico`, ver defeito D6). `t=2`, `dg` 25/10/2026 (26/10 após 00h).
- Os 12.875 arquivos passam em `validarArquivo` do coletor (0 erros), conferido com `qa/ensaio/validar.mjs`.
- TSE falso: instante = `floor((agora - ENSAIO_INICIO)/60s)`, trava no último; ETag do asset + 304 em `If-None-Match`; `Cache-Control: no-store`; `/_status` mostra o passo. `ENSAIO_INICIO` = 24/10 00:31:36 (-03).

## Linha do tempo (horário de Brasília, 24/10)

| Hora | Evento |
|---|---|
| 00:24 | deploy TSE falso (início no futuro), web-ensaio e coletor-ensaio; cron começa |
| 00:25 a 00:33 | pré-dados: TSE devolve o passo 0 (zerado); stubs intactos (`cadeias: {}`, `presidente: null`). Screenshot 01 |
| 00:31:36 | `ENSAIO_INICIO`: passo 0 |
| 00:35:58 | 1º commit real (6258 seq 0; gate do START_DATE passou) |
| 00:36:31 | 6260 seq 0 (estratos baixados e gravados em `state/estratos-6260.json`) |
| 00:38 | <10%: sem projeção (`apuracao_minima`). Screenshot 02 |
| 00:40:28 | 1ª projeção (12,1%: Lula 47,06 / Flávio 52,94, faixa ±0,75 pp, confiança baixa). Screenshot 03 |
| 00:49:31 | ~50% do eleitorado. Screenshot 04 |
| 00:59:59 | 99,5% e vitória matematicamente definida (Flávio) |
| 01:01:15 | 6258 seq 20 (100%, passo final 0300) |
| 01:02 | front mostra "Vitória matematicamente definida" e a frase de precisão. Screenshot 05 |
| 01:10 | cron do coletor desligado; verificação da cadeia e teste do lock |

## Evidências

Monitor a cada ~2,5 min (`qa/ensaio/run1/monitor.log`). Colunas: seq = cadeia 6258/6260; erro esperado = projeção/parcial (pp).

| Hora | Passo | seq | apurado | projeção (L / F) | faixa | método | erro esp. | tendência | x-cache (1ª/2ª) |
|---|---|---|---|---|---|---|---|---|---|
| 00:25:49 | 0:1700 | - | - | - | - | - | - | - | MISS/HIT |
| 00:28:20 | 0:1700 | - | - | - | - | - | - | - | MISS/HIT |
| 00:30:50 | 0:1700 | - | - | - | - | - | - | - | MISS/HIT |
| 00:33:21 | 1:1711 | - | - | - | - | - | - | - | MISS/HIT |
| 00:35:52 | 4:1733 | - | - | - | - | - | - | - | MISS/HIT |
| 00:38:23 | 6:1745 | 1/0 | 5.2% | - | - | - | - | - | MISS/HIT |
| 00:40:54 | 9:1800 | 4/1 | 12.1% | L 47.06 / F 52.94 | +-0.75pp | presidente | 0.376/4.447 | 22 | MISS/HIT |
| 00:43:24 | 11:1817 | 6/1 | 18.9% | L 47.41 / F 52.59 | +-0.75pp | presidente | 0.376/4.447 | 22 | MISS/HIT |
| 00:45:55 | 14:1834 | 8/1 | 27.9% | L 47.84 / F 52.16 | +-0.75pp | presidente | 0.376/3.94 | 22 | HIT/HIT |
| 00:48:26 | 16:1847 | 9/2 | 39.6% | L 48.25 / F 51.75 | +-0.75pp | presidente | 0.376/3.482 | 22 | MISS/HIT |
| 00:50:57 | 19:1909 | 11/3 | 57.9% | L 48.52 / F 51.48 | +-0.6pp | presidente | 0.302/2.811 | 22 | HIT/HIT |
| 00:53:28 | 21:1920 | 13/4 | 74.5% | L 48.64 / F 51.36 | +-0.43pp | presidente | 0.216/1.856 | 22 | MISS/HIT |
| 00:55:59 | 24:2035 | 14/5 | 84.9% | L 48.63 / F 51.37 | +-0.37pp | presidente | 0.184/1.422 | 22 | HIT/HIT |
| 00:58:30 | 26:2055 | 17/5 | 92.2% | L 48.66 / F 51.34 | +-0.21pp | presidente | 0.107/0.868 | 22 | MISS/HIT |
| 01:01:01 | 29:0300 | 19/5 | 94.7% | L 48.68 / F 51.32 | +-0.21pp | presidente | 0.107/0.868 | 22 | MISS/HIT |
| 01:03:31 | 29:0300 | 20/6 | 100.0% | L 48.8 / F 51.2 | +-0.05pp | presidente | 0.05/0.05 | 22 | MISS/HIT |
| 01:06:02 | 29:0300 | 20/8 | 100.0% | L 48.8 / F 51.2 | +-0.05pp | presidente | 0.05/0.05 | 22 | MISS/HIT |
| 01:08:33 | 29:0300 | 20/9 | 100.0% | L 48.8 / F 51.2 | +-0.05pp | presidente | 0.05/0.05 | 22 | MISS/HIT |

Front sem reload (`qa/ensaio/run1/watcher.log`, mesma aba Playwright/Chrome desde 00:39, marcador `window.__sem_reload` preservado até o fim): o cabeçalho passou de "Ao vivo · 17:45:00" para 21:40:00 e 03:00:00, o bloco de projeção apareceu e a frase final foi "Neste ponto da apuração, a projeção erra em média ±0,1 ponto; a parcial, ±0,1." Screenshots (390 e 1440 px) em `docs/ensaio/`: `01-pre-dados`, `02-menos-10pct`, `03-primeira-projecao`, `04-meio-50pct`, `05-fim`.

x-cache em `/dados/live/latest.json`: a 2ª requisição foi HIT em 17 de 17 amostras; a 1ª foi MISS em 14 e HIT em 3 (00:45, 00:50 e 00:55, cache já quente por outros leitores, esperado com s-maxage=10).

Verificação da cadeia, `node tools/verificar-cadeia.mjs https://segundo-turno-web-ensaio.hosts5924.workers.dev/dados` (com raw): **OK, cadeia íntegra**. 6258 cabeça seq 20 (21 snapshots), 6260 cabeça seq 11 (12 snapshots; a cadeia de governadores continuou avançando enquanto o cron rodou, ver D2).

Projeção final: 6258 projeção Flávio 51,2% / Lula 48,8% (faixa 51,15 a 51,25), definido matematicamente. A soma dos arquivos de UF+ZZ do replay no último instante dá Flávio 51,22%: erro 0,02 pp. O arquivo BR do replay dá 51,01% (o front mostra o "apurado" 51,01%): diferença de 0,19 pp, que é artefato do gerador (D5), não do modelo.

Governadores no fim (projeção, 100% das seções): AC Mailza 60,9 / Alan Rick 39,1; AM Omar 61,9 / Maria do Carmo 38,1; DF Celina 59,2 / Leandro 40,8; RN Allyson 50,5 / Cadu 49,5 (empate técnico). ES e TO sem projeção publicada no fim (só parcial), ver D3.

Erros do coletor: `wrangler tail` (a partir de 00:36) mostrou 31 invocações cron "Ok" e 19 mensagens `commit falhou: manifest alterado por outro escritor (CAS falhou)` (17 em 6260, 2 em 6258). Nenhum outro erro.

Lock 409: PUT em `history/6258/2026-10-24/000020-b7036ab1....json` pela API do R2 devolveu **HTTP 409** (`code 10069, The object is locked by the bucket policy`); via `wrangler r2 object put` mesma mensagem. DELETE do mesmo objeto devolve HTTP 200 com `success:false` e o mesmo erro 10069 (o `wrangler r2 object delete` imprime "Delete complete" mas o objeto continua lá: confirmado por GET depois). Objeto intacto.

## Defeitos (não corrigidos)

| # | Sev. | Defeito | Evidência |
|---|---|---|---|
| D1 | ALTA | `live/latest.json` regride: um commit de 6260 grava `latest.json` com a cabeça de 6258 que o processo carregou no início da invocação, que pode estar vários seq atrás da cabeça real. O front e qualquer leitor veem o placar voltar (18:34 para 18:17 no front; seq 11 para 9; às 01:01 latest tinha seq 17 com a cadeia em 19). Dura até o próximo commit de 6258. `gravarLatest` usa `ctx.heads` sem recarregar a outra cadeia. | `qa/ensaio/mono.mjs`: 7 regressões em 107 leituras (seq 11 depois 9, x-cache MISS lendo o R2); `monitor.log` 01:01:01 |
| D2 | ALTA | Commit de 6260 perde a corrida e é descartado (CAS do manifest). `publicarLive` (series, gov-*, latest) roda **antes** do CAS do manifest, então o commit que falha já publicou `latest.json`/`gov-*.json` divergentes do manifest e deixou snapshot órfão em `history/`. Causa provável (não medida): o commit de 6260 grava até ~250 raw sequenciais e passa do `LOCK_TTL_MS` de 45 s, outra invocação toma o lock e grava o manifest. 19 falhas em 31 invocações. Consequência: a cadeia 6258 só commitou 21 vezes em 30 min e ficou até 3 min sem avançar (seq 8 às 03:44:25, seq 9 às 03:47:35), e estratos (ex.: `es57975`, `es57991`) só chegaram ao último instante depois do fim do replay, 1 por commit. | `qa/ensaio/run1/tail2.log`; walk da cadeia (gaps) |
| D3 | MÉDIA | Governadores: a cobertura de estratos demora a fechar. Com os commits perdidos, a cadeia 6260 só chegou a 100% das seções (seq 6, 04:01) ao fim do replay, os últimos estratos entraram um a um nos commits seguintes, e ES e TO ficaram sem projeção (modo parcial/UF) no fim. | `latest.json` final: `forecast` ausente em ES e TO |
| D4 | BAIXA | `wrangler tail --format json` não emitiu nada no ensaio (`--format pretty` funcionou). Operação: no domingo usar `pretty`. O `DELETE` em objeto travado responde 200 (API), então o log do verificador/teste de lock deve olhar `success:false`. | `tail.log` vazio |
| D5 | BAIXA (replay) | O replay não é aditivo: cada arquivo foi renormalizado sozinho, então BR (51,01%) difere da soma de UFs+ZZ (51,22%). Vale para a leitura da projeção final (ela segue as UFs). Não afeta a infraestrutura. | validação offline |
| D6 | BAIXA | A trava de produção "arquivo sintético em produção" só checa `json._sintetico`; os replays (`_sintetico_backfill`, `_sintetico_ensaio`) passam por ela. Foi o que permitiu o ensaio com ENV=production, mas também significa que um replay despejado no TSE_BASE de produção não seria barrado. | `collect.mjs` (`json._sintetico`) |
| D7 | BAIXA | Front 390 px: o menu superior fica cortado ("Resu"), com rolagem horizontal escondida. | `docs/ensaio/05-fim-390.png` |

Observações sem defeito: no replay, as 42 seções sem BU deixam o BR em 99,99% e o `pst` vai a 100,0% só por arredondamento; o ETag condicional do TSE falso gerou 304 normalmente.

## Comandos usados (resumo)

```
export CLOUDFLARE_ACCOUNT_ID=7da0ed9efd4c11dde93580a34322e913
W=/Users/diego/Claude/segundo-turno/collector/node_modules/.bin/wrangler
python3 qa/ensaio/gerar_replay.py <scratch>/tse/assets            # gera os 12.875 arquivos
node qa/ensaio/validar.mjs <scratch>/tse/assets                   # validarArquivo do coletor: 0 erros
$W r2 bucket create segundo-turno-ensaio
$W r2 bucket lock add segundo-turno-ensaio --name history-imutavel --prefix history/ --retention-days 1 -y
$W r2 bucket lock add segundo-turno-ensaio --name raw-imutavel --prefix raw/ --retention-days 1 -y
$W r2 object put segundo-turno-ensaio/live/latest.json   --file stub-latest.json   --remote --content-type "application/json; charset=utf-8"
$W r2 object put segundo-turno-ensaio/live/manifest.json --file stub-manifest.json --remote --content-type "application/json; charset=utf-8"
(cd qa/ensaio/tse && $W deploy --var ENSAIO_INICIO:<epoch ms>)                       # TSE falso
(cd web && SITE_URL=https://segundo-turno-web-ensaio.hosts5924.workers.dev OUT_DIR=dist-ensaio node scripts/build.mjs \
   && $W deploy --env ensaio --assets dist-ensaio && rm -rf dist-ensaio)
(cd collector && $W deploy --env ensaio)                                              # cron liga
$W tail segundo-turno-coletor-ensaio --format pretty
node qa/ensaio/monitor.mjs ; node qa/ensaio/watcher.mjs ; node qa/ensaio/shot.mjs <rotulo>
node tools/verificar-cadeia.mjs https://segundo-turno-web-ensaio.hosts5924.workers.dev/dados
curl -X PUT -H "Authorization: Bearer $(wrangler auth token)" --data-binary @adult.json \
   https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/segundo-turno-ensaio/objects/<chave url-encoded>   # 409
(cd collector && edit crons = [] && $W deploy --env ensaio)                           # desliga o cron
```

Nota: o `qa/ensaio/tse/wrangler.toml` espera a pasta `assets/` gerada por `gerar_replay.py` (apagada do disco ao fim; regerável em ~10 s).

## Pendências

- Corrigir D1 e D2 antes do domingo (sugestão: recarregar a cabeça das duas cadeias a partir do manifest em `gravarLatest`, publicar `latest/gov` só depois do CAS do manifest, renovar/ampliar o TTL do lock ou paralelizar os puts de raw no commit de 6260). Repetir o ensaio depois (bucket novo, pois o lock de 1 dia impede apagar `history/`).
- Se quiser repetir sem refazer o bucket: o `live/` pode ser sobrescrito, mas `history/` e `raw/` ficam retidos por 1 dia e o manifest atual teria de ser trocado pelo stub.


---

# Ensaio 2 (24/10/2026, 01:31 a 02:12)

Repetição após as correções D1, D2, D3, D6 e D7, com bucket novo `segundo-turno-ensaio2` (locks `history/` e `raw/` de 1 dia, stubs de staging), coletor `segundo-turno-coletor-ensaio` com `ENV=staging` e cron ligado só durante o ensaio (desligado ao fim: "No targets deployed"), TSE falso e front (`segundo-turno-web-ensaio`, bucket trocado para `ensaio2` em `web/wrangler.toml`) com o build novo de `web/src`. O front do ensaio foi publicado a partir de `web/dist-ensaio` (removido depois); o `web/dist` não foi tocado. `ENSAIO_INICIO` = 01:37:20.

D5 corrigido no gerador (`qa/ensaio/gerar_replay.py`): UFs e ZZ são transformadas primeiro e o BR é a **soma** dos votos; no governador a UF é a soma dos estratos. No último instante BR = soma das UFs+ZZ = Lula 58.190.541 / Flávio 61.110.247 (Flávio 51,2237%). 12.875 arquivos, 0 erros no `validarArquivo`.

## Critérios

| Critério | Resultado | Evidência |
|---|---|---|
| 0 regressões de seq em `latest.json` (≥100 leituras) | **APROVADO** | `qa/ensaio/mono.mjs` leu `/dados/live/latest.json` a cada 3 s durante todo o ensaio: 647 leituras, 0 regressões, seq final 27 a 29 (`qa/ensaio/run2/mono.log`). O front também só avançou (17:16, 17:24, ... 21:05, nunca voltou) |
| 0 falhas de CAS e 0 snapshot órfão | **APROVADO** | `wrangler tail`: 0 linhas `(error)` em 30+ invocações. Listagem de `history/` por API do R2: 60 objetos = 30 da cadeia 6258 + 30 da 6260, 0 órfãos, 0 faltando |
| 6 UFs de governador e presidente com projeção no fim | **APROVADO** | `latest.json` final: presidente e AC, AM, DF, ES, RN, TO com `forecast`. ES e TO, que no ensaio 1 ficaram sem projeção, agora têm |
| Projeção final do presidente dentro da faixa do final do replay | **APROVADO** | Projeção Flávio 51,2 / Lula 48,8, faixa 51,15 a 51,25; final do replay (BR = soma UFs) 51,2237: dentro. Governadores: projeção = final do replay (AC 60,9 / AM 61,92 / DF 59,16 / ES 59,43 / RN 50,05 / TO 50,91), todas dentro da faixa de ±0,05 pp |
| `verificar-cadeia` íntegra | **APROVADO** | `OK: cadeia integra`, 6258 cabeça seq 29 (30 snapshots), 6260 cabeça seq 29 (30). Também com raw (todos os raw conferem por sha256) |
| `duracao_commit_ms` registrada | **APROVADO** | Presente em `live/manifest-6258.json` (7097 ms) e `manifest-6260.json` (6400 ms) e no log de cada commit. 59 commits no `tail`: 6258 mediana 3,5 s, máx. 7,2 s; 6260 mediana 15,3 s, máx. **36,9 s**; geral mediana 5,8 s, máx. 36,9 s (TTL do lock é 120 s) |
| Front muda sozinho + frase nova + menu 390 px | **APROVADO** | Mesma aba, `window.__sem_reload` preservado, 43 mudanças de estado registradas. Frase: "Neste ponto da apuração, a projeção errou em média ±0,1 ponto nos testes; a parcial, ±0,1. O que são os testes?". Menu a 390 px quebra em 2 linhas e mostra Resumo e Metodologia (`docs/ensaio/e2-05-fim-390.png`) |

## Evidências do ensaio 2

Colunas: seq 6258/6260; erro esp. = projeção/parcial (pp); gov = UFs com método de projeção publicado; x-cache da 1ª/2ª leitura.

| Hora | Passo | seq | apurado | projeção (L / F) | erro esp. | gov | x-cache |
|---|---|---|---|---|---|---|---|
| 01:31:21 | 0:1700 | - | - | - | - | - | MISS/HIT |
| 01:33:52 | 0:1700 | - | - | - | - | - | HIT/HIT |
| 01:36:22 | 0:1700 | - | - | - | - | - | HIT/HIT |
| 01:38:53 | 1:1711 | 1/- | 0.3% | - | - | 0/6 | HIT/HIT |
| 01:41:24 | 4:1733 | 4/2 | 2.9% | - | - | 0/6 | HIT/HIT |
| 01:43:55 | 7:1750 | 6/4 | 7.2% | - | - | 1/6 | HIT/HIT |
| 01:46:26 | 9:1800 | 9/7 | 15.0% | L 47.22 / F 52.78 (±0.75) | 0.376/4.447 | 5/6 | MISS/HIT |
| 01:48:56 | 12:1822 | 11/10 | 23.2% | L 47.56 / F 52.44 (±0.75) | 0.376/3.94 | 5/6 | HIT/HIT |
| 01:51:27 | 14:1834 | 14/12 | 39.6% | L 48.25 / F 51.75 (±0.75) | 0.376/3.482 | 4/6 | HIT/HIT |
| 01:53:58 | 17:1857 | 16/14 | 52.3% | L 48.45 / F 51.55 (±0.6) | 0.302/2.811 | 4/6 | HIT/HIT |
| 01:56:28 | 19:1909 | 19/17 | 63.9% | L 48.55 / F 51.45 (±0.51) | 0.257/2.327 | 4/6 | HIT/HIT |
| 01:58:59 | 22:1931 | 21/20 | 80.4% | L 48.64 / F 51.36 (±0.43) | 0.216/1.856 | 1/6 | HIT/HIT |
| 02:01:30 | 24:2035 | 24/21 | 92.2% | L 48.66 / F 51.34 (±0.21) | 0.107/0.868 | 3/6 | HIT/HIT |
| 02:04:00 | 27:2105 | 26/24 | 96.5% | L 48.69 / F 51.31 (±0.09) | 0.05/0.463 | 2/6 | HIT/HIT |
| 02:06:31 | 29:0300 | 29/26 | 100.0% | L 48.8 / F 51.2 (±0.05) | 0.05/0.05 | 4/6 | MISS/HIT |
| 02:09:02 | 29:0300 | 29/28 | 100.0% | L 48.8 / F 51.2 (±0.05) | 0.05/0.05 | 4/6 | MISS/HIT |

Screenshots (390 e 1440 px, `docs/ensaio/`): `e2-01-pre-dados`, `e2-03-primeira-projecao`, `e2-04-meio-50pct`, `e2-05-fim` (99,5%, captura da aba que não recarregou), `e2-06-final-recarregado` (03:00). Logs em `qa/ensaio/run2/`.

## Diferenças em relação ao ensaio 1

- Cadeias: antes 6258 teve 21 commits em 30 min e a 6260 12; agora as duas tiveram 1 commit por passo (seq 0 a 29, 30 cada), sem lacunas.
- Em staging o gate de início não existe, então o passo 0 (zerado) também gerou commit (6258 seq 0); em produção ele seria barrado pelo gate. É comportamento esperado, não defeito.
- O commit da 6260 é o mais lento (mediana 15 s, máx. 37 s, com ~60 raw novos por commit nos primeiros passos); isso passaria do TTL antigo de 45 s e cabe com folga nos 120 s com renovação.

## Pendências / observações

- Nenhum defeito novo aberto. Atenção operacional: a 6260 chega a 37 s por commit; se o TSE real mudar muitos estratos de uma vez, acompanhar `duracao_commit_ms`.
- O ensaio 2 deixou o cron do coletor-ensaio desligado e `collector/wrangler.toml` com `crons = []` no `[env.ensaio]`. Bucket `segundo-turno-ensaio2` mantido (lock de 1 dia).
- Scripts novos/atualizados em `qa/ensaio/` (`gerar_replay.py`, `mono.mjs`, `watcher.mjs`); logs do ensaio 1 foram movidos para `qa/ensaio/run1/`.
