// Orquestracao: busca no TSE -> valida -> (se mudou) commit encadeado no R2.
import {
  CHAVE_LATEST, CHAVE_MANIFEST, CHAVE_SERIES, chaveGov, chaveHistory, chaveRaw,
  gravarImutavel, gravarLive, JSON_UTF8, lerJson,
} from './armazenamento.mjs';
import {
  canonicalize, dataBrasilia, gzipBytes, parseDgHg, sha256Hex,
} from './canonical.mjs';
import {
  cadeias, CHAVE_ESTRATOS, CICLOS, DATA_INICIO_PADRAO, ESTRATOS_POR_CICLO, estratosDoConfig, GOV_CFG_URL, GOV_UFS,
  INTERVALO_CICLO_MS, PRAZO_INVOCACAO_MS, SERIE_INICIO_PADRAO, SUBREQUEST_ORCAMENTO,
} from './config.mjs';
import { criarForecaster } from './forecast-adapter.mjs';
import { adquirirLock, conferirLock, liberarLock } from './lock.mjs';
import { anexarSerie, construirGov, construirLatest } from './live.mjs';
import { buscarArquivo, executarPaced } from './tse-fetch.mjs';
import { compactar, validarArquivo } from './validate.mjs';

const AMBIENTES = ['staging', 'production'];
const LIMITE_STALE_MANIFEST = 100;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDeDg = (dg) => `${dg.slice(6, 10)}-${dg.slice(3, 5)}-${dg.slice(0, 2)}`;

function nCandidatos() {
  return 2; // 2o turno: sempre dois candidatos por cargo/regiao
}

/**
 * Uma invocacao do Worker: ate `ciclos` ciclos espacados de `intervaloMs`.
 * deps: { fetchFn, sleep, agora, forecaster, ciclos, intervaloMs, paceMs, sinteticoPermitido }
 */
export async function executarInvocacao(env, deps = {}) {
  if (!AMBIENTES.includes(env?.ENV)) throw new Error(`ENV invalido: ${env?.ENV} (use staging|production)`);
  if (!env.DATA) throw new Error('binding R2 DATA ausente');
  const d = {
    sleep: dormir,
    agora: () => Date.now(),
    fetchFn: fetch,
    forecaster: criarForecaster(),
    ciclos: CICLOS,
    intervaloMs: INTERVALO_CICLO_MS,
    ...deps,
  };
  const fetchBase = d.fetchFn;
  const ctx = {
    env, d, bucket: env.DATA, ambiente: env.ENV,
    dataInicio: env.START_DATE || DATA_INICIO_PADRAO,
    cadeias: cadeias(),
    usados: 0, // fetches ao TSE nesta invocacao (orcamento de subrequests)
    orcamento: Number(env.SUBREQUEST_ORCAMENTO) || SUBREQUEST_ORCAMENTO,
    serieInicioMs: Date.parse(env.SERIE_INICIO || SERIE_INICIO_PADRAO),
    estratos: null, // lista de estratos dos governadores (so depois do 1o dado real)
    memo: new Map(), // `${eleicao}:${id}` -> entrada
    falhas: new Map(), // `${eleicao}:${id}` -> falhas consecutivas
    heads: {}, // eleicao -> { snapshot, sha, chave }
    resumo: { ciclos: 0, commits: [], erros: [], pulados: [], avisos: [] },
  };
  d.fetchFn = (...a) => {
    ctx.usados++;
    return fetchBase(...a);
  };
  await carregarEstadoInicial(ctx);

  const t0 = d.agora();
  ctx.t0 = t0;
  for (let i = 0; i < d.ciclos; i++) {
    if (i > 0) {
      const espera = t0 + i * d.intervaloMs - d.agora();
      if (espera > 0) await d.sleep(espera);
      if (d.agora() - t0 > (d.prazoMs ?? PRAZO_INVOCACAO_MS)) break; // nao invade o cron seguinte
    }
    ctx.ciclo = i;
    await executarCiclo(ctx);
    ctx.resumo.ciclos++;
  }
  for (const c of ctx.cadeias.filter((x) => x.commitNoFim)) await commitSeguro(ctx, c);
  ctx.resumo.subrequests_tse = ctx.usados;
  await reconciliarStale(ctx);
  ctx.resumo.stale = staleAtual(ctx);
  return ctx.resumo;
}

async function carregarEstadoInicial(ctx) {
  const { valor: manifest } = await lerJson(ctx.bucket, CHAVE_MANIFEST);
  if (manifest && manifest.ambiente !== ctx.ambiente) {
    throw new Error(`bucket pertence a '${manifest.ambiente}', Worker e '${ctx.ambiente}': abortando`);
  }
  for (const c of ctx.cadeias) await carregarHead(ctx, c.eleicao, manifest);
}

// Carrega (ou reaproveita do cache da invocacao) o snapshot que o manifest aponta como cabeca da cadeia.
async function carregarHead(ctx, eleicao, manifest) {
  const ref = manifest?.cadeias?.[eleicao];
  if (!ref) {
    delete ctx.heads[eleicao];
    return null;
  }
  if (ctx.heads[eleicao]?.sha === ref.sha256) return ctx.heads[eleicao];
  const { valor } = await lerJson(ctx.bucket, ref.chave);
  if (!valor) throw new Error(`cabeca da cadeia ${eleicao} ausente: ${ref.chave}`);
  ctx.heads[eleicao] = { snapshot: valor, sha: ref.sha256, chave: ref.chave };
  return ctx.heads[eleicao];
}

const chaveFonte = (c, f) => `${c.eleicao}:${f.id}`;

function baseline(ctx, c, f) {
  const k = chaveFonte(c, f);
  if (ctx.memo.has(k)) return ctx.memo.get(k);
  const fh = ctx.heads[c.eleicao]?.snapshot.fontes.find((x) => x.id === f.id);
  return fh
    ? { etag: fh.etag, lastModified: fh.last_modified, sha: fh.sha256_raw, status: 'ok', bom: { sha: fh.sha256_raw } }
    : null;
}

const fontesAtivas = (ctx, c) => (c.eleicao === '6260' && ctx.estratos ? [...c.fontes, ...ctx.estratos] : c.fontes);

function passaGate(ctx, c) {
  if (ctx.heads[c.eleicao]) return true;
  if (ctx.ambiente !== 'production') return true;
  if (c.gateDe) return passaGate(ctx, ctx.cadeias.find((x) => x.eleicao === c.gateDe));
  return c.fontes.some((f) => {
    if (c.fonteGate && f.id !== c.fonteGate) return false;
    const bom = ctx.memo.get(chaveFonte(c, f))?.bom;
    return bom?.compact && bom.compact.secoes.totalizadas > 0 && isoDeDg(bom.compact.dg) >= ctx.dataInicio;
  });
}

// Round-robin sem estado: o lote vem do relogio (minuto), entao invocacoes sobrepostas escolhem os mesmos arquivos.
function lote(ctx, ciclo) {
  const n = ctx.estratos.length;
  const base = ctx.cadeias.find((x) => x.eleicao === '6260').fontes.length;
  const ciclosRestantes = Math.max(1, ctx.d.ciclos - ciclo);
  const disponivel = Math.floor((ctx.orcamento - ctx.usados) / ciclosRestantes) - base - ctx.cadeias[0].fontes.length;
  const porCiclo = Math.max(0, Math.min(ESTRATOS_POR_CICLO, disponivel, n));
  const slot = Math.floor(ctx.t0 / 60_000);
  const inicio = (slot * ESTRATOS_POR_CICLO * ctx.d.ciclos + ciclo * ESTRATOS_POR_CICLO) % n;
  return Array.from({ length: porCiclo }, (_, i) => ctx.estratos[(inicio + i) % n]);
}

function fontesParaBuscar(ctx, c, ciclo) {
  if (!passaGate(ctx, c)) {
    if (c.gateDe) return [];
    return c.fonteGate ? c.fontes.filter((f) => f.id === c.fonteGate) : c.fontes;
  }
  return c.eleicao === '6260' && ctx.estratos ? [...c.fontes, ...lote(ctx, ciclo)] : c.fontes;
}

// Lista de estratos: estado no R2 (criada uma vez) ou baixada de config/mun-e006260-cm.json. So apos o 1o dado real.
async function garantirEstratos(ctx) {
  const gov = ctx.cadeias.find((x) => x.eleicao === '6260');
  if (ctx.estratos || ctx.estratosFalhou || !passaGate(ctx, gov)) return;
  const { valor } = await lerJson(ctx.bucket, CHAVE_ESTRATOS);
  if (valor?.estratos?.length) {
    ctx.estratos = valor.estratos;
    return;
  }
  const resp = await buscarArquivo(GOV_CFG_URL, null, ctx.d);
  let lista = [];
  if (resp.status === 200) {
    try {
      lista = estratosDoConfig(JSON.parse(new TextDecoder().decode(resp.body)));
    } catch {
      lista = [];
    }
  }
  if (!lista.length) {
    ctx.estratosFalhou = true; // tenta de novo na proxima invocacao; governador roda em modo UF (faixa larga)
    ctx.resumo.avisos.push('lista de estratos dos governadores indisponivel (modo UF)');
    return;
  }
  await ctx.bucket.put(CHAVE_ESTRATOS, JSON.stringify({ schema: 1, fonte: GOV_CFG_URL, estratos: lista }), {
    httpMetadata: { contentType: JSON_UTF8, cacheControl: 'no-store' },
    onlyIf: { etagDoesNotMatch: '*' },
  });
  ctx.estratos = lista;
}

async function executarCiclo(ctx) {
  await garantirEstratos(ctx);
  const alvos = ctx.cadeias.flatMap((c) => fontesParaBuscar(ctx, c, ctx.ciclo).map((f) => [c, f]));
  const tarefas = alvos.map(([c, f]) => async () => {
    const cond = baseline(ctx, c, f);
    const resp = await buscarArquivo(f.url, cond, ctx.d);
    await processarResposta(ctx, c, f, cond, resp);
  });
  await executarPaced(tarefas, ctx.d);
  for (const c of ctx.cadeias.filter((x) => !x.commitNoFim)) await commitSeguro(ctx, c);
}

async function commitSeguro(ctx, c) {
  try {
    await tentarCommit(ctx, c);
  } catch (e) {
    console.error(`commit ${c.eleicao} falhou:`, e);
    ctx.resumo.erros.push(`${c.eleicao}: ${e.message}`);
  }
}

function marcar(ctx, k, ok) {
  ctx.falhas.set(k, ok ? 0 : (ctx.falhas.get(k) ?? 0) + 1);
}

async function processarResposta(ctx, c, f, cond, resp) {
  const k = chaveFonte(c, f);
  if (resp.status === 304) {
    marcar(ctx, k, cond?.status === 'ok');
    return;
  }
  if (resp.status === 404 && f.opcional) return;
  if (resp.status !== 200) {
    marcar(ctx, k, false);
    return;
  }
  const sha = await sha256Hex(resp.body);
  if (cond && cond.sha === sha) {
    marcar(ctx, k, cond.status === 'ok');
    ctx.memo.set(k, { ...cond, etag: resp.etag ?? cond.etag, lastModified: resp.lastModified ?? cond.lastModified });
    return;
  }
  const erros = [];
  let json = null;
  try {
    json = JSON.parse(new TextDecoder().decode(resp.body).replace(/^﻿/, ''));
  } catch {
    erros.push('json ilegivel');
  }
  if (json) {
    erros.push(...validarArquivo(json, {
      ele: c.eleicao, cd: c.cd, tpabr: f.tpabr, cdabr: f.cdabr ?? f.regiao, nCandidatos: nCandidatos(),
    }));
    if (ctx.ambiente === 'production' && json._sintetico) erros.push('arquivo sintetico em producao');
  }
  const anterior = ctx.memo.get(k)?.bom ?? cond?.bom ?? null;
  if (erros.length) {
    marcar(ctx, k, false);
    ctx.memo.set(k, { etag: resp.etag, lastModified: resp.lastModified, sha, status: 'invalido', erros, bom: anterior });
    return;
  }
  marcar(ctx, k, true);
  const bom = {
    sha, bytes: resp.body, compact: compactar(json), dg: json.dg, hg: json.hg,
    etag: resp.etag, lastModified: resp.lastModified,
  };
  ctx.memo.set(k, { etag: resp.etag, lastModified: resp.lastModified, sha, status: 'ok', bom });
}

function limiarStale(ctx) {
  return Math.min(2, ctx.d.ciclos);
}

export function staleAtual(ctx) {
  return [...ctx.falhas.entries()].filter(([, n]) => n >= limiarStale(ctx)).map(([k]) => k).sort();
}

// ---------------------------------------------------------------- commit

async function tentarCommit(ctx, c) {
  const head = ctx.heads[c.eleicao];
  const mudou = fontesAtivas(ctx, c).filter((f) => {
    const bom = ctx.memo.get(chaveFonte(c, f))?.bom;
    if (!bom?.bytes) return false;
    const shaHead = head?.snapshot.fontes.find((x) => x.id === f.id)?.sha256_raw;
    return bom.sha !== shaHead;
  });
  if (mudou.length === 0) return;
  if (!head) {
    const faltando = c.fontes.filter((f) => !f.opcional && !ctx.memo.get(chaveFonte(c, f))?.bom?.bytes);
    if (faltando.length > 0 || !passaGate(ctx, c)) return; // cadeia ainda nao pode comecar
  }

  const lock = await adquirirLock(ctx.bucket, { agora: ctx.d.agora, sleep: ctx.d.sleep });
  if (!lock) {
    ctx.resumo.pulados.push(`${c.eleicao}: lock ocupado`);
    return;
  }
  try {
    await commitSobLock(ctx, c, lock);
  } finally {
    await liberarLock(ctx.bucket, lock);
  }
}

async function commitSobLock(ctx, c, lock) {
  const { valor: manifest, etag: manifestEtag } = await lerJson(ctx.bucket, CHAVE_MANIFEST);
  if (manifest && manifest.ambiente !== ctx.ambiente) throw new Error('ambiente do bucket diverge do Worker');
  const head = await carregarHead(ctx, c.eleicao, manifest);

  // Reconfere sob o lock: outro cron pode ja ter gravado exatamente estes dados.
  const novos = fontesAtivas(ctx, c).filter((f) => {
    const bom = ctx.memo.get(chaveFonte(c, f))?.bom;
    return bom?.bytes && bom.sha !== head?.snapshot.fontes.find((x) => x.id === f.id)?.sha256_raw;
  });
  if (novos.length === 0) return;

  const agoraDate = new Date(ctx.d.agora());
  const fontes = [];
  const parcial = {};
  for (const f of fontesAtivas(ctx, c)) {
    const bom = ctx.memo.get(chaveFonte(c, f))?.bom;
    const fh = head?.snapshot.fontes.find((x) => x.id === f.id);
    const novo = novos.includes(f);
    if (novo) {
      fontes.push(f.kind === 'estrato'
        ? { id: f.id, dg: bom.dg, hg: bom.hg, etag: bom.etag ?? null, sha256_raw: bom.sha } // url e derivavel do id
        : {
          id: f.id, url: f.url, dg: bom.dg, hg: bom.hg, etag: bom.etag ?? null,
          last_modified: bom.lastModified ?? null, sha256_raw: bom.sha,
        });
      parcial[f.id] = bom.compact;
    } else if (fh) {
      fontes.push(fh);
      parcial[f.id] = head.snapshot.parcial[f.id];
    }
  }

  const calc = await calcularForecasts(ctx, c, parcial);
  const seq = head ? head.snapshot.seq + 1 : 0;
  const snapshot = {
    schema: 1,
    ambiente: ctx.ambiente,
    eleicao: c.eleicao,
    cargo: c.cargo,
    seq,
    coletado_em: agoraDate.toISOString(),
    fontes,
    modelo: calc.modelo,
    parcial,
    forecast: calc.forecast,
    criterios_nao_atendidos: calc.criterios,
    analise: calc.analise,
    prev_sha256: head ? head.sha : null,
    prev_chave: head ? head.chave : null,
  };
  const canonico = canonicalize(snapshot);
  const sha = await sha256Hex(canonico);
  const chave = chaveHistory(c.eleicao, dataBrasilia(agoraDate), seq, sha);

  if (!(await conferirLock(ctx.bucket, lock))) throw new Error('lock perdido antes de gravar');

  for (const f of novos) {
    const bom = ctx.memo.get(chaveFonte(c, f)).bom;
    await gravarImutavel(ctx.bucket, chaveRaw(bom.sha), await gzipBytes(bom.bytes), 'application/gzip');
  }
  if (!(await gravarImutavel(ctx.bucket, chave, canonico, JSON_UTF8))) {
    throw new Error(`snapshot ja existe: ${chave}`);
  }
  ctx.heads[c.eleicao] = { snapshot, sha, chave };

  const staleChaves = staleAtual(ctx);
  await publicarLive(ctx, c, snapshot, novos.map((f) => f.id), calc, resumoStale(ctx, staleChaves));
  const novoManifest = {
    schema: 1,
    ambiente: ctx.ambiente,
    atualizado_em: agoraDate.toISOString(),
    stale: staleChaves.length > 0,
    stale_total: staleChaves.length,
    stale_fontes: staleChaves.slice(0, LIMITE_STALE_MANIFEST),
    cadeias: {
      ...(manifest?.cadeias ?? {}),
      [c.eleicao]: { seq, sha256: sha, chave, coletado_em: snapshot.coletado_em },
    },
  };
  await gravarManifest(ctx, novoManifest, manifestEtag);
  ctx.resumo.commits.push({ eleicao: c.eleicao, seq, sha256: sha, fontes_novas: novos.map((f) => f.id) });
}

async function gravarManifest(ctx, manifest, etagAnterior) {
  const onlyIf = etagAnterior ? { etagMatches: etagAnterior } : { etagDoesNotMatch: '*' };
  const r = await gravarLive(ctx.bucket, CHAVE_MANIFEST, manifest, onlyIf);
  if (!r) throw new Error('manifest alterado por outro escritor (CAS falhou)');
}

// Modelo: presidente recebe as UFs; governador recebe o arquivo da UF e, se TODOS os estratos da UF ja foram
// coletados, os estratos municipais/zonais (senao o modelo roda em modo UF, com faixa larga).
async function calcularForecasts(ctx, c, parcial) {
  const calc = ctx.d.forecaster;
  const chavesStale = new Set(staleAtual(ctx));
  const staleMap = (ids) => Object.fromEntries(ids.map((id) => [id, chavesStale.has(`${c.eleicao}:${id}`)]));
  const agora = ctx.d.agora();
  if (c.cargo === 'presidente') {
    const { br, ...ufs } = parcial;
    const r = await calc({ cargo: 'presidente', br, ufs, stale: staleMap(Object.keys(ufs)), agora });
    return { ...r, criterios: r.criterios_nao_atendidos };
  }
  const forecast = {};
  const criterios = {};
  const analise = {};
  let ultimo = null;
  for (const uf of GOV_UFS) {
    if (!parcial[uf]) continue;
    const esperados = (ctx.estratos ?? []).filter((e) => e.uf === uf).map((e) => e.id);
    const completo = esperados.length > 0 && esperados.every((id) => parcial[id]);
    const estratos = completo ? Object.fromEntries(esperados.map((id) => [id, parcial[id]])) : undefined;
    const r = await calc({
      cargo: 'governador', uf, ufs: { [uf]: parcial[uf] }, estratos, agora,
      stale: staleMap(estratos ? esperados : [uf]),
    });
    ultimo = r;
    if (r.forecast) forecast[uf] = r.forecast;
    else criterios[uf] = r.criterios_nao_atendidos;
    if (r.analise) analise[uf] = { ...r.analise, estratos_completos: completo };
  }
  return {
    versao: ultimo?.versao ?? 'desconhecida',
    modelo: ultimo?.modelo ?? { nome: null, versao: 'desconhecida', calibracao: null, sha_codigo: null },
    forecast: Object.keys(forecast).length ? forecast : null,
    criterios,
    analise: Object.keys(analise).length ? analise : null,
  };
}

async function publicarLive(ctx, c, snapshot, idsNovos, calc, stale) {
  const { valor: serieAtual } = await lerJson(ctx.bucket, CHAVE_SERIES);
  const forecastPorId = c.cargo === 'presidente' ? { br: calc.forecast } : (calc.forecast ?? {});
  const analisePorId = c.cargo === 'presidente' ? { br: calc.analise } : (calc.analise ?? {});
  await gravarLive(ctx.bucket, CHAVE_SERIES, anexarSerie(serieAtual, snapshot, { forecastPorId, analisePorId, inicioMs: ctx.serieInicioMs }));
  if (c.cargo === 'governador') {
    // regrava o gov-<uf> de toda UF que teve arquivo novo (da UF ou de algum estrato dela)
    const ufsAfetadas = new Set(idsNovos.map((id) => (GOV_UFS.includes(id) ? id : id.slice(0, 2))));
    for (const uf of ufsAfetadas) await gravarGov(ctx, uf, stale);
  }
  await gravarLatest(ctx, stale);
}

function gravarGov(ctx, uf, stale) {
  const estratosUf = (ctx.estratos ?? []).filter((e) => e.uf === uf && ctx.heads['6260'].snapshot.parcial[e.id]).length;
  return gravarLive(ctx.bucket, chaveGov(uf), construirGov({ ambiente: ctx.ambiente, uf, head: ctx.heads['6260'], stale, estratosUf }));
}

// Resumo de stale para os arquivos publicos: fontes UF/BR por nome; estratos so contados (limite de tamanho).
function resumoStale(ctx, chaves) {
  const ufDe = new Map((ctx.estratos ?? []).map((e) => [`6260:${e.id}`, e.uf]));
  const fontes = [];
  const estratosPorUf = {};
  let estratos = 0;
  for (const k of chaves) {
    if (ufDe.has(k)) {
      estratos++;
      estratosPorUf[ufDe.get(k)] = (estratosPorUf[ufDe.get(k)] ?? 0) + 1;
    } else fontes.push(k);
  }
  return { fontes, estratos, estratosPorUf };
}

async function gravarLatest(ctx, stale) {
  await gravarLive(ctx.bucket, CHAVE_LATEST, construirLatest({
    ambiente: ctx.ambiente,
    agora: new Date(ctx.d.agora()).toISOString(),
    stale,
    heads: ctx.heads,
  }));
}

// Se o conjunto de fontes `stale` mudou desde o manifest, republica manifest + latest + gov (so nas transicoes).
async function reconciliarStale(ctx) {
  const chaves = staleAtual(ctx);
  const { valor: manifest } = await lerJson(ctx.bucket, CHAVE_MANIFEST);
  if (!manifest || Object.keys(manifest.cadeias ?? {}).length === 0) return; // nenhuma cadeia comecou: nada a marcar (preserva stubs)
  if (JSON.stringify(manifest.stale_fontes ?? []) === JSON.stringify(chaves.slice(0, LIMITE_STALE_MANIFEST))
    && (manifest.stale_total ?? 0) === chaves.length) return;
  const lock = await adquirirLock(ctx.bucket, { agora: ctx.d.agora, sleep: ctx.d.sleep });
  if (!lock) return;
  try {
    const { valor: atual, etag } = await lerJson(ctx.bucket, CHAVE_MANIFEST);
    for (const c of ctx.cadeias) await carregarHead(ctx, c.eleicao, atual);
    await gravarManifest(ctx, {
      ...atual, stale: chaves.length > 0, stale_total: chaves.length, stale_fontes: chaves.slice(0, LIMITE_STALE_MANIFEST),
      atualizado_em: new Date(ctx.d.agora()).toISOString(),
    }, etag);
    const stale = resumoStale(ctx, chaves);
    if (ctx.heads['6260']) for (const uf of GOV_UFS) await gravarGov(ctx, uf, stale);
    await gravarLatest(ctx, stale);
  } catch (e) {
    console.error('reconciliar stale falhou:', e);
    ctx.resumo.erros.push(`stale: ${e.message}`);
  } finally {
    await liberarLock(ctx.bucket, lock);
  }
}
