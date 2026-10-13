// Propostas: criar, liberar o link privado, registrar a resposta e transformar a aprovada em projeto
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, dataTable, filtros, contem, loadBase, loadClientes, clienteOpts, lixeira, quiet, timeline, registrarMudancas } from '../core.js';
import { converterLead } from './clientes.js';
import { start, h, run, toast, modal, formModal, confirmDlg, pageHead, empty, fmtDate, copyText } from '../ui.js';

const KIND = { rascunho: 'dim', enviada: '', aceita: 'ok', recusada: 'warn', vencida: 'warn' };
// O portal está em /app/<módulo>/; a página pública fica na raiz do site.
const linkOf = (p) => new URL('../../proposta.html?t=' + p.token, location.href).href;
const projetoHref = (id) => new URL(`../projetos/detalhe.html?id=${id}`, new URL('./', location.href)).href;

// ---- PDF da proposta: abre uma página de impressão (A4) pronta para "Salvar como PDF" ----
// Dados do emissor impressos no rodapé do PDF (ajuste aqui se mudar).
const EMISSOR = { nome: 'Vemax', email: 'mavsoares.oliveira@gmail.com', fone: '(11) 93954-7919', cidade: 'São Paulo, SP' };
const PDF_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.55 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
  .brand { font-weight: 700; font-size: 18pt; color: #1d4ed8; } .doc { color: #555; font-size: 10pt; text-transform: uppercase; letter-spacing: .12em; }
  h1 { font-size: 20pt; margin: 22px 0 4px; } .para { color: #555; margin: 0 0 18px; }
  .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 0 20px; }
  .info div { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; } .info small { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; color: #1d4ed8; } .info b { font-size: 11pt; }
  h2 { font-size: 13pt; margin: 18px 0 6px; } p { margin: 0 0 9px; white-space: pre-wrap; }
  .foot { margin-top: 30px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 9pt; color: #555; }
  .btnbar { position: fixed; top: 10px; right: 10px; } .btnbar button { padding: 8px 14px; font-size: 11pt; cursor: pointer; }
  @media print { .btnbar { display: none; } }
`;
const abrirPdf = (p, paraQuem) => {
  const w = window.open('', '_blank');
  if (!w) { toast('O navegador bloqueou a nova janela. Libere pop-ups para este site.', true); return; }
  w.document.open(); w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title></title><style>' + PDF_CSS + '</style></head><body></body></html>'); w.document.close();
  w.document.title = p.titulo + ' — Proposta Vemax';
  const d = w.document;
  const el = (tag, cls, text) => { const e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const kv = (k, v) => { const x = el('div'); x.append(el('small', null, k), el('b', null, v)); return x; };
  const bar = el('div', 'btnbar'); const pr = el('button', null, 'Imprimir / Salvar como PDF'); pr.onclick = () => w.print(); bar.append(pr);
  const top = el('div', 'top'); top.append(el('span', 'brand', EMISSOR.nome), el('span', 'doc', 'Proposta comercial'));
  const info = el('div', 'info');
  info.append(kv('Investimento', p.valor == null ? 'A combinar' : L.brl(p.valor)), kv('Prazo estimado', p.prazo_texto || 'A combinar'), kv('Válida até', p.validade ? fmtDate(p.validade) : 'Sem data limite'));
  d.body.append(bar, top, el('h1', null, p.titulo), el('p', 'para', `Para ${paraQuem} · emitida em ${new Date().toLocaleDateString('pt-BR')}`), info);
  const secao = (titulo, texto) => {
    const paras = String(texto || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    if (paras.length) { d.body.append(el('h2', null, titulo)); paras.forEach((x) => d.body.append(el('p', null, x))); }
  };
  secao('Escopo', p.escopo); secao('Serviços e entregas incluídos', p.servicos); secao('Condições de pagamento', p.condicoes_pagamento);
  d.body.append(el('div', 'foot', `${EMISSOR.nome} · ${EMISSOR.email} · ${EMISSOR.fone} · ${EMISSOR.cidade}. Esta proposta registra o escopo e as condições acima; contrato e pagamento são combinados à parte.`));
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* o usuário pode usar o botão */ } }, 400);
};

// ---- formulário ----
const campos = (p, env, fixo) => [
  ...(fixo ? [] : [
    { name: 'contato_id', label: 'Lead (oportunidade)', type: 'select', nullable: true, value: p.contato_id, options: [['', '— nenhum —'], ...env.leads.filter((l) => !L.FIM_LEAD.includes(l.status) || l.id === p.contato_id).map((l) => [l.id, l.empresa || l.nome])] },
    { name: 'cliente_id', label: 'Cliente', type: 'select', nullable: true, value: p.cliente_id, options: clienteOpts(env.clientes, '— nenhum —'), hint: 'Escolha o lead, o cliente ou os dois. Se o lead já virou cliente, o vínculo é automático.' },
  ]),
  { name: 'titulo', label: 'Título', required: true, maxlength: 140, value: p.titulo },
  { name: 'servicos', label: 'Serviços e entregas incluídos', type: 'textarea', maxlength: 4000, value: p.servicos, hint: 'Uma linha em branco separa os parágrafos. O cliente vê este texto.' },
  { name: 'escopo', label: 'Escopo', type: 'textarea', maxlength: 8000, value: p.escopo },
  { name: 'prazo_texto', label: 'Prazo estimado', maxlength: 120, value: p.prazo_texto, placeholder: 'Ex.: 6 semanas' },
  { name: 'valor', label: 'Valor total (R$)', type: 'number', step: '0.01', min: 0, nullable: true, value: p.valor },
  { name: 'condicoes_pagamento', label: 'Condições de pagamento', maxlength: 1000, value: p.condicoes_pagamento, placeholder: 'Ex.: 50% na aprovação e 50% na entrega' },
  { name: 'validade', label: 'Válida até', type: 'date', nullable: true, value: p.validade ?? L.addDias(L.hojeISO(), 15) },
  { name: 'responsavel_id', label: 'Responsável', type: 'select', nullable: true, value: p.responsavel_id, options: env.base.teamOpts() },
];
const MUDANCAS = { titulo: 'Título', valor: 'Valor', validade: 'Validade', prazo_texto: 'Prazo', condicoes_pagamento: 'Pagamento', escopo: 'Escopo', servicos: 'Serviços' };
const FMT = { valor: L.brl, validade: (v) => v.split('-').reverse().join('/') };

/** Cria uma proposta. `fixo` = {contato_id?, cliente_id?} quando já se sabe para quem é (aberta a partir do lead). */
export function novaProposta(env, fixo, titulo) {
  formModal({ title: 'Nova proposta', fields: campos({ titulo, ...(fixo || {}) }, env, fixo), validate: (v) => (!fixo && !v.contato_id && !v.cliente_id ? 'Escolha o lead ou o cliente desta proposta.' : ''),
    onSubmit: async (v) => {
      const row = { ...v, ...(fixo || {}) };
      const lead = row.contato_id ? env.leads.find((l) => l.id === row.contato_id) : null;
      if (!row.cliente_id && lead?.cliente_id) row.cliente_id = lead.cliente_id;
      const r = await run(sb.from('propostas').insert(row).select().single(), 'Rascunho criado.');
      if (!r) return false;
      env.lista.unshift(r); env.onChange?.();
    } });
}

// ---- detalhe ----
const paraQuem = (p, env) => (p.cliente_id ? env.clientes.find((c) => c.id === p.cliente_id)?.nome : null)
  || (p.contato_id ? (env.leads.find((l) => l.id === p.contato_id)?.empresa || env.leads.find((l) => l.id === p.contato_id)?.nome) : null) || '—';

export function detalheProposta(p, env) {
  const box = h('div');
  const eff = () => L.statusProposta(p, L.hojeISO());
  const patch = async (v, msg) => {
    const antes = { ...p };
    const r = await run(sb.from('propostas').update(v).eq('id', p.id).select().single(), msg);
    if (!r) return null;
    Object.assign(p, r); await registrarMudancas('propostas', p.id, antes, r, MUDANCAS, FMT); env.onChange?.(); paint(); return r;
  };
  const nota = (texto) => sb.from('interacoes').insert({ entidade: 'propostas', entidade_id: p.id, tipo: 'sistema', texto });

  const liberar = async () => {
    if (!(await confirmDlg('Liberar o link desta proposta para o cliente? Quem tiver o link poderá ver e responder.'))) return;
    if (!(await patch({ status: 'enviada', enviada_em: new Date().toISOString() }, 'Link liberado.'))) return;
    await nota('Link liberado para o cliente.');
    const lead = p.contato_id && env.leads.find((l) => l.id === p.contato_id);
    if (lead && ['novo', 'em_contato', 'reuniao'].includes(lead.status)) {
      const r = await run(sb.from('contatos_site').update({ status: 'proposta' }).eq('id', lead.id).select().single());
      if (r) { Object.assign(lead, r); env.onChange?.(); }
    }
    copyText(linkOf(p));
  };
  const responder = (aceita) => formModal({ title: aceita ? 'Registrar aprovação' : 'Registrar recusa', submitLabel: 'Registrar',
    fields: [{ name: 'obs', label: 'Como o cliente respondeu?', type: 'textarea', maxlength: 1000, placeholder: 'Ex.: Aprovou por WhatsApp em 10/05, com início na segunda.' }],
    onSubmit: async (v) => {
      const r = await patch({ status: aceita ? 'aceita' : 'recusada', respondida_em: new Date().toISOString(), resposta_nome: `${env.ctx.profile.nome || 'Equipe'} (registro interno)`.slice(0, 120), resposta_obs: v.obs.slice(0, 1000) }, aceita ? 'Proposta aprovada.' : 'Proposta recusada.');
      if (!r) return false;
      await nota(`${aceita ? 'Aprovação' : 'Recusa'} registrada pela equipe.${v.obs ? ' ' + v.obs : ''}`);
    } });
  const prorrogar = () => formModal({ title: 'Prorrogar validade', submitLabel: 'Prorrogar', fields: [{ name: 'validade', label: 'Nova data limite', type: 'date', required: true, value: L.addDias(L.hojeISO(), 15) }],
    validate: (v) => (v.validade < L.hojeISO() ? 'Escolha uma data a partir de hoje.' : ''), onSubmit: async (v) => !!(await patch({ validade: v.validade, status: 'enviada' }, 'Validade prorrogada.')) });

  const criarProjeto = async () => {
    const lead = p.contato_id ? env.leads.find((l) => l.id === p.contato_id) : null;
    if (!p.cliente_id && !lead?.cliente_id) {
      if (!lead) { toast('Vincule a proposta a um cliente antes de criar o projeto.', true); return; }
      if (!(await confirmDlg(`Para criar o projeto é preciso ter o cliente cadastrado. Cadastrar “${lead.empresa || lead.nome}” como cliente agora?`))) return;
      if (!(await converterLead(lead))) return;
    }
    const modelos = await quiet(sb.from('modelos_projeto').select('id,nome').eq('ativo', true).order('nome'));
    formModal({ title: 'Criar projeto desta proposta', submitLabel: 'Criar projeto', fields: [
      { name: 'prazo', label: 'Prazo de entrega', type: 'date', nullable: true, value: L.prazoDeTexto(p.prazo_texto), hint: `Cliente, escopo, valor${p.responsavel_id ? ' e responsável' : ''} são copiados da proposta.` },
      { name: 'modelo', label: 'Modelo de projeto', type: 'select', nullable: true, options: [['', '— sem modelo —'], ...modelos.map((m) => [m.id, m.nome])], hint: 'O modelo cria as tarefas e entregas iniciais.' }],
    onSubmit: async (v) => {
      const { data, error } = await sb.rpc('projeto_de_proposta', { p_proposta: p.id, p_prazo: v.prazo || null, p_modelo: v.modelo || null });
      if (error) { toast(error.message || 'Não foi possível criar o projeto.', true); return false; }
      env.projetos.push({ id: data, proposta_id: p.id });
      toast('Projeto criado. O lead foi marcado como ganho.'); env.onChange?.(); paint();
      if (await confirmDlg('Abrir o projeto agora?')) location.href = projetoHref(data);
    } });
  };

  const paint = () => {
    const s = eff(), proj = env.projetos.find((x) => x.proposta_id === p.id);
    box.replaceChildren(
      h('div', { class: 'row between' }, h('b', {}, paraQuem(p, env)), badge(L.PROPOSTA_STATUS[s], KIND[s])),
      h('dl', { class: 'dl', style: 'margin-top:12px' },
        h('dt', {}, 'Valor'), h('dd', {}, L.brl(p.valor)), h('dt', {}, 'Prazo estimado'), h('dd', {}, p.prazo_texto || 'A combinar'),
        h('dt', {}, 'Pagamento'), h('dd', {}, p.condicoes_pagamento || '—'), h('dt', {}, 'Válida até'), h('dd', {}, p.validade ? fmtDate(p.validade) : 'Sem data limite'),
        h('dt', {}, 'Responsável'), h('dd', {}, env.base.nameOf(p.responsavel_id) || '—'), h('dt', {}, 'Enviada em'), h('dd', {}, p.enviada_em ? fmtDate(p.enviada_em) : '—')),
      p.respondida_em && h('p', { class: 'small', style: 'margin-top:10px' }, `${p.status === 'aceita' ? 'Aprovada' : 'Recusada'} por ${p.resposta_nome} em ${fmtDate(p.respondida_em)}`, p.resposta_obs && ` — “${p.resposta_obs}”`),
      p.servicos && h('details', { style: 'margin-top:10px' }, h('summary', {}, 'Serviços e entregas'), h('p', { style: 'white-space:pre-wrap' }, p.servicos)),
      p.escopo && h('details', { style: 'margin-top:6px' }, h('summary', {}, 'Escopo'), h('p', { style: 'white-space:pre-wrap' }, p.escopo)),
      h('div', { class: 'row', style: 'margin:16px 0 4px' },
        h('button', { class: 'btn sm', onclick: () => abrirPdf(p, paraQuem(p, env)) }, 'PDF'),
        p.status !== 'rascunho' && h('button', { class: 'btn sm', onclick: () => copyText(linkOf(p)) }, 'Copiar link'),
        p.status !== 'rascunho' && h('a', { class: 'btn sm', href: linkOf(p), target: '_blank', rel: 'noopener' }, 'Abrir link do cliente'),
        env.canEdit && p.status === 'rascunho' && h('button', { class: 'btn sm primary', onclick: liberar }, 'Liberar link'),
        env.canEdit && p.status === 'rascunho' && h('button', { class: 'btn sm', onclick: () => formModal({ title: 'Editar proposta', fields: campos(p, env, { contato_id: p.contato_id, cliente_id: p.cliente_id }), onSubmit: async (v) => !!(await patch(v, 'Proposta salva.')) }) }, 'Editar'),
        env.canEdit && s === 'enviada' && h('button', { class: 'btn sm', onclick: () => patch({ status: 'rascunho', enviada_em: null }, 'Link recolhido.') }, 'Recolher link'),
        env.canEdit && (s === 'enviada' || s === 'vencida') && h('button', { class: 'btn sm', onclick: () => responder(true) }, 'Registrar aprovação'),
        env.canEdit && (s === 'enviada' || s === 'vencida') && h('button', { class: 'btn sm', onclick: () => responder(false) }, 'Registrar recusa'),
        env.canEdit && s === 'vencida' && h('button', { class: 'btn sm', onclick: prorrogar }, 'Prorrogar validade'),
        env.canEdit && env.canProj && p.status === 'aceita' && !proj && h('button', { class: 'btn sm primary', onclick: criarProjeto }, 'Criar projeto'),
        proj && h('a', { class: 'btn sm', href: projetoHref(proj.id) }, 'Ver projeto'),
        env.canEdit && h('button', { class: 'btn sm danger', onclick: async () => { if (await lixeira('propostas', p, p.titulo, () => { env.lista.splice(env.lista.indexOf(p), 1); env.onChange?.(); closeFn?.(); })) { /* ok */ } } }, 'Lixeira')),
      h('h3', { style: 'margin:18px 0 8px' }, 'Histórico'),
      timeline({ entidade: 'propostas', id: p.id }, { base: env.base, canEdit: env.canEdit, tipos: ['nota', 'decisao', 'mensagem'] }),
      h('p', { class: 'small muted', style: 'margin-top:12px' }, 'O cliente só enxerga a proposta depois que você libera o link. O aceite registra nome e data, mas não substitui um contrato.'));
  };
  let closeFn;
  paint();
  closeFn = modal('Proposta — ' + p.titulo, box, (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
  [...document.querySelectorAll('.ov .modal')].pop()?.classList.add('wide');
}

// ---- janela de propostas de um lead ----
/** contato: linha de contatos_site. onChange(): redesenha a tela de leads. */
export async function openPropostas(contato, { canEdit, canProj, ctx, base, clientes, leads, onChange }) {
  const [lista, projetos] = await Promise.all([
    run(sb.from('propostas').select('*').eq('contato_id', contato.id).is('deleted_at', null).order('criado_em', { ascending: false })),
    quiet(sb.from('projetos').select('id,proposta_id').not('proposta_id', 'is', null).is('deleted_at', null)),
  ]);
  const env = { ctx, base, canEdit, canProj, clientes, leads: leads || [contato], lista: lista || [], projetos, onChange: () => { paint(); onChange?.(); } };
  const body = h('div');
  const paint = () => body.replaceChildren(env.lista.length ? h('ul', { class: 'ul-list' }, env.lista.map((p) => { const s = L.statusProposta(p); return h('li', { class: 'row between' },
    h('span', {}, h('b', {}, p.titulo), h('div', { class: 'small muted' }, `${L.brl(p.valor)} · ${p.prazo_texto || 'prazo a combinar'}${p.validade ? ' · válida até ' + fmtDate(p.validade) : ''}`)),
    h('span', { class: 'row', style: 'gap:8px' }, badge(L.PROPOSTA_STATUS[s], KIND[s]), h('button', { class: 'btn sm', onclick: () => detalheProposta(p, env) }, 'Abrir'))); })) : h('p', { class: 'small muted' }, 'Nenhuma proposta para este lead ainda.'));
  paint();
  modal('Propostas — ' + (contato.empresa || contato.nome), h('div', {},
    canEdit && h('button', { class: 'btn primary sm', style: 'margin-bottom:14px', onclick: () => novaProposta(env, { contato_id: contato.id, cliente_id: contato.cliente_id || null }, 'Proposta — ' + (contato.empresa || contato.nome)) }, 'Nova proposta'), body),
  (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
}

// ---- página de propostas ----
export const init = () => start('propostas/', 'Propostas', async (ctx, view) => {
  const canEdit = ctx.can('contatos', 'editar'), canProj = ctx.can('projetos', 'editar');
  await sb.rpc('atualizar_vencimentos');      // marca as vencidas; se a função não existir, a tela calcula sozinha
  const [rows, base, clientes, leadsRaw, projetos] = await Promise.all([
    run(sb.from('propostas').select('*').is('deleted_at', null).order('criado_em', { ascending: false })),
    loadBase(), loadClientes(),
    quiet(sb.from('contatos_site').select('id,nome,empresa,cliente_id,status').is('deleted_at', null)),
    ctx.can('projetos') ? quiet(sb.from('projetos').select('id,proposta_id').not('proposta_id', 'is', null).is('deleted_at', null)) : [],
  ]);
  const env = { ctx, base, canEdit, canProj, clientes, leads: leadsRaw, lista: rows || [], projetos, onChange: () => draw() };
  const f = { q: '', status: '', resp: '' }, st = { sort: 'criada', dir: -1, page: 0 }, body = h('div'), tiles = h('div', { class: 'grid g4', style: 'margin-bottom:18px' });
  const eff = (p) => L.statusProposta(p);

  const cols = [
    { key: 'titulo', label: 'Proposta', sort: (p) => p.titulo.toLowerCase(), render: (p) => h('span', {}, h('a', { class: 't', href: '#', onclick: (e) => { e.preventDefault(); detalheProposta(p, env); } }, p.titulo), h('div', { class: 'small muted' }, paraQuem(p, env))) },
    { key: 'valor', label: 'Valor', sort: (p) => (p.valor == null ? null : Number(p.valor)), render: (p) => L.brl(p.valor) },
    { key: 'validade', label: 'Validade', sort: (p) => p.validade, render: (p) => (p.validade ? fmtDate(p.validade) : '—') },
    { key: 'status', label: 'Situação', sort: (p) => eff(p), render: (p) => badge(L.PROPOSTA_STATUS[eff(p)], KIND[eff(p)]) },
    { key: 'resp', label: 'Responsável', sort: (p) => base.nameOf(p.responsavel_id).toLowerCase() || null, render: (p) => base.nameOf(p.responsavel_id) || '—' },
    { key: 'criada', label: 'Criada em', sort: (p) => p.criado_em, render: (p) => fmtDate(p.criado_em) },
    { key: 'a', label: '', render: (p) => h('button', { class: 'btn sm', onclick: () => detalheProposta(p, env) }, 'Abrir') },
  ];
  function draw() {
    const aguard = env.lista.filter((p) => eff(p) === 'enviada');
    tiles.replaceChildren(
      ...[['Aguardando resposta', aguard.length, aguard.length ? L.brl(L.soma(aguard, 'valor')) : 'Nada pendente', 'enviada'], ['Rascunhos', env.lista.filter((p) => p.status === 'rascunho').length, 'Ainda não enviadas', 'rascunho'],
        ['Aprovadas', env.lista.filter((p) => p.status === 'aceita').length, L.brl(L.soma(env.lista.filter((p) => p.status === 'aceita'), 'valor')), 'aceita'], ['Vencidas', env.lista.filter((p) => eff(p) === 'vencida').length, 'Prorrogue ou encerre', 'vencida']]
        .map(([l, n, sub, k]) => h('button', { class: 'card kpi' + (k === 'vencida' && n ? ' warn' : '') + (f.status === k ? ' on' : ''), style: 'text-align:left;cursor:pointer', onclick: () => { f.status = f.status === k ? '' : k; draw(); } }, h('span', { class: 'small' }, l), h('b', {}, n), h('small', {}, sub))));
    const shown = env.lista.filter((p) => (!f.status || eff(p) === f.status) && (!f.resp || p.responsavel_id === f.resp) && contem([p.titulo, p.escopo, paraQuem(p, env)], f.q));
    body.replaceChildren(dataTable({ cols, rows: shown, state: st, onState: draw, vazio: empty(env.lista.length ? 'Nenhuma proposta com esses filtros.' : canEdit ? 'Nenhuma proposta ainda. Crie a primeira a partir de um lead ou cliente.' : 'Nenhuma proposta ainda.') }));
  }
  view.append(pageHead('Comercial', 'Propostas', 'Acompanhe o que foi enviado, o que espera resposta e o que virou projeto.',
    canEdit && h('button', { class: 'btn primary', onclick: () => novaProposta(env, null, '') }, 'Nova proposta')),
  tiles, filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar por título, escopo ou cliente…' },
    { tipo: 'select', chave: 'status', rotulo: 'Todas as situações', opcoes: Object.entries(L.PROPOSTA_STATUS) },
    { tipo: 'select', chave: 'resp', rotulo: 'Todos os responsáveis', opcoes: base.team.map((t) => [t.id, t.nome]) }], f, draw), body);
  draw();
});
