# QA independente do front (staging)

Alvo: https://segundo-turno-web-staging.hosts5924.workers.dev | Data: 2026-10-24 | Evidências: /private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/qa-front/ (qa.json, lh-home.json, lh-gov.json, e2e.txt, shot-*.png)
Código não editado. Nenhum node_modules temporário criado (o web/node_modules já existia; o lighthouse@12 do npx reutilizou cache antigo).

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| 1 | URLs 200 / 404 real | PARCIAL | `/`, 6 governadores, `/metodologia/`, `/auditoria/`, robots.txt, manifest, favicon.svg, og.png (10,6 KB), sitemap, apple-touch-icon: 200. Rota inexistente: status 404 mas corpo VAZIO (content-length 0); a página 404 só existe em `/404` (200). `/favicon.ico`: 404. Ver D1. |
| 1b | Cache-Control | OK | HTML: `public, max-age=60, s-maxage=60, stale-while-revalidate=300`; `/assets/app.*`: `public, max-age=31536000, immutable`; robots/manifest/ícones/og: 86400; 404: no-store |
| 2 | /dados/live/latest.json | OK | 200, x-cache MISS depois HIT (age 0), 815 B gz, `cache-control: public, max-age=5, s-maxage=10, swr=30`; `?x=1` -> 400; `/dados/locks/`, `/dados/locks/x.json`, `/dados/locks/manifest.json` -> 404 |
| 2b | Polling ~20 s sem query | OK | Em 62 s: requisições em 0, 22,8, 40,3, 60,9 s; todas `/dados/live/latest.json` sem query. Cada tick aparece 2x (tipo `fetch` + `other`, mesmo instante; provável revalidação do cache, não confirmado) |
| 3 | 360/768/1440 x claro/escuro, sem scroll-x e sem erro de console | PARCIAL | 54 combinações (9 páginas x 3 larguras x 2 temas): 0 erros/avisos de console, 0 respostas >=400. Scroll horizontal só em `/metodologia/` a 360 px (scrollWidth 637 > 360), claro e escuro. Ver D2. Screenshots: shot-_-*, shot-_governador_am_-*, shot-_auditoria_-* |
| 3b | Estado coerente (0% apurado, sem projeção) | OK | latest.json: pct_secoes 0, forecast null, votos 0. UI mostra contagem regressiva (01d 16h), "A apuração começa às 17h", "Aguardando as 17h", tabela com "—"; nenhuma projeção, faixa ou número inventado. Gráfico: eixo X 17h-22h, Y fixo 35-65%, linha 50%, legenda cheia (apurado) x tracejada (projeção) |
| 4 | Sem JavaScript | OK | Body mostra placar do 1º turno real (Lula 45,16% / 53.879.538; Flávio 47,03% / 56.104.503; 499.248 seções; 78,92%), critérios, tabelas por região e por UF; governador DF idem (screenshots shot-nojs-*) |
| 5 | Conteúdo | OK | Lula 13 PT vermelho, Flávio 22 PL azul. Números 1º turno conferidos contra fixtures TSE 6257 (br) e 6259 (AC, AM, DF, ES, RN, TO): todos idênticos (ex.: Mailza 218.760/49,76; Aziz 841.846/40,63; Celina 825.530/49,93; Pazolini 1.048.633/49,65; Allyson 733.809/36,94; Dorinha 386.260/45,52). Cores conferem com GOVERNADORES-ALINHAMENTO: AC dois neutros, AM Aziz vermelho x Maria do Carmo azul, DF Grass vermelho x Celina azul, ES Pazolini azul x Ferraço cinza, RN Cadu vermelho x Allyson cinza, TO Dorinha azul x Vicentinho cinza. Faixa "SIMULAÇÃO"/mockup: ausentes (grep no HTML de `/` e `/governador/am/`: 0 ocorrências). Auditoria só no rodapé ("Auditoria e histórico") |
| 5b | /auditoria/ | OK com ressalva | "Verificar a cadeia" no navegador: "Cadeia íntegra. 1 snapshots recalculados (#0 a #0). Hash da ponta 61cf0c3e…0d89c5" (presidente 6258); governadores 6260: "Cadeia íntegra · 5 versões · 35d5d2…". Ressalva: com 1 snapshot o teste "adulteração de 1 byte no snapshot do meio" não tem como demonstrar detecção (continuou "íntegra"); coberto pelo E2E local |
| 6 | Lighthouse mobile | FALHA (a11y) | Home: perf 99, **a11y 94**, BP 100, SEO 100 (LCP 1,9 s, CLS 0, TBT 0). Governador AM: perf 100, a11y 96, BP 100, SEO 100. Ver D3 |
| 7 | Pesos gzip | OK | JS 22.372 B + CSS 5.898 B = 28,3 KB (<=60); HTML home 9.683 B (<=30); governador ~7,4 KB |
| 8 | Suíte E2E (`npm run test:e2e`) | OK | 21 passed / 0 failed (24,8 s), cobre estados 1-4 de exemplo, polling, stale, sem JS, mapa, auditoria com adulteração, 404, tema escuro. Roda contra dist/ local, não contra staging |

## Defeitos
| ID | Sev. | Descrição | Evidência |
|---|---|---|---|
| D1 | Média | Rota inexistente devolve 404 com corpo vazio (sem a página "404" desenhada) e `/404.html` redireciona 307 para `/404` (200). O E2E local passa porque o servidor de teste serve 404.html; em Workers Static Assets `not_found_handling="404-page"` não achou o arquivo (provável efeito de html_handling/auto-trailing-slash renomear 404.html -> /404). `/favicon.ico` também 404 vazio | `curl -i /nao-existe/` -> `HTTP/2 404, content-length: 0`; `curl /404` -> 200 com HTML (9.349 B) |
| D2 | Média | `/metodologia/` com scroll horizontal a 360 px (scrollWidth 637). Viola A12 | qa.json: render[...] pg=/metodologia/ w=360 hscroll=true (claro e escuro); provável tabela/código largo sem overflow-x |
| D3 | Média | Lighthouse a11y da home = 94 (<95). Falhas: `heading-order` (h4 sem h3), `definition-list` (`<dl class="kpis">` com filhos inválidos; também no governador), `label-content-name-mismatch` (`a.brand` aria-label "Apuração do 2º turno 2026, início" não contém o texto visível) | lh-home.json, lh-gov.json |
| D4 | Baixa | Rótulos do eixo X do gráfico "17h" e "17:30" colados/sobrepostos a 1440 px ("17h17:30") | shot-_governador_am_-1440-dark.png |
| D5 | Baixa | Na página de governador a 1440 px o item "Presidente" da navegação aparece cortado ("Presid") | mesmo screenshot |
| D6 | Baixa | CSS bloqueia renderização (economia estimada 300 ms); sem impacto na nota (perf 99-100) | lh-home.json |
| D7 | Baixa | Dois eventos de rede por tick de polling (fetch + other); confirmar se há requisição duplicada real | ver 2b |

Veredito: staging utilizável; antes de produção corrigir D1, D2 e D3 (A12 e A5 não fecham integralmente).
