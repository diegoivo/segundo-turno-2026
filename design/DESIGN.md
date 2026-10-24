# Design: Apuração do 2º turno 2026

Entrega do worker de design para o worker de front. Tudo em `design/`. Abra `index.html` e `governador-df.html` direto no navegador (sem build). O seletor preto no topo ("Só no mockup") alterna os 4 estados e some em produção. `?estado=1..4` na URL fixa o estado; `governador-df.html?uf=ac|am|df|es|rn|to` troca a UF.

## 1. Direção

- Skill: design-taste-frontend (taste-skill v2.1.4), rota de app/dashboard (`draw.mjs --app --kind analytics`, seed 882816612).
- Estilo sorteado e adotado: **Achromatic ledger** (claro). A regra do estilo é a razão da escolha: o chrome não tem cor nenhuma; a cor só existe nos dados. Num painel de apuração isso é exatamente o que se quer: vermelho (Lula) e azul (Flávio) aparecem apenas onde há voto, número, barra ou linha. Foi mantida a paleta/tipografia do projeto (`--keep palette,type`); o tema escuro e os dois neutros dos governadores foram acrescentados.
- Pergunta única da tela: **"quem está na frente agora, e a projeção sustenta isso?"**. O maior elemento é o placar (44 px nos percentuais), seguido da projeção e do gráfico de histórico.
- Rosto próprio (exigido pelo skill): (1) o **número do candidato** num círculo de cor (13 vermelho, 22 azul), que substitui a foto; (2) o gráfico **apurado (linha cheia) × projeção (tracejada + faixa)** com a linha de 50% marcada; (3) a **cadeia de hash verificável no navegador**, com botão para simular a adulteração de 1 byte; (4) o **mapa real do Brasil** (malha do IBGE) colorido pela parcial. É o "elemento que só este produto tem".
- **Cantos arredondados em todo o site** (revisão 2): cartões 12, painéis internos 10, controles 8, elementos pequenos 5, pílula em barras, chips, botões e abas; número do candidato em círculo.
- **Marca**: ícone original (quadrado verde com losango amarelo e círculo azul com um "certo" branco, de voto) que só remete às cores do Brasil, sem copiar bandeira nem brasão. Verde, amarelo e azul-marinho ficam **só na marca**, nunca em dado; o vermelho e o azul dos candidatos não se misturam com ela.
- Fotos de acervo aberto: avaliado e **descartado**. Site de dado eleitoral, sem fotos de candidatos (direito de imagem); o skill pede fotografias, mas aqui elas competiriam com o dado e custariam peso. Nenhuma imagem raster na página.
- Ícones: **Material Symbols Rounded** (Google, Apache 2.0), só SVG inline dos 9 usados (sprite `<symbol>` + `<use>` no topo de cada HTML): sensors (ao vivo), refresh (atualizar), verified (auditoria), download, info (metodologia), dark_mode/light_mode (tema), map (panorama), expand_more (abrir/fechar). Nenhuma fonte de ícones.
- Redraws do sorteio: nenhum. Desvios conscientes: sem sidebar (site público de uma página, 200 M de acessos, mobile-first): usa barra de topo com âncoras; "rows of identical cards" evitado; 1px de borda e linhas de tabela mantidos (permitidos em app screens).

## 2. Entrega e peso

| Arquivo | Papel | gzip (sem minificar) |
|---|---|---|
| `css/app.css` | todo o CSS (home e governador) | 6,9 KB |
| `js/app.js` | formatação, tema, estado, view-models, componentes | 9,6 KB |
| `js/chart.js` | gráficos SVG (histórico e comparação 2022) e tabela equivalente | 4,2 KB |
| `js/audit.js` | cadeia SHA-256 e verificação (Web Crypto) | 2,8 KB |
| `js/home.js` / `js/gov.js` | montagem de cada página (inclui o mapa) | 4,6 KB / 3,6 KB |
| `index.html` / `governador-df.html` | casca + sprite de ícones | 6,2 KB / 5,0 KB |
| **`js/mapa-br.js` (`.json` idêntico ao lado)** | **malha do IBGE, 27 UFs, carregada sob demanda quando o mapa chega perto da tela** | **10,8 KB** |
| `js/mock-data.js` | só mockup (dados fictícios + 1º turno real); não vai para produção | 9,4 KB |
| `favicon.svg`, `apple-touch-icon.png` (180), `icon-192/512.png`, `manifest.webmanifest` | marca | 0,4 / 3,5 / 4 / 10 / 0,5 KB |

JS+CSS **inicial** da home: **26,7 KB gzip sem minificar** (cerca de 18 KB minificado), sem o mapa. Mapa: 10,8 KB gzip à parte, carregado por `IntersectionObserver` (em produção, servir como `mapa-br.json` com cache longo). Limite de 60 KB: folga ampla. Zero imagem raster na página (só os PNGs da marca, que não são carregados pela página), zero fonte web, zero biblioteca.

**Mapa**: fonte IBGE, API de malhas v3 (`/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`), projetada (equiretangular com correção de latitude), simplificada com Douglas-Peucker (tolerância 0,04°, sem dependência externa), coordenadas com 1 casa. Cada UF = um `<path>` dentro de `<a class="ufa">` com a sigla em `data-uf`. Gerador: o script usado está descrito aqui; a entrega é o arquivo pronto. Crédito "Malha: IBGE" na própria seção e no rodapé.

## 3. Tokens

Todos em `:root` de `css/app.css`; o tema escuro redefine os mesmos nomes (`:root[data-theme="dark"]` e `prefers-color-scheme` quando não há `data-theme="light"`). Troque só os valores, nunca os nomes.

**Cor (claro / escuro)**

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--ground` | #f2f4f7 | #0b0d10 | fundo da página (azul-acinzentado de "livro-caixa") |
| `--surface` | #ffffff | #14171b | cartões |
| `--raised` / `--active` | #f7f8fa / #e9ecf1 | #1a1e23 / #23282f | blocos internos, item ativo |
| `--border` / `--rule` / `--control` | #e1e4ea / #eceff3 / #c9ced8 | #262b32 / #1f242a / #3a414b | borda de cartão, linha de lista, borda de controle |
| `--text` / `--muted` | #111418 / #565d6b | #f3f5f7 / #a6aebb | tinta e texto secundário (AA em ambos) |
| `--primary` | #14171c | #f3f5f7 | botão principal (tinta, nunca cor de marca) |
| `--red` `--red-f` `--red-t` | #c0212b / #c0212b / #fbe9ea | #ff7a80 / #cf2e36 / #2e1a1d | **Lula**: texto e linha / preenchimento (texto branco) / tom claro |
| `--blue` `--blue-f` `--blue-t` | #1d5fbf / #1d5fbf / #e6eefb | #6ea3ff / #2f6fdc / #15233b | **Flávio** |
| `--n1` `--n1-f` `--n1-t` | #474c55 / #565c67 / #e9ebee | #b9bfc9 / #6b7280 / #23272d | neutro 1: **grafite** |
| `--n2` `--n2-f` `--n2-t` | #766427 / #7a6a2a / #f1ecd8 | #d6bb5c / #7a6a2a / #2b2713 | neutro 2: **oliva-ocre** |
| `--other` | #8b92a0 | #6d7583 | "outros candidatos" (barra cinza do 1º turno) |
| marca (só no ícone) | #009C3B verde, #FFDF00 amarelo, #002776 azul-marinho, #fff | igual | `favicon.svg` e `#i-marca` do sprite; nunca usados em dado |
| `--ok` `--warn` `--bad` | #1f7a4c #8a5300 #b3261e | #4cc58a #f0b24a #ff8a80 | status (critério atendido, falta, adulteração) |
| `--sim-*` | fundo #14171c, tag amarela #ffd23f | fundo #ffd23f | faixa SIMULAÇÃO |

Lado de uma disputa = classe no contêiner: `.c-red`, `.c-blue`, `.c-n1`, `.c-n2` definem `--c` (texto/linha), `--cf` (preenchimento) e `--ct` (tom claro). Todo componente de candidato só lê `--c/--cf/--ct`. Assim a cor do candidato é dado, não CSS.

**Cores dos governadores** (docs/GOVERNADORES-ALINHAMENTO.md): AC = Mailza Assis (n1) e Alan Rick (n2); AM = Omar Aziz (vermelho), Prof. Maria do Carmo (azul); DF = Leandro Grass (vermelho), Celina Leão (azul); ES = Ferraço (n1), Pazolini (azul); RN = Cadu de Lula (vermelho), Allyson (n1); TO = Vicentinho Júnior (n1), Prof. Dorinha (azul). Tabela `GOV` em `js/app.js`; na página, o vermelho fica à esquerda e o azul à direita, os neutros ocupam o lado que sobra (n1 antes de n2). Em produção a cor deve vir do JSON (campo `cor` por candidato), não de constante no código.

**Tipografia.** Uma pilha, sem webfont: `system-ui, -apple-system, "Segoe UI", Roboto, …`. Escala (px): 12 meta/eixo, 14 corpo/rótulo, 16 texto/títulos de cartão, 18 título de seção, 24 h1 e KPI, 34/44 percentual do placar (34 no celular, 44 a partir de 560 px), 32 percentual projetado. Pesos 400, 600, 700. Números sempre com `font-variant-numeric: tabular-nums`. Monoespaçada só em `<code>` de hash.

**Espaço e forma.** Base de 4 px. Coluna de até 1168 px; margem 16 px (mobile) e 24 px (≥ 720). Um só `--gap: 16px` entre cartões; padding de cartão 20 px (16 px abaixo de 420). Seções separadas por 32 px. **Raios (tokens):** `--r-card: 12px` (cartões, linhas da lista final, rodapé 24 em cima), `--r-panel: 10px` (painéis internos, veredito, resultado, tabela, tooltip 8), `--r-ctl: 8px`, `--r-sm: 5px`, `--r-pill: 999px` (botões, abas, chips, barras de progresso, barras divergentes, barra do placar com pontas pílula e miolo de 4 px). Número do candidato: círculo. Sem sombras (só o tooltip), sem gradientes. Ícones só onde ajudam (ver seção 1).

**Pontos de quebra.** 420 (cartão compacto), 560 (percentual 44 px), 640 (listas em 2 colunas), 720 (margem 24, nome do candidato da direita alinhado à direita), 960 (grades 5/7 e 2 colunas), 1100 (nav na mesma linha do logo).

## 4. Componentes (classes e função geradora em `js/app.js`)

| Componente | Classe / função | Notas |
|---|---|---|
| Faixa SIMULAÇÃO | `.simband[data-sim]` | `position: sticky; top:0`. Aparece em todo estado ≠ 1 (CSS: `html[data-state="1"] [data-sim]{display:none}`). Em produção a faixa **não existe**; só use em staging/ensaio. |
| Seletor de estado | `.mockbar .seg` | só mockup |
| Cabeçalho | `.top .brand .nav .live #tema` | marca do site (ícone verde, amarelo e azul), âncoras que rolam dentro da própria linha no celular, selo "Ao vivo" |
| Contagem regressiva | `#count .clock` | alvo 25/10/2026 17h (20h UTC); `role="timer"` |
| Candidato | `A.candHTML` | quadrado com número + nome + "Nº · partido · vice" + % + votos |
| Placar | `A.scoreLive` / `A.score1T` | candidatos, barra de 100% (linha de 50%), diferença em votos, 4 indicadores divididos por linhas finas |
| Projeção | `A.fcHTML` | % projetado, faixa ("entre X% e Y%"), régua da faixa, veredito, votos pendentes, confiança, versão e hora |
| Veredito | `A.verdictHTML` | `Disputa indefinida` (padrão), `Vencedor projetado: X` só se a margem supera a faixa, `Vitória matematicamente definida` (aritmética, sem modelo) |
| Projeção indisponível | `A.fcNA` + `A.critHTML` | lista dos 4 critérios com "Atendido" / "Falta" em texto e ícone (não só cor) e o valor atual |
| Projeção final × apurado | `A.fcFinal` | estado 4: o que o forecast publicou antes × o apurado, "dentro/fora da faixa" |
| Gráfico de histórico | `A.histChart`, `A.histSummary`, `A.histTable` | % de cada candidato por horário (17h em diante), escala fixa 35% a 65%, apurado cheio × projeção tracejada + faixa, rótulos na ponta das linhas, marcas "urnas fechadas", "Projeção liberada" e "Vitória definida", frase-resumo acima, tabela equivalente abaixo, tooltip em palavras |
| Comparação com 2022 | `A.cmpHTML` + `A.cmpChart` | "quando X% estavam apurados, o placar era..." + gráfico de % de cada candidato por **% das seções apuradas** (2022 pontilhado, 2026 cheio), com a frase "isto não é previsão" |
| Panorama | `drawMap()` em `home.js`, `A.divRow` | **mapa real do IBGE** (SVG): cor da UF = quem lidera **na parcial**; intensidade em 3 degraus (menos de 50%, 50% a 90%, mais de 90% das seções) via `color-mix` e `--k`; cinza = sem votos; contorno preto grosso = tem governador (e a UF é link); UFs grandes têm a sigla; tooltip por mouse, toque e foco (Tab); botões "Todas / Norte / ... / Sul" apagam as demais regiões; quadro por região ao lado, com barras que partem do 50%; legenda explícita "É a parcial, não a projeção" |
| Auditoria | `<details class="aud">`, `A.buildChain`, `A.verifyChain`, `A.initAudit` | **recolhida por padrão**; o resumo de uma linha mostra o estado verificado ("Cadeia íntegra · 298 versões · último hash c80126…", recalculado ao carregar); abre por clique ou pela âncora `#auditoria`/`#metodologia`; dentro: botão "Verificar a cadeia", caixa "Simular adulteração de 1 byte" (o resumo vira "Cadeia quebrada em #…"), download do snapshot e da cadeia dos últimos 6, Metodologia em `<details>` |
| Votos apurados × forecast | `A.raceRow`, `#vf` | uma linha por disputa: apurado (% e votos) e projeção (% e faixa), situação em chip; nome da disputa linka a página; no celular vira bloco de duas colunas |
| Governador | `governador-df.html` + `js/gov.js` | mesmo placar/projeção/histórico; tabela 1º turno × agora × projeção; presidente na UF; outras disputas; auditoria da disputa |

Rótulos do 1º turno reaproveitados (docs/MODELO-1T-ENGENHARIA-REVERSA.md): "Projeção do resultado final", "Votos válidos pendentes (estimativa)", comparação com 2022, "Metodologia" e botão de dados em JSON. Mudanças pedidas pelo coordenador: projeção estratificada por UF, **faixa de erro calibrada** (no lugar dos "cenários ±2 p.p."), rótulo de confiança por nível de apuração (baixa < 25%, média 25% a 70%, alta > 70%), versão e hora do forecast, "Vencedor projetado" só quando a margem supera a faixa, senão "Disputa indefinida". **Probabilidade de vitória**: não é elemento da tela; existe um espaço opcional `.probslot[hidden]` dentro de `A.fcHTML`, desligado.

## 4b. Regras de gráfico (para o worker de front seguir)

Aplicam-se a todos os gráficos (`A.histChart`, `A.cmpChart`, faixa da projeção, mapa). Pensadas para leigos e para estatística honesta.

1. **O que se mostra é o % de cada candidato nos votos válidos**, com a linha de 50% bem marcada e rotulada ("50%: quem passar daqui vence"; no celular, "50% = vence"). A "diferença em pontos" não aparece mais; se voltar, tem de ser explicada em palavras.
2. **Escala vertical fixa e honesta: 35% a 65%** em todos os gráficos de %, sem zoom automático. Valores fora da escala são encostados na borda, nunca esticam o eixo.
3. **Eixo horizontal do histórico = horário real a partir das 17h** ("17h · urnas fechadas" marcado no início). Nada antes das 17h; o primeiro ponto é o primeiro dado real do TSE. No painel de 2022 o eixo é "% das seções apuradas" e isso está escrito no gráfico, na legenda e no texto, junto com "isto não é previsão".
4. **Apurado (fato) × projeção (estimativa) inequívocos**: apurado = linha **cheia** e grossa, com bolinha cheia no fim; projeção = linha **tracejada**, bolinha vazada, **mais a faixa** (preenchimento claro com borda pontilhada). A cor é a do candidato nos dois casos. Os rótulos ficam **na ponta das linhas** ("Lula 49,2% apurado", "Lula 50,4% projeção"), com afastamento automático para não se sobreporem; a legenda é só reforço.
5. **Projeção nunca sem faixa**: em qualquer lugar em que aparece um % projetado, aparece "entre X% e Y%" junto (`A.fcHTML`, linhas do bloco final, tabela do gráfico). A legenda da faixa, em português simples: **"o resultado final deve ficar dentro desta faixa em 9 de cada 10 casos (calibrado com as eleições de 2022)"**. A largura vem do backtest; a UI não inventa outra largura nem outro significado.
6. **Antes da liberação da projeção**: a área fica cinza com o texto "aguardando dados suficientes". Não há linha inventada, interpolada nem ligando lacunas (cada ponto é uma versão real do TSE).
7. **Uma frase-resumo em português simples acima de cada gráfico**, que muda com o estado (`A.histSummary`): antes das 17h, sem projeção ("faltam critérios mínimos"), com projeção indefinida ("as faixas dos dois candidatos se cruzam na linha de 50%"), com projeção que aponta ("a faixa dele está toda acima de 50%") e resultado definido.
8. **Sem jargão**: nada de "p.p.", "IC" ou "estrato" na interface. Usar "pontos percentuais" só por extenso, "margem de erro", "faixa". Números sempre com vírgula decimal e ponto de milhar (`Intl.NumberFormat('pt-BR')`).
9. **Acessibilidade**: cor nunca é a única pista (estilo da linha, rótulo na linha, texto, contorno, número); contraste AA nos dois temas; cada gráfico tem `role="img"` com `aria-label` descritivo e uma **tabela equivalente** recolhida logo abaixo ("Ver os dados do gráfico em tabela", `A.histTable`); o tooltip repete o dado em palavras (hora, % apurado, projeção e faixa). Foco por teclado no mapa (Tab) e nos botões de região.
10. **Mapa**: cor = quem lidera **na parcial** e intensidade = % das seções apuradas, com o aviso "É a parcial da apuração, não a projeção" dentro do cartão do mapa. No 1º turno a legenda diz que é o resultado real.
11. **Desenho em pixels reais**, redesenhado quando a largura **ou a altura** do contêiner muda (`ResizeObserver`, `A.watch`); no celular os rótulos encolhem (sufixos "apurado" e "projeção" viram "proj."), o eixo X mostra menos marcas e o mapa ocupa a largura inteira.

## 5. Os 4 estados da home

1. **Antes das 17h**: contagem regressiva, resultado real do 1º turno (Lula 53.879.538 = 45,16%; Flávio 56.104.503 = 47,03%; outros 7,81%) em barra de três partes, critérios que a projeção exigirá, gráfico vazio (escala 35% a 65%, linha de 50% e marca das 17h desenhadas), panorama real do 1º turno por UF, curva real de 2022, auditoria vazia ("o primeiro dado real vira o snapshot 0"), bloco final com o 1º turno de cada disputa. **Sem faixa SIMULAÇÃO**: todos os números são reais.
2. **Apuração sem projeção** (17:51, 12,19% das seções): placar com a parcial, "Projeção indisponível" e os critérios que faltam (5 UFs abaixo de 5%: AP, PA, PI, RO, TO).
3. **Apuração com projeção** (18:39, 78,78% das seções): projeção Lula 50,4% (49,8% a 51,0%), Flávio 49,6% (49,0% a 50,2%), "Disputa indefinida" porque os 50% caem dentro da faixa, confiança alta, forecast v297.
4. **Resultado definido** (19:50, 99,79%): "Vitória matematicamente definida" pela conta aritmética (239.984 pendentes < 433.331 de diferença) e a comparação da projeção publicada às 18:39 com o apurado.

Os dados de 2, 3 e 4 são fictícios, gerados por simulação consistente (cada UF parte do 1º turno real; parcial, pendentes, projeção por UF e faixa saem das mesmas contas), e os números somam. **Qualquer tela com eles leva a faixa SIMULAÇÃO.**

## 6. Contrato de dados que a UI espera (para o worker de front ligar ao `latest.json`)

View-model por disputa (`A.president(k)` / `A.governor(uf, k)` mostram o formato): `left`/`right` (candidato: `n, nome, sg, vice, cor`), `pct` (seções totalizadas), `L`/`R` (votos válidos), `pend` (válidos pendentes estimados), `ts` (total de seções), `fc {avail, L, R, lo, hi, hw, ver, hora, conf}`, `def` (aritmético), `series[] {t, pct, pm, fm, bd, on, seq}`. Por UF: `[pct_secoes, votos_esq, votos_dir]`. O 1º turno e a curva de 2022 (margem Lula − Bolsonaro por % de seções, TSE) estão em `mock-data.js` e podem virar arquivos estáticos.

## 7. Acessibilidade, desempenho, robustez

- Contraste AA nos dois temas (inspetor do skill: 0 FAIL, 1 WARN defendido). Cor nunca é a única pista: nome, número e quadrado acompanham; critérios têm texto "Atendido/Falta"; confiança tem barras e palavra; mapa tem número e rótulo por UF.
- Foco visível, alvos ≥ 40 px, `aria-label` nos gráficos (resumo em texto), `role="timer"`, `aria-live` no resultado da verificação, `<details>` nativo para metodologia e "ver as 27 UFs".
- 360 px sem rolagem horizontal verificado nos 4 estados das duas páginas. Nenhum erro de console.
- `prefers-reduced-motion` respeitado; não há animação (movimento só como feedback de hover).
- Segurança: os componentes montam HTML por string com `A.esc` nos textos vindos de dado; em produção, mantenha o escape e valide o JSON do TSE antes de renderizar.

## 8. Pendências e decisões para o front

1. **Pré-render** (inclusive do sprite de ícones e da marca, já inline): o mockup monta tudo por JS. Em produção, gerar o HTML do estado atual no deploy (SSG) e hidratar com `latest.json`, para ter conteúdo no primeiro pintar e sem JS. A casca (`index.html`) já tem as seções e ids.
2. **Páginas das outras UFs**: o mockup serve as seis por `governador-df.html?uf=`. Em produção, uma rota `/governador/<uf>` gerada do mesmo modelo.
3. **Metodologia**: está num `<details>` na seção de Auditoria; se for virar página própria, o link do rodapé já aponta para `#metodologia`. Link "Baixar histórico completo" ainda é `#historico-completo`.
4. **Exterior** não entra no panorama (o TSE o trata como abrangência à parte; o critério de leitura cita "27 UFs e exterior"). Incluir como linha à parte da tabela de regiões.
5. **Critérios de governador** (20% das seções e 50% dos municípios com voto) vêm do modelo do 1º turno e dependem do coletor de municípios; a % de municípios do mockup é fictícia.
6. Faixa de erro e rótulo de confiança no mockup usam uma fórmula de demonstração; os valores reais saem do backtest (F2).
7. A faixa SIMULAÇÃO e o seletor de estado devem ser removidos do build de produção.
8. Mapa: UFs pequenas (DF, SE, AL, RJ, ES, RN, PB) não têm sigla desenhada; o nome aparece no tooltip e no foco. A tabela de regiões e as listas cobrem o resto.
9. O inspetor acusa 1 WARN ("poucos blocos na primeira tela de 1440 px"): a primeira tela entrega título, placar, diferença e indicadores; o resto da página é longo por necessidade (15 blocos pedidos). Defendido.

## 9. Screenshots (`design/screens/`)

`home-estado{1..4}-{1440,768,390}.png`, `governador-df-estado{1..4}-{1440,768,390}.png` (página inteira, tema claro) e `home-estado{3,4}-escuro-{1440,390}.png`. Gerados por Playwright (Chrome) a partir dos arquivos locais.
