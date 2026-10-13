// Supabase falso em memória, só para o teste de fumaça das telas (não faz parte do repositório).
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export const configured = true;
export const state = { db: {}, user: 'u1', calls: [], seq: 100, rpcs: [] };
const now = () => new Date().toISOString();

const DEFAULTS = {
  contatos_site: () => ({ status: 'novo', origem: 'site', empresa: '', pessoa_contato: '', email: '', telefone: '', notas: '', etapa_desde: now(), motivo_perda: '', detalhe_perda: '', criado_em: now(), deleted_at: null, cliente_id: null, responsavel_id: null, valor_estimado: null, proximo_contato: null, primeiro_contato_em: null }),
  propostas: () => ({ status: 'rascunho', escopo: '', servicos: '', condicoes_pagamento: '', prazo_texto: '', token: 'a'.repeat(64), criado_em: now(), deleted_at: null, cliente_id: null, contato_id: null, responsavel_id: null }),
  clientes: () => ({ razao_social: '', documento: '', email: '', telefone: '', site: '', cidade: '', observacoes: '', criado_em: now(), deleted_at: null }),
  cliente_contatos: () => ({ cargo: '', email: '', telefone: '', principal: false, criado_em: now() }),
  cliente_links: () => ({ criado_em: now() }),
  projetos: () => ({ status: 'planejado', prioridade: 'media', descricao: '', escopo: '', cliente: '', criado_em: now(), deleted_at: null, bloqueado: false, motivo_bloqueio: '', link_repositorio: '', link_ambiente: '', link_documentacao: '' }),
  tarefas: () => ({ status: 'a_fazer', prioridade: 'media', descricao: '', horas_gastas: 0, motivo_bloqueio: '', criado_em: now(), deleted_at: null }),
  chamados: () => ({ numero: ++state.seq, status: 'novo', prioridade: 'media', descricao: '', solucao: '', aberto_em: now(), deleted_at: null, canal: 'outro' }),
  cobrancas: () => ({ status: 'pendente', parcela: 1, total_parcelas: 1, observacoes: '', criado_em: now(), deleted_at: null }),
  despesas: () => ({ categoria: 'outro', fornecedor: '', observacoes: '', criado_em: now(), deleted_at: null }),
  interacoes: () => ({ criado_em: now(), criado_por: state.user }),
  projeto_entregas: () => ({ tipo: 'entrega', concluida: false, criado_em: now() }),
  projeto_escopo_alteracoes: () => ({ decisao: 'pendente', decisao_obs: '', aplicada: false, criado_em: now() }),
  projeto_ciclos: () => ({ encerrado: false, meta: '', retro_manter: '', retro_mudar: '', criado_em: now() }),
  modelos_projeto: () => ({ tarefas: [], entregas: [], ativo: true }),
  categorias_servico: () => ({ ativo: true }),
  eventos_seguranca: () => ({ quando: now() }),
  contratos: () => ({ status: 'ativo', tipo: 'suporte', periodicidade: 'mensal', antecedencia_dias: 10, observacoes: '', criado_em: now(), deleted_at: null, fim: null }),
};
const PKS = { opcoes: ['grupo', 'chave'], permissoes: ['modulo'], projeto_wip: ['status'] };
const UNIQUE = { clientes: (a, b) => !a.deleted_at && !b.deleted_at && a.nome.trim().toLowerCase() === b.nome.trim().toLowerCase() };

export function seedOpcoes(sqlPath) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const bloco = sql.slice(sql.indexOf('insert into public.opcoes'), sql.indexOf('create table public.categorias_servico'));
  const rows = [...bloco.matchAll(/\('([a-z_]+)','([a-z0-9_]+)','([^']+)',(\d+)\)/g)].map((m) => ({ grupo: m[1], chave: m[2], nome: m[3], ordem: Number(m[4]), ativo: true }));
  return rows;
}

const get = (r, c) => (c.includes('.') ? c.split('.').reduce((o, k) => o?.[k], r) : r[c]);

class Q {
  constructor(table) { this.t = table; this.op = 'select'; this.f = []; this.ord = []; this.ret = false; this.one = null; this.head = false; this.lim = null; }
  select(_cols, opts) { if (this.op !== 'select') this.ret = true; else this.opts = opts; if (opts?.head) this.head = true; return this; }
  insert(v) { this.op = 'insert'; this.v = v; return this; }
  update(v) { this.op = 'update'; this.v = v; return this; }
  upsert(v) { this.op = 'upsert'; this.v = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push((r) => get(r, c) === v); return this; }
  neq(c, v) { this.f.push((r) => get(r, c) !== v); return this; }
  gte(c, v) { this.f.push((r) => get(r, c) >= v); return this; }
  lte(c, v) { this.f.push((r) => get(r, c) <= v); return this; }
  is(c, v) { this.f.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)); return this; }
  not(c, op, v) {
    if (op === 'is' && v === null) this.f.push((r) => get(r, c) != null);
    else if (op === 'in') { const arr = String(v).replace(/[()]/g, '').split(','); this.f.push((r) => !arr.includes(String(get(r, c)))); }
    else this.f.push((r) => get(r, c) !== v);
    return this;
  }
  or(str) {
    const conds = str.split(',').map((p) => { const m = /^(\w+)\.(ilike|eq)\.(.*)$/.exec(p); return (r) => { const x = String(get(r, m[1]) ?? '').toLowerCase(), q = m[3].replace(/%/g, '').toLowerCase(); return m[2] === 'ilike' ? x.includes(q) : x === q; }; });
    this.f.push((r) => conds.some((fn) => fn(r))); return this;
  }
  in(c, arr) { this.f.push((r) => arr.includes(get(r, c))); return this; }
  ilike(c, p) { this.f.push((r) => String(get(r, c) ?? '').toLowerCase() === String(p).toLowerCase().replace(/%/g, '')); return this; }
  match(o) { Object.entries(o).forEach(([k, v]) => this.f.push((r) => r[k] === v)); return this; }
  order(c, o = {}) { this.ord.push([c, o.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  range() { return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }
  exec() {
    const tbl = (state.db[this.t] ||= []);
    state.calls.push([this.op, this.t, this.v]);
    const err = (m, code) => ({ data: null, error: { message: m, code } });
    let out;
    if (this.op === 'insert' || this.op === 'upsert') {
      const arr = Array.isArray(this.v) ? this.v : [this.v], made = [];
      for (const raw of arr) {
        const pk = PKS[this.t];
        if (this.op === 'upsert' && pk) { const ex = tbl.find((r) => pk.every((k) => r[k] === raw[k])); if (ex) { Object.assign(ex, raw); made.push(ex); continue; } }
        const row = { ...(DEFAULTS[this.t]?.() || {}), id: PKS[this.t] ? undefined : randomUUID(), ...raw };
        if (UNIQUE[this.t] && tbl.some((r) => UNIQUE[this.t](r, row))) return err('duplicate key value violates unique constraint', '23505');
        tbl.push(row); made.push(row);
      }
      out = made;
    } else if (this.op === 'update') {
      out = tbl.filter((r) => this.f.every((fn) => fn(r)));
      out.forEach((r) => Object.assign(r, this.v));
    } else if (this.op === 'delete') {
      out = tbl.filter((r) => this.f.every((fn) => fn(r)));
      state.db[this.t] = tbl.filter((r) => !out.includes(r));
    } else {
      out = tbl.filter((r) => this.f.every((fn) => fn(r)));
      for (const [c, asc] of [...this.ord].reverse()) out = [...out].sort((a, b) => { const x = a[c], y = b[c]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
      if (this.lim != null) out = out.slice(0, this.lim);
      if (this.head) return { data: null, count: out.length, error: null };
    }
    const wants = this.op === 'select' || this.ret || this.one;
    if (!wants) return { data: null, error: null };
    const copy = out.map((r) => JSON.parse(JSON.stringify(r)));
    if (this.one === 'single') return copy.length ? { data: copy[0], error: null } : err('JSON object requested, multiple (or no) rows returned', 'PGRST116');
    if (this.one === 'maybe') return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null };
  }
}

export function zerarEstado() {
  Object.assign(state, {
    aal: { currentLevel: 'aal1', nextLevel: 'aal1' }, fatores: [], eventos: [], falhas: [], signOuts: [], rpcs: [], navegacoes: 0,
    sessaoValida: true, mfaOk: true, senhaCerta: 'Senha-Atual-77!', updateErro: null, loginErro: null, atualizacoesSenha: [], authCb: null,
  });
}
zerarEstado();
const ok = (data = null) => ({ data, error: null });
const falha = (code, status = 400, message = 'erro') => ({ data: null, error: { code, status, message } });

/** Cliente descartável: só confere a senha atual, sem mexer na sessão (como o de verdade). */
export const clienteTemporario = () => ({ auth: { signInWithPassword: async ({ password }) => (password === state.senhaCerta ? ok({}) : falha('invalid_credentials')) } });

export const sb = {
  from: (t) => new Q(t),
  rpc: async (name, args) => {
    state.rpcs.push([name, args]);
    switch (name) {
      case 'projeto_de_proposta': {
        const p = state.db.propostas.find((x) => x.id === args.p_proposta);
        if (!p || p.status !== 'aceita') return { data: null, error: { message: 'Só propostas aprovadas podem virar projeto.' } };
        const id = randomUUID(); state.db.projetos.push({ ...DEFAULTS.projetos(), id, titulo: p.titulo, cliente_id: p.cliente_id, proposta_id: p.id });
        return { data: id, error: null };
      }
      case 'sessao_valida': return ok(state.sessaoValida);
      case 'mfa_ok': return ok(state.mfaOk);
      case 'registrar_evento': state.eventos.push({ tipo: args.p_tipo, detalhe: args.p_detalhe }); return ok();
      case 'registrar_login_falho': state.falhas.push(args.p_email); return ok();
      case 'conta_do_hash': return ok([{ nome: 'Membro Teste', email: 'm@x.com' }]);
      default: return { data: 0, error: null };
    }
  },
  auth: {
    getSession: async () => ({ data: { session: state.semSessao ? null : { user: { id: state.user, email: 'a@x.com' } } } }),
    signOut: async (o) => { state.signOuts.push(o?.scope || 'global'); return { error: null }; },
    signInWithPassword: async ({ password }) => (state.loginErro ? falha(state.loginErro.code, state.loginErro.status) : password === state.senhaCerta ? ok({ session: {} }) : falha('invalid_credentials')),
    updateUser: async ({ password }) => { if (state.updateErro) return falha(state.updateErro); state.atualizacoesSenha.push(password); state.senhaCerta = password; return ok({}); },
    resetPasswordForEmail: async () => ok(), signUp: async () => ok({}),
    onAuthStateChange: (cb) => { state.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ok(state.aal),
      listFactors: async () => ok({ totp: state.fatores.filter((f) => f.status === 'verified'), all: state.fatores }),
      enroll: async () => { const f = { id: 'f' + (state.fatores.length + 1), status: 'unverified' }; state.fatores.push(f); return ok({ id: f.id, totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>', secret: 'ABCDEFGH234567' } }); },
      challengeAndVerify: async ({ factorId, code }) => { if (code !== '123456') return falha('mfa_verification_failed'); const f = state.fatores.find((x) => x.id === factorId); if (f) f.status = 'verified'; state.aal = { currentLevel: 'aal2', nextLevel: 'aal2' }; return ok({}); },
      unenroll: async ({ factorId }) => { state.fatores = state.fatores.filter((f) => f.id !== factorId); return ok({}); },
    },
  },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x/y' }, error: null }), upload: async () => ({ error: null }), remove: async () => ({}) }) },
};
