#!/usr/bin/env node
// Gera os arquivos estáticos do modo demonstração (?demo) a partir de snapshots do ENSAIO GERAL 2 (bucket segundo-turno-ensaio2,
// só leitura). Dado sintético: 1º turno 2026 convertido em 2º turno. Nada daqui vem de produção.
// Uso: node scripts/gerar-demo.mjs <pasta-com-os-JSON-baixados> [seqPres=15] [seqGov=13]
//   a pasta deve ter: h6258-<seq>.json, h6258-<seq+1>.json (para o sha), h6260-<seq>.json, h6260-<seq+1>.json, series.json
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { construirGov, construirLatest } from '../../collector/src/live.mjs';

const [dir, sp = '15', sg = '13'] = process.argv.slice(2);
if (!dir) { console.error('uso: gerar-demo.mjs <pasta> [seqPres] [seqGov]'); process.exit(1); }
const seqP = Number(sp);
const seqG = Number(sg);
const ler = (f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const OUT = fileURLToPath(new URL('../src/demo/', import.meta.url));
const UFS = ['ac', 'am', 'df', 'es', 'rn', 'to'];

const pres = ler(`h6258-${seqP}.json`);
const govs = ler(`h6260-${seqG}.json`);
// sha de um snapshot = prev_sha256 do seguinte; na demo o hash não é exposto (não há cadeia pública a verificar)
const SEM_SHA = null;
const agora = new Date().toISOString();
const stale = { fontes: [], estratos: 0 };

const latest = construirLatest({ ambiente: 'demo', agora, stale, heads: { 6258: { snapshot: pres, sha: SEM_SHA }, 6260: { snapshot: govs, sha: SEM_SHA } } });
latest.demo = true;

const serieFull = ler('series.json');
const serie = {
  schema: 1,
  presidente: serieFull.presidente.filter((x) => x.s <= seqP),
  governadores: Object.fromEntries(UFS.map((u) => [u, serieFull.governadores[u].filter((x) => x.s <= seqG)])),
};

mkdirSync(`${OUT}live`, { recursive: true });
const gravar = (f, o) => writeFileSync(`${OUT}${f}`, `${JSON.stringify(o)}\n`);
gravar('live/latest.json', latest);
gravar('live/series.json', serie);
for (const uf of UFS) gravar(`live/gov-${uf}.json`, { ...construirGov({ ambiente: 'demo', uf, head: { snapshot: govs, sha: SEM_SHA }, stale, estratosUf: 0 }), demo: true });
// o mapa usa manifest -> snapshot; aqui o "snapshot" é só a parcial por UF
gravar('live/manifest.json', { schema: 1, ambiente: 'demo', atualizado_em: agora, stale: false, stale_total: 0, stale_fontes: [], demo: true, cadeias: { 6258: { seq: pres.seq, sha256: null, chave: 'snapshot-6258.json', coletado_em: pres.coletado_em } } });
gravar('snapshot-6258.json', { demo: true, parcial: pres.parcial });
console.log(`demo: presidente ${latest.presidente.pct_secoes.toFixed(1)}% (seq ${seqP}); governadores ${UFS.map((u) => `${u} ${latest.governadores[u].pct_secoes.toFixed(0)}%`).join(', ')}`);
