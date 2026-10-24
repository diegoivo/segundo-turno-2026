// Casca HTML das páginas (pré-renderizadas no build). Os slots recebem o HTML das visões em lib/views.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GOV_UFS } from '../lib/config.mjs';
import { esc } from '../lib/format.mjs';
import { govView, homeView, tituloGov } from '../lib/views.mjs';

const SPRITE = readFileSync(fileURLToPath(new URL('../assets/sprite.svg.html', import.meta.url)), 'utf8');
const NOME_SITE = 'Apuração do 2º turno 2026';
const BOOT_TEMA = "try{var t=localStorage.getItem('tema');if(t)document.documentElement.dataset.theme=t}catch(e){}";

const HEAD = ({ titulo, descricao, caminho, assets, site, dadosOrigem, noindex = false }) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#009C3B">
${noindex ? '<meta name="robots" content="noindex">' : ''}<link rel="canonical" href="${esc(site + caminho)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${NOME_SITE}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(site + caminho)}">
<meta property="og:image" content="${esc(site)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Marca do site de apuração do 2º turno 2026: losango amarelo e círculo azul sobre fundo verde">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
<meta name="twitter:image" content="${esc(site)}/og.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
${dadosOrigem ? `<link rel="preconnect" href="${esc(dadosOrigem)}" crossorigin>` : ''}
<style>${assets.cssTexto}</style>
<script>${BOOT_TEMA}</script>
</head>`;

const HEADER = (nav, live = true) => `<header class="top">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Apuração 2º turno 2026, início"><svg class="mark" width="30" height="30" aria-hidden="true" focusable="false"><use href="#i-marca"/></svg><span>Apuração 2º turno <small>2026</small></span></a>
    <button class="btn" id="tema" type="button" aria-pressed="false"><svg class="ic" aria-hidden="true" focusable="false"><use id="tema-ic" href="#i-dark-mode"/></svg><span id="tema-t">Tema escuro</span></button>
    ${live ? '<div class="livebox"><p class="live" id="upd" aria-live="polite">@@upd@@</p><button class="btn ico" id="atualizar" type="button" aria-label="Atualizar agora" title="Atualizar agora"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-refresh"/></svg></button></div>' : ''}
    <nav class="nav" aria-label="Seções da página"><ul>${nav}</ul></nav>
  </div>
</header>`;

const FOOTER = `<footer class="end">
  <div class="wrap">
    <p class="big" aria-hidden="true">Apuração do 2º turno</p>
    <p>Fonte dos dados: Tribunal Superior Eleitoral (resultados.tse.jus.br). Projeção estatística independente, não é resultado oficial. Nenhuma pesquisa eleitoral nem boca de urna é usada. Sem fotos de candidatos: cor, número e nome.</p>
    <p class="links"><a href="/metodologia/">Metodologia</a><a href="/auditoria/">Auditoria e histórico</a><a href="https://resultados.tse.jus.br/">Resultados oficiais do TSE</a></p>
    <p class="note">Malha: IBGE. Ícones: Material Symbols (Google, licença Apache 2.0). Marca do site: criação própria, só remete às cores do Brasil.</p>
  </div>
</footer>`;

const NAV_HOME = ['placar:Placar', 'projecao:Projeção', 'historico:Histórico', 'estados:Estados', 'votos-forecast:Resumo']
  .map((x) => { const [id, t] = x.split(':'); return `<li><a href="#${id}">${t}</a></li>`; }).join('') + '<li><a href="/metodologia/">Metodologia</a></li>';

const TAGLINE = (evidencia) => `<p class="tagline">Projeção estatística do resultado final a partir dos dados oficiais do TSE, atualizada a cada minuto.</p>${evidencia ? `<p class="tagline evid">${esc(evidencia)}</p>` : ''}`;

const COUNT = `<section id="count" class="card count" aria-labelledby="t-count" style="margin-bottom:var(--gap)">
    <div><h2 id="t-count">Faltam para o fechamento das urnas</h2><p class="sub" id="count-sub">Domingo, 25 de outubro de 2026, 17h em Brasília. A divulgação começa nesse horário.</p></div>
    <div class="clock" id="clock" role="timer" aria-live="off"></div>
  </section>`;

const HIST = (id = 'historico') => `<div class="card hero-chart" id="${id}">
      <h3>Histórico: parcial × projeção</h3>
      <p class="sum" id="histsum">@@histsum@@</p>
      <div class="legend" id="histlegend">
        <span><svg viewBox="0 0 34 12" aria-hidden="true"><path d="M0 6h34" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/></svg><b>Apurado</b> (já contado, é fato): linha cheia</span>
        <span><svg viewBox="0 0 34 12" aria-hidden="true"><rect y="0" width="34" height="12" rx="3" fill="var(--text)" fill-opacity=".14"/><path d="M0 6h34" stroke="var(--text)" stroke-width="2.5" stroke-dasharray="7 5"/></svg><b>Projeção</b> (estimativa): linha tracejada e faixa</span>
      </div>
      <div class="chart" id="histchart">@@histchart@@</div>
      <p class="note"><b>Como ler:</b> cada candidato tem a sua cor. Quem passar da linha de 50% dos votos válidos vence. A faixa colorida é a margem de erro da projeção: o resultado final deve ficar dentro dela em 9 de cada 10 casos (calibrado com as eleições de 2022). A escala vai de 35% a 65% e não muda. Passe o dedo ou o mouse para ver cada horário.</p>
      <div id="histtbl">@@histtbl@@</div>
    </div>`;

const AUDITORIA = ({ id, cadeia, titulo, intro, verificador, aberto = false }) => `<section id="${id}" aria-labelledby="t-${id}" data-cadeia="${cadeia}">
    <details class="aud card"${aberto ? ' open' : ''}>
      <summary>
        <span class="sumh"><h2 id="t-${id}">${titulo}</h2><span class="sumline a-line"><svg class="ic" aria-hidden="true"><use href="#i-verified"/></svg>Aguardando o primeiro snapshot, às 17h</span></span>
        <svg class="ic chev" aria-hidden="true" focusable="false"><use href="#i-expand-more"/></svg>
      </summary>
      <div class="audbody">
        <p class="sub" style="margin-bottom:16px">${intro}</p>
        <div class="grid g-audit">
          <div class="panel">
            <h3>Como funciona</h3>
            <p class="sub">Cada versão do dado e do forecast fica gravada, imutável e encadeada à anterior por SHA-256. O navegador baixa os últimos snapshots e recalcula os hashes (Web Crypto), sem confiar em nós.</p>
            <div class="a-live" hidden>
              <div class="acts">
                <button class="btn pri a-ver" type="button"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-verified"/></svg>Verificar a cadeia</button>
                <a class="btn a-snap" href="#"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-download"/></svg>Baixar o snapshot mais recente (JSON)</a>
                <a class="btn a-raw" href="#"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-download"/></svg>Baixar o bruto do TSE (.gz)</a>
              </div>
              <label class="chk"><input type="checkbox" class="a-chk"> Simular a adulteração de 1 byte no snapshot do meio</label>
              <div class="result" role="status" aria-live="polite"></div>
            </div>
            <p class="sub a-empty" style="margin-top:12px">Ainda não há snapshots. O primeiro dado real do TSE, às 17h, vira o snapshot de número 0. Dado de teste nunca entra neste histórico.</p>
            <p class="audlinks"><a class="a-man" href="#">manifest.json (índice da cadeia)</a><a href="${esc(verificador)}" rel="noopener">Verificador público (tools/verificar-cadeia.mjs, Node)</a><a href="/metodologia/">Metodologia</a></p>
          </div>
          <div class="panel">
            <h3>Últimos snapshots encadeados</h3>
            <p class="sub">Cada linha guarda o próprio hash e o hash da anterior. Mudar um byte antigo quebra todos os seguintes.</p>
            <div data-chain style="margin-top:8px"></div>
          </div>
        </div>
      </div>
    </details>
  </section>`;

function preencher(html, slots, extras = {}) {
  const all = { ...slots, ...extras };
  return html.replace(/@@(\w+)@@/g, (m, k) => (all[k] ?? ''));
}

/** Documento completo da home no estado 1 (sem dados): pré-render. */
export function paginaHome({ assets, site, dadosOrigem, histSvg, cmpSvg, evidencia }) {
  const v = homeView({});
  const s = v.slots;
  const corpo = `<body data-page="home">
${SPRITE}
${HEADER(NAV_HOME)}
<main class="wrap" id="topo">
  <div class="head">
    <h1>Apuração do 2º turno</h1>
    ${TAGLINE(evidencia)}
    <div class="headline" id="finding">@@finding@@</div>
  </div>
  ${COUNT}
  <section id="placar" aria-labelledby="t-placar">
    <h2 class="sr" id="t-placar">Placar</h2>
    <div class="card score" id="score">@@score@@</div>
  </section>
  <section id="projecao" class="grid g-fc" aria-label="Projeção e histórico">
    <div class="card fc" id="fc">@@fc@@</div>
    ${HIST()}
  </section>
  <section id="comparacao" aria-labelledby="t-cmp">
    <div class="sh"><h2 id="t-cmp">Comparação com 2022</h2><p>No mesmo ponto da apuração, como estavam Lula e Jair Bolsonaro no 2º turno de 2022 (dados oficiais do TSE).</p></div>
    <div class="card cmp" id="cmp">@@cmp@@</div>
  </section>
  <section id="estados" aria-labelledby="maptitle">
    <div class="sh"><h2 id="maptitle"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-map"/></svg><span>@@maptitle@@</span></h2><p id="mapsub">@@mapsub@@</p></div>
    <div class="grid g-map">
      <div class="card mapcard">
        <div class="regsel" role="group" aria-label="Destacar uma região no mapa">
          <button type="button" aria-pressed="true" data-r="">Todas</button><button type="button" aria-pressed="false" data-r="Norte">Norte</button><button type="button" aria-pressed="false" data-r="Nordeste">Nordeste</button><button type="button" aria-pressed="false" data-r="Centro-Oeste">Centro-Oeste</button><button type="button" aria-pressed="false" data-r="Sudeste">Sudeste</button><button type="button" aria-pressed="false" data-r="Sul">Sul</button>
        </div>
        <div class="mapbox" id="mapbox"><p class="sub" style="padding:24px 0">O mapa carrega quando esta seção chega perto da tela. Sem JavaScript, use o quadro por região ao lado.</p></div>
        <div class="mobonly"><div id="maplegend"></div>
        <p class="note">Malha: IBGE. Toque ou passe o mouse sobre uma UF; com o teclado, use Tab. As UFs com contorno grosso têm governador no 2º turno e abrem a página da disputa.</p></div>
      </div>
      <div class="card">
        <h3>Por região</h3>
        <p class="sub">Vermelho: Lula. Azul: Flávio. A barra parte do 50%.</p>
        <div id="regs" style="margin-top:12px">@@regs@@</div>
        <div class="deskonly"><div id="maplegend2"></div>
        <p class="note">Malha: IBGE. Toque ou passe o mouse sobre uma UF; com o teclado, use Tab. As UFs com contorno grosso têm governador no 2º turno e abrem a página da disputa.</p></div>
        <details class="more"><summary><span>Ver as 27 UFs</span><svg class="ic chev" aria-hidden="true" focusable="false"><use href="#i-expand-more"/></svg></summary><div id="ufs">@@ufs@@</div></details>
      </div>
    </div>
  </section>
  <section id="votos-forecast" aria-labelledby="t-vf">
    <div class="sh"><h2 id="t-vf">Votos apurados × forecast</h2><p id="vfsub">@@vfsub@@</p></div>
    <ul class="vf" id="vf">@@vf@@</ul>
    <p class="note" id="vffoot">@@vffoot@@</p>
  </section>
</main>
${FOOTER}
<script type="module" src="${assets.js}"></script>
</body>
</html>`;
  const head = HEAD({
    titulo: `${NOME_SITE} | Presidente e governadores`,
    descricao: 'Apuração ao vivo do 2º turno de 2026, com projeção do resultado final, histórico auditável e dados oficiais do TSE.',
    caminho: '/', assets, site, dadosOrigem,
  });
  const html = preencher(`${head}\n${corpo}`, s, { histchart: histSvg, upd: s.upd });
  return html.replace('<div class="chart" id="cmpchart"></div>', `<div class="chart" id="cmpchart">${cmpSvg}</div>`);
}

const NAV_GOV = (uf) => `<li><a href="#placar" aria-current="page">Governador <span id="uf-pill">${uf.toUpperCase()}</span></a></li><li><a href="#projecao">Projeção</a></li><li><a href="#comparacao">1º turno × agora</a></li><li><a href="#outros">Outras UFs</a></li><li><a href="/">Presidente</a></li>`;

export function paginaGov({ uf, assets, site, dadosOrigem, histSvg, evidencia }) {
  const v = govView(uf, {});
  const titulo = tituloGov(uf);
  const corpo = `<body data-page="gov" data-uf="${uf}">
${SPRITE}
${HEADER(NAV_GOV(uf))}
<main class="wrap" id="topo">
  <div class="head">
    <p class="crumb"><a href="/">Apuração do 2º turno</a> / Governadores</p>
    <h1 id="h1">${esc(titulo)}</h1>
    ${TAGLINE(evidencia)}
    <div class="headline" id="finding">@@finding@@</div>
  </div>
  ${COUNT}
  <section id="placar" aria-labelledby="t-placar"><h2 class="sr" id="t-placar">Placar</h2><div class="card score" id="score">@@score@@</div></section>
  <section id="projecao" class="grid g-fc" aria-label="Projeção e histórico">
    <div class="card fc" id="fc">@@fc@@</div>
    ${HIST()}
  </section>
  <section id="comparacao" class="grid g-2" aria-label="Comparações">
    <div class="card"><h3>1º turno × agora × projeção</h3><p class="sub">Cada candidato nas três fotografias da disputa.</p><div id="cmp" style="margin-top:12px">@@cmp@@</div></div>
    <div class="card"><h3 id="pres-title">@@prestitle@@</h3><p class="sub">Contexto: o outro 2º turno, na mesma UF.</p><div id="pres" style="margin-top:12px">@@pres@@</div></div>
  </section>
  <section id="outros" aria-labelledby="t-out">
    <div class="sh"><h2 id="t-out">Outras disputas de governador</h2><p>As seis UFs com 2º turno para governador. Cada uma tem página própria, no mesmo modelo.</p></div>
    <div id="others">@@others@@</div>
  </section>
</main>
${FOOTER}
<script type="module" src="${assets.js}"></script>
</body>
</html>`;
  const head = HEAD({
    titulo: `${titulo} | ${NOME_SITE}`,
    descricao: `Apuração ao vivo do 2º turno para ${titulo.toLowerCase()}, com projeção do resultado final, histórico auditável e dados oficiais do TSE.`,
    caminho: `/governador/${uf}/`, assets, site, dadosOrigem,
  });
  return preencher(`${head}\n${corpo}`, v.slots, { histchart: histSvg });
}

export function paginaDoc({ titulo, descricao, caminho, corpoHtml, assets, site, dadosOrigem }) {
  return `${HEAD({ titulo: `${titulo} | ${NOME_SITE}`, descricao, caminho, assets, site, dadosOrigem })}
<body data-page="doc">
${SPRITE}
${HEADER('<li><a href="/">Início</a></li><li><a href="/auditoria/">Auditoria</a></li>', false)}
<main class="wrap doc" id="topo">
${corpoHtml}
</main>
${FOOTER}
<script type="module" src="${assets.js}"></script>
</body>
</html>`;
}

export function paginaAuditoria({ assets, site, dadosOrigem, verificador }) {
  const corpo = `<body data-page="auditoria">
${SPRITE}
${HEADER('<li><a href="/">Início</a></li><li><a href="/metodologia/">Metodologia</a></li>', false)}
<main class="wrap" id="topo">
  <div class="head"><h1>Auditoria e histórico</h1><p class="tagline">Cada versão do dado e da projeção fica gravada, imutável e encadeada por hash. Qualquer pessoa pode baixar, recalcular e conferir. Nada é apagado nem reescrito.</p></div>
  ${AUDITORIA({ id: 'auditoria', cadeia: '6258', titulo: 'Presidente (eleição 6258)', intro: 'Cadeia de snapshots do 2º turno presidencial.', verificador, aberto: true })}
  ${AUDITORIA({ id: 'auditoria-gov', cadeia: '6260', titulo: 'Governadores (eleição 6260)', intro: 'Cadeia de snapshots dos governadores (AC, AM, DF, ES, RN, TO).', verificador })}
</main>
${FOOTER}
<script type="module" src="${assets.js}"></script>
</body>
</html>`;
  return `${HEAD({ titulo: `Auditoria e histórico | ${NOME_SITE}`, descricao: 'Histórico encadeado por hash das projeções e dos dados do TSE, com verificação no navegador e downloads.', caminho: '/auditoria/', assets, site, dadosOrigem })}\n${corpo}`;
}

export function pagina404({ assets, site, dadosOrigem }) {
  return `${HEAD({ titulo: `Página não encontrada | ${NOME_SITE}`, descricao: 'Página não encontrada.', caminho: '/404.html', assets, site, dadosOrigem, noindex: true })}
<body data-page="doc">
${SPRITE}
${HEADER('<li><a href="/">Início</a></li>', false)}
<main class="wrap notfound" id="topo">
<h1>404</h1>
<p>Esta página não existe. <a href="/">Voltar à apuração do 2º turno</a>.</p>
<p class="sub"><a href="/governador/df/">Governador do DF</a> · <a href="/metodologia/">Metodologia</a></p>
</main>
${FOOTER}
<script type="module" src="${assets.js}"></script>
</body>
</html>`;
}

export { GOV_UFS };
