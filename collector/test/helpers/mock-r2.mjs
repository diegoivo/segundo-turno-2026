// Mock em memoria da API de binding do R2 (put/get/head/delete/list + onlyIf).
import { createHash } from 'node:crypto';

const paraBytes = (v) => (typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v));

export class MockR2 {
  constructor({ latencia = true } = {}) {
    this.objetos = new Map();
    this.log = []; // { op, chave }
    this.latencia = latencia;
    this.aoPut = null; // hook async (chave, n) para simular lentidao/intercalar invocacoes
    this.nPuts = 0;
    this.bloqueados = []; // prefixos com Bucket Lock: put sobre chave existente => 409
  }

  async #tick() {
    if (this.latencia) await new Promise((r) => setImmediate(r)); // permite intercalar invocacoes concorrentes
  }

  #embrulhar(chave, o) {
    return {
      key: chave,
      etag: o.etag,
      httpEtag: `"${o.etag}"`,
      size: o.bytes.length,
      httpMetadata: o.httpMetadata,
      text: async () => new TextDecoder().decode(o.bytes),
      arrayBuffer: async () => o.bytes.slice().buffer,
    };
  }

  async put(chave, valor, opts = {}) {
    await this.#tick();
    if (this.aoPut) await this.aoPut(chave, ++this.nPuts);
    const atual = this.objetos.get(chave);
    if (atual && this.bloqueados.some((p) => chave.startsWith(p))) {
      throw Object.assign(new Error(`409 Conflict: ${chave} protegido por Bucket Lock`), { status: 409 });
    }
    const c = opts.onlyIf;
    if (c) {
      const igual = (e) => (Array.isArray(e) ? e : [e]).some((x) => atual && (x === '*' || x === atual.etag));
      if (c.etagMatches !== undefined && !igual(c.etagMatches)) return null;
      if (c.etagDoesNotMatch !== undefined && igual(c.etagDoesNotMatch)) return null;
    }
    const bytes = paraBytes(valor);
    this.seq = (this.seq ?? 0) + 1;
    const etag = createHash('md5').update(bytes).update(String(this.seq)).digest('hex');
    this.objetos.set(chave, { bytes, etag, httpMetadata: opts.httpMetadata ?? {} });
    this.log.push({ op: 'put', chave });
    return this.#embrulhar(chave, this.objetos.get(chave));
  }

  async get(chave) {
    await this.#tick();
    const o = this.objetos.get(chave);
    return o ? this.#embrulhar(chave, o) : null;
  }

  async head(chave) {
    return this.get(chave);
  }

  async delete(chave) {
    await this.#tick();
    this.objetos.delete(chave);
    this.log.push({ op: 'delete', chave });
  }

  async list({ prefix = '' } = {}) {
    return { objects: [...this.objetos.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })) };
  }

  puts(prefixo = '') {
    return this.log.filter((l) => l.op === 'put' && l.chave.startsWith(prefixo));
  }

  limparLog() {
    this.log = [];
  }

  texto(chave) {
    const o = this.objetos.get(chave);
    return o ? new TextDecoder().decode(o.bytes) : null;
  }

  leitor() {
    return {
      ler: async (p) => {
        const o = this.objetos.get(p);
        if (!o) throw new Error(`nao encontrado: ${p}`);
        return o.bytes;
      },
    };
  }
}
