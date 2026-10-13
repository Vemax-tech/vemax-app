// Leads e oportunidades: funil em quadro e lista, próxima ação, motivo de perda, origem e histórico
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, dataTable, filtros, contem, kanban, colunas, loadBase, loadClientes, lixeira, quiet, timeline, pedirForm, registrarMudancas } from '../core.js';
import { openPropostas } from './propostas.js';
import { converterLead, fichaHref } from './clientes.js';
import { novoProjeto } from './projetos.js';
import { start, h, run, pageHead, empty, formModal, modal, confirmDlg, fmtDate, contactHref } from '../ui.js';

const ETAPA_KIND = { concluido: 'ok', descartado: 'dim' };
const PERFIL = ['segmento', 'porte', 'prazo', 'orcamento'];

export const init = () => start('contatos/', 'Leads', async (ctx, view) => {
  const canEdit = ctx.can('contatos', 'editar'), canProj = ctx.can('projetos', 'editar'), canCli = ctx.can('clientes', 'editar');
  const [rows, base, clientes, projs] = await Promise.all([
    run(sb.from('contatos_site').select('*').is('deleted_at', null).order('criado_em', { ascending: false })),
    loadBase(), ctx.can('clientes') ? loadClientes() : [],
    ctx.can('projetos') ? quiet(sb.from('projetos').select('id,contato_id').not('contato_id', 'is', null).is('deleted_at', null)) : [],
  ]);
  const list = rows || [], hoje = L.hojeISO();
  const f = { q: '', status: '', resp: '', origem: '', cat: '', alerta: '', view: 'lista' }, st = { sort: 'criado', dir: -1, page: 0 };
  const body = h('div'), tiles = h('div', { class: 'grid g4', style: 'margin-bottom:18px' }), analise = h('div');
  const nomeLead = (l) => l.empresa || l.nome;
  const alertas = (l) => L.alertasLead(l, hoje);
  const clienteDe = (l) => clientes.find((c) => c.id === l.cliente_id);
  const env = () => ({ ctx, base, canEdit, canProj, clientes, leads: list, onChange: draw });

  // ---- formulário ----
  const campos = (l = {}) => [
    { name: 'empresa', label: 'Empresa', maxlength: 160, value: l.empresa },
    { name: 'pessoa_contato', label: 'Pessoa de contato', maxlength: 120, value: l.pessoa_contato },
    { name: 'email', label: 'E-mail', type: 'email', maxlength: 160, value: l.email },
    { name: 'telefone', label: 'Telefone / WhatsApp', maxlength: 40, value: l.telefone },
    { name: 'mensagem', label: 'Necessidade relatada', type: 'textarea', required: true, maxlength: 2000, value: l.mensagem },
    { name: 'categoria_id', label: 'Serviço de interesse', type: 'select', nullable: true, value: l.categoria_id, options: [['', '— não definido —'], ...base.catOpts(l.categoria_id)] },
    { name: 'origem', label: 'Origem do contato', type: 'select', value: l.origem || 'indicacao', options: base.opts('origem_lead', l.origem) },
    { name: 'responsavel_id', label: 'Responsável pelo acompanhamento', type: 'select', nullable: true, value: l.responsavel_id, options: base.teamOpts() },
    { name: 'valor_estimado', label: 'Valor estimado (R$)', type: 'number', step: '0.01', min: 0, nullable: true, value: l.valor_estimado },
    { name: 'proximo_contato', label: 'Data do próximo contato', type: 'date', nullable: true, value: l.proximo_contato },
    { name: 'notas', label: 'Observações internas', type: 'textarea', maxlength: 4000, value: l.notas },
  ];
  const validar = (l) => (v) => {
    if (!l && !v.empresa && !v.pessoa_contato) return 'Informe a empresa ou a pessoa de contato.';
    if (!l && !v.email && !v.telefone) return 'Informe pelo menos um e-mail ou telefone para o retorno.';
    if (v.telefone && L.soDigitos(v.telefone).length < 8) return 'O telefone parece incompleto. Inclua o DDD.';
    return '';
  };
  const montar = (v, l) => ({ ...v, nome: (v.empresa || v.pessoa_contato || l?.nome || '').slice(0, 120), contato: (v.email || v.telefone || l?.contato || '').slice(0, 160) });
  const MUD = { valor_estimado: 'Valor estimado', proximo_contato: 'Próximo contato', origem: 'Origem' };
  const FMT = { valor_estimado: L.brl, proximo_contato: fmtDate };

  const novo = () => formModal({ title: 'Novo lead', fields: campos(), validate: validar(null), onSubmit: async (v) => {
    const r = await run(sb.from('contatos_site').insert({ ...montar(v), status: 'novo' }).select().single(), 'Lead cadastrado.');
    if (!r) return false; list.unshift(r); draw(); abrir(r);
  } });
  const editar = (l, reabrir) => formModal({ title: 'Editar lead', fields: campos(l), validate: validar(l), onSubmit: async (v) => {
    const antes = { ...l };
    const r = await run(sb.from('contatos_site').update(montar(v, l)).eq('id', l.id).select().single(), 'Lead atualizado.');
    if (!r) return false; Object.assign(l, r); await registrarMudancas('contatos_site', l.id, antes, r, MUD, FMT); draw(); reabrir?.();
  } });

  // ---- etapas ----
  async function mover(l, novoStatus) {
    if (novoStatus === l.status) return;
    let extra = {};
    if (novoStatus === 'descartado') {
      const m = await pedirForm({ title: 'Marcar como perdido', submitLabel: 'Marcar como perdido', fields: [
        { name: 'motivo_perda', label: 'Motivo da perda', type: 'select', required: true, options: [['', '— escolha —'], ...base.opts('motivo_perda')] },
        { name: 'detalhe_perda', label: 'Detalhes (opcional)', type: 'textarea', maxlength: 500 }] });
      if (!m) { draw(); return; }
      extra = m;
    }
    const antes = { ...l };
    const r = await run(sb.from('contatos_site').update({ status: novoStatus, ...extra }).eq('id', l.id).select().single(), 'Etapa atualizada.');
    if (!r) { draw(); return; }
    Object.assign(l, r);
    await sb.from('interacoes').insert({ entidade: 'contatos_site', entidade_id: l.id, tipo: 'sistema',
      texto: `Etapa: ${base.lab('etapa_lead', antes.status)} → ${base.lab('etapa_lead', novoStatus)}${extra.motivo_perda ? `. Motivo: ${base.lab('motivo_perda', extra.motivo_perda)}${extra.detalhe_perda ? ' — ' + extra.detalhe_perda : ''}` : ''}` });
    draw();
    if (novoStatus === 'concluido' && !l.cliente_id && canCli && (await confirmDlg('Negócio ganho! Cadastrar este lead como cliente agora?'))) { await converterLead(l); draw(); }
  }
  const escolherEtapa = async (l) => {
    const v = await pedirForm({ title: 'Mudar etapa', submitLabel: 'Mudar', fields: [{ name: 'status', label: 'Nova etapa', type: 'select', value: l.status, options: base.opts('etapa_lead', l.status) }] });
    if (v) mover(l, v.status);
  };

  // ---- detalhe ----
  function abrir(l) {
    const box = h('div');
    const paint = () => {
      const a = alertas(l), cli = clienteDe(l), href = contactHref(l.email || l.telefone || l.contato);
      const proj = projs.find((p) => p.contato_id === l.id);
      box.replaceChildren(
        h('div', { class: 'row between' }, h('b', { style: 'font-size:1.1rem;color:var(--text)' }, nomeLead(l)), badge(base.lab('etapa_lead', l.status), ETAPA_KIND[l.status] || '')),
        a.length > 0 && h('div', { class: 'chips' }, a.map((x) => badge(L.ALERTA_LEAD[x], x === 'parado' || x === 'contato_atrasado' ? 'warn' : 'info'))),
        h('dl', { class: 'dl', style: 'margin-top:12px' },
          h('dt', {}, 'Pessoa de contato'), h('dd', {}, l.pessoa_contato || (l.empresa ? '—' : l.nome)),
          h('dt', {}, 'Contato'), h('dd', {}, [l.email, l.telefone].filter(Boolean).length ? [l.email, l.telefone].filter(Boolean).join(' · ') : (href ? h('a', { class: 't', href, target: '_blank', rel: 'noopener noreferrer' }, l.contato) : l.contato)),
          h('dt', {}, 'Serviço'), h('dd', {}, base.catName(l.categoria_id) || '—'),
          h('dt', {}, 'Origem'), h('dd', {}, base.lab('origem_lead', l.origem)),
          h('dt', {}, 'Responsável'), h('dd', {}, base.nameOf(l.responsavel_id) || 'Ninguém ainda'),
          h('dt', {}, 'Valor estimado'), h('dd', {}, l.valor_estimado != null ? L.brl(l.valor_estimado) : '—'),
          h('dt', {}, 'Próximo contato'), h('dd', {}, l.proximo_contato ? fmtDate(l.proximo_contato) : 'Não definido'),
          h('dt', {}, 'Nesta etapa desde'), h('dd', {}, `${fmtDate(l.etapa_desde)} (${L.diasDesde(l.etapa_desde)} dia(s))`),
          h('dt', {}, 'Recebido em'), h('dd', {}, fmtDate(l.criado_em)),
          l.status === 'descartado' && [h('dt', {}, 'Motivo da perda'), h('dd', {}, base.lab('motivo_perda', l.motivo_perda) + (l.detalhe_perda ? ' — ' + l.detalhe_perda : ''))]),
        h('p', { style: 'margin-top:12px;white-space:pre-wrap' }, h('b', {}, 'Necessidade: '), l.mensagem),
        l.problema && h('p', { class: 'small muted', style: 'white-space:pre-wrap' }, 'Problema informado: ' + l.problema),
        l.solucao_sugerida && h('p', { class: 'small muted' }, 'Sugestão do site: ' + l.solucao_sugerida),
        l.perfil && h('div', { class: 'chips' }, PERFIL.filter((k) => l.perfil[k]).map((k) => badge(String(l.perfil[k]).slice(0, 40), 'dim'))),
        l.notas && h('p', { class: 'small', style: 'color:var(--amber-hi);white-space:pre-wrap;margin-top:8px' }, 'Observações: ' + l.notas),
        h('div', { class: 'row', style: 'margin:16px 0 6px' },
          canEdit && h('button', { class: 'btn sm', onclick: () => editar(l, () => paint()) }, 'Editar'),
          canEdit && h('button', { class: 'btn sm', onclick: async () => { await escolherEtapa(l); paint(); } }, 'Mudar etapa'),
          h('button', { class: 'btn sm', onclick: () => openPropostas(l, env()) }, 'Propostas'),
          cli ? h('a', { class: 'btn sm', href: fichaHref(cli.id) }, 'Ver cliente') : canEdit && canCli && h('button', { class: 'btn sm primary', onclick: async () => { if (await converterLead(l)) { clientes.splice(0, clientes.length, ...(await loadClientes())); draw(); paint(); } } }, 'Converter em cliente'),
          canEdit && canProj && l.cliente_id && !proj && h('button', { class: 'btn sm', onclick: () => novoProjeto({ ctx, base, clientes, preset: { cliente_id: l.cliente_id, contato_id: l.id, titulo: 'Projeto — ' + nomeLead(l), responsavel_id: l.responsavel_id, descricao: l.mensagem, categoria_id: l.categoria_id, valor_contratado: l.valor_estimado }, aoCriar: (p) => { projs.push({ id: p.id, contato_id: l.id }); paint(); } }) }, 'Criar projeto'),
          proj && h('a', { class: 'btn sm', href: `../projetos/detalhe.html?id=${proj.id}` }, 'Ver projeto'),
          canEdit && h('button', { class: 'btn sm danger', onclick: () => lixeira('contatos_site', l, nomeLead(l), () => { list.splice(list.indexOf(l), 1); draw(); fechar?.(); }) }, 'Lixeira')),
        h('h3', { style: 'margin:16px 0 8px' }, 'Histórico'),
        timeline({ entidade: 'contatos_site', id: l.id }, { base, canEdit, tipos: ['contato', 'nota', 'decisao', 'mensagem'] }));
    };
    let fechar; paint();
    fechar = modal('Lead', box, (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
    [...document.querySelectorAll('.ov .modal')].pop()?.classList.add('wide');
  }

  // ---- cartão e colunas ----
  const leadCard = (l) => {
    const a = alertas(l), dias = L.diasDesde(l.etapa_desde);
    return h('article', { class: 'kcard' + (a.some((x) => x === 'parado' || x === 'contato_atrasado') ? ' alert' : '') },
      h('h3', {}, h('a', { class: 't', href: '#', onclick: (e) => { e.preventDefault(); abrir(l); } }, nomeLead(l))),
      h('p', { class: 'small' }, l.email || l.telefone || l.contato),
      h('p', { class: 'small muted clamp' }, l.mensagem),
      h('div', { class: 'chips' }, l.valor_estimado != null && badge(L.brl(l.valor_estimado), 'info'), a.slice(0, 3).map((x) => badge(L.ALERTA_LEAD[x], x === 'parado' || x === 'contato_atrasado' ? 'warn' : 'dim'))),
      h('p', { class: 'small muted', style: 'margin-top:6px' }, [base.nameOf(l.responsavel_id) || 'Sem responsável', l.proximo_contato ? 'Próx.: ' + fmtDate(l.proximo_contato) : null, dias > 0 && !L.FIM_LEAD.includes(l.status) ? `${dias} d na etapa` : null].filter(Boolean).join(' · ')));
  };
  const cols = [
    { key: 'lead', label: 'Lead', sort: (l) => nomeLead(l).toLowerCase(), render: (l) => h('span', {}, h('a', { class: 't', href: '#', onclick: (e) => { e.preventDefault(); abrir(l); } }, nomeLead(l)), h('div', { class: 'small muted' }, l.email || l.telefone || l.contato)) },
    { key: 'nec', label: 'Necessidade', render: (l) => h('div', { class: 'clamp small', style: 'max-width:360px' }, l.mensagem) },
    { key: 'etapa', label: 'Etapa', sort: (l) => (base.opcoes.etapa_lead || []).findIndex((o) => o.chave === l.status), render: (l) => badge(base.lab('etapa_lead', l.status), ETAPA_KIND[l.status] || '') },
    { key: 'valor', label: 'Valor', sort: (l) => (l.valor_estimado == null ? null : Number(l.valor_estimado)), render: (l) => (l.valor_estimado != null ? L.brl(l.valor_estimado) : '—') },
    { key: 'prox', label: 'Próx. contato', sort: (l) => l.proximo_contato, render: (l) => (l.proximo_contato ? fmtDate(l.proximo_contato) : h('span', { class: 'small muted' }, 'Sem data')) },
    { key: 'resp', label: 'Responsável', sort: (l) => base.nameOf(l.responsavel_id).toLowerCase() || null, render: (l) => base.nameOf(l.responsavel_id) || h('span', { class: 'small', style: 'color:#ff9b8a' }, 'Ninguém') },
    { key: 'origem', label: 'Origem', sort: (l) => base.lab('origem_lead', l.origem).toLowerCase(), render: (l) => base.lab('origem_lead', l.origem) },
    { key: 'criado', label: 'Recebido', sort: (l) => l.criado_em, render: (l) => fmtDate(l.criado_em) },
    { key: 'alertas', label: 'Atenção', render: (l) => h('div', { class: 'chips', style: 'margin:0' }, alertas(l).slice(0, 2).map((x) => badge(L.ALERTA_LEAD[x], x === 'parado' || x === 'contato_atrasado' ? 'warn' : 'dim'))) },
  ];

  const filtrados = () => list.filter((l) => (!f.status || l.status === f.status) && (!f.resp || (f.resp === 'none' ? !l.responsavel_id : l.responsavel_id === f.resp))
    && (!f.origem || l.origem === f.origem) && (!f.cat || l.categoria_id === f.cat) && (!f.alerta || alertas(l).includes(f.alerta))
    && contem([l.nome, l.empresa, l.pessoa_contato, l.email, l.telefone, l.contato, l.mensagem, l.problema], f.q));

  function desenharAnalise() {
    const origens = [...new Set(list.map((l) => l.origem))];
    const perdidos = list.filter((l) => l.status === 'descartado');
    const motivos = [...new Set(perdidos.map((l) => l.motivo_perda || ''))];
    analise.replaceChildren(h('details', { class: 'card', style: 'margin-top:22px' }, h('summary', { style: 'cursor:pointer;font-weight:600;color:var(--text)' }, 'Origem dos leads e motivos de perda'),
      list.length ? h('div', { class: 'cols2', style: 'margin-top:14px' },
        h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Origem', 'Leads', 'Ganhos', 'Perdidos', 'Conversão', 'Valor ganho'].map((t) => h('th', {}, t)))),
          h('tbody', {}, origens.map((o) => { const g = list.filter((l) => l.origem === o && l.status === 'concluido'), p = list.filter((l) => l.origem === o && l.status === 'descartado'), t = list.filter((l) => l.origem === o);
            return h('tr', {}, h('td', {}, base.lab('origem_lead', o)), h('td', {}, String(t.length)), h('td', {}, String(g.length)), h('td', {}, String(p.length)), h('td', {}, g.length + p.length ? Math.round((g.length / (g.length + p.length)) * 100) + '%' : '—'), h('td', {}, L.brl(L.soma(g.map((x) => ({ v: x.valor_estimado ?? 0 })), 'v')))); })))),
        h('div', {}, h('h3', { style: 'margin-bottom:8px' }, 'Por que perdemos'), motivos.length
          ? h('ul', { class: 'ul-list' }, motivos.map((m) => h('li', { class: 'row between' }, base.lab('motivo_perda', m) === '—' ? 'Sem motivo informado' : base.lab('motivo_perda', m), badge(String(perdidos.filter((l) => (l.motivo_perda || '') === m).length)))))
          : h('p', { class: 'small muted' }, 'Nenhum lead perdido ainda.')))
        : h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Os números aparecem quando houver leads cadastrados.')));
  }

  function draw() {
    const abertos = list.filter((l) => !L.FIM_LEAD.includes(l.status));
    const conta = (k) => abertos.filter((l) => alertas(l).includes(k)).length;
    const tile = (rot, n, sub, chave, perigo) => h('button', { class: 'card kpi' + (perigo && n ? ' warn' : '') + (f.alerta === chave ? ' on' : ''), onclick: () => { f.alerta = f.alerta === chave ? '' : chave; draw(); } }, h('span', { class: 'small' }, rot), h('b', {}, n), h('small', {}, sub));
    tiles.replaceChildren(tile('Novos sem primeiro contato', conta('sem_primeiro_contato'), 'Precisam de retorno', 'sem_primeiro_contato', true), tile('Contato atrasado', conta('contato_atrasado'), 'Data do retorno já passou', 'contato_atrasado', true),
      tile('Sem próxima ação', conta('sem_proxima_acao'), 'Defina a data do próximo contato', 'sem_proxima_acao', false), tile('Parados', conta('parado'), `Mesma etapa há ${L.STALL_DAYS}+ dias`, 'parado', true));
    const shown = filtrados();
    if (f.view === 'quadro') {
      body.replaceChildren(shown.length || !list.length ? kanban({ cols: colunas(base, 'etapa_lead', shown), card: leadCard, canMove: canEdit, onMove: mover }) : empty('Nenhum lead com esses filtros.'));
    } else {
      body.replaceChildren(dataTable({ cols, rows: shown, state: st, onState: draw, rowClass: (l) => (alertas(l).some((x) => x === 'parado' || x === 'contato_atrasado') ? 'late' : null),
        vazio: empty(list.length ? 'Nenhum lead com esses filtros.' : canEdit ? 'Nenhum lead ainda. Os contatos do site chegam aqui automaticamente; para outros canais, use “Novo lead”.' : 'Nenhum lead ainda. Os contatos do site chegam aqui automaticamente.') }));
    }
    desenharAnalise();
  }

  const viewBtn = (v, l) => h('button', { class: 'btn sm' + (f.view === v ? ' primary' : ''), 'aria-pressed': String(f.view === v), onclick: () => { f.view = v; draw(); bar.querySelectorAll('[data-v]').forEach((b) => { const on = b.dataset.v === f.view; b.classList.toggle('primary', on); b.setAttribute('aria-pressed', String(on)); }); }, 'data-v': v }, l);
  const bar = h('div', { class: 'row between', style: 'margin-bottom:12px' }, h('span', { class: 'small muted' }, 'Em quadro, arraste os cartões entre as etapas ou use “Mover para”.'), h('span', { class: 'row' }, viewBtn('lista', 'Lista'), viewBtn('quadro', 'Quadro')));

  view.append(pageHead('Comercial', 'Leads e oportunidades', 'Contatos do site e de outros canais, do primeiro retorno ao fechamento.', canEdit && h('button', { class: 'btn primary', onclick: novo }, 'Novo lead')),
    tiles,
    filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar por nome, empresa, contato ou necessidade…' },
      { tipo: 'select', chave: 'status', rotulo: 'Todas as etapas', opcoes: base.opts('etapa_lead') },
      { tipo: 'select', chave: 'resp', rotulo: 'Todos os responsáveis', opcoes: [['none', 'Sem responsável'], ...base.team.map((t) => [t.id, t.nome])] },
      { tipo: 'select', chave: 'origem', rotulo: 'Todas as origens', opcoes: base.opts('origem_lead') },
      { tipo: 'select', chave: 'cat', rotulo: 'Todos os serviços', opcoes: base.catOpts() }], f, draw),
    bar, body, analise);
  draw();
});
