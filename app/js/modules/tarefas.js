// Tarefas: quadro, lista e agrupamento por projeto, responsável ou prazo
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, dataTable, filtros, contem, kanban, colunas, loadBase, lixeira, quiet, pedirForm, registrarMudancas } from '../core.js';
import { start, h, run, pageHead, empty, formModal, fmtDate, qs } from '../ui.js';

const PRIO_KIND = { baixa: 'dim', media: 'dim', alta: '', urgente: 'warn' };
const MUD = { status: 'Status', prazo: 'Prazo', prioridade: 'Prioridade', responsavel_id: 'Responsável' };

/** Campos do formulário. `projetos`: [{id,titulo}]. `entregas`: entregas do projeto (opcional). */
export function camposTarefa(t, { base, projetos, entregas = [] }) {
  return [
    { name: 'titulo', label: 'Tarefa', required: true, maxlength: 160, value: t.titulo },
    { name: 'projeto_id', label: 'Projeto', type: 'select', nullable: true, value: t.projeto_id, options: [['', '— sem projeto (interna) —'], ...projetos.map((p) => [p.id, p.titulo])] },
    ...(entregas.length ? [{ name: 'entrega_id', label: 'Entrega relacionada', type: 'select', nullable: true, value: t.entrega_id, options: [['', '— nenhuma —'], ...entregas.map((e) => [e.id, e.titulo])] }] : []),
    { name: 'descricao', label: 'Detalhes', type: 'textarea', maxlength: 4000, value: t.descricao },
    { name: 'status', label: 'Status', type: 'select', value: t.status || 'a_fazer', options: base.opts('etapa_tarefa', t.status) },
    { name: 'motivo_bloqueio', label: 'Motivo do bloqueio (se bloqueada)', maxlength: 300, value: t.motivo_bloqueio },
    { name: 'prioridade', label: 'Prioridade', type: 'select', value: t.prioridade || 'media', options: base.opts('prioridade', t.prioridade) },
    { name: 'responsavel_id', label: 'Responsável', type: 'select', nullable: true, value: t.responsavel_id, options: base.teamOpts() },
    { name: 'prazo', label: 'Prazo', type: 'date', nullable: true, value: t.prazo },
    { name: 'horas_estimadas', label: 'Horas estimadas', type: 'number', step: '0.5', min: 0, nullable: true, value: t.horas_estimadas },
    { name: 'horas_gastas', label: 'Horas gastas até agora', type: 'number', step: '0.5', min: 0, value: t.horas_gastas ?? 0 },
  ];
}
const validarTarefa = (v) => (v.status === 'bloqueada' && !v.motivo_bloqueio ? 'Explique o que está bloqueando a tarefa.' : '');
const limpar = (v) => ({ ...v, horas_gastas: v.horas_gastas ?? 0, motivo_bloqueio: v.status === 'bloqueada' ? v.motivo_bloqueio : '' });

/** Abre o formulário de nova tarefa. aoCriar(linha) roda depois de salvar. */
export function novaTarefa({ base, projetos, entregas, preset = {}, aoCriar }) {
  formModal({ title: 'Nova tarefa', fields: camposTarefa(preset, { base, projetos, entregas }), validate: validarTarefa, submitLabel: 'Criar tarefa', onSubmit: async (v) => {
    const row = limpar(v);
    row.cliente_id = projetos.find((p) => p.id === row.projeto_id)?.cliente_id ?? null;
    const r = await run(sb.from('tarefas').insert(row).select().single(), 'Tarefa criada.');
    if (!r) return false; aoCriar?.(r);
  } });
}
export function editarTarefa(t, { base, projetos, entregas, aoSalvar }) {
  formModal({ title: 'Editar tarefa', fields: camposTarefa(t, { base, projetos, entregas }), validate: validarTarefa, onSubmit: async (v) => {
    const antes = { ...t }, row = limpar(v);
    if (row.projeto_id !== t.projeto_id) row.cliente_id = projetos.find((p) => p.id === row.projeto_id)?.cliente_id ?? null;
    const r = await run(sb.from('tarefas').update(row).eq('id', t.id).select().single(), 'Tarefa salva.');
    if (!r) return false; Object.assign(t, r);
    await registrarMudancas('tarefas', t.id, antes, r, MUD, { status: (x) => base.lab('etapa_tarefa', x), prioridade: (x) => base.lab('prioridade', x), prazo: fmtDate, responsavel_id: (x) => base.nameOf(x) });
    aoSalvar?.(t);
  } });
}
/** Muda o status; ao bloquear pede o motivo. Devolve a linha atualizada ou null. */
export async function moverTarefa(t, status, base) {
  if (t.status === status) return null;
  const extra = { motivo_bloqueio: '' };
  if (status === 'bloqueada') {
    const v = await pedirForm({ title: 'Bloquear tarefa', submitLabel: 'Bloquear', fields: [{ name: 'motivo', label: 'O que está bloqueando?', required: true, maxlength: 300 }] });
    if (!v) return null; extra.motivo_bloqueio = v.motivo;
  }
  const antes = { ...t };
  const r = await run(sb.from('tarefas').update({ status, ...extra }).eq('id', t.id).select().single(), 'Status atualizado.');
  if (r) { Object.assign(t, r); await registrarMudancas('tarefas', t.id, antes, r, { status: 'Status' }, { status: (x) => base.lab('etapa_tarefa', x) }); }
  return r;
}

export const init = () => start('tarefas/', 'Tarefas', async (ctx, view) => {
  const canEdit = ctx.can('projetos', 'editar'), hoje = L.hojeISO();
  const [rows, projetos, base] = await Promise.all([
    run(sb.from('tarefas').select('*').is('deleted_at', null).order('prazo', { ascending: true, nullsFirst: false })),
    quiet(sb.from('projetos').select('id,titulo,cliente_id,status').is('deleted_at', null).order('titulo')),
    loadBase(),
  ]);
  const list = rows || [];
  const projNome = (id) => projetos.find((p) => p.id === id)?.titulo || '';
  const f = { q: '', projeto: qs('projeto') || '', resp: qs('resp') === 'me' ? ctx.user.id : '', status: '', prio: '', view: 'quadro', grupo: '', abertas: '' }, st = { sort: 'prazo', dir: 1, page: 0 };
  const body = h('div'), tiles = h('div', { class: 'grid g4', style: 'margin-bottom:18px' });
  const abertaT = (t) => t.status !== 'concluida';
  const atrasada = (t) => abertaT(t) && t.prazo && t.prazo < hoje;
  const semResp = (t) => abertaT(t) && !t.responsavel_id;
  const prox = (t) => abertaT(t) && t.prazo && t.prazo >= hoje && L.diffDias(t.prazo, hoje) <= L.SOON_DAYS;
  const env = () => ({ base, projetos, aoSalvar: draw });

  const mover = async (t, status) => { await moverTarefa(t, status, base); draw(); };
  const acoes = (t) => h('div', { class: 'row' },
    canEdit && h('button', { class: 'btn sm', onclick: () => editarTarefa(t, env()) }, 'Editar'),
    canEdit && h('button', { class: 'btn sm danger', 'aria-label': 'Enviar para a lixeira: ' + t.titulo, onclick: () => lixeira('tarefas', t, t.titulo, () => { list.splice(list.indexOf(t), 1); draw(); }) }, 'Lixeira'));

  const card = (t) => h('article', { class: 'kcard' + (t.status === 'bloqueada' || atrasada(t) ? ' alert' : '') },
    h('h3', {}, t.titulo),
    t.projeto_id && h('p', { class: 'small' }, h('a', { class: 't', href: `../projetos/detalhe.html?id=${t.projeto_id}` }, projNome(t.projeto_id))),
    t.status === 'bloqueada' && h('p', { class: 'small', style: 'color:#ff9b8a', role: 'status' }, '⛔ ' + (t.motivo_bloqueio || 'Bloqueada')),
    h('div', { class: 'chips' },
      t.responsavel_id ? badge(base.nameOf(t.responsavel_id), 'dim') : abertaT(t) && badge('Sem responsável', 'warn'),
      t.prazo && badge((atrasada(t) ? 'Atrasada · ' : 'Prazo ') + fmtDate(t.prazo), atrasada(t) ? 'warn' : prox(t) ? 'info' : 'dim'),
      t.prioridade !== 'media' && badge(base.lab('prioridade', t.prioridade), PRIO_KIND[t.prioridade]),
      t.horas_estimadas != null && badge(`${t.horas_gastas}/${t.horas_estimadas} h`, Number(t.horas_gastas) > Number(t.horas_estimadas) ? 'warn' : 'dim')),
    h('div', { style: 'margin-top:8px' }, acoes(t)));

  const cols = [
    { key: 'titulo', label: 'Tarefa', sort: (t) => t.titulo.toLowerCase(), render: (t) => h('span', {}, h('b', { style: 'color:var(--text)' }, t.titulo), t.status === 'bloqueada' && h('div', { class: 'small', style: 'color:#ff9b8a' }, '⛔ ' + (t.motivo_bloqueio || 'Bloqueada'))) },
    { key: 'projeto', label: 'Projeto', sort: (t) => projNome(t.projeto_id).toLowerCase() || null, render: (t) => (t.projeto_id ? h('a', { class: 't', href: `../projetos/detalhe.html?id=${t.projeto_id}` }, projNome(t.projeto_id)) : h('span', { class: 'muted' }, 'Interna')) },
    { key: 'status', label: 'Status', sort: (t) => (base.opcoes.etapa_tarefa || []).findIndex((o) => o.chave === t.status), render: (t) => (canEdit
      ? h('select', { class: 'sm', 'aria-label': 'Status de ' + t.titulo, onchange: (e) => mover(t, e.target.value) }, base.opts('etapa_tarefa', t.status).map(([v, l]) => h('option', { value: v, selected: v === t.status }, l)))
      : badge(base.lab('etapa_tarefa', t.status))) },
    { key: 'resp', label: 'Responsável', sort: (t) => base.nameOf(t.responsavel_id).toLowerCase() || null, render: (t) => base.nameOf(t.responsavel_id) || (abertaT(t) ? h('span', { class: 'small', style: 'color:#ff9b8a' }, 'Ninguém') : '—') },
    { key: 'prazo', label: 'Prazo', sort: (t) => t.prazo, render: (t) => (t.prazo ? h('span', { style: atrasada(t) ? 'color:#ff9b8a' : null }, fmtDate(t.prazo) + (atrasada(t) ? ' · atrasada' : '')) : '—') },
    { key: 'prio', label: 'Prioridade', sort: (t) => (base.opcoes.prioridade || []).findIndex((o) => o.chave === t.prioridade), render: (t) => badge(base.lab('prioridade', t.prioridade), PRIO_KIND[t.prioridade]) },
    { key: 'a', label: '', render: acoes },
  ];

  const faixa = (t) => (!t.prazo ? '5 · Sem prazo' : t.prazo < hoje ? '1 · Atrasadas' : t.prazo === hoje ? '2 · Hoje' : L.diffDias(t.prazo, hoje) <= 7 ? '3 · Próximos 7 dias' : '4 · Depois');
  const grupoDe = { projeto: (t) => projNome(t.projeto_id) || 'Tarefas internas (sem projeto)', resp: (t) => base.nameOf(t.responsavel_id) || 'Sem responsável', prazo: faixa };

  function draw() {
    const ab = list.filter(abertaT);
    const tile = (rot, n, sub, fn, perigo) => h('div', { class: 'card kpi' + (perigo && n ? ' warn' : '') }, h('span', { class: 'small' }, rot), h('b', {}, n), h('small', {}, sub));
    tiles.replaceChildren(tile('Atrasadas', ab.filter(atrasada).length, 'Passaram do prazo', null, true), tile('Bloqueadas', ab.filter((t) => t.status === 'bloqueada').length, 'Dependem de alguém ou algo', null, true),
      tile('Sem responsável', ab.filter(semResp).length, 'Atribua para ninguém esquecer', null, true), tile('Vencem em 7 dias', ab.filter(prox).length, 'Prazo próximo', null, false));
    const q = f.q;
    const shown = list.filter((t) => (!f.projeto || (f.projeto === 'none' ? !t.projeto_id : t.projeto_id === f.projeto)) && (!f.resp || (f.resp === 'none' ? !t.responsavel_id : t.responsavel_id === f.resp))
      && (!f.status || t.status === f.status) && (!f.prio || t.prioridade === f.prio) && (!f.abertas || abertaT(t)) && contem([t.titulo, t.descricao, projNome(t.projeto_id)], q));
    if (!list.length) { body.replaceChildren(empty(canEdit ? 'Nenhuma tarefa ainda. Crie a primeira ou abra um projeto para começar de um modelo.' : 'Nenhuma tarefa ainda.')); return; }
    if (!shown.length) { body.replaceChildren(empty('Nenhuma tarefa com esses filtros.')); return; }
    if (f.view === 'quadro') { body.replaceChildren(kanban({ cols: colunas(base, 'etapa_tarefa', shown), card, canMove: canEdit, onMove: mover })); return; }
    if (f.grupo) {
      const g = {}; shown.forEach((t) => { (g[grupoDe[f.grupo](t)] ||= []).push(t); });
      body.replaceChildren(...Object.keys(g).sort().map((k) => h('section', { style: 'margin-bottom:18px' }, h('h2', { style: 'font-size:1rem;margin-bottom:8px' }, k.replace(/^\d · /, ''), h('span', { class: 'small muted' }, ` ${g[k].length}`)),
        dataTable({ cols: cols.filter((c) => c.key !== (f.grupo === 'projeto' ? 'projeto' : f.grupo === 'resp' ? 'resp' : '')).map(({ sort, ...c }) => c), rows: [...g[k]].sort((a, b) => (a.prazo || '9').localeCompare(b.prazo || '9')), state: { sort: '', dir: 1, page: 0 }, size: 200, onState: draw }))));
      return;
    }
    body.replaceChildren(dataTable({ cols, rows: shown, state: st, onState: draw, rowClass: (t) => (atrasada(t) || t.status === 'bloqueada' ? 'late' : null), vazio: empty('Nenhuma tarefa.') }));
  }

  const toggle = (rot, on, fn) => h('button', { class: 'btn sm' + (on() ? ' primary' : ''), 'aria-pressed': String(on()), onclick: (e) => { fn(); draw(); e.currentTarget.classList.toggle('primary', on()); e.currentTarget.setAttribute('aria-pressed', String(on())); } }, rot);
  const viewBtns = h('span', { class: 'row' },
    ...[['quadro', 'Quadro'], ['lista', 'Lista']].map(([v, l]) => h('button', { class: 'btn sm' + (f.view === v ? ' primary' : ''), 'data-v': v, 'aria-pressed': String(f.view === v), onclick: () => { f.view = v; viewBtns.querySelectorAll('[data-v]').forEach((b) => { b.classList.toggle('primary', b.dataset.v === v); b.setAttribute('aria-pressed', String(b.dataset.v === v)); }); grupoSel.hidden = v !== 'lista'; draw(); } }, l)));
  const grupoSel = h('select', { 'aria-label': 'Agrupar a lista por', hidden: true, style: 'width:auto', onchange: (e) => { f.grupo = e.target.value; draw(); } },
    h('option', { value: '' }, 'Sem agrupamento'), h('option', { value: 'projeto' }, 'Agrupar por projeto'), h('option', { value: 'resp' }, 'Agrupar por responsável'), h('option', { value: 'prazo' }, 'Agrupar por prazo'));

  view.append(pageHead('Operação', 'Tarefas', 'O que cada pessoa precisa fazer, por projeto, responsável e prazo.',
    canEdit && h('button', { class: 'btn primary', onclick: () => novaTarefa({ base, projetos: projetos.filter((p) => !L.FIM_PROJETO.includes(p.status)), preset: { projeto_id: f.projeto && f.projeto !== 'none' ? f.projeto : null, responsavel_id: ctx.user.id }, aoCriar: (r) => { list.unshift(r); draw(); } }) }, 'Nova tarefa')),
  tiles,
  filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar tarefa…' },
    { tipo: 'select', chave: 'projeto', rotulo: 'Todos os projetos', opcoes: [['none', 'Tarefas internas'], ...projetos.map((p) => [p.id, p.titulo])] },
    { tipo: 'select', chave: 'resp', rotulo: 'Todos os responsáveis', opcoes: [['none', 'Sem responsável'], ...base.team.map((t) => [t.id, t.id === ctx.user.id ? t.nome + ' (eu)' : t.nome])] },
    { tipo: 'select', chave: 'status', rotulo: 'Todos os status', opcoes: base.opts('etapa_tarefa') },
    { tipo: 'select', chave: 'prio', rotulo: 'Todas as prioridades', opcoes: base.opts('prioridade') }], f, draw),
  h('div', { class: 'row between', style: 'margin-bottom:12px' }, h('span', { class: 'row' }, toggle('Só em aberto', () => Boolean(f.abertas), () => { f.abertas = f.abertas ? '' : '1'; }), grupoSel), viewBtns),
  body);
  draw();
  const alvo = qs('abrir') && list.find((x) => x.id === qs('abrir'));   // vindo da busca global
  if (alvo) { if (canEdit) editarTarefa(alvo, env()); else { f.q = alvo.titulo; draw(); } }
});
