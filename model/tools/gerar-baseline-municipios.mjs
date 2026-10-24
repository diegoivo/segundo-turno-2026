// Gera model/baselines/presidente-municipios.json (1T 2026 por municipio, so os dois finalistas) a partir da
// reconstrucao por secao backfill/1t2026/secoes-presidente.csv.gz (boletins de urna oficiais do TSE).
// Uso: node model/tools/gerar-baseline-municipios.mjs <secoes-presidente.csv.gz> [mun-e006258-cm.json]
// id do estrato = '<uf><cd5>' (codigo TSE com 5 digitos, igual ao nome do arquivo municipal `<uf><cd5>-c0001-e006258-u.json`).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [csvGz, munCm] = process.argv.slice(2);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'baselines', 'presidente-municipios.json');
const REGIAO = Object.fromEntries([
  ...'ac am ap pa ro rr to'.split(' ').map((u) => [u, 'N']), ...'al ba ce ma pb pe pi rn se'.split(' ').map((u) => [u, 'NE']),
  ...'df go ms mt'.split(' ').map((u) => [u, 'CO']), ...'es mg rj sp'.split(' ').map((u) => [u, 'SE']), ...'pr rs sc'.split(' ').map((u) => [u, 'S']), ['zz', 'ZZ'],
]);
const linhas = gunzipSync(readFileSync(csvGz)).toString('utf8').split('\n').filter(Boolean);
const cab = linhas[0].split(',');
const ix = Object.fromEntries(cab.map((c, i) => [c, i]));
const estratos = {};
for (const l of linhas.slice(1)) {
  const r = l.split(',');
  const uf = r[ix.uf].toLowerCase();
  const id = `${uf}${r[ix.cd_municipio].padStart(5, '0')}`;
  const e = estratos[id] ?? (estratos[id] = { nome: r[ix.nm_municipio], te: 0, comp: 0, vvc: 0, ts: 0, votos: { 13: 0, 22: 0 }, grupo: { uf, regiao: REGIAO[uf] } });
  e.te += Number(r[ix.aptos]); e.comp += Number(r[ix.comparecimento]); e.ts += 1;
  e.votos[13] += Number(r[ix.v_13]); e.votos[22] += Number(r[ix.v_22]);
  e.vvc = e.votos[13] + e.votos[22];
}
const nomes = munCm ? Object.fromEntries(JSON.parse(readFileSync(munCm, 'utf8')).abr.flatMap((a) => a.mu.map((m) => [`${a.cd}${m.cd}`, m.nm]))) : {};
const faltando = Object.keys(nomes).filter((id) => !estratos[id]);
const extras = Object.keys(estratos).filter((id) => munCm && !nomes[id]);
const out = {
  corrida: { tipo: 'presidente', eleicao_1t: '6257', estratificacao: 'municipio', finalistas: [{ n: '13', nmu: 'LULA', nm: 'LUIZ INÁCIO LULA DA SILVA', sgp: 'PT' }, { n: '22', nmu: 'FLAVIO BOLSONARO', nm: 'FLAVIO NANTES BOLSONARO', sgp: 'PL' }] },
  fonte: 'boletins de urna do 1o turno 2026 (bweb, TSE) agregados por municipio em backfill/1t2026/secoes-presidente.csv.gz',
  gerado_em: new Date().toISOString(), estratos,
};
writeFileSync(OUT, JSON.stringify(out));
const soma = (f) => Object.values(estratos).reduce((s, e) => s + f(e), 0);
console.log('municipios', Object.keys(estratos).length, 'te', soma((e) => e.te), 'L', soma((e) => e.votos[13]), 'F', soma((e) => e.votos[22]), 'bytes', JSON.stringify(out).length);
console.log('no mun-cm mas sem secoes:', faltando.length, faltando.slice(0, 5), '| com secoes mas fora do mun-cm:', extras.length, extras.slice(0, 5));
