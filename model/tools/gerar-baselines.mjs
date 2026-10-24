// Gera model/baselines/*.json a partir dos arquivos finais do 1o turno 2026 (TSE, -u.json).
// Uso: node model/tools/gerar-baselines.mjs <dir 6257 por UF> <dir 6259 municipal/zonas> <mun-e006260-cm.json> <dir 6259 por UF>
// Ex.: node model/tools/gerar-baselines.mjs fixtures/tse/oficial/ele2026/6257/dados <scratch>/dl/tse26/6259 \
//        fixtures/tse/oficial/ele2026/6260/config/mun-e006260-cm.json fixtures/tse/oficial/ele2026/6259/dados
// Deterministico; so leitura de arquivos locais. Baselines sao pequenas (totais por estrato).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTse } from '../parse.mjs';

const [dir6257, dir6259mun, munCm, dir6259uf] = process.argv.slice(2);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'baselines');
const UFS = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz'.split(' ');
const GOV_UFS = ['ac', 'am', 'df', 'es', 'rn', 'to'];

const ler = (p) => JSON.parse(readFileSync(p, 'utf8'));
const achar = (dir, nome) => {
  const direto = join(dir, nome);
  if (existsSync(direto)) return direto;
  for (const sub of readdirSync(dir)) {
    const p = join(dir, sub, nome);
    if (existsSync(p)) return p;
  }
  throw new Error(`arquivo nao encontrado: ${nome} em ${dir}`);
};

function estratoDe(obs, nome, finalistas) {
  const votos = Object.fromEntries(finalistas.map((f) => [f.n, obs.cands.find((c) => c.n === f.n)?.vap ?? 0]));
  return { nome, te: obs.te, est: obs.est, comp: obs.comp, vvc: obs.vvc, ts: obs.ts, votos };
}

function finalistasDe(obs) {
  const f = obs.cands.filter((c) => c.st === '2º turno');
  if (f.length !== 2) throw new Error(`esperava 2 finalistas, achei ${f.length}`);
  return f.map((c) => ({ n: c.n, nmu: c.nmu, nm: c.nm, sgp: c.sgp }));
}

function gerarPresidente() {
  const br = parseTse(ler(achar(dir6257, 'br-c0001-e006257-u.json')), { eleicao: '6257', turno: '1' });
  const finalistas = finalistasDe(br.obs);
  const estratos = Object.fromEntries(UFS.map((uf) => {
    const p = parseTse(ler(achar(dir6257, `${uf}-c0001-e006257-u.json`)), { eleicao: '6257', turno: '1' });
    if (!p.ok) throw new Error(`${uf}: ${p.erros.join(',')}`);
    return [uf, estratoDe(p.obs, uf.toUpperCase(), finalistas)];
  }));
  return {
    corrida: { tipo: 'presidente', eleicao_1t: '6257', estratificacao: 'uf', finalistas },
    fonte: 'resultados.tse.jus.br/oficial/ele2026/6257/dados/<uf>/<uf>-c0001-e006257-u.json (totalizacao final do 1o turno 2026)',
    gerado_em: new Date().toISOString(), estratos,
  };
}

function gerarGovernador(uf, municipios) {
  const ufObs = parseTse(ler(achar(dir6259uf, `${uf}-c0003-e006259-u.json`)), { eleicao: '6259', turno: '1' });
  const finalistas = finalistasDe(ufObs.obs);
  const zonas = uf === 'df';
  const ids = zonas
    ? municipios[0].z.map((z) => [`${uf}${municipios[0].cd}-z${z}`, `${municipios[0].nm} · zona ${z}`])
    : municipios.map((m) => [`${uf}${m.cd}`, m.nm]);
  const estratos = Object.fromEntries(ids.map(([id, nome]) => {
    const p = parseTse(ler(join(dir6259mun, `${id}-c0003-e006259-u.json`)), { eleicao: '6259', turno: '1' });
    if (!p.ok) throw new Error(`${id}: ${p.erros.join(',')}`);
    return [id, estratoDe(p.obs, nome, finalistas)];
  }));
  const somaTe = Object.values(estratos).reduce((s, e) => s + e.te, 0);
  if (Math.abs(somaTe - ufObs.obs.te) > ufObs.obs.te * 0.001) throw new Error(`${uf}: soma te ${somaTe} != uf ${ufObs.obs.te}`);
  return {
    corrida: { tipo: 'governador', uf, eleicao_1t: '6259', estratificacao: zonas ? 'zona' : 'municipio', finalistas },
    fonte: `resultados.tse.jus.br/oficial/ele2026/6259/dados/${uf}/<estrato>-c0003-e006259-u.json (totalizacao final do 1o turno 2026)`,
    gerado_em: new Date().toISOString(), estratos,
  };
}

mkdirSync(OUT, { recursive: true });
const cm = ler(munCm);
const pres = gerarPresidente();
writeFileSync(join(OUT, 'presidente.json'), JSON.stringify(pres));
for (const uf of GOV_UFS) {
  const mun = cm.abr.find((a) => a.cd === uf).mu;
  writeFileSync(join(OUT, `governador-${uf}.json`), JSON.stringify(gerarGovernador(uf, mun)));
  console.log(uf, Object.keys(JSON.parse(readFileSync(join(OUT, `governador-${uf}.json`), 'utf8')).estratos).length, 'estratos');
}
const idx = [
  '// Gerado por model/tools/gerar-baselines.mjs. Nao editar a mao.',
  "import presidente from './presidente.json' with { type: 'json' };",
  "import presidenteMunicipios from './presidente-municipios.json' with { type: 'json' };",
  ...GOV_UFS.map((uf) => `import gov_${uf} from './governador-${uf}.json' with { type: 'json' };`),
  'export const BASELINES = Object.freeze({',
  '  presidente,',
  '  presidenteMunicipios,',
  `  governador: Object.freeze({ ${GOV_UFS.map((uf) => `${uf}: gov_${uf}`).join(', ')} }),`,
  '});',
  '',
].join('\n');
writeFileSync(join(OUT, 'index.mjs'), idx);
console.log('presidente', Object.keys(pres.estratos).length, 'estratos; baselines gravadas em', OUT);
