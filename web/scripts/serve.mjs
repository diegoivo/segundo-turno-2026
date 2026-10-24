#!/usr/bin/env node
// Servidor de desenvolvimento: dist/ + /dados/ com os JSON de exemplo do estado N (1 a 4). Uso: npm run serve -- 3
import { iniciarServidor } from '../test/e2e/servidor.mjs';
import { montarEstado } from '../test/fixtures/gerar.mjs';

const n = Number(process.argv[2] ?? 1);
const s = await iniciarServidor({ porta: Number(process.env.PORT ?? 8787) });
s.estado.dados = montarEstado(n);
console.log(`dist + dados de exemplo (estado ${n}): ${s.url}`);
