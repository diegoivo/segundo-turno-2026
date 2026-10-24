// Entrada do Worker. Cron `* * * * *` roda a coleta; HTTP so existe em staging (token).
import { executarInvocacao } from './collect.mjs';

const resposta = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function iguaisTempoConstante(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function tratarHttp(request, env, executar = executarInvocacao) {
  // Producao (e qualquer ENV desconhecido): 404 para tudo.
  if (env.ENV !== 'staging' || !env.STAGING_TOKEN) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  if (url.pathname !== '/coletar' || request.method !== 'POST') return new Response('Not found', { status: 404 });
  const auth = request.headers.get('authorization') ?? '';
  if (!iguaisTempoConstante(auth, `Bearer ${env.STAGING_TOKEN}`)) return resposta({ erro: 'nao autorizado' }, 401);
  try {
    return resposta(await executar(env, { ciclos: 1 }));
  } catch (e) {
    return resposta({ erro: String(e.message) }, 500);
  }
}

export default {
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(
      executarInvocacao(env).catch((e) => {
        console.error('coleta falhou:', e);
        throw e;
      }),
    );
  },
  fetch(request, env) {
    return tratarHttp(request, env);
  },
};
