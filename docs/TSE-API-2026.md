# API pública de resultados do TSE, 2º turno 2026

Mapeamento feito em 23/10/2026 (véspera do 2º turno, 25/10/2026; a data foi dada no pedido e não foi verificada no TSE). Só GET, ~2 req/s, User-Agent `Mozilla/5.0 (segundo-turno research)`.
Base: `https://resultados.tse.jus.br/oficial/`. Fixtures em `/Users/diego/Claude/segundo-turno/fixtures/tse/` (mesmo caminho relativo da URL).

## 1. Candidatos a presidente (2º turno, eleição 6258)

Fonte direta: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json` (200, dg 15/10/2026 09:38:12). O arquivo já lista os 2 candidatos, zerados. Confirmado pelo resultado final do 1º turno (`ele2026/6257/dados/br/br-c0001-e006257-u.json`, st = "2º turno") e por `cdn.tse.jus.br/.../consulta_cand/consulta_cand_2026.zip` (`consulta_cand_2026_BR.csv`, turno 2).

| Nº | Nome de urna | Nome completo | Partido | Coligação (6258) | Vice | 1T: votos nominais / % válidos |
|---|---|---|---|---|---|---|
| 13 | LULA | LUIZ INÁCIO LULA DA SILVA | PT | "BRASIL PRONTO PRA MAIS" (PSB/PDT/PCDOB/PT/PV/PSOL/REDE); federação 101 FE Brasil (PT/PC do B/PV) | GERALDO ALCKMIN (PSB), sqcand 280002542548 / vice 280002542549 | 53.879.538 / 45,16% |
| 22 | FLAVIO BOLSONARO | FLAVIO NANTES BOLSONARO | PL | partido isolado (PL) | ALFREDO GASPAR (PL), sqcand 280002551544 / vice 280002551543 | 56.104.503 / 47,03% |

Ordem no arquivo 6258: seq 1 = Lula, seq 2 = Flávio. No 1T Flávio ficou na frente.

## 2. Governador no 2º turno (eleição 6260)

Método: **confirmado pelo TSE** nas 27 UFs. Em `ele2026/6259/dados/<uf>/<uf>-c0003-e006259-u.json`, o campo `st` de cada candidato vale "2º turno" (ou "Eleito" / "Não eleito"). Cruzado com a existência de `ele2026/6260/dados/<uf>/<uf>-c0003-e006260-u.json`: existe (200) só em 6 UFs; AL e demais dão 404. O `mun-e006260-cm.json` (44 KB) também cobre só essas UFs. Checagem aritmética (maior % de válidos <= 50%) bate: AC 49,76, AM 40,63, DF 49,93, ES 49,65, RN 36,94, TO 45,52. Eleitos no 1T: as outras 21 UFs (menor margem: PR 50,10 e RJ 50,88).

Não há arquivo BR para governador (`6260/dados/br/br-c0003-e006260-u.json` = 404).

| UF | Candidato (urna / nº / partido) | Vice | 1T % válidos | Coligação |
|---|---|---|---|---|
| AC | MAILZA ASSIS, 11, PP | Jessica Sales | 49,76 | AVANÇA ACRE |
| AC | ALAN RICK, 10, REPUBLICANOS | Ricardo Leite | 32,27 | TRABALHO DA ESPERANÇA |
| AM | OMAR AZIZ, 55, PSD | Alessandra Campelo | 40,63 | FORÇA AMAZONAS |
| AM | PROFESSORA MARIA DO CARMO, 22, PL | Coronel Anibal | 24,49 | MUDAR É URGENTE |
| DF | CELINA LEÃO, 11, PP | Gustavo Rocha | 49,93 | PROPÓSITO E AÇÃO |
| DF | LEANDRO GRASS, 13, PT | Dora Gomes | 34,47 | DF DO POVO |
| ES | LORENZO PAZOLINI, 10, REPUBLICANOS | Eliane Leal | 49,65 | PAZ PRA VIVER UM NOVO TEMPO |
| ES | RICARDO FERRAÇO, 15, MDB | Camillo Neves | 34,06 | AGORA É O FUTURO |
| RN | ALLYSON, 44, UNIÃO | Hermano | 36,94 | ESPERANÇA E TRABALHO' |
| RN | CADU DE LULA, 13, PT | Larissa | 36,16 | TIME QUE CUIDA |
| TO | PROFESSORA DORINHA, 44, UNIÃO | Atos Gomes | 45,52 | UNIÃO PELO TOCANTINS |
| TO | VICENTINHO JÚNIOR, 45, PSDB | Amélio Cayres | 43,94 | PRA CIMA TOCANTINS |

Nomes completos: nos próprios `6260/dados/<uf>/<uf>-c0003-e006260-u.json` (campo `nm`). Senador (c0005) não foi mapeado.

## 3. Padrões de URL e cabeçalhos

Configuração geral: `comum/config/ele-c.json` (200; Last-Modified 18/10/2026; cache-control max-age=14; ETag). Pleito 3220 / ciclo `ele2026`. Template em `arq[]`: `ft` fotos `<cd_eleicao>/fotos/<uf>`, `cm` `<cd_eleicao>/config`, `e`/`ab`/`u` `<cd_eleicao>/dados/<uf>`, `aux` arquivo-urna.

Testados com GET/HEAD (HTTP):

| Padrão | 6257 (1T pres.) | 6258 (2T pres.) | 6259 (1T gov.) | 6260 (2T gov.) |
|---|---|---|---|---|
| `dados/br/br-c0001-e00XXXX-u.json` | 200 (9.349 B) | **200 (2.864 B, zerado)** | n/a | n/a |
| `dados/<uf>/<uf>-c0001-e00XXXX-u.json` | 200 (27 UFs) | **200** (ex. AC 2.867 B) | n/a | n/a |
| `dados/<uf>/<uf>-c0003-e00XXXX-u.json` | n/a | n/a | 200 (27 UFs) | **200 só AC, AM, DF, ES, RN, TO** |
| `dados/br/br-c0003-e006260-u.json` | | | | 404 |
| Município: `dados/<uf>/<uf><cdmun5>-c000N-e00XXXX-u.json` (cd TSE de 5 dígitos, do `mun-*-cm.json`, não IBGE) | 200 (ac01392 Rio Branco 9.276 B; sp71072 9.376 B) | **200** (ac01392) | 200 (c0003) | **200** (ac01392 c0003) |
| `config/mun-e00XXXX-cm.json` | 200 (534.025 B) | 200 (534.026 B) | 200 (518.899 B) | 200 (44.151 B, só 6 UFs) |
| `fotos/br/<sqcand>.jpeg` | 200 (6.969 B) | 200 | | |
| `config/ele-c.json` dentro da eleição, `config/<uf>/<uf>-e00XXXX-cm.json`, `config/br/...` | 404 | 404 | | 404 |
| variantes `-r -v -t -f -a -ab -e -cm -cs` em `dados/` (BR, UF e município) | 404 | 404 | | 404 |
| `dados-simplificados/br/br-c0001-e00XXXX-r.json` | 404 | 404 | | |
| `fotos/<uf>` (diretório) | 404 | | | |

Conclusão: só existe a variante `-u` (arquivo único). **O detalhamento por município é um arquivo por município** (`<uf><cdmun>-c000N-e00XXXX-u.json`, `tpabr`="mu"), não um arquivo agregado. Os 5.570 municípios dão ~5.570 GET (~46 min a 2 req/s); não baixado em massa, só amostras (AC/Rio Branco e SP/SP para 6257; ac01392 para 6258, 6259 e 6260). Com o 2º turno, o `mun-e006258-cm.json` lista os 5.570 municípios (campo `c`="s" = capital, `z` = zonas, `cdi` = IBGE); não verifiquei se os arquivos municipais de 6258 aparecem para todos.

Cabeçalhos (todos os JSON): `Last-Modified`, `ETag` (hex MD5), `Cache-Control: max-age=3..46` (varia por requisição, CDN Akamai, `cdn-cache-status: Hit/RefreshHit from child`), `Expires`, `x-ratelimit-limit: 5000, 5000;w=1` (5.000 req/s). Exemplos: 6257 BR: ETag `2da19dbacd44746287f057d454ed01f0`, Last-Modified 07/10/2026 23:35:43; 6258 BR: ETag `8cfac16c5d817fe190b047c9235d7e90`, Last-Modified 15/10/2026 12:38:25; 6260 AC: ETag `6bafe2bdadfb088d30b04390ce55f59b`, Last-Modified 18/10/2026 13:06:43. Estratégia: polling a cada >=15 s com `If-None-Match` (não testado se o servidor devolve 304).
Resposta 404: corpo de 165/246/248 bytes (HTML/XML).

## 4. Schema dos arquivos `-u.json`

Cabeçalho: `ele` (cód. eleição), `t` (turno), `f` ("o" oficial), `sup`, `tpabr` (br/uf/mu), `cdabr`, `dg`/`hg` (data/hora de geração do arquivo, dd/mm/aaaa hh:mm:ss), `idg`, `dt`/`ht` (data/hora da totalização; vazio antes da apuração), `dv`, `tf` ("s" totalização final, "n" não), `and` (andamento: "f" finalizado, "n" não iniciado; "p" parcial presumido, **não confirmado**), `esae`, `mnae`.
`carg[0]`: `cd` (1 presidente, 3 governador), `nmn`, `nv` (nº vagas), `fed[]` (federações), `agr[]` (agrupamentos: `nm`, `tp` "i" isolado/"c" coligação, `com`, `par[]` -> `cand[]`).
Candidato: `n`, `sqcand`, `nm`, `nmu` (urna), `dt` nasc., `dvt` ("Válido"), `seq` (posição), `e` ("s"/"n": matematicamente eleito/habilitado ao 2º turno), `st` ("2º turno", "Eleito", "Não eleito", "" pré-apuração), `vap` (votos), `pvap` (% válidos, vírgula decimal), `pvapn` (% com 9 casas; **também usa vírgula decimal** nos arquivos vistos, ex. `47,027772356`; normalizar), `vs[]` (vice: `tp` "v", `sqcand`, `nm`, `nmu`, `sgp`).
`s` seções: `ts` total, `st` totalizadas, `pst` % totalizadas (`pstn` numérico), `snt` não totalizadas, `si`/`sni` instaladas/não, `sa`/`sna` apuradas/não.
`e` eleitorado: `te` total, `est` totalizado, `pest`, `esnt`, `esi`, `esa`, `c` comparecimento (`pc` %), `a` abstenção (`pa` %).
`v` votos: `tv` total, `vvc` votos válidos candidatos, `pvvc`, `vv` válidos, `vnom` nominais, `van` anulados, `vb` brancos (`pvb`), `tvn` nulos totais, `vn` nulos, `vnt` nulos técnicos, `vsan`, `vscv`.
Sufixo `n` nos campos = valor com mais casas decimais (vírgula em `pvapn`, ponto nos campos de `s`/`e`/`v`, p.ex. `pstn`). Valores são strings.

Exemplo real 6257 BR (final; dg 05/10/2026 12:51:47, tf "s", and "f"): `s.pst`=100,00 (499.248 seções), `e.te`=158.745.502, `e.c`=125.275.835 (78,92%), `e.a`=33.469.244 (21,08%), `v.vvc`=119.300.788 (95,23%), `v.vb`=2.300.798 (1,84%), `v.tvn`=3.674.249, candidatos: 22 Flávio 56.104.503 (47,03%) e=s st="2º turno"; 13 Lula 53.879.538 (45,16%) e=s st="2º turno"; 55 Caiado 2.605.148 (2,18%); 70 Augusto Cury 3.448.569 (2,89%); 14 Renan Santos 2.675.887 (2,24%); demais <0,3%. Arquivos completos: `fixtures/tse/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json` e `.../ac/ac-c0001-e006257-u.json` (UF; `tpabr`="uf", mesma estrutura).
Exemplo 6259 c0003: `fixtures/tse/oficial/ele2026/6259/dados/ac/ac-c0003-e006259-u.json` (Mailza 49,758101386 st "2º turno", Alan Rick 32,27).
Pré-apuração 6258 (BR): `t`="2", `dt`/`ht` vazios, `tf`="n", `and`="n", `s.snt`=499.248 (100%), `e.te`=158.745.502, todos `vap`="0", `st`="", `e`="n". Já traz eleitorado e total de seções. Após o 25/10 espera-se o mesmo schema (inferência, **não confirmado**).
Em 6258 a flag `e` e `st` só devem mudar na totalização. O texto de `st` para o vencedor do 2º turno é **não confirmado** ("Eleito" em 6259 para quem passou de 50%).

## 5. Dado por município do 1T 2026

Sim, por duas vias.
- `resultados.tse.jus.br`: um arquivo por município (ver §3), p.ex. `ele2026/6257/dados/ac/ac01392-c0001-e006257-u.json` (Rio Branco: Flávio 131.895, 63,76%; Lula 56.423, 27,28%). Códigos em `ele2026/6257/config/mun-e006257-cm.json`.
- `cdn.tse.jus.br/estatistica/sead/odsele/` (dados abertos, página `https://dadosabertos.tse.jus.br/dataset/resultados-2026`), CSV latin-1, `;`, colunas por município e zona (`CD_MUNICIPIO`, `NR_ZONA`, `QT_VOTOS_NOMINAIS_VALIDOS`...), conteúdo em ZIP:
  - `votacao_candidato_munzona/votacao_candidato_munzona_2026.zip`: 454.783.527 B (Last-Modified 23/10/2026 23:10). Dentro: `..._BR.csv` (33,6 MB, presidente por município/zona, `NR_TURNO`=1), `..._<UF>.csv` (federal/estadual; MG 717 MB, SP 884 MB), `..._BRASIL.csv` (3,2 GB).
  - `votacao_partido_munzona/votacao_partido_munzona_2026.zip`: 22.840.699 B
  - `detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip`: 2.514.590 B (brancos, nulos, abstenção, comparecimento por zona)
  - `votacao_secao/votacao_secao_2026_<UF|BR>.zip` (AC 7.589.844 B, Last-Modified 06/10/2026), `detalhe_votacao_secao/detalhe_votacao_secao_2026.zip`
  - `consulta_cand/consulta_cand_2026.zip`: 3.240.995 B; `relatorio_resultado_totalizacao/Relatorio_Resultado_Totalizacao_2026_<UF|BR>.zip` (existência na página, tamanho não medido)
  - Os arquivos de 2º turno desses pacotes ainda não existem (**não confirmado**; os zips são regenerados, esperado após 25/10).

## 6. Histórico de totalização (série temporal)

- 2022 existe: `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/Historico_Totalizacao_Presidente_BR_1T_2022.zip` (200, 1.625.754 B) e `..._2T_2022.zip` (200, 825.276 B).
- 2026: **não existe / não confirmado.** 404 em `eleicoes/eleicoes2026/Historico_Totalizacao_Presidente_BR_{1T,2T}_2026.zip`, `..._BR_2026.zip`, `..._Presidente_1T_2026.zip`, `Governador_BR_1T_2026`, `Governador_AC_1T_2026`, extensões `.csv/.json/.xlsx`; o diretório `eleicoes2026/` dá 403 (sem listagem). `Historico_Totalizacao_Governador_*_1T_2022` e `Prefeito_BR_1T_2024` também 404 (o padrão não é geral). A página de dados abertos 2026 não lista nenhum histórico; há `resultados-2026-arquivos-transmitidos-para-totalizacao` (não explorado). Alternativa: construir a série fazendo polling do `-u.json` e guardando `s.pst`/`dg`/`hg` a cada fetch.

## Fixtures salvas (50 arquivos, ~1 MB)

`fixtures/tse/oficial/`: `comum/config/ele-c.json`; `ele2026/6257/dados/{br,<27 UFs>}/*-c0001-e006257-u.json` + municipais `ac01392`, `sp71072`; `ele2026/6258/dados/br/br-c0001-e006258-u.json`, `.../ac/ac-c0001-e006258-u.json`, `ac01392-c0001-e006258-u.json`; `ele2026/6259/dados/{ac,am,df,es,rn,to}/*-c0003-e006259-u.json` + `ac01392`; `ele2026/6260/dados/{ac,am,df,es,rn,to}/*-c0003-e006260-u.json` + `ac01392`; `config/mun-e006258-cm.json`, `mun-e006260-cm.json`.

## Lacunas
- Formato do 6258/6260 pós-apuração (valores de `st`/`and`) não confirmado; só será visível em 25/10.
- 304/If-None-Match não testado. Arquivos municipais de 6258 (todos os 5.570) não varridos.
- Histórico de totalização 2026: não confirmado.
- Senador, deputados e fotos de governadores não mapeados.
