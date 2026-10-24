# Front do site do 2º turno 2026

Site estático (SSG em Node + JS vanilla). Sem framework; única dependência de build: `esbuild`. O HTML é pré-renderizado no estado "antes das 17h" com o resultado real do 1º turno (TSE 6257/6259) e depois hidratado pelo JS com os JSON do coletor.

## Páginas
`/` (home), `/governador/<ac|am|df|es|rn|to>/`, `/metodologia/` (renderizada de `docs/METODOLOGIA.md`), `/auditoria/` (cadeias 6258 e 6260, verificação no navegador), `404.html`. A home tem só um link discreto para a auditoria, no rodapé.

## Buildar
```
cd web && npm install
npm run build        # gera web/dist/
```
Variáveis de ambiente do build:

| Variável | Padrão | Uso |
|---|---|---|
| `DATA_BASE_URL` | `/dados/` | base dos JSON (`<base>live/latest.json` etc.). Mesma origem por padrão; para o domínio de dados: `https://dados.exemplo.com.br/` |
| `SITE_URL` | `https://apuracao2026.example.com.br` (placeholder) | canonical, OG, sitemap |
| `VERIFIER_URL` | `https://github.com/SEU-USUARIO/segundo-turno/blob/main/tools/verificar-cadeia.mjs` (placeholder) | link do verificador público |
| `EVIDENCE_TEXT` | vazio | frase opcional de evidência sob o título (ex.: desempenho no 1º turno); só aparece se preenchida |
| `OUT_DIR` | `dist` | pasta de saída |

Saída: HTML, `assets/app.<hash>.js|css` e `assets/mapa-br.<hash>.json` (hash de conteúdo, `immutable`), ícones, `manifest.webmanifest`, `og.png` (gerado no build, sem números), `robots.txt`, `sitemap.xml` e `_headers` (Workers Static Assets: HTML `public, max-age=60, s-maxage=60, stale-while-revalidate=300`; `/assets/*` `public, max-age=31536000, immutable`).

## Como os dados entram
- Polling de `live/latest.json` a cada 20 s ±3 s (jitter), pausado com a aba oculta, backoff exponencial em erro. `fetch` simples, **nunca** com query string (o WAF bloqueia); o cache fica por conta do CDN.
- `live/series.json`: 1× por visita (só depois do primeiro dado real), depois estendido pelos pontos do latest. `live/gov-<uf>.json`: só na página da UF. `live/manifest.json` e snapshots: só mapa (lazy) e auditoria.
- "Dados do TSE atrasados": `stale=true` ou `dg/hg` do presidente com mais de 3 min (exceto a 100% das seções).
- Estados derivados dos dados: sem dado/0% = pré-apuração; dado sem `forecast` = sem projeção (critérios faltantes de `criterios_nao_atendidos`); `forecast` = com projeção; `definido_matematicamente` = definido. Campo ausente aparece como "—".
- Precisão ("a projeção erra em média ±X ponto; a parcial, ±Y"): lê `forecast.erro_medio_esperado` (ou `erro_medio_esperado` no bloco da disputa) no formato `{projecao: X, parcial: Y}`. Sem o campo, a frase não aparece. Ajustar `erroMedio()` em `src/lib/components.mjs` se o modelo exportar outro formato.

## Testar
```
npm test            # unitários (node --test), cobertura de src/lib
npm run build && npm run test:e2e   # Playwright (usa o Google Chrome instalado; ou npx playwright install chromium e CHROME_CHANNEL=)
npm run lighthouse -- 3             # Lighthouse mobile em dist/ + dados de exemplo (estado 3)
npm run serve -- 3                  # dist/ + /dados/ com o estado 1..4 de exemplo em http://127.0.0.1:8787
```
Os JSON de exemplo (`test/fixtures/gerar.mjs`) usam números arbitrários e só existem nos testes; nunca entram em `dist/`.

## Estrutura
`src/lib` (lógica pura e componentes de HTML, usados no build e no navegador), `src/client` (DOM, polling, mapa, auditoria), `src/build` (casca das páginas, OG, cabeçalhos), `src/css/app.css`, `src/data/primeiro-turno.json` (1º turno real, gerado por `scripts/extrair-dados-1t.mjs`), `scripts/build.mjs`.
