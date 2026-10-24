import { executarInvocacao } from '../../src/collect.mjs';
import { criarForecaster } from '../../src/forecast-adapter.mjs';
import { MockR2 } from './mock-r2.mjs';
import { publicarApuracao, TseFalso } from './tse-mock.mjs';

export const semEspera = async () => {};

export function novoAmbiente(ENV = 'staging', extra = {}) {
  const bucket = new MockR2();
  const tse = new TseFalso();
  return { bucket, tse, env: { ENV, DATA: bucket, ...extra } };
}

let relogio = Date.parse('2026-10-25T21:00:00Z');
export const avancar = (ms) => { relogio += ms; };
export const definirRelogio = (iso) => { relogio = Date.parse(iso); };

export function rodar(amb, deps = {}) {
  return executarInvocacao(amb.env, {
    fetchFn: amb.tse.fetch,
    sleep: semEspera,
    agora: () => relogio,
    ciclos: 1,
    forecaster: criarForecaster({ indisponivel: true }),
    paceMs: 0,
    ...deps,
  });
}

export function apurar(amb, pct, extra = {}) {
  publicarApuracao(amb.tse, { pct, ...extra });
}

export const lerObj = (bucket, chave) => JSON.parse(bucket.texto(chave));
