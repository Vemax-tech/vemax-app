// Suporte: central interna de chamados. Os registros são feitos pela equipe; não há integração automática com e-mail ou WhatsApp.
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, dataTable, filtros, contem, kanban, colunas, loadBase, loadClientes, clienteOpts, projetoOpts, lixeira, quiet, timeline, pedirForm, registrarMudancas } from '../core.js';
import { fichaHref } from './clientes.js';
import { start, h, run, pageHead, empty, formModal, modal, fmtDate, qs } from '../ui.js';

const PRIO_KIND = { baixa: 'dim', media: 'dim', alta: '', urgente: 'warn' };
const PESO = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const MUD = { status: 'Status', prioridade: 'Prioridade', prazo: 'Prazo', responsavel_id: 'Responsável' };

export const init = () => start('suporte/', 'Suporte', async (ctx, view) => {
  const canEdit = ctx.can('suporte', 'editar'), hoje = L.hojeISO();
  const [rows, base, clientes, projetos] = await Promise.all([
    run(sb.from('chamados').select('*').is('deleted_at', null).order('aberto_em', { ascending: false })),
    loadBase(), ctx.can('clientes') ? loadClientes() : [],
    ctx.can('projetos') ? quiet(sb.from('projetos').select('id,titulo,cliente_id').is('deleted_at', null).order('titulo')) : [],
  ]);
  const list = rows || [];
  const f = { q: '', cli: qs('cliente') || '', resp: '', prio: '', status: '', canal: '', alerta: '', view: 'quadro' }, st = { sort: 'prazo', dir: 1, page: 0 };
  const body = h('div'), tiles = h('div', { class: 'grid g4', style: 'margin-bottom:18px' });
  const cliNome = (c) => clientes.find((x) => x.id === c.cliente_id)?.nome || '';
  const projNome = (c) => projetos.find((x) => x.id === c.projeto_id)?.titulo || '';
  const aberto = (c) => !L.FIM_CHAMADO.includes(c.status);
  const atrasado = (c) => L.chamadoAtrasado(c, hoje);
  const proximo = (c) => aberto(c) && c.prazo && c.prazo >= hoje && L.diffDias(c.prazo, hoje) <= 2;
  const semResp = (c) => aberto(c) && !c.responsavel_id;

  const campos = (c = {}) => [
    { name: 'cliente_id', label: 'Cliente', type: 'select', required: true, value: c.cliente_id, options: clienteOpts(clientes), hint: clientes.length ? null : 'Cadastre o cliente em Clientes antes de abrir o chamado.' },
    { name: 'projeto_id', label: 'Projeto relacionado (se houver)', type: 'select', nullable: true, value: c.projeto_id, options: projetoOpts(projetos) },
    { name: 'assunto', label: 'Assunto', required: true, maxlength: 160, value: c.assunto },
    { name: 'descricao', label: 'Descrição do problema ou pedido', type: 'textarea', maxlength: 4000, value: c.descricao },
    { name: 'canal', label: 'Canal de origem', type: 'select', value: c.canal || 'whatsapp', options: Object.entries(L.CANAIS) },
    { name: 'prioridade', label: 'Prioridade', type: 'select', value: c.prioridade || 'media', options: base.opts('prioridade', c.prioridade) },
    { name: 'responsavel_id', label: 'Responsável', type: 'select', nullable: true, value: c.responsavel_id ?? (c.id ? null : ctx.user.id), options: base.teamOpts() },
    { name: 'prazo', label: 'Prazo combinado', type: 'date', nullable: true, value: c.prazo },
  ];
  const novo = () => formModal({ title: 'Novo chamado', fields: campos(), submitLabel: 'Abrir chamado', onSubmit: async (v) => {
    const r = await run(sb.from('chamados').insert(v).select().single(), 'Chamado aberto.');
    if (!r) return false; list.unshift(r); draw(); abrir(r);
  } });
  const editar = (c, reabrir) => formModal({ title: `Editar chamado #${c.numero}`, fields: campos(c), onSubmit: async (v) => {
    const antes = { ...c };
    const r = await run(sb.from('chamados').update(v).eq('id', c.id).select().single(), 'Chamado salvo.');
    if (!r) return false; Object.assign(c, r);
    await registrarMudancas('chamados', c.id, antes, r, MUD, { status: (x) => base.lab('etapa_chamado', x), prioridade: (x) => base.lab('prioridade', x), prazo: fmtDate, responsavel_id: (x) => base.nameOf(x) });
    draw(); reabrir?.();
  } });

  async function mover(c, status) {
    if (c.status === status) { draw(); return; }
    const extra = {};
    if (L.FIM_CHAMADO.includes(status) && !c.solucao) {
      const v = await pedirForm({ title: 'Registrar a solução', submitLabel: 'Registrar e encerrar', fields: [{ name: 'solucao', label: 'O que foi feito para resolver?', type: 'textarea', required: true, maxlength: 4000 }] });
      if (!v) { draw(); return; }
      extra.solucao = v.solucao;
    }
    const antes = { ...c };
    const r = await run(sb.from('chamados').update({ status, ...extra }).eq('id', c.id).select().single(), 'Status atualizado.');
    if (r) {
      Object.assign(c, r); await registrarMudancas('chamados', c.id, antes, r, { status: 'Status' }, { status: (x) => base.lab('etapa_chamado', x) });
      if (extra.solucao) await sb.from('interacoes').insert({ entidade: 'chamados', entidade_id: c.id, tipo: 'solucao', texto: extra.solucao });
    }
    draw();
  }

  function abrir(c) {
    const box = h('div');
    const paint = () => {
      const alertas = [semResp(c) && ['Sem responsável', 'warn'], atrasado(c) && ['Fora do prazo', 'warn'], proximo(c) && ['Prazo em até 2 dias', 'info']].filter(Boolean);
      box.replaceChildren(
        h('div', { class: 'row between' }, h('b', { style: 'font-size:1.1rem;color:var(--text)' }, `#${c.numero} · ${c.assunto}`), badge(base.lab('etapa_chamado', c.status), aberto(c) ? '' : 'dim')),
        alertas.length > 0 && h('div', { class: 'chips' }, alertas.map(([t, k]) => badge(t, k))),
        h('dl', { class: 'dl', style: 'margin-top:12px' },
          h('dt', {}, 'Cliente'), h('dd', {}, c.cliente_id ? h('a', { class: 't', href: fichaHref(c.cliente_id) }, cliNome(c) || 'Ver cliente') : '—'),
          h('dt', {}, 'Projeto'), h('dd', {}, c.projeto_id ? h('a', { class: 't', href: `../projetos/detalhe.html?id=${c.projeto_id}` }, projNome(c) || 'Ver projeto') : '—'),
          h('dt', {}, 'Canal'), h('dd', {}, L.CANAIS[c.canal]), h('dt', {}, 'Prioridade'), h('dd', {}, base.lab('prioridade', c.prioridade)),
          h('dt', {}, 'Responsável'), h('dd', {}, base.nameOf(c.responsavel_id) || 'Ninguém ainda'),
          h('dt', {}, 'Aberto em'), h('dd', {}, new Date(c.aberto_em).toLocaleString('pt-BR')),
          h('dt', {}, 'Prazo combinado'), h('dd', {}, c.prazo ? fmtDate(c.prazo) : 'Não definido'),
          c.resolvido_em && [h('dt', {}, 'Encerrado em'), h('dd', {}, new Date(c.resolvido_em).toLocaleString('pt-BR'))]),
        c.descricao && h('p', { style: 'margin-top:12px;white-space:pre-wrap' }, c.descricao),
        c.solucao && h('p', { style: 'margin-top:12px;white-space:pre-wrap' }, h('b', {}, 'Solução: '), c.solucao),
        h('div', { class: 'row', style: 'margin:16px 0 6px' },
          canEdit && h('button', { class: 'btn sm', onclick: () => editar(c, paint) }, 'Editar'),
          canEdit && h('select', { class: 'sm', 'aria-label': 'Mudar status', onchange: async (e) => { await mover(c, e.target.value); paint(); } },
            base.opts('etapa_chamado', c.status).map(([v, l]) => h('option', { value: v, selected: v === c.status }, (v === c.status ? 'Status: ' : 'Mudar para: ') + l))),
          canEdit && h('button', { class: 'btn sm danger', onclick: () => lixeira('chamados', c, c.assunto, () => { list.splice(list.indexOf(c), 1); draw(); fechar?.(); }) }, 'Lixeira')),
        h('h3', { style: 'margin:16px 0 4px' }, 'Atendimento'),
        h('p', { class: 'small muted', style: 'margin-bottom:8px' }, 'Notas internas são só da equipe. “Mensagem enviada ao cliente” registra o que foi respondido por e-mail, WhatsApp ou telefone; o envio é feito fora do sistema.'),
        timeline({ entidade: 'chamados', id: c.id }, { base, canEdit, tipos: ['nota', 'mensagem', 'contato', 'decisao'] }));
    };
    let fechar; paint();
    fechar = modal('Chamado', box, (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
    [...document.querySelectorAll('.ov .modal')].pop()?.classList.add('wide');
  }

  const ordem = (a, b) => (PESO[a.prioridade] - PESO[b.prioridade]) || (a.prazo || '9').localeCompare(b.prazo || '9');
  const card = (c) => h('article', { class: 'kcard' + (atrasado(c) || (semResp(c) && c.prioridade === 'urgente') ? ' alert' : '') },
    h('h3', {}, h('a', { class: 't', href: '#', onclick: (e) => { e.preventDefault(); abrir(c); } }, `#${c.numero} · ${c.assunto}`)),
    cliNome(c) && h('p', { class: 'small' }, cliNome(c)),
    h('div', { class: 'chips' },
      c.prioridade !== 'media' && badge(base.lab('prioridade', c.prioridade), PRIO_KIND[c.prioridade]),
      semResp(c) ? badge('Sem responsável', 'warn') : base.nameOf(c.responsavel_id) && badge(base.nameOf(c.responsavel_id), 'dim'),
      c.prazo && aberto(c) && badge((atrasado(c) ? 'Fora do prazo · ' : 'Prazo ') + fmtDate(c.prazo), atrasado(c) ? 'warn' : proximo(c) ? 'info' : 'dim'),
      badge(L.CANAIS[c.canal], 'dim')));

  const cols = [
    { key: 'num', label: 'Chamado', sort: (c) => c.numero, render: (c) => h('span', {}, h('a', { class: 't', href: '#', onclick: (e) => { e.preventDefault(); abrir(c); } }, `#${c.numero} · ${c.assunto}`), h('div', { class: 'small muted' }, cliNome(c))) },
    { key: 'status', label: 'Status', sort: (c) => (base.opcoes.etapa_chamado || []).findIndex((o) => o.chave === c.status), render: (c) => badge(base.lab('etapa_chamado', c.status), aberto(c) ? '' : 'dim') },
    { key: 'prio', label: 'Prioridade', sort: (c) => PESO[c.prioridade], render: (c) => badge(base.lab('prioridade', c.prioridade), PRIO_KIND[c.prioridade]) },
    { key: 'resp', label: 'Responsável', sort: (c) => base.nameOf(c.responsavel_id).toLowerCase() || null, render: (c) => base.nameOf(c.responsavel_id) || (aberto(c) ? h('span', { class: 'small', style: 'color:#ff9b8a' }, 'Ninguém') : '—') },
    { key: 'prazo', label: 'Prazo', sort: (c) => c.prazo, render: (c) => (c.prazo ? h('span', { style: atrasado(c) ? 'color:#ff9b8a' : null }, fmtDate(c.prazo) + (atrasado(c) ? ' · fora do prazo' : '')) : '—') },
    { key: 'canal', label: 'Canal', sort: (c) => c.canal, render: (c) => L.CANAIS[c.canal] },
    { key: 'aberto', label: 'Aberto em', sort: (c) => c.aberto_em, render: (c) => fmtDate(c.aberto_em) },
    { key: 'a', label: '', render: (c) => h('button', { class: 'btn sm', onclick: () => abrir(c) }, 'Abrir') },
  ];

  function draw() {
    const ab = list.filter(aberto);
    const tile = (rot, n, sub, chave, perigo) => h('button', { class: 'card kpi' + (perigo && n ? ' warn' : '') + (f.alerta === chave ? ' on' : ''), onclick: () => { f.alerta = f.alerta === chave ? '' : chave; draw(); } }, h('span', { class: 'small' }, rot), h('b', {}, n), h('small', {}, sub));
    tiles.replaceChildren(tile('Em aberto', ab.length, 'Novos e em atendimento', 'aberto', false), tile('Sem responsável', ab.filter(semResp).length, 'Ninguém assumiu', 'semresp', true),
      tile('Fora do prazo', ab.filter(atrasado).length, 'Prazo combinado vencido', 'atrasado', true), tile('Aguardando cliente', ab.filter((c) => c.status === 'aguardando_cliente').length, 'Dependem de retorno', 'aguardando', false));
    const alerta = { aberto, semresp: semResp, atrasado, aguardando: (c) => c.status === 'aguardando_cliente' }[f.alerta];
    const shown = list.filter((c) => (!f.cli || c.cliente_id === f.cli) && (!f.resp || (f.resp === 'none' ? !c.responsavel_id : c.responsavel_id === f.resp)) && (!f.prio || c.prioridade === f.prio)
      && (!f.status || c.status === f.status) && (!f.canal || c.canal === f.canal) && (!alerta || alerta(c)) && contem([c.assunto, c.descricao, cliNome(c), String(c.numero)], f.q));
    if (!list.length) { body.replaceChildren(empty(canEdit ? 'Nenhum chamado ainda. Registre o primeiro pedido de um cliente com “Novo chamado”.' : 'Nenhum chamado registrado ainda.')); return; }
    if (!shown.length) { body.replaceChildren(empty('Nenhum chamado com esses filtros.')); return; }
    if (f.view === 'quadro') {
      body.replaceChildren(kanban({ cols: colunas(base, 'etapa_chamado', shown).map((k) => ({ ...k, items: [...k.items].sort(ordem) })), card, canMove: canEdit, onMove: mover }));
    } else {
      body.replaceChildren(dataTable({ cols, rows: shown, state: st, onState: draw, rowClass: (c) => (atrasado(c) ? 'late' : null) }));
    }
  }

  const viewBtns = h('span', { class: 'row' }, ...[['quadro', 'Quadro'], ['lista', 'Lista']].map(([v, l]) => h('button', { class: 'btn sm' + (f.view === v ? ' primary' : ''), 'data-v': v, 'aria-pressed': String(f.view === v),
    onclick: () => { f.view = v; viewBtns.querySelectorAll('[data-v]').forEach((b) => { b.classList.toggle('primary', b.dataset.v === v); b.setAttribute('aria-pressed', String(b.dataset.v === v)); }); draw(); } }, l)));

  view.append(pageHead('Atendimento', 'Suporte', 'Chamados registrados pela equipe a partir de e-mail, telefone, WhatsApp ou formulário.', canEdit && h('button', { class: 'btn primary', onclick: () => { if (!clientes.length) { modal('Cadastre o cliente primeiro', h('p', {}, 'Todo chamado pertence a um cliente. Cadastre a empresa em Clientes e volte aqui.'), (close) => h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '../clientes/' }, 'Ir para Clientes'), h('button', { class: 'btn', onclick: close }, 'Fechar'))); return; } novo(); } }, 'Novo chamado')),
  tiles,
  filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar por assunto, cliente ou número…' },
    { tipo: 'select', chave: 'cli', rotulo: 'Todos os clientes', opcoes: clientes.map((c) => [c.id, c.nome]) },
    { tipo: 'select', chave: 'resp', rotulo: 'Todos os responsáveis', opcoes: [['none', 'Sem responsável'], ...base.team.map((t) => [t.id, t.nome])] },
    { tipo: 'select', chave: 'status', rotulo: 'Todos os status', opcoes: base.opts('etapa_chamado') },
    { tipo: 'select', chave: 'prio', rotulo: 'Todas as prioridades', opcoes: base.opts('prioridade') },
    { tipo: 'select', chave: 'canal', rotulo: 'Todos os canais', opcoes: Object.entries(L.CANAIS) }], f, draw),
  h('div', { class: 'row between', style: 'margin-bottom:12px' }, h('span', { class: 'small muted' }, 'Integração automática com WhatsApp e e-mail ainda não está configurada: registre os pedidos manualmente.'), viewBtns), body);
  draw();
  const alvo = qs('abrir') && list.find((x) => x.id === qs('abrir'));   // vindo da busca global
  if (alvo) abrir(alvo);
});
