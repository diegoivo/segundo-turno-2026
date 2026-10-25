# QA independente: ajustes de front (25/10)

Staging: https://segundo-turno-web-staging.hosts5924.workers.dev (build com SITE_URL de staging; sem deploy em produção; collector e R2 intocados). Screenshots em `docs/qa-ajustes/qa-*.png`.

## Resultado por item

| Item | Resultado | Evidência |
|---|---|---|
| 1. `npm test` | PASS | 30/30, 0 falhas, cobertura de linhas 99,77% (meta 80%) |
| 1. e2e | PASS (com flake) | 1ª execução 39/40 (falha em `ajustes.spec.mjs:168`, `?demo=1`, esperava requisição de `/demo/snapshot-6258.json`); reexecução isolada 3/3 e completa 40/40 |
| Header mobile (360/390) | PASS | 85 px, 2 linhas (marca+status+GitHub+tema; nav abaixo). Meta: ≤ 2 linhas e ≤ 96 px |
| Header 768/1280 | PASS | 56 px, 1 linha (meta ≤ 64 px). Com e sem `?demo` |
| Tema só ícone | PASS | sem texto, aria-label e title trocam; alternado de verdade claro (bg 242,244,247) → escuro (11,13,16) → claro |
| GitHub | PASS | href https://github.com/diegoivo/segundo-turno-2026, "Star" + contagem; API retorna 0 estrelas e o botão mostra 0 (correto) |
| `?demo=1` | PASS com ressalvas (D1, D3) | faixa "Simulação com dados do 1º turno — não é resultado real" visível, 46,4% apurado, projeção, 0 requisições a /dados/ (home 390/1280 e governador/df), só /demo/live/*; links preservam `?demo=1` no clique (home, governador) |
| Sem `?demo` | PASS | 0 faixa, 0 requisições a /demo/ |
| Mapa | PASS | contorno 1 px (2 px nas UFs com governador) vermelho/azul escuro; sem borda preta grossa |
| Por região | PASS | % de Lula e de Flávio dos dois lados, barra bicolor vermelho/azul com marca dos 50% (1280 e 390) |
| Console / scroll horizontal | PASS | 0 erros; sem scroll horizontal em home, demo, governador, metodologia, auditoria (360/390/1280) |
| Lighthouse (mobile, staging) | PASS | `/`: perf 98, a11y 100, BP 100, SEO 100, CLS 0. `/?demo=1`: a11y 100, perf 97, SEO 66 (esperado: noindex), CLS 0,11 |
| /dados/ cache | PASS | `x-cache: MISS`, depois `HIT` (cf-cache-status HIT), Cache-Control s-maxage=10 |
| /demo/live/latest.json | PASS | 200 |

Observação: `scripts/lighthouse.mjs` roda só contra servidor local de fixtures; o Lighthouse do staging foi rodado direto com `npx lighthouse@12`.

## Defeitos

| # | Severidade | Descrição |
|---|---|---|
| D1 | Média | "Sair da simulação" não sai. O handler de clique do demo (`demo-ui.mjs`) reescreve qualquer href `/` para `/?demo=1` (`hrefDemo`), então o link recarrega a simulação. Verificado: após o clique a URL é `/?demo=1` e a faixa continua. Correção: excluir o link da faixa (ou ignorar `#demoband a`) da reescrita. O logo/marca `/` também mantém o demo, o que é desejado. |
| D2 | Baixa | e2e `?demo=1` flaky: falhou 1 vez em 5 execuções (exige `/demo/snapshot-6258.json` logo após as asserções; condição de corrida com carregamento do snapshot). Sugere esperar a requisição no teste. |
| D3 | Baixa | Com `?demo=1`, CLS 0,11 no Lighthouse mobile: a faixa é inserida só pelo cliente e empurra o conteúdo. Não afeta a home sem demo (CLS 0). |
| D4 | Baixa | A 768 px a navegação é cortada pelo status ("R" do "Resumo" aparece pela metade antes do "25/10"); a nav rola na horizontal, sem sobreposição, mas o corte é abrupto. A 360/390 a nav também corta o último item ("Resu"), com scroll horizontal interno. |
| D5 | Informativa | Links internos só preservam `?demo` no clique; abrir em nova aba/botão do meio ou copiar o link não preserva (o href no DOM não tem `?demo`). Metodologia e auditoria não mantêm o demo (por design). |
| D6 | Informativa | PRD pede "1 linha a 360 px", mas a implementação (e o critério deste QA) usa 2 linhas no mobile; o PRD deve ser atualizado. |

Nenhum defeito crítico ou alto. Recomendação: corrigir D1 antes de produção (a simulação não é ativada sem `?demo`, então o risco em produção é baixo); D2 a D6 não bloqueiam.
