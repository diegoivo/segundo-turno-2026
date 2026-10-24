#!/usr/bin/env node
// Verifica a cadeia de hash do historico do 2o turno 2026. Node >= 18, sem dependencias.
//
// Uso: node tools/verificar-cadeia.mjs <base> [--cadeia 6258] [--sem-raw]
//   <base> = URL base (ex.: https://dados.exemplo.com.br) ou diretorio local com o mesmo layout do bucket
//            (live/manifest.json, history/..., raw/...).
// Para cada cadeia do manifest, caminha da cabeca (seq mais alto) ate seq 0 e confere:
//   - o arquivo e o JSON canonico exato (um byte alterado quebra);
//   - sha256(JSON canonico) == sha do nome do arquivo == prev_sha256 do seguinte == manifest;
//   - seq continuo (n, n-1, ..., 0) e prev_sha256 == null no seq 0;
//   - todo raw referenciado existe e sha256(gunzip) == nome.
// Sai com codigo 1 em qualquer quebra.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function canonicalize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalize(x))).join(',')}]`;
  const ks = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${ks.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;
}

async function sha256Hex(dados) {
  const buf = await crypto.subtle.digest('SHA-256', typeof dados === 'string' ? new TextEncoder().encode(dados) : dados);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gunzip(dados) {
  const s = new Blob([dados]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export function leitorLocal(dir) {
  return { ler: async (p) => new Uint8Array(await readFile(join(dir, p))) };
}

export function leitorUrl(base, fetchFn = fetch) {
  const b = base.replace(/\/+$/, '');
  return {
    ler: async (p) => {
      const r = await fetchFn(`${b}/${p}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${p}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}

const texto = (u8) => new TextDecoder().decode(u8);
const SHA = /^[0-9a-f]{64}$/;

/** @param leitor { ler(path) -> Uint8Array } */
export async function verificarCadeia(leitor, { cadeia = null, verificarRaw = true } = {}) {
  const erros = [];
  const resumo = {};
  let manifest;
  try {
    manifest = JSON.parse(texto(await leitor.ler('live/manifest.json')));
  } catch (e) {
    return { ok: false, erros: [`manifest ilegivel: ${e.message}`], resumo };
  }
  const ids = Object.keys(manifest.cadeias ?? {}).filter((id) => !cadeia || id === cadeia);
  if (ids.length === 0) erros.push(cadeia ? `cadeia ${cadeia} ausente no manifest` : 'manifest sem cadeias');
  const rawVistos = new Set();

  for (const id of ids) {
    const ref = manifest.cadeias[id];
    let seqEsperado = ref.seq;
    let shaEsperado = ref.sha256;
    let chave = ref.chave;
    let posterior = null; // snapshot seguinte (para checar ordem do tempo)
    let n = 0;
    while (true) {
      const ctx = `[${id} seq ${seqEsperado}]`;
      let bruto;
      try {
        bruto = texto(await leitor.ler(chave));
      } catch (e) {
        erros.push(`${ctx} snapshot ilegivel (${chave}): ${e.message}`);
        break;
      }
      let snap;
      try {
        snap = JSON.parse(bruto);
      } catch {
        erros.push(`${ctx} JSON invalido`);
        break;
      }
      const canon = canonicalize(snap);
      const sha = await sha256Hex(canon);
      if (bruto !== canon) erros.push(`${ctx} conteudo difere do JSON canonico (arquivo alterado)`);
      if (sha !== shaEsperado) erros.push(`${ctx} sha256 recalculado ${sha} != esperado ${shaEsperado}`);
      if (!chave.endsWith(`-${shaEsperado}.json`)) erros.push(`${ctx} nome do arquivo nao contem o sha esperado`);
      if (snap.seq !== seqEsperado) erros.push(`${ctx} seq no arquivo = ${snap.seq}`);
      if (!chave.includes(`/${String(seqEsperado).padStart(6, '0')}-`)) erros.push(`${ctx} nome do arquivo nao tem o seq`);
      if (snap.eleicao !== id) erros.push(`${ctx} eleicao do arquivo = ${snap.eleicao}`);
      if (posterior && snap.coletado_em > posterior.coletado_em) erros.push(`${ctx} coletado_em posterior ao snapshot seguinte`);

      for (const f of snap.fontes ?? []) {
        if (!SHA.test(f.sha256_raw ?? '')) {
          erros.push(`${ctx} fonte ${f.id} sem sha256_raw valido`);
          continue;
        }
        if (!verificarRaw || rawVistos.has(f.sha256_raw)) continue;
        rawVistos.add(f.sha256_raw);
        try {
          const raw = await gunzip(await leitor.ler(`raw/${f.sha256_raw}.json.gz`));
          if ((await sha256Hex(raw)) !== f.sha256_raw) erros.push(`${ctx} raw ${f.sha256_raw} adulterado`);
        } catch (e) {
          erros.push(`${ctx} raw ${f.sha256_raw} ausente/ilegivel: ${e.message}`);
        }
      }
      n++;
      if (snap.seq === 0 || seqEsperado === 0) {
        if (snap.prev_sha256 !== null) erros.push(`${ctx} seq 0 deveria ter prev_sha256 = null`);
        break;
      }
      if (!SHA.test(snap.prev_sha256 ?? '') || !snap.prev_chave) {
        erros.push(`${ctx} prev_sha256/prev_chave ausentes`);
        break;
      }
      posterior = snap;
      seqEsperado -= 1;
      shaEsperado = snap.prev_sha256;
      chave = snap.prev_chave;
    }
    resumo[id] = { cabeca_seq: ref.seq, snapshots_verificados: n };
  }
  return { ok: erros.length === 0, erros, resumo };
}

async function main(argv) {
  const args = argv.slice(2);
  const base = args.find((a) => !a.startsWith('--'));
  if (!base) {
    console.error('uso: verificar-cadeia.mjs <url-base|diretorio> [--cadeia 6258] [--sem-raw]');
    return 2;
  }
  const i = args.indexOf('--cadeia');
  const cadeia = i >= 0 ? args[i + 1] : null;
  const leitor = /^https?:\/\//.test(base) ? leitorUrl(base) : leitorLocal(base);
  const r = await verificarCadeia(leitor, { cadeia, verificarRaw: !args.includes('--sem-raw') });
  for (const [id, s] of Object.entries(r.resumo)) console.log(`cadeia ${id}: cabeca seq ${s.cabeca_seq}, ${s.snapshots_verificados} snapshot(s) verificados`);
  if (r.ok) {
    console.log('OK: cadeia integra');
    return 0;
  }
  for (const e of r.erros) console.error(`FALHA: ${e}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
