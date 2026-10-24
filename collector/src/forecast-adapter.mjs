// Adaptador entre o coletor e o modelo (../../model/index.mjs, v2.x, ESM puro). Contrato lido no topo do modulo:
//   forecast(entrada) -> { forecast|null, criterios_nao_atendidos: string[], parcial, apurado, corrida, modelo, versao, ... }
//   entrada = { cargo, uf?, ufs, estratos?, br?, stale?, agora? }  (Compacto exige eleitorado.totalizado)
// O adaptador normaliza a saida para o que vai ao snapshot:
//   { versao, modelo:{nome,versao,calibracao,sha_codigo}, forecast, criterios_nao_atendidos, analise }
//   analise = { apurado, parcial, estratificacao, definido_matematicamente } (sem a lista pesada de estratos).
// Se o modulo nao existir ou lancar erro: forecast=null + criterio explicando.

import { CALIBRACAO_SHA256 } from './config.mjs';

let cache = null;

async function carregarModelo() {
  if (cache) return cache;
  try {
    cache = await import('../../model/index.mjs');
  } catch {
    cache = { indisponivel: true };
  }
  return cache;
}

const vazio = (versao, nome, criterio) => ({
  versao, modelo: { nome, versao, calibracao: null, calibracao_sha256: null, sha_codigo: null }, forecast: null, criterios_nao_atendidos: [criterio], analise: null,
});

export function criarForecaster(modeloFixo) {
  return async function calcular(entrada) {
    const mod = modeloFixo ?? (await carregarModelo());
    if (mod.indisponivel) return vazio('indisponivel', null, 'modelo_indisponivel');
    const versao = mod.VERSAO ?? mod.versao ?? mod.MODEL_VERSION ?? 'desconhecida';
    const nome = mod.MODELO?.nome ?? null;
    const fn = mod.forecast ?? mod.calcularForecast ?? mod.default;
    if (typeof fn !== 'function') return vazio(versao, nome, 'modelo_sem_funcao_forecast');
    try {
      const r = (await fn(entrada)) ?? {};
      const forecast = r.forecast ?? null;
      return {
        versao,
        modelo: { nome, versao, calibracao: mod.MODELO?.calibracao ?? r.modelo?.calibracao ?? null, calibracao_sha256: CALIBRACAO_SHA256, sha_codigo: mod.SHA_CODIGO ?? mod.sha_codigo ?? null },
        forecast,
        criterios_nao_atendidos: forecast ? [] : (r.criterios_nao_atendidos ?? ['criterios_nao_informados']),
        analise: r.parcial || r.apurado
          ? {
            apurado: r.apurado ?? null,
            parcial: r.parcial ?? null,
            estratificacao: r.corrida?.estratificacao ?? null,
            definido_matematicamente: r.parcial?.definido_matematicamente ?? null,
          }
          : null,
      };
    } catch (e) {
      return vazio(versao, nome, `erro_modelo: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  };
}
