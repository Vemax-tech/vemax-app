// Peças DO PORTAL que conhecem o banco: dados de apoio (equipe, etapas, categorias), exclusão recuperável,
// linha do tempo e histórico de alterações.
// Tabela, quadro, filtros e CSV são genéricos e moram em ../../shared/js/tabela.js; seguem reexportados aqui.
import { sb } from './supabase.js';
import { h, run, toast, formModal, confirmDlg, fmtDate, icon } from './ui.js';
import { badge } from '../../shared/js/tabela.js';
import * as L from './lib.js';

export { badge, sec, dataTable, kanban, baixarCsv, filtros, contem } from '../../shared/js/tabela.js';
export { linkSeguro } from '../../shared/js/dom.js';

/** Quieto: se a consulta falhar (ex.: tabela ainda sem permissão), a tela continua sem esses dados. */
export const quiet = (p) => p.then((r) => r.data || []);

// ---------------------------------------------------------------- dados de apoio
/** Equipe ativa, rótulos configuráveis (etapas, prioridades, origens) e categorias de serviço. */
export async function loadBase() {
  const [team, opcRows, cats] = await Promise.all([
    run(sb.from('profiles').select('id,nome').eq('ativo', true).order('nome')),
    quiet(sb.from('opcoes').select('*').order('ordem')),
    quiet(sb.from('categorias_servico').select('*').order('ordem')),
  ]);
  const opcoes = {};
  opcRows.forEach((o) => { (opcoes[o.grupo] ||= []).push(o); });
  if (!opcRows.length) toast('As configurações da área interna não foram encontradas. Peça ao administrador para aplicar a migration 012 no Supabase.', true);
  const base = {
    team: team || [], opcoes, cats,
    nameOf: (id) => base.team.find((t) => t.id === id)?.nome || '',
    /** [[chave, rótulo]] só dos itens ativos (ou do que estiver em `inclui`, para não perder o valor atual ao editar). */
    opts: (grupo, inclui) => (opcoes[grupo] || []).filter((o) => o.ativo || o.chave === inclui).map((o) => [o.chave, o.nome]),
    lab: (grupo, chave) => (opcoes[grupo] || []).find((o) => o.chave === chave)?.nome || chave || '—',
    catName: (id) => cats.find((c) => c.id === id)?.nome || '',
    catOpts: (inclui) => cats.filter((c) => c.ativo || c.id === inclui).map((c) => [c.id, c.nome]),
    teamOpts: (vazio = '— ninguém —') => [['', vazio], ...base.team.map((t) => [t.id, t.nome])],
  };
  return base;
}
export const loadClientes = async () => (await run(sb.from('clientes').select('id,nome,documento,email,telefone').is('deleted_at', null).order('nome'))) || [];
export const clienteOpts = (clientes, vazio = '— selecione —') => [['', vazio], ...clientes.map((c) => [c.id, c.nome])];
export const projetoOpts = (projetos, vazio = '— nenhum —') => [['', vazio], ...projetos.map((p) => [p.id, p.titulo])];

/** Colunas de um quadro: etapas ativas + qualquer etapa oculta que ainda tenha itens (nada some da tela). */
export function colunas(base, grupo, itens, campo = 'status') {
  const todas = base.opcoes[grupo] || [];
  return todas.filter((o) => o.ativo || itens.some((i) => i[campo] === o.chave)).map((o) => ({ key: o.chave, label: o.nome + (o.ativo ? '' : ' (oculta)'), items: itens.filter((i) => i[campo] === o.chave) }));
}

/** Pergunta rápida: abre um formulário e devolve os valores digitados, ou null se a pessoa cancelar. */
export function pedirForm(cfg) {
  return new Promise((res) => {
    let enviado = false;
    formModal({ ...cfg, onSubmit: async (v) => { enviado = true; res(v); }, onClose: () => { if (!enviado) res(null); } });
  });
}

// ---------------------------------------------------------------- exclusão recuperável
export async function lixeira(tabela, row, nome, onDone) {
  if (!(await confirmDlg(`Enviar “${nome}” para a lixeira? Dá para restaurar depois em Configurações > Lixeira.`))) return false;
  const ok = await run(sb.from(tabela).update({ deleted_at: new Date().toISOString() }).eq('id', row.id).select().single(), 'Enviado para a lixeira.');
  if (ok) onDone?.(ok);
  return Boolean(ok);
}

// ---------------------------------------------------------------- linha do tempo
/**
 * Registros de notas, decisões, contatos e mensagens enviadas ao cliente.
 * onde = {entidade, id}  -> histórico de um registro;  onde = {cliente_id} -> tudo o que envolve o cliente.
 */
export function timeline(onde, { base, canEdit, tipos = ['nota', 'decisao', 'contato', 'mensagem'], vazio = 'Nenhum registro ainda.' }) {
  const root = h('div'), list = h('div');
  let rows = [];
  const NOMES = { contatos_site: 'Lead', propostas: 'Proposta', clientes: 'Cliente', projetos: 'Projeto', tarefas: 'Tarefa', chamados: 'Chamado', cobrancas: 'Cobrança' };
  const paint = () => list.replaceChildren(rows.length ? h('ul', { class: 'ul-list' }, rows.map((r) => h('li', {},
    h('div', { class: 'row between' },
      h('span', { class: 'row', style: 'gap:8px' }, badge(L.TIPOS_INTERACAO[r.tipo] || r.tipo, r.tipo === 'mensagem' ? '' : 'dim'), onde.cliente_id && badge(NOMES[r.entidade] || r.entidade, 'dim')),
      h('span', { class: 'small muted' }, (base.nameOf(r.criado_por) || 'Sistema') + ' · ' + new Date(r.criado_em).toLocaleString('pt-BR'))),
    h('p', { style: 'white-space:pre-wrap;margin-top:4px' }, r.texto)))) : h('p', { class: 'small muted' }, vazio));
  const load = async () => {
    let q = sb.from('interacoes').select('*').order('criado_em', { ascending: false }).limit(200);
    q = onde.cliente_id ? q.eq('cliente_id', onde.cliente_id) : q.eq('entidade', onde.entidade).eq('entidade_id', onde.id);
    rows = (await run(q)) || []; paint();
  };
  if (canEdit && onde.entidade) {
    const tipo = h('select', { 'aria-label': 'Tipo do registro' }, tipos.map((t) => h('option', { value: t }, L.TIPOS_INTERACAO[t])));
    const txt = h('textarea', { rows: 2, maxlength: 4000, 'aria-label': 'Texto do registro', placeholder: 'O que aconteceu, o que foi decidido ou o que foi dito ao cliente…' });
    const dica = h('p', { class: 'small muted' });
    const upd = () => { dica.textContent = tipo.value === 'mensagem' ? 'Registro do que foi enviado ao cliente. Ele não é enviado automaticamente por aqui.' : 'Visível apenas para a equipe.'; };
    tipo.addEventListener('change', upd); upd();
    const add = h('button', { class: 'btn sm primary', onclick: async () => {
      const texto = txt.value.trim(); if (!texto) { toast('Escreva o registro.', true); return; }
      add.disabled = true;
      const r = await run(sb.from('interacoes').insert({ entidade: onde.entidade, entidade_id: onde.id, tipo: tipo.value, texto }).select().single(), 'Registro adicionado.');
      add.disabled = false;
      if (r) { txt.value = ''; rows.unshift(r); paint(); }
    } }, 'Registrar');
    root.append(h('div', { style: 'display:grid;gap:8px;margin-bottom:14px' }, h('div', { class: 'row' }, tipo, add), txt, dica));
  }
  root.append(list); load();
  return root;
}

// ---------------------------------------------------------------- histórico de alterações
/** Anota na linha do tempo o que mudou entre dois estados (valor, prazo, escopo…). rotulos = {campo: 'Rótulo'}; fmt = {campo: (v)=>texto}. */
export async function registrarMudancas(entidade, id, antes, depois, rotulos, fmt = {}) {
  const f = (k, v) => (v == null || v === '' ? '—' : (fmt[k] ? fmt[k](v) : String(v).length > 80 ? String(v).slice(0, 77) + '…' : String(v)));
  const partes = Object.entries(rotulos).filter(([k]) => String(antes[k] ?? '') !== String(depois[k] ?? '')).map(([k, r]) => `${r}: ${f(k, antes[k])} → ${f(k, depois[k])}`);
  if (!partes.length) return;
  const { error } = await sb.from('interacoes').insert({ entidade, entidade_id: id, tipo: 'sistema', texto: partes.join('; ').slice(0, 4000) });
  if (error) console.error(error);
}

export { fmtDate, icon };
