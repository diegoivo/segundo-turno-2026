# Execução — Site do 2º turno 2026

> Log vivo. PRD: `docs/PRD-segundo-turno.md`.

## Log de fases
| Data/hora (BRT) | Fase | Evento |
|---|---|---|
| 2026-10-23 22h | — | Pasta encontrada vazia; o projeto anterior (Codex) não existe no disco nem no GitHub. Recomeço do zero. |
| 2026-10-23 22h | F0 | TSE consultado: 2º turno = eleição `6258` (pleito 3220, ele2026); config de municípios publicada; caminho `dados-simplificados` de 2022 retorna 404 → layout de 2026 a descobrir. |
| 2026-10-23 22h30 | F0 | PRD + mockup (`docs/mockup-home.html`) entregues. **Aguardando aprovação.** |

## Custos incorridos
- Nenhum até agora (nenhuma conta, serviço ou domínio contratado).

## Decisões
- Ver PRD, seção 14.

## Pendências
- Respostas P1–P5 do PRD.
- Compra do domínio (pelo Diego).

## 2026-10-23 ~23h — Rodada 2 (respostas do Diego)
- taste-skill **v2.1.4** clonado em `~/.claude/vendor/taste-skill` (tag v2.1.4, commit 6010f91) e linkado em `~/.claude/skills/design-taste-frontend` via `install.sh --claude`. O script foi revisado antes: só cria o symlink.
- Site do 1º turno baixado (HTML + bundles) para engenharia reversa. Fontes vistas no bundle: `oficial/ele2026/6257/dados/<uf>/<uf>-c0001-e006257-u.json` e `Historico_Totalizacao_Presidente_BR_{1T,2T}_2022.zip`.
- Workers em paralelo (Sonnet): (a) engenharia reversa do modelo → `docs/MODELO-1T-ENGENHARIA-REVERSA.md`; (b) API TSE 2º turno + candidatos reais + fixtures → `docs/TSE-API-2026.md`, `fixtures/tse/`.
- Próximo: design com taste-skill (worker), após confirmar os nomes dos candidatos.
- F1 concluída (worker): `docs/TSE-API-2026.md` + 50 fixtures em `fixtures/tse/`. Conferência independente via curl: 6258 BR traz LULA (13, PT) e FLAVIO NANTES BOLSONARO (22, PL); 6260 c0003 responde 200 em AC, AM, DF, ES, RN e TO e 404 em AL. Lacuna: não existe histórico de totalização de 2026 publicado; a série é montada pelo próprio coletor.
- Cores aprovadas pelo Diego: Lula = vermelho, Flávio = azul; governadores pela regra de base (classificação em andamento → `docs/GOVERNADORES-ALINHAMENTO.md`).
- Em andamento: design com taste-skill (worker Sonnet) → `design/`; classificação de alinhamento dos governadores (worker Sonnet); engenharia reversa do modelo.
- Engenharia reversa concluída → `docs/MODELO-1T-ENGENHARIA-REVERSA.md`. O modelo do 1º turno é uma projeção estratificada por UF (pendentes × share atual), com faixa de ±2 p.p. não calibrada e sem limiar mínimo. Reproduzido exatamente (Lula 44,42% / Flávio 47,65% a 64,8% apurado; final 45,16% / 47,03%).
- F2 disparada: worker Fable → `model/`, `docs/METODOLOGIA.md`, `docs/BACKTEST.md`.
- Alinhamento dos governadores → `docs/GOVERNADORES-ALINHAMENTO.md`. Pendente: QA independente das fontes e a decisão do Diego para UFs com um lado claro e outro neutro (ES, RN, TO).
- F2 concluída (worker Fable, 24/10 ~02h): `model/` (ESM puro, `forecast(entrada)`, versão 2.0.1, calibração `bt2022-2026-10-24`), 27 testes `node --test` (cobertura de linhas 99%), backtest por replay dos boletins de urna de 2022 (ordem real `DT_BU_RECEBIDO`, 1T e 2T, 28 abrangências + 38 corridas estaduais) → `docs/BACKTEST.md`, `docs/METODOLOGIA.md`. Modelo final: estratificado (UF / município / zona no DF) + prior do 1T 2026 com swing para estratos sem apuração; encolhimento e ajuste pela curva de 2022 rejeitados pelo backtest. Faixas por % apurado (presidente 2,3 p.p. a 10-20% → 0,5 a 90-95%; governador 1,7 a 20-30% → 0,25 a 90-95%). Integração: o coletor precisa passar `e.est` (eleitorado totalizado) e os arquivos municipais/zonais dos governadores (contrato no topo de `model/index.mjs`). Dados do 1T 2026 não usados na calibração (holdout).
- v3.0.0 do modelo (24/10 ~03h, worker Fable, a pedido do Diego): correção da deriva das urnas tardias no presidente (curva do erro médio por % apurado, estimada no 2T 2022 e subtraída da projeção; validação independente: curva do 1T 2022 aplicada ao holdout 1T 2026 reduziu o MAE de 0,33 para 0,065 p.p. e o viés de −0,33 para +0,05). Modelo municipal do presidente (B) implementado e calibrado (`presidente_mun`, baseline de 5.716 municípios a partir dos BUs do 1T 2026), mas não ativado: exige ~5.700 arquivos por leitura; liga sozinho se o coletor passar `entrada.estratos`. Faixa do presidente recalibrada (±0,6 a 10-30% → ±0,2 a 90-95%) e `erro_medio_esperado_pp` exportado para a UI. 31 testes, cobertura de linhas 97,7%. Detalhes em `docs/BACKTEST.md` §8.
- Diego escolheu a opção (a) para os casos mistos de cor (ES/RN/TO).
- F3 coletor concluído (worker) → `collector/` + `tools/verificar-cadeia.mjs`. Conferência local: 28/28 testes, cobertura 99% linhas / 91,7% ramos. A cadeia de produção começa no 1º dado real de 25/10 com seções > 0. Pendências: `onlyIf` do R2 só testado em mock (testar em staging), municipais dos governadores dependem do modelo, reconstrução de series.json a partir de history/. QA independente pendente.
- Pedido do Diego: validar o modelo com o 1º turno de 2026. Achado: o TSE publica os boletins de urna de 2026 por seção com `DT_BU_RECEBIDO`, o que permite reconstruir a parcial minuto a minuto. O site anterior expõe 190 pontos reais da série nacional (`/api/live` → history), usados como prova de fidelidade da reconstrução.
- Decisão de método: calibração só com 2022 (1T/2T); 1T 2026 = holdout para validação às cegas por agente independente. Worker de backfill disparado → `backfill/1t2026/`, `docs/BACKFILL-1T2026.md`.
- Design concluído (worker, taste-skill v2.1.4, rota app, estilo "Achromatic ledger") → `design/` (home com 4 estados, governador com `?uf=`, 26 screenshots, `DESIGN.md`). Inspetor do skill: 0 FAIL, 1 WARN (densidade da 1ª dobra em 1440). JS+CSS 22,5 KB gz sem minificar. Aguardando aprovação do Diego.
- Feedback de design do Diego: cantos levemente arredondados (sem quadrados); ícone do site nas cores do Brasil; mapa real do Brasil por UF no panorama (malha IBGE simplificada, carregada à parte); Auditoria colapsada; ícones Google Material Symbols Rounded em SVG inline. Repassado ao worker de design.
- Diego: histórico começa às 17h (fim da votação); gráficos legíveis por leigos e com validade estatística (% dos válidos com linha de 50%, faixa calibrada sempre junto da projeção, eixo fixo, apurado × projeção visualmente distintos, frase-resumo simples). Repassado ao design; regras vão para o DESIGN.md.
- F2 modelo concluído (worker Fable) → `model/` v2.0.0 (calibração bt2022-2026-10-24), `docs/METODOLOGIA.md`, `docs/BACKTEST.md`. O estratificado do 1º turno ganhou fallback 1T 2026 + swing (MAE −31% nas corridas estaduais), governador por município e DF por 19 zonas. A curva 2022 e o encolhimento foram rejeitados pelo backtest. Faixa calibrada por % apurado (presidente: 2,29 p.p. a 10–20% → 0,17 a 98–99,5%). 0 vencedores errados em 7.530 chamadas (2022). 27 testes, 99,4% linhas. 1T 2026 preservado como holdout.
- Integração modelo ↔ coletor devolvida ao worker do coletor (falta `est` no Compacto; municipais/zonais dos governadores).
- Integração modelo ↔ coletor concluída (worker): 35/35 testes, 99,3% linhas. 487 estratos de governador em round-robin (~2 min por passada, ~6,4 req/s, orçamento de 800 fetches por invocação); Class A estimada em 30–45 mil no dia. `zz` obrigatório (confirmado 200).
- Risco de frescor dos estratos: conferido no TSE que os finais municipais compartilham o dg/hg da UF (AC 21:08:16). Mesmo assim, pedida ao modelo a v2.0.1: estratos com 100% isentos de frescor e frescor do estrato medido contra o dg da UF.
- Design v2 concluído: cantos arredondados (tokens de raio), marca verde/amarelo/azul, mapa IBGE (10,8 KB gz, lazy), Auditoria recolhida, Material Symbols inline (9 ícones), regras de gráfico (17h, 35–65% fixo, faixa calibrada sempre junto, apurado sólido × projeção tracejada). Inspetor: 0 FAIL. JS+CSS inicial 26,7 KB gz. Aguardando aprovação do Diego.
- Modelo v2.0.1 (salvaguarda de frescor) integrado. Coletor: 36/36 testes, 99,3% linhas; o adaptador já passava `ufs[uf]`. Teste novo cobre município final antigo (não derruba) e UF velha (derruba só a UF).
- Design aprovado pelo Diego. F4 front de produção disparado (worker Sonnet) → `web/`.
- Backfill 1T 2026 concluído → `backfill/1t2026/`, `docs/BACKFILL-1T2026.md`. 499.206 seções, 265 instantes. Final = oficial (tolerância 0, em votos). Contra 190 pontos reais: |Δ| médio 0,002 p.p.; 115/190 pontos batem voto a voto com um prefixo da ordem de DT_BU_RECEBIDO. O TSE totaliza ~0,5 min (mediana) após o recebimento. Validação cega disparada (QA Sonnet independente) → `docs/VALIDACAO-1T2026.md`.
- Wrangler 4.152.0 instalado em `collector/` (devDependency). Já autenticado (OAuth, diego@conversion.com.br). Duas contas visíveis: "Diego@conversion.com.br's Account" (e8c4…e6bb) e "Hosts@conversion.com.br's Account" (7da0…e913) → perguntar qual usar.
- Diego (24/10): sem estimativa de horário do resultado; conta Cloudflare = **Hosts@conversion.com.br** (7da0…e913).
- Infra staging: buckets R2 `segundo-turno-staging` e `segundo-turno-prod` criados; lock de teste (2 dias) em `history/` e `raw/` do staging; coletor staging no ar em https://segundo-turno-coletor-staging.hosts5924.workers.dev (cron 1/min). Coleta manual com o TSE real: seq 0 nas cadeias 6258 e 6260, 97 subrequests, sem erros. Endpoint sem token → 401. `account_id` fixado no wrangler.toml.
- Validação cega 1T 2026 (QA independente) → `docs/VALIDACAO-1T2026.md`: **APROVADO COM RESSALVAS**. Presidente (modo cego): publica às 17:52 (10,05%), erro médio 0,76 p.p. contra 1,96 da parcial, cobertura 94,8%, 0 chamadas erradas, maior salto 0,11 p.p. Ressalvas: 10 das 11 falhas de cobertura estão em 10–16% apurado; AM com cobertura de 89,5%.
- Diego (24/10): a proposta do site é a projeção estatística (manchete); precisão em linguagem simples; frase de proposta; liberação mantida em **10%**; histórico auditável mantido, sem ênfase (link no rodapé + /auditoria/). Repassado ao front.
- Diagnóstico de metodologia (pergunta do Diego sobre as urnas tardias pró-Lula): no 1T 2026 cego, o erro do modelo tem sinal único, com Lula subprojetado (−2,32 a 10–20% → −0,15 a 95–99%). A estratificação por UF captura ~metade da deriva; o resto é intra-UF. O perfil é quase idêntico ao do 1T 2022, o que indica deriva estável no mesmo tipo de turno. Modelo v3 pedido (Fable): (B) swing municipal com base no turno anterior; (C) correção de deriva calibrada no mesmo tipo de turno (2T 2022 → 2T 2026), validada fora da amostra 1T 2022 → 1T 2026; exportar `erro_medio_esperado`.
- Modelo v3.0.0 (worker Fable): A+C = estratificação por UF + correção de deriva das urnas tardias (curva do 2T 2022). Holdout 1T22→1T26: viés −0,33 → +0,05; MAE 0,33 → 0,065. B (municipal) implementado, mas desligado (coleta de ~5.700 GET por passada inviável no prazo). Novos campos: correcao_pp, sem_correcao, erro_medio_esperado_pp. Conferência: modelo 32/32, coletor 36/36.
- Alerta do orquestrador: a faixa da v3 (±0,61 no início) foi definida usando o holdout → o holdout deixou de ser cego. Revisão estatística independente disparada (Fable) → `docs/REVISAO-ESTATISTICA-V3.md`.
