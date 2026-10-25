# PRD: ajustes de front (25/10)

## Objetivo
Pedido do Diego: deixar o header compacto, criar um modo de demonstração com contagem e melhorar o mapa e o bloco por região. Publicar em produção.

## Escopo
1. **Header:** os itens não quebram linha em nenhuma largura (≥ 360 px).
2. **Tema:** o alternador claro/escuro mostra só o ícone, com aria-label e title.
3. **GitHub:** botão compacto no header, no estilo típico do GitHub (ícone + "Star" + contagem), linkando https://github.com/diegoivo/segundo-turno-2026. A contagem é buscada no cliente via api.github.com, com cache de 1 h no localStorage. Se falhar, o botão aparece sem número. Sem custo para a Cloudflare.
4. **Demonstração:** com `?demo=1` (ou `?demo=apurando`), a página mostra dados com contagem antes do início. São dois estados: aguardando (padrão) e apurando (demo). Os dados são estáticos, gerados do replay do ensaio (1º turno 2026 convertido), e servidos como asset. A faixa "Simulação, não é resultado real" fica sempre visível. Sem o parâmetro, nada muda. A demo nunca toca em /dados/.
5. **Mapa:** sem as bordas pretas grossas. Contorno fino vermelho ou azul, conforme quem lidera; neutro quando não houver dado.
6. **Por região:** cada região mostra sempre o percentual dos dois lados, com barra vermelha (Lula) e azul (Flávio).

## Critérios de aceite
- Header em 1 linha a 360, 390, 768 e 1280 px, sem scroll horizontal.
- Testes unitários e E2E passando, inclusive novos testes para o demo e para o header.
- Sem erro de console e Lighthouse sem regressão de a11y.
- Produção sem `?demo` continua idêntica no comportamento dos dados.

## Riscos
- É dia de eleição: o deploy afeta só o front, sem tocar no coletor nem no R2.
- O demo não pode ser confundido com resultado real; por isso a faixa obrigatória.

## Status (worker de front, 25/10)
Implementado e testado, SEM deploy. Build de produção compila (`SITE_URL=https://segundo-turno-web.hosts5924.workers.dev`). Aguarda QA independente.

| Item | Status | Notas |
|---|---|---|
| 1 Header | feito | Marca, GitHub e tema sempre na mesma linha (360/390/768/1280, medido em teste). Status "Ao vivo" e navegação ficam em linhas próprias em telas estreitas (nunca quebram por dentro; nav rola na horizontal). Mensagens de atraso/offline encurtadas para caber a 360 px. |
| 2 Tema | feito | Só ícone, `aria-label` ("Mudar para o tema claro/escuro") e `title`; removido `aria-pressed` (o rótulo já diz a ação). |
| 3 GitHub | feito | `#gh` com mark inline (Octicons), "Star" + contagem (`1,2 mil`), cache `gh_stars` de 1 h, sem número se a API falhar. Não existe CSP no repo nem em `_headers`, então nada bloqueia `api.github.com`; um teste unitário exige `connect-src` com `https://api.github.com` se uma CSP for criada. |
| 4 Demo | feito | `?demo`, `?demo=1`, `?demo=apurando` (só home e governador). Dados de `src/demo/` (ensaio geral 2, presidente 46,4% apurado, projeção liberada; AC 74%, AM 50%, DF 93%, ES 76%, RN 35%, TO 84%), copiados para `dist/demo/`. Faixa amarela fixa; noindex; sem polling; links internos preservam `?demo`. Gerador: `web/scripts/gerar-demo.mjs`. Bloco `/demo/*` em `_headers` (cache 5 min, noindex). |
| 5 Mapa | feito | Contorno fino na cor de quem lidera (neutro sem dado); UF com governador só um pouco mais grossa; preto apenas no foco do teclado. |
| 6 Por região | feito | `divRow`: % de Lula e de Flávio sempre visíveis, barra bicolor (vermelho/azul) com a marca dos 50%; sem votos mostra "—" nos dois lados. Vale também para a lista de UFs e para o painel da página de governador. |

Decisões: a demo é montada só no cliente (a faixa nunca está no HTML normal); `DEMO` só liga em `data-page` home/gov; o sha dos snapshots é `null` na demo (não há cadeia pública a verificar).

Correção do header (coordenação): a partir de 768 px tudo em 1 linha (56 px medidos); abaixo, 2 linhas (85 px): marca, status compacto, GitHub e tema; depois a navegação. Botão de atualizar escondido abaixo de 480 px e na faixa 768–1099 px. Medido no e2e (home, governador, metodologia e ?demo).

Correções do QA (D1-D4): link 'Sair da simulação' excluído da reescrita; faixa fixa com espaço reservado desde o <head> (CLS cai de 0,11 para ~0,03, só a troca pré-render/dados); e2e do demo espera as requisições; nav com fade de borda.
