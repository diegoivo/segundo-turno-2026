// Gera src/data/primeiro-turno.json (so dados REAIS do 1o turno, TSE 6257/6259) a partir de design/js/mock-data.js.
// Descarta tudo que e simulacao (states, series, sim, st, ser). Rode uma vez; o resultado e versionado.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const src = readFileSync(`${raiz}../design/js/mock-data.js`, 'utf8');
const window = {};
new Function('window', src)(window);
const M = window.MOCK;

// Cores/rotulos dos governadores: docs/GOVERNADORES-ALINHAMENTO.md (via design/js/app.js, tabela GOV).
const GOV = {
  'ALAN RICK': ['Alan Rick', 'n2', 'Alan Rick'], 'MAILZA ASSIS': ['Mailza Assis', 'n1', 'Mailza'],
  'OMAR AZIZ': ['Omar Aziz', 'red', 'Omar'], 'PROFESSORA MARIA DO CARMO': ['Prof. Maria do Carmo', 'blue', 'Carmo'],
  'CELINA LEÃO': ['Celina Leão', 'blue', 'Celina'], 'LEANDRO GRASS': ['Leandro Grass', 'red', 'Grass'],
  'RICARDO FERRAÇO': ['Ricardo Ferraço', 'n1', 'Ferraço'], 'LORENZO PAZOLINI': ['Lorenzo Pazolini', 'blue', 'Pazolini'],
  'CADU DE LULA': ['Cadu de Lula', 'red', 'Cadu'], 'ALLYSON': ['Allyson', 'n1', 'Allyson'],
  'PROFESSORA DORINHA': ['Prof. Dorinha', 'blue', 'Dorinha'], 'VICENTINHO JÚNIOR': ['Vicentinho Júnior', 'n1', 'Vicentinho'],
};
const title = (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/ (Da|De|Do|Dos|Das|E) /g, (m) => m.toLowerCase());

const governadores = {};
for (const [uf, g] of Object.entries(M.gov)) {
  governadores[uf.toLowerCase()] = {
    ts: g.ts, te: g.te, validos1t: g.V1,
    candidatos: g.cands.map((c) => {
      const [nome, cor, curto] = GOV[c.nmu];
      return { n: c.n, chave: c.nmu, nome, curto, cor, completo: title(c.nm || c.nmu), sg: c.sg, vice: title(c.vice), coligacao: `Coligação ${title(c.coligacao)}`, votos1t: c.v1, pct1t: parseFloat(c.p1.replace(',', '.')) };
    }),
  };
}

const saida = {
  fonte: 'TSE, eleições 6257 (presidente, 1º turno) e 6259 (governador, 1º turno); curva de 2022: TSE, histórico de totalização do 2º turno',
  presidente: { votosLula: M.pres1.L, votosFlavio: M.pres1.F, validos: M.pres1.V, secoes: M.pres1.ts, eleitorado: M.pres1.te, comparecimento: M.pres1.comp, brancos: M.pres1.brancos, nulos: M.pres1.nulos },
  ufs: M.ufs1.map((u) => ({ uf: u.uf, nome: u.nome, regiao: u.regiao, lula: u.L, flavio: u.F, validos: u.V, secoes: u.ts })),
  curva2022: M.c2022,
  governadores,
};
writeFileSync(`${raiz}src/data/primeiro-turno.json`, `${JSON.stringify(saida)}\n`);
console.log('ok', Object.keys(governadores));
