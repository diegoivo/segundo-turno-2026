# Coletor do 2o turno 2026 (Cloudflare Worker)

Worker JS ESM, sem dependencias de runtime. Cron `* * * * *`; cada invocacao roda ate 4 ciclos espacados de 15 s.
Busca no TSE (6258 presidente: br + 27 UFs + zz; 6260 governador c0003: AC, AM, DF, ES, RN, TO, mais 487 estratos municipais/zonais), valida, e so grava no R2 (binding `DATA`) quando algum arquivo mudou.

## Rodar os testes
```
cd collector && npm test        # node --test --experimental-test-coverage (Node >= 20)
node ../tools/verificar-cadeia.mjs <url-base|diretorio> [--cadeia 6258]
```
Nao ha deploy neste repositorio ainda: `wrangler.toml` nao tem `account_id` e nada foi criado na Cloudflare.

## Layout do bucket
- `raw/<sha256>.json.gz`: corpo bruto do TSE, deduplicado (imutavel).
- `history/<eleicao>/<AAAA-MM-DD>/<seq 6 dig>-<sha>.json`: snapshot imutavel em JSON canonico (chaves ordenadas). `sha` = SHA-256 do proprio JSON canonico. Campos: `seq`, `coletado_em`, `fontes[{id,url,dg,hg,etag,last_modified,sha256_raw}]`, `modelo{versao,sha_codigo}`, `parcial`, `forecast` (ou `null` + `criterios_nao_atendidos`), `prev_sha256`, `prev_chave`. Duas cadeias independentes: `6258` e `6260`. Data da pasta = fuso de Brasilia.
- `live/latest.json`, `live/gov-<uf>.json`, `live/series.json`, `live/manifest.json` (mutaveis; `max-age=5, s-maxage=10, stale-while-revalidate=30`). `history/` e `raw/` sao `max-age=31536000, immutable`.
- `locks/coletor.lock`: lock de commit.

## Concorrencia (cron sobreposto)
Cadeias independentes: cada uma tem lock proprio (`locks/6258.lock`, `locks/6260.lock`; `put` com `onlyIf: etagDoesNotMatch '*'`, tomada de lock vencido com `etagMatches`, TTL 120 s, **renovado** durante o commit) e manifest proprio (`live/manifest-<eleicao>.json`, a fonte da verdade da cabeca). `live/manifest.json` continua existindo para o front como indice composto (`cadeias`), reconstruido dos manifests das cadeias com CAS. O fetch ao TSE nao usa lock. Um commit lento de 6260 (487 estratos) nao bloqueia 6258.
Ordem estrita de um commit: raws novos (paralelo limitado a 8, ja deduplicados) -> snapshot -> **CAS do manifest da cadeia** (ponto de commit) -> series, gov-<uf>, latest.json e indice. Se o CAS falhar, nada e publicado e o proximo ciclo retoma do R2. Series, gov, latest e indice sao escritos com CAS e reconstruidos a partir das cabecas **relidas do R2** a cada tentativa, entao nenhum escritor atrasado faz o placar regredir. A duracao de cada commit vai para o log, para `resumo.commits[].duracao_ms` e `duracao_commit_ms` no manifest da cadeia. Buckets antigos (so o indice composto) continuam funcionando.

## Ambientes e inicio da cadeia
`ENV = staging | production` (var no `wrangler.toml`; qualquer outro valor aborta). O manifest guarda o `ambiente`; Worker e bucket divergentes abortam sem escrever.
- staging: grava qualquer dado valido (bucket `segundo-turno-staging`). Endpoint `POST /coletar` (1 ciclo) com `Authorization: Bearer $STAGING_TOKEN` (`wrangler secret put STAGING_TOKEN --env staging`).
- production (`segundo-turno-prod`): HTTP sempre 404. **`seq=0` = primeiro dado real do TSE com `dg` >= `START_DATE` (2026-10-25) e secoes totalizadas > 0.** Escolhida em vez de "primeiro arquivo zerado" porque o zerado e de 15/10 (pre-eleicao, sem informacao) e o criterio A10 do PRD pede "1o dado real". Antes disso o Worker so consulta o arquivo BR e nao grava nada. Arquivos com qualquer chave `_sintetico*` (ex.: `_sintetico`, `_sintetico_ensaio`) sao rejeitados em production; um ensaio com dados sinteticos precisa rodar com `ENV=staging`.

## Validacao e stale
Eleicao/turno/cargo/abrangencia corretos, 2 candidatos, soma dos `vap` = `v.vvc`, secoes `st+snt=ts`, percentuais em 0..100, soma dos `pvap` ~ 100, `dg/hg` parseaveis. Invalido, 404 (fonte obrigatoria) ou falha de rede/5xx em 2 ciclos seguidos: o ultimo bom e mantido e a fonte entra em `stale_fontes` (manifest, latest, gov-<uf>); so ha escrita nas transicoes. Nao ha historico novo por causa de stale.

## Modelo (model/index.mjs v2.x)
`src/forecast-adapter.mjs` importa `../../model/index.mjs` (sem o modulo: `forecast=null`, criterio `modelo_indisponivel`). Entrada: presidente `{cargo, br, ufs (27 UFs + zz), stale, agora}`; governador `{cargo, uf, ufs:{uf}, estratos, stale, agora}`. Os dados vao no formato `Compacto` (agora com `eleitorado.totalizado`, `ele`, `t`). `estratos` so e enviado quando TODOS os estratos da UF ja foram coletados; antes disso o modelo roda em modo UF (faixa larga). `stale` = mapa id->bool das fontes com falha; `agora` = relogio do Worker.
O snapshot guarda `modelo {nome,versao,calibracao,sha_codigo}` (`sha_codigo` e null: o modelo nao exporta), `forecast`, `criterios_nao_atendidos` e `analise {apurado, parcial, estratificacao, definido_matematicamente}` (governador: mapa por UF).
- `live/latest.json`: por candidatura `forecast {projecao, faixa, meia_largura_pp, margem_pp, tendencia, confianca}`, `faixa_meia_largura_pp`, `confianca`, `definido_matematicamente`, `criterios_nao_atendidos`, `modelo_versao`, `pct_eleitorado`. Estratos com falha so entram como contagem (`estratos_stale`).
- `live/gov-<uf>.json`: forecast completo do modelo, `apurado`, `parcial_modelo`, `estratificacao`, `estratos_coletados`.
- `live/series.json`: ponto `{s,t,p,c,f:{p:projecao,m:meia_largura,c:confianca},d:definido}`; so entram pontos cujo `dg/hg` e >= `SERIE_INICIO` (padrao 2026-10-25T17:00-03:00).

## Estratos dos governadores (municipais; zonais no DF)
Lista derivada de `config/mun-e006260-cm.json` (AC 22, AM 62, ES 78, RN 167, TO 139, DF 19 zonas `df97012-z<zona>`), baixada uma vez e guardada em `state/estratos-6260.json`. So e baixada, assim como os arquivos, depois do 1o dado real (em producao ate la so o BR e consultado). Round-robin **sem estado**: o lote vem do minuto do relogio, entao crons sobrepostos escolhem os mesmos arquivos; 61 estratos por ciclo x 4 ciclos = 244 por invocacao, passada completa em ~2 min, sempre com `If-None-Match` (304). Os estratos ficam em `parcial` e `fontes` do snapshot (sem `url`, derivavel do id). A cadeia 6260 faz 1 commit por invocacao (nao por ciclo).
- Subrequests por invocacao: 4 x (35 + 61) = 384 fetches ao TSE (+1 config na 1a vez) + ~20-60 operacoes de R2. Orcamento configuravel (`SUBREQUEST_ORCAMENTO`, padrao 800 fetches; o lote encolhe se o orcamento acabar). Limite do Workers Paid: 10.000 por invocacao (antes 1.000; mesmo assim cabe).
- Taxa: ~6,4 req/s em media, pico <= 8 req/s (pacing de 125 ms entre inicios). Cada ciclo cabe em ~12 s; nenhum ciclo comeca depois de 58 s da invocacao (`PRAZO_INVOCACAO_MS`), entao nao ha sobreposicao com o cron seguinte. Se duas invocacoes se sobrepuserem mesmo assim, o commit e serializado pelo lock.
- Estimativa de Class A (R2) no dia da eleicao: raw novos (~13 mil: 487 estratos x ~20 mudancas + 29 arquivos x ~100) + snapshots (~600 gov + ~800 pres) + live (~6 por commit, ~9 mil) + lock/manifest (~4 por commit, ~5,5 mil) = **~30 a 45 mil/dia, pico ~8 mil/h**. Franquia: 1 M/mes. Class B: ~1.440 leituras de manifest/head por dia + series.

## Limites conhecidos / atencao
- Criterios de tempo do modelo (`frescorMaxS`/`dispersaoMaxS` = 300 s sobre `dg/hg`): se o TSE nao regerar o `dg/hg` de um municipio que nao mudou, o arquivo "velho" derruba o forecast de governador. Verificar no dia (o modelo usa o `dg/hg` do arquivo).
- `sha_codigo` do modelo fica null. `live/series.json` e acrescentada a cada commit (reconstruir de `history/` se for perdida). Sem "heartbeat" quando nada muda: o front usa `hg` do TSE e `atualizado_em`.
- Formato zonal do DF: `tpabr="zona"`, `cdabr` = zona; a validacao nao exige `tpabr/cdabr` nos estratos de zona.
