# PRD — Site do 2º turno 2026 (apuração ao vivo + forecast auditável)

> Documento vivo. Status geral: **PLANO APROVADO COM AJUSTES (23/10). Em andamento: F1 (API TSE), engenharia reversa do modelo do 1º turno, novo design com taste-skill. Domínio pendente.**
> Última atualização: 2026-10-23 (sexta), ~22h30 BRT.

## 1. Contexto e prazo

- 2º turno presidencial: **domingo 25/10/2026**. Urnas fecham **17h (Brasília)**, horário em que a divulgação de resultados começa.
- Tempo disponível: ~42h. O plano é enxuto de propósito: **só presidente**, uma página, nenhum componente sem justificativa de custo.
- Dados confirmados no TSE em 23/10 (`resultados.tse.jus.br/oficial/comum/config/ele-c.json`):
  - pleito `3220`, ciclo `ele2026`; eleição federal 1º turno `6257` → **2º turno `cdt2 = 6258`**;
  - `oficial/ele2026/6258/config/mun-e006258-cm.json` já responde 200 (534 KB, `max-age=8`);
  - o caminho de 2022 `dados-simplificados/br/br-c0001-e00XXXX-r.json` responde **404** para 6257 e 6258. O layout de arquivos de 2026 precisa ser descoberto na Fase 1 (risco R1).
- O projeto do 1º turno **não existe nesta máquina** (a pasta estava vazia e nada foi encontrado no disco nem no GitHub). A "mesma lógica do primeiro turno" precisa ser descrita pelo Diego (pergunta P1). Sem essa descrição, vale o modelo proposto na seção 6.

## 2. Objetivo

Página pública que mostra a apuração do 2º turno quase em tempo real (até 45 s de atraso sobre o TSE) e uma projeção do resultado final. Requisitos:
1. **Histórico auditável**: cada versão de dado e de forecast fica gravada, imutável e encadeada por hash, e pode ser verificada por terceiros.
2. **200 milhões de acessos** sem degradação.
3. **Custo mínimo**: alvo de US$ 0 a 5 por mês, mais o domínio.

## 3. Escopo

**Dentro:** presidente (BR, regiões e 27 UFs) na home; governadores das UFs com 2º turno, cada um em página própria; ao final da home, resumo "votos apurados × forecast" (presidente + cada governador); fase pré-apuração (contagem regressiva + resultado oficial do 1º turno); fase de apuração (parcial, % de seções, forecast ou "forecast indisponível" com o motivo); gráfico da série histórica do forecast; seção de auditoria (snapshots, hashes, download); página de metodologia.

**Fora (por enquanto):** governadores do 2º turno, municípios no front, mapa geográfico detalhado, pesquisas eleitorais, contas de usuário, comentários, app nativo, fotos de candidatos (direitos de imagem; usar cor e iniciais).

## 4. Arquitetura (custo zero no caminho de leitura)

```
          TSE (resultados.tse.jus.br)
                    │  fetch a cada 15 s (cron 1/min + laço interno de 4 ciclos)
                    ▼
     Worker "coletor" (Cron Trigger) ── valida ── calcula forecast
                    │  grava SÓ quando o dado do TSE muda (dg/hg/ETag)
                    ▼
     R2 bucket ─ live/latest.json        (mutável, ~2 KB gz, s-maxage=10)
               ─ live/series.json        (mutável, carregado 1× por visita)
               ─ history/AAAA-MM-DD/<seq>-<sha>.json  (imutável, cadeia de hash)
               ─ raw/<sha256>.json.gz    (payload bruto do TSE, deduplicado)
                    │  domínio custom dados.<dominio> + Cache Rules + Tiered Cache
                    ▼
     CDN Cloudflare (330+ PoPs) ◄── navegador faz polling a cada 20 s ± jitter
                    ▲
     Site estático (Workers Static Assets, sem script) ── www.<dominio>
```

Princípios:
- **Nenhum Worker no caminho de leitura.** Visitantes só tocam em asset estático (grátis e ilimitado) e em JSON servido do cache da CDN. Um Worker no caminho de leitura custaria US$ 0,30 por milhão de requisições (tabela 7.3).
- **Cache dirigido pela origem:** objetos no R2 com `Cache-Control: public, max-age=5, s-maxage=10, stale-while-revalidate=30`. Cache Rule em `dados.<dominio>` deixa `.json` elegível para cache (JSON não entra em cache por padrão). Os snapshots de `history/` e `raw/` usam `max-age=31536000, immutable`.
- **Smart Tiered Cache** (grátis): os PoPs consultam um tier superior antes do R2, e as idas à origem caem de "por PoP" para "por tier".
- **Blindagem contra cache-busting:** regra WAF (o plano Free tem 5) que bloqueia query string em `dados.<dominio>`, porque `?x=123` furaria o cache. Também 1 regra de rate limit por IP.
- **Cliente gentil:** polling de 20 s com jitter, pausa com a aba oculta (Page Visibility), backoff em erro, `If-None-Match` (304 sem corpo). A série completa é baixada 1× e depois atualizada pelo `latest.json`.
- **Degradação segura:** se o TSE falhar ou mandar schema inválido, o coletor mantém o último dado bom e marca `stale: true`. Com mais de 3 min de atraso, o front mostra "dados do TSE atrasados".

## 5. Histórico auditável

- Cada snapshot leva `seq`, `coletado_em`, `tse: {url, dg, hg, etag, sha256_raw}`, `modelo: {versao, sha_codigo}`, `parcial`, `forecast` (ou `forecast: null` + `criterios_nao_atendidos`) e `prev_sha256`. Isso forma uma **cadeia de hash**: alterar qualquer snapshot antigo quebra todos os seguintes.
- O payload bruto do TSE fica em `raw/` (gzip, deduplicado por hash). Qualquer pessoa consegue recalcular o forecast a partir do bruto com o código publicado.
- **R2 Bucket Lock** no prefixo `history/` e `raw/` (retenção mínima de 1 ano): nem nós conseguimos sobrescrever ou apagar.
- Publicação do código e de um script `verificar-cadeia` (Node, sem dependências) em repositório público (P5).
- Ao fim da apuração: bundle final (`history-final.tar.gz` + hash raiz) congelado.
- Recibos ou dados locais de teste **nunca** vão para o bucket de produção: os testes usam o bucket `segundo-turno-staging`, e o de produção começa com `seq=0` no primeiro dado real do TSE.

## 6. Modelo de forecast (proposta, a validar com P1)

Usa apenas dados oficiais do TSE. Sem pesquisa e sem boca de urna.
1. Base por município (5.570): resultado do 1º turno dos dois finalistas, votos dos eliminados e comparecimento.
2. Para municípios com apuração parcial: a parcial observada vale como estimativa local, com peso crescente conforme o % apurado.
3. Para seções ainda não apuradas: share esperado = base do 1º turno + **swing observado** (escala logit) nos municípios já apurados da mesma UF, encolhido para o swing da região e depois para o do país (hierárquico).
4. Votos restantes = eleitorado restante × comparecimento do 1º turno do município.
5. Incerteza: bootstrap dos resíduos do swing entre municípios. Saída: % válidos projetado por candidato, intervalo de 90% e probabilidade de vitória.
6. **Critérios mínimos para publicar** (sem eles, o site mostra "Projeção indisponível" e lista o que falta):
   - ≥ 10% das seções totalizadas no país;
   - ≥ 5% totalizadas em cada uma das 5 regiões;
   - ≥ 30 municípios com apuração ≥ 50% em cada região (para estimar o swing);
   - dados do TSE com menos de 3 min de atraso e schema válido.
7. "Vitória matematicamente definida" só aparece quando os votos restantes não alcançam mais a diferença (critério aritmético, sem modelo).
8. Antes de entrar em produção: backtest com **replay do 1º turno de 2026** e do 2º turno de 2022 em ordem real de totalização. Meta: intervalo de 90% contendo o resultado real em ≥ 90% dos instantes publicados.

## 7. Previsão de custos

### 7.1 Premissas de tráfego (cenário 200 M de visitas)
- 200 M de visitas (page views); sessão média de 8 min; polling de 20 s → ~25 requisições de JSON por visita.
- Total ≈ **5 bilhões de requisições de JSON + 600 M de requisições de asset**. Banda ≈ 10–15 TB.

### 7.2 Arquitetura proposta

| Item | Volume | Preço Cloudflare | Custo |
|---|---|---|---|
| CDN / banda (plano Free) | 10–15 TB | sem cobrança de banda | US$ 0 |
| Assets estáticos (Workers Static Assets) | ~600 M req | grátis e ilimitado | US$ 0 |
| JSON servido do cache (HIT) | ~5 B req | sem cobrança por requisição de cache | US$ 0 |
| R2 Class B (misses que chegam à origem) | < 2 M/mês com Tiered Cache | 10 M grátis/mês | US$ 0 |
| R2 Class A (gravações) | ~10 mil no dia da eleição | 1 M grátis/mês | US$ 0 |
| R2 storage | < 2 GB (raw em gzip) | 10 GB grátis | US$ 0 |
| Workers Paid (coletor; CPU > 10 ms para parsear 27 UFs) | ~45 mil invocações/mês | US$ 5/mês | **US$ 5** |
| Domínio | 1 | `.com.br` R$ 40/ano (registro.br) ou `.com` ~US$ 10,50/ano (Cloudflare Registrar) | R$ 40–60/ano |
| **Total** | | | **≈ US$ 5 no mês + domínio** |

Opcional: o plano Workers Free (US$ 0) só serve se o parse couber em 10 ms de CPU, o que é improvável com 27 UFs. Proponho assinar o Paid só no mês da eleição e cancelar depois.

### 7.3 O que NÃO fazer (custo do mesmo tráfego)

| Alternativa | Custo estimado para 5 B req |
|---|---|
| Worker/Pages Function respondendo o JSON | ~US$ 1.500 (US$ 0,30/M) + CPU |
| R2 sem cache na frente (Class B direto) | ~US$ 1.800 (US$ 0,36/M) |
| Durable Objects / WebSocket para "push" | US$ 1.000+ e mais complexidade |
| Vercel/Netlify por banda | US$ 1.000–2.000+ (15 TB) |

## 8. Entradas
- API pública de resultados do TSE (`resultados.tse.jus.br/oficial/ele2026/...`).
- Conta Cloudflare do Diego (Wrangler local, `wrangler login`).
- Domínio, a ser comprado pelo Diego após aprovação (P2).
- Descrição da lógica do 1º turno (P1), se houver.

## 9. Entregáveis
1. `collector/`: Worker com Cron, validação de schema, forecast, gravação no R2 e cadeia de hash.
2. `model/`: forecast puro (sem I/O), testável, com backtest.
3. `web/`: página estática (HTML + JS vanilla/Preact, ≤ 60 KB gz) e página de metodologia.
4. `tools/verificar-cadeia.mjs`: verificador público do histórico.
5. Infra: R2 (prod + staging), domínio custom, Cache Rules, Tiered Cache, regra WAF, rate limit e Bucket Lock.
6. Docs: `README.md`, `docs/DEPLOY.md`, `docs/METODOLOGIA.md`, `docs/EXECUCAO-segundo-turno.md`.
7. Desenho da home: `docs/mockup-home.html`.

## 10. Critérios de aceite (mensuráveis)

| # | Critério | Como o QA verifica |
|---|---|---|
| A1 | URL pública responde 200 em HTTPS no domínio final | `curl -I` |
| A2 | `cf-cache-status: HIT` em ≥ 99% das requisições a `latest.json` após aquecimento | 200 `curl` seguidos, a partir de 2 redes |
| A3 | Zero invocações de Worker no caminho de leitura | Analytics do Workers: só invocações do cron |
| A4 | Atraso TSE → site ≤ 45 s (p95) | comparar `hg` do TSE com `coletado_em` e com o horário de exibição |
| A5 | `latest.json` ≤ 3 KB gz; JS+CSS inicial ≤ 60 KB gz; Lighthouse mobile ≥ 95 | `curl --compressed -w size`, Lighthouse |
| A6 | Cadeia de hash 100% válida e adulteração detectada | `verificar-cadeia` em prod + teste que altera 1 byte |
| A7 | Forecast oculto quando os critérios da seção 6.6 falham | testes unitários + replay com cortes de % |
| A8 | Backtest: cobertura do IC 90% ≥ 90% | relatório do backtest |
| A9 | Query string em `dados.` bloqueada (403) | `curl` |
| A10 | Nenhum dado de staging/teste no bucket de prod; `seq=0` = 1º dado real | listagem do R2 + inspeção do snapshot 0 |
| A11 | Teste de carga moderado (2 mil req/s por 60 s) sem erro e com HIT | `oha`/`k6` |
| A12 | Página funciona a 360 px, com contraste AA, nos temas claro e escuro | Playwright + axe |
| A13 | Gráficos: eixo de tempo começa às 17h; nenhuma projeção sem a faixa calibrada; eixo Y fixo; apurado × projeção distinguíveis sem cor; frase-resumo em português simples | revisão do QA com screenshots + checagem no código |

## 11. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Layout dos arquivos de 2026 mudou (404 no caminho de 2022) | Fase 1: descobrir pelos arquivos `config` e pelo front oficial do TSE; parser tolerante; fallback só com BR |
| R2 | TSE limita ou bloqueia o coletor | 1 fetch a cada 15 s por arquivo, `If-None-Match`, User-Agent identificado, sem paralelismo agressivo |
| R3 | Modelo erra no começo da apuração (viés geográfico de quem conta primeiro) | critérios mínimos, swing hierárquico, IC largo, backtest; na dúvida, não publicar |
| R4 | Questão legal (divulgação no dia da eleição) | só dado oficial e só após 17h; sem pesquisa ou boca de urna; aviso de "projeção estatística, não oficial". Recomendo uma checagem jurídica rápida |
| R5 | Prazo de 42h | escopo mínimo, sub-agents em paralelo, ensaio geral domingo às 15h |
| R6 | Propagação de DNS do domínio novo | comprar no sábado de manhã; `.com` na Cloudflare ativa na hora; o `workers.dev` serve de fallback sem as regras de cache |
| R7 | Cache-busting ou ataque | regra WAF, rate limit, DDoS grátis, Under Attack Mode pronto |
| R8 | Arquivo do 1º turno indisponível para a base do modelo | descobrir na Fase 1; sem base, o forecast fica desligado e só a parcial vai ao ar |

## 12. Plano de fases

| Fase | Quando | O quê | Executor (modelo) | Status |
|---|---|---|---|---|
| F0 | sex 23/10 | PRD + mockup + aprovação | principal | **aguardando aprovação** |
| F1 | sáb manhã | Descoberta da API TSE 2026 (6257/6258), schemas e fixtures reais | worker Sonnet | pendente |
| F2 | sáb | Modelo + backtest (replay do 1º turno 2026 e do 2º turno 2022) | worker Fable | pendente |
| F3 | sáb | Coletor + R2 + cadeia de hash + validação | worker Sonnet | pendente |
| F4 | sáb | Front estático conforme mockup | worker Sonnet | pendente |
| F5 | sáb noite | Infra Cloudflare (domínio, R2, regras, cron) em staging | principal + Wrangler | pendente |
| F6 | sáb noite / dom manhã | QA independente (A1–A12), loop de correção ≤ 3 | QA Sonnet + Haiku | pendente |
| F7 | dom 15h | Ensaio geral em prod com o bucket de prod vazio; liga o cron às 16h30 | principal | pendente |
| F8 | dom 17h → fim | Monitoramento ao vivo; congelamento e bundle final | principal | pendente |

## 13. Perguntas abertas (bloqueiam a execução)
- **P1.** O que era a "lógica do primeiro turno"? (link do site, código ou descrição do modelo). Sem resposta, vale o modelo da seção 6.
- **P2.** Domínio: `.com` pela Cloudflare (ativa na hora, ~US$ 10,50/ano) ou `.com.br` pelo registro.br (R$ 40/ano, exige CPF/CNPJ e troca de NS)? Qual nome?
- **P3.** Aprova o Workers Paid (US$ 5/mês, só em outubro/novembro)?
- **P4.** Mostrar só presidente? (recomendado pelo prazo)
- **P5.** Publicar o código e o histórico em repositório GitHub público (reforça a auditoria)?

## 14. Log de decisões
- 2026-10-23: sem Worker no caminho de leitura; polling em JSON cacheado em vez de push; sem fotos; o forecast só aparece com os critérios mínimos atendidos.
- 2026-10-23 (respostas do Diego):
  - **P1** → reaproveitar o modelo do site do 1º turno (https://apuracao-2026-vs-2022.diegoivo.chatgpt.site/), que deu certo. A engenharia reversa vai para `docs/MODELO-1T-ENGENHARIA-REVERSA.md`; a seção 6 será substituída por esse modelo adaptado ao 2º turno.
  - **P2** → domínio decidido depois. Até lá, staging em `*.workers.dev` / `r2.dev`, sem as regras de cache de zona (A2/A9 só são verificáveis com o domínio).
  - **P3** → Workers Paid aprovado (US$ 5/mês).
  - **P4** → presidente **e governadores** (UFs com 2º turno), cada governador em página própria (`/governador/<uf>`). A home termina com o **resumo "votos apurados × forecast"**.
  - **P5** → código no GitHub pessoal do Diego (repositório público).
  - Design: refazer com o **taste-skill v2.1.4** (Leonxlnx/taste-skill, instalado em `~/.claude/skills/design-taste-frontend`), usando **nomes reais** dos candidatos (fonte: TSE).
  - Cores: **vermelho = Lula**, **azul = Flávio Bolsonaro** (igual ao site do 1º turno). Os nomes ainda serão confirmados pelo TSE. Governadores: vermelho = candidato do PT ou da base do Lula; azul = candidato do PL ou da base do Flávio; sem nenhum dos dois lados na disputa → duas cores neutras (aprovado pelo Diego em 23/10). Caso misto (um lado claro, outro neutro: ES, RN, TO) → o lado claro leva a sua cor e o outro fica neutro (opção "a", aprovada em 23/10). Mapa de cores: `docs/GOVERNADORES-ALINHAMENTO.md`. O alinhamento de cada candidato é julgamento de sub-agent, com a fonte citada.
  - Escopo de custo: governadores somam ~10 UFs × 1 arquivo a cada 15 s ao coletor, sem impacto relevante (R2 Class A continua < 1 M/mês).


## 15. Status (24/10/2026)
Todas as fases foram concluídas e o site está no ar em https://segundo-turno-web.hosts5924.workers.dev. Ensaio 2 aprovado; QA final 9/9 PASS (`docs/QA-FINAL-PRODUCAO.md`). Pendências: domínio, confirmação do Workers Paid e o gatilho operacional `sem_correcao`. Detalhes em `EXECUCAO-segundo-turno.md`.
