// Ficha do projeto: resumo, equipe, entregas, tarefas, alterações de escopo, financeiro do projeto e histórico de decisões
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, dataTable, loadBase, loadClientes, lixeira, quiet, linkSeguro, timeline, pedirForm, registrarMudancas } from '../core.js';
import { camposProjeto, validarProjeto, MUDANCAS_PROJETO, FMT_PROJETO } from './projetos.js';
import { novaTarefa, editarTarefa, moverTarefa } from './tarefas.js';
import { gerarCobrancas, registrarPagamento, formDespesa } from './financeiro.js';
import { openAcompanhamento } from './acompanhamento.js';
import { fichaHref } from './clientes.js';
import { validarArquivo, mensagemErro } from '../validacao.js';
import { start, h, run, pageHead, formModal, confirmDlg, modal, fmtDate, toast, qs } from '../ui.js';

const BUCKET = 'projetos';
const MAX = 50 * 1024 * 1024;
const KIND_COB = { prevista: 'dim', pendente: '', paga: 'ok', atrasada: 'warn', cancelada: 'dim' };

export const init = () => start('projetos/', 'Projeto', async (ctx, view) => {
  const id = qs('id');
  const p = id ? await run(sb.from('projetos').select('*').eq('id', id).maybeSingle()) : null;
  if (!p || p.deleted_at) { view.append(pageHead('Projetos', 'Projeto não encontrado', 'Ele pode ter sido removido ou o endereço está incompleto.', h('a', { class: 'btn', href: './' }, 'Voltar ao quadro'))); return; }
  const canEdit = ctx.can('projetos', 'editar'), canFin = ctx.can('financeiro'), canFinEd = ctx.can('financeiro', 'editar'), hoje = L.hojeISO();
  const [base, clientes, membros, entregas, tarefas, mudancas, proposta, cobrancas, despesas] = await Promise.all([
    loadBase(), loadClientes(),
    quiet(sb.from('projeto_membros').select('usuario_id').eq('projeto_id', id)),
    quiet(sb.from('projeto_entregas').select('*').eq('projeto_id', id).order('data_prevista', { nullsFirst: false })),
    quiet(sb.from('tarefas').select('*').eq('projeto_id', id).is('deleted_at', null).order('prazo', { nullsFirst: false })),
    quiet(sb.from('projeto_escopo_alteracoes').select('*').eq('projeto_id', id).order('criado_em', { ascending: false })),
    p.proposta_id && ctx.can('contatos') ? run(sb.from('propostas').select('id,titulo,status').eq('id', p.proposta_id).maybeSingle()) : null,
    canFin ? quiet(sb.from('cobrancas').select('*').eq('projeto_id', id).is('deleted_at', null).order('vencimento')) : [],
    canFin ? quiet(sb.from('despesas').select('*').eq('projeto_id', id).is('deleted_at', null).order('data', { ascending: false })) : [],
  ]);
  const cli = () => clientes.find((c) => c.id === p.cliente_id);
  const head = h('div'), resumo = h('div'), equipeBox = h('div'), entBox = h('div'), tarBox = h('div'), escBox = h('div'), finBox = h('div');
  const card = (titulo, acao, ...kids) => h('section', { class: 'card' }, h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h2', {}, titulo), acao), ...kids);
  const lista = (itens, vazio) => (itens.length ? h('ul', { class: 'ul-list' }, itens) : h('p', { class: 'small muted' }, vazio));

  // ---------------- cabeçalho e resumo
  const patchProjeto = async (v, msg) => {
    const antes = { ...p }, r = await run(sb.from('projetos').update(v).eq('id', p.id).select().single(), msg);
    if (!r) return null; Object.assign(p, r);
    await registrarMudancas('projetos', p.id, antes, r, MUDANCAS_PROJETO, { ...FMT_PROJETO, status: (x) => base.lab('etapa_projeto', x), prioridade: (x) => base.lab('prioridade', x) });
    drawHead(); drawResumo(); drawFin(); return r;
  };
  const editar = () => formModal({ title: 'Editar projeto', fields: camposProjeto(p, { base, clientes }), validate: validarProjeto, onSubmit: async (v) => {
    if (v.cliente_id !== p.cliente_id) v.cliente = clientes.find((c) => c.id === v.cliente_id)?.nome.slice(0, 160) || '';
    return !!(await patchProjeto(v, 'Projeto salvo.'));
  } });
  const bloquear = async () => {
    if (p.bloqueado) { await patchProjeto({ bloqueado: false, motivo_bloqueio: '' }, 'Projeto desbloqueado.'); return; }
    const v = await pedirForm({ title: 'Bloquear projeto', submitLabel: 'Bloquear', fields: [{ name: 'motivo', label: 'O que está travando?', required: true, maxlength: 300 }] });
    if (v) await patchProjeto({ bloqueado: true, motivo_bloqueio: v.motivo }, 'Projeto marcado como bloqueado.');
  };

  const anexos = async () => {
    const files = (await run(sb.from('projeto_anexos').select('*').eq('projeto_id', p.id).order('criado_em', { ascending: false }))) || [];
    const box = h('div');
    const paint = () => box.replaceChildren(files.length ? h('ul', { class: 'ul-list' }, files.map((a) => h('li', { class: 'row between' },
      h('span', {}, h('b', {}, a.nome), a.tamanho ? h('span', { class: 'small muted' }, ` · ${(a.tamanho / 1048576).toFixed(1)} MB`) : null),
      h('span', { class: 'row' },
        h('button', { class: 'btn sm', onclick: async () => { const r = await run(sb.storage.from(BUCKET).createSignedUrl(a.caminho, 120)); if (r) window.open(r.signedUrl, '_blank', 'noopener'); } }, 'Baixar'),
        canEdit && h('button', { class: 'btn sm danger', onclick: async () => {
          if (!(await confirmDlg(`Remover ${a.nome}?`))) return;
          if (await run(sb.from('projeto_anexos').delete().eq('id', a.id))) { await sb.storage.from(BUCKET).remove([a.caminho]); files.splice(files.indexOf(a), 1); paint(); }
        } }, 'Remover')))) ) : h('p', { class: 'small muted' }, 'Nenhum arquivo anexado.'));
    const pick = h('input', { type: 'file', 'aria-label': 'Escolher arquivo' });
    const send = h('button', { class: 'btn sm primary', onclick: async () => {
      const file = pick.files[0];
      if (!file) { toast('Escolha um arquivo.', true); return; }
      if (file.size > MAX) { toast('Arquivo acima de 50 MB.', true); return; }
      const conf = validarArquivo(file, new Uint8Array(await file.slice(0, 512).arrayBuffer()));
      if (!conf.ok) { toast(conf.erro, true); return; }              // confere o conteúdo real, não só a extensão
      send.disabled = true;
      const path = `${p.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (up.error) { console.error(up.error); toast(mensagemErro(up.error, 'Falha no envio do arquivo.'), true); send.disabled = false; return; }
      const row = await run(sb.from('projeto_anexos').insert({ projeto_id: p.id, nome: file.name, caminho: path, tamanho: file.size }).select().single(), 'Arquivo anexado.');
      if (row) { files.unshift(row); paint(); pick.value = ''; } else await sb.storage.from(BUCKET).remove([path]);
      send.disabled = false;
    } }, 'Enviar');
    paint();
    modal('Anexos — ' + p.titulo, h('div', {}, box, canEdit && h('div', { class: 'row', style: 'margin-top:16px' }, pick, send)), (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
  };

  function drawHead() {
    document.title = `${p.titulo} — Vemax Portal`;
    head.replaceChildren(pageHead('Projeto', p.titulo, null,
      h('a', { class: 'btn', href: './' }, 'Quadro de projetos'),
      canEdit && h('button', { class: 'btn', onclick: editar }, 'Editar'),
      h('button', { class: 'btn', onclick: anexos }, 'Anexos'),
      h('button', { class: 'btn', onclick: () => openAcompanhamento(p, { canEdit, canPortfolio: ctx.can('portfolio', 'editar'), onChange: drawResumo }) }, 'Acompanhamento do cliente'),
      canEdit && !L.FIM_PROJETO.includes(p.status) && h('button', { class: 'btn', onclick: bloquear }, p.bloqueado ? 'Desbloquear' : 'Bloquear'),
      canEdit && h('button', { class: 'btn danger', onclick: () => lixeira('projetos', p, p.titulo, () => { location.href = './'; }) }, 'Lixeira')));
  }

  function drawResumo() {
    const horas = L.consumo(p, tarefas, despesas), late = p.prazo && p.prazo < hoje && !L.FIM_PROJETO.includes(p.status);
    resumo.replaceChildren(
      p.bloqueado && h('p', { class: 'pending-note', role: 'status', style: 'margin-bottom:12px;color:#ff9b8a' }, '⛔ Projeto bloqueado' + (p.motivo_bloqueio ? ': ' + p.motivo_bloqueio : '')),
      h('div', { class: 'chips', style: 'margin:0 0 12px' }, badge(base.lab('etapa_projeto', p.status), L.FIM_PROJETO.includes(p.status) ? 'dim' : ''), badge('Prioridade ' + base.lab('prioridade', p.prioridade).toLowerCase(), p.prioridade === 'urgente' ? 'warn' : 'dim'),
        late && badge('Atrasado', 'warn'), horas.horasAcima && badge('Horas acima do previsto', 'warn'), horas.custoAlto && badge('Custo alto', 'warn')),
      h('dl', { class: 'dl' },
        h('dt', {}, 'Cliente'), h('dd', {}, cli() ? h('a', { class: 't', href: fichaHref(p.cliente_id) }, cli().nome) : p.cliente || '—'),
        h('dt', {}, 'Proposta de origem'), h('dd', {}, proposta ? h('a', { class: 't', href: '../propostas/' }, `${proposta.titulo} (${L.PROPOSTA_STATUS[proposta.status]})`) : p.proposta_id ? 'Sem acesso à proposta' : '—'),
        h('dt', {}, 'Categoria'), h('dd', {}, base.catName(p.categoria_id) || '—'),
        h('dt', {}, 'Responsável'), h('dd', {}, base.nameOf(p.responsavel_id) || '—'),
        h('dt', {}, 'Início previsto'), h('dd', {}, p.inicio_previsto ? fmtDate(p.inicio_previsto) : '—'),
        h('dt', {}, 'Prazo'), h('dd', {}, p.prazo ? fmtDate(p.prazo) : '—'),
        h('dt', {}, 'Valor contratado'), h('dd', {}, p.valor_contratado != null ? L.brl(p.valor_contratado) : '—'),
        h('dt', {}, 'Esforço'), h('dd', {}, `${horas.horas.toLocaleString('pt-BR')} h gastas${p.esforco_horas != null ? ' de ' + p.esforco_horas + ' h previstas' : ''}`),
        h('dt', {}, 'Repositório'), h('dd', {}, p.link_repositorio ? linkSeguro(p.link_repositorio) : '—'),
        h('dt', {}, 'Ambiente'), h('dd', {}, p.link_ambiente ? linkSeguro(p.link_ambiente) : '—'),
        h('dt', {}, 'Documentação'), h('dd', {}, p.link_documentacao ? linkSeguro(p.link_documentacao) : '—')),
      p.descricao && h('p', { style: 'margin-top:12px;white-space:pre-wrap' }, p.descricao),
      p.escopo && h('details', { style: 'margin-top:10px' }, h('summary', {}, 'Escopo'), h('p', { style: 'white-space:pre-wrap' }, p.escopo)));
  }

  // ---------------- equipe
  const drawEquipe = () => {
    const ids = membros.map((m) => m.usuario_id), livres = base.team.filter((t) => !ids.includes(t.id));
    equipeBox.replaceChildren(lista(ids.map((u) => h('li', { class: 'row between' }, base.nameOf(u) || 'Usuário inativo',
      canEdit && h('button', { class: 'btn sm danger', onclick: async () => { if (await run(sb.from('projeto_membros').delete().eq('projeto_id', p.id).eq('usuario_id', u), 'Integrante removido.')) { membros.splice(membros.findIndex((m) => m.usuario_id === u), 1); drawEquipe(); } } }, 'Remover'))), 'Nenhum integrante além do responsável principal.'),
    canEdit && livres.length > 0 && (() => { const sel = h('select', { 'aria-label': 'Adicionar integrante' }, livres.map((t) => h('option', { value: t.id }, t.nome)));
      return h('div', { class: 'row', style: 'margin-top:10px' }, sel, h('button', { class: 'btn sm primary', onclick: async () => { const r = await run(sb.from('projeto_membros').insert({ projeto_id: p.id, usuario_id: sel.value }).select().single(), 'Integrante adicionado.'); if (r) { membros.push(r); drawEquipe(); } } }, 'Adicionar')); })());
  };

  // ---------------- entregas e marcos
  const drawEntregas = () => {
    const feitas = entregas.filter((e) => e.concluida).length;
    entBox.replaceChildren(entregas.length > 0 && h('div', { style: 'margin-bottom:10px' }, h('div', { class: 'progress' }, h('i', { style: `width:${Math.round((feitas / entregas.length) * 100)}%` })), h('p', { class: 'small muted' }, `${feitas} de ${entregas.length} concluída(s)`)),
      lista(entregas.map((e) => h('li', { class: 'row between' },
        h('label', { class: 'chk', style: 'margin:0' }, h('input', { type: 'checkbox', checked: e.concluida, disabled: !canEdit, 'aria-label': 'Concluída: ' + e.titulo, onchange: async (ev) => {
          const r = await run(sb.from('projeto_entregas').update({ concluida: ev.target.checked, concluida_em: ev.target.checked ? new Date().toISOString() : null }).eq('id', e.id).select().single());
          if (r) Object.assign(e, r); else ev.target.checked = e.concluida; drawEntregas(); } }),
        h('span', {}, h('b', {}, e.titulo), ' ', badge(e.tipo === 'marco' ? 'Marco' : 'Entrega', 'dim'), e.data_prevista && h('span', { class: 'small muted' }, ` · ${fmtDate(e.data_prevista)}`, !e.concluida && e.data_prevista < hoje ? ' (atrasada)' : ''))),
        canEdit && h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg(`Remover “${e.titulo}”?`) && await run(sb.from('projeto_entregas').delete().eq('id', e.id))) { entregas.splice(entregas.indexOf(e), 1); drawEntregas(); drawTarefas(); } } }, 'Remover'))), 'Nenhuma entrega ou marco definido. Eles ajudam a mostrar o andamento ao cliente.'));
  };
  const novaEntrega = () => formModal({ title: 'Nova entrega ou marco', fields: [
    { name: 'titulo', label: 'Título', required: true, maxlength: 160 }, { name: 'tipo', label: 'Tipo', type: 'select', options: [['entrega', 'Entrega'], ['marco', 'Marco']] },
    { name: 'data_prevista', label: 'Data prevista', type: 'date', nullable: true }],
  onSubmit: async (v) => { const r = await run(sb.from('projeto_entregas').insert({ ...v, projeto_id: p.id }).select().single(), 'Entrega adicionada.'); if (!r) return false; entregas.push(r); drawEntregas(); } });

  // ---------------- tarefas
  const stT = { sort: 'prazo', dir: 1, page: 0 };
  function drawTarefas() {
    const ab = tarefas.filter((t) => t.status !== 'concluida'), feitas = tarefas.length - ab.length;
    const gasto = tarefas.reduce((t, x) => t + Number(x.horas_gastas || 0), 0);
    tarBox.replaceChildren(tarefas.length > 0 && h('p', { class: 'small muted', style: 'margin-bottom:8px' }, `${feitas} de ${tarefas.length} concluída(s) · ${gasto.toLocaleString('pt-BR')} h gastas`),
      dataTable({ state: stT, rows: tarefas, size: 50, onState: drawTarefas, vazio: h('p', { class: 'small muted' }, 'Nenhuma tarefa neste projeto ainda.'), rowClass: (t) => (t.status === 'bloqueada' || (t.status !== 'concluida' && t.prazo && t.prazo < hoje) ? 'late' : null),
        cols: [
          { key: 'titulo', label: 'Tarefa', sort: (t) => t.titulo.toLowerCase(), render: (t) => h('span', {}, t.titulo, t.status === 'bloqueada' && h('div', { class: 'small', style: 'color:#ff9b8a' }, '⛔ ' + (t.motivo_bloqueio || 'Bloqueada'))) },
          { key: 'status', label: 'Status', render: (t) => (canEdit ? h('select', { class: 'sm', 'aria-label': 'Status de ' + t.titulo, onchange: async (e) => { await moverTarefa(t, e.target.value, base); drawTarefas(); drawResumo(); } }, base.opts('etapa_tarefa', t.status).map(([v, l]) => h('option', { value: v, selected: v === t.status }, l))) : badge(base.lab('etapa_tarefa', t.status))) },
          { key: 'resp', label: 'Responsável', sort: (t) => base.nameOf(t.responsavel_id).toLowerCase() || null, render: (t) => base.nameOf(t.responsavel_id) || (t.status !== 'concluida' ? h('span', { class: 'small', style: 'color:#ff9b8a' }, 'Ninguém') : '—') },
          { key: 'prazo', label: 'Prazo', sort: (t) => t.prazo, render: (t) => (t.prazo ? fmtDate(t.prazo) : '—') },
          { key: 'a', label: '', render: (t) => canEdit && h('button', { class: 'btn sm', onclick: () => editarTarefa(t, { base, projetos: [p], entregas, aoSalvar: () => { drawTarefas(); drawResumo(); } }) }, 'Editar') }] }));
  }

  // ---------------- alterações de escopo
  const registrarEscopo = () => formModal({ title: 'Registrar alteração de escopo', submitLabel: 'Registrar', fields: [
    { name: 'descricao', label: 'O que foi pedido?', type: 'textarea', required: true, maxlength: 2000 },
    { name: 'solicitante', label: 'Quem pediu?', maxlength: 120, placeholder: 'Nome da pessoa do cliente' },
    { name: 'impacto_dias', label: 'Impacto no prazo (dias)', type: 'number', step: '1', nullable: true, hint: 'Use um número negativo se o prazo diminuir.' },
    { name: 'impacto_valor', label: 'Impacto no valor (R$)', type: 'number', step: '0.01', nullable: true }],
  validate: (v) => (v.impacto_dias != null && !Number.isInteger(v.impacto_dias) ? 'O impacto no prazo deve ser em dias inteiros.' : ''),
  onSubmit: async (v) => {
    const r = await run(sb.from('projeto_escopo_alteracoes').insert({ ...v, projeto_id: p.id }).select().single(), 'Alteração registrada.');
    if (!r) return false; mudancas.unshift(r);
    await sb.from('interacoes').insert({ entidade: 'projetos', entidade_id: p.id, tipo: 'decisao', texto: `Pedido de alteração de escopo registrado: ${v.descricao.slice(0, 300)}` });
    drawEscopo();
  } });
  const decidir = async (m, aprovada) => {
    const v = await pedirForm({ title: aprovada ? 'Aprovar alteração' : 'Recusar alteração', submitLabel: aprovada ? 'Aprovar' : 'Recusar', fields: [{ name: 'obs', label: 'Justificativa ou combinado com o cliente', type: 'textarea', maxlength: 1000 }] });
    if (!v) return;
    const upd = { decisao: aprovada ? 'aprovada' : 'recusada', decisao_obs: v.obs, decidido_em: new Date().toISOString(), decidido_por: ctx.user.id };
    const r = await run(sb.from('projeto_escopo_alteracoes').update(upd).eq('id', m.id).select().single(), aprovada ? 'Alteração aprovada.' : 'Alteração recusada.');
    if (!r) return; Object.assign(m, r);
    await sb.from('interacoes').insert({ entidade: 'projetos', entidade_id: p.id, tipo: 'decisao', texto: `Alteração de escopo ${aprovada ? 'aprovada' : 'recusada'}: ${m.descricao.slice(0, 200)}${v.obs ? ' — ' + v.obs : ''}` });
    if (aprovada && ((m.impacto_dias && p.prazo) || m.impacto_valor)) {
      const partes = [m.impacto_dias && p.prazo ? `prazo ${m.impacto_dias > 0 ? '+' : ''}${m.impacto_dias} dia(s)` : null, m.impacto_valor ? `valor ${m.impacto_valor > 0 ? '+' : ''}${L.brl(m.impacto_valor)}` : null].filter(Boolean).join(' e ');
      if (await confirmDlg(`Aplicar o impacto ao projeto agora (${partes})?`)) {
        const novo = {};
        if (m.impacto_dias && p.prazo) novo.prazo = L.addDias(p.prazo, m.impacto_dias);
        if (m.impacto_valor) novo.valor_contratado = Math.max(0, Number(p.valor_contratado || 0) + Number(m.impacto_valor));
        if (await patchProjeto(novo, 'Projeto atualizado.')) { const ra = await run(sb.from('projeto_escopo_alteracoes').update({ aplicada: true }).eq('id', m.id).select().single()); if (ra) Object.assign(m, ra); }
      }
    }
    drawEscopo();
  };
  function drawEscopo() {
    escBox.replaceChildren(lista(mudancas.map((m) => h('li', {},
      h('div', { class: 'row between' }, h('b', {}, m.descricao.length > 90 ? m.descricao.slice(0, 87) + '…' : m.descricao), badge(L.DECISAO[m.decisao], m.decisao === 'aprovada' ? 'ok' : m.decisao === 'recusada' ? 'warn' : 'dim')),
      m.descricao.length > 90 && h('p', { class: 'small', style: 'white-space:pre-wrap' }, m.descricao),
      h('p', { class: 'small muted' }, [m.solicitante && 'Pedido por ' + m.solicitante, fmtDate(m.criado_em), m.impacto_dias != null && `prazo ${m.impacto_dias > 0 ? '+' : ''}${m.impacto_dias} d`, m.impacto_valor != null && `valor ${L.brl(m.impacto_valor)}`, m.aplicada && 'impacto aplicado'].filter(Boolean).join(' · ')),
      m.decisao_obs && h('p', { class: 'small' }, 'Decisão: ' + m.decisao_obs),
      canEdit && m.decisao === 'pendente' && h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn sm primary', onclick: () => decidir(m, true) }, 'Aprovar'), h('button', { class: 'btn sm', onclick: () => decidir(m, false) }, 'Recusar')))),
    'Nenhum pedido extra registrado. Registre aqui o que o cliente pedir fora do combinado, com o impacto em prazo e valor.'));
  }

  // ---------------- financeiro do projeto
  function drawFin() {
    if (!canFin) { finBox.replaceChildren(); return; }
    const hojeI = hoje, ef = (c) => L.statusCobranca(c, hojeI), k = L.consumo(p, tarefas, despesas);
    const ativos = cobrancas.filter((c) => ef(c) !== 'cancelada'), recebido = L.soma(ativos.filter((c) => ef(c) === 'paga').map((c) => ({ v: c.valor_pago ?? c.valor })), 'v');
    const reload = async () => {
      const [c, d] = await Promise.all([run(sb.from('cobrancas').select('*').eq('projeto_id', id).is('deleted_at', null).order('vencimento')), run(sb.from('despesas').select('*').eq('projeto_id', id).is('deleted_at', null).order('data', { ascending: false }))]);
      if (c) cobrancas.splice(0, cobrancas.length, ...c); if (d) despesas.splice(0, despesas.length, ...d); drawFin(); drawResumo();
    };
    finBox.replaceChildren(card('Financeiro do projeto', canFinEd && h('span', { class: 'row' },
      h('button', { class: 'btn sm', onclick: () => (cli() ? gerarCobrancas({ base, clientes, projetos: [p], preset: { cliente_id: p.cliente_id, projeto_id: p.id, descricao: p.titulo, valor: p.valor_contratado }, aoCriar: reload }) : toast('Vincule o projeto a um cliente antes.', true)) }, 'Gerar cobranças'),
      h('button', { class: 'btn sm', onclick: () => formDespesa({ projeto_id: p.id }, { base, projetos: [p], aoSalvar: reload }) }, 'Nova despesa')),
    h('div', { class: 'row', style: 'gap:18px;margin-bottom:10px' },
      h('span', { class: 'small' }, 'Contratado: ', h('b', {}, L.brl(p.valor_contratado))), h('span', { class: 'small' }, 'Recebido: ', h('b', {}, L.brl(recebido))),
      h('span', { class: 'small' }, 'A receber: ', h('b', {}, L.brl(L.soma(ativos.filter((c) => ef(c) !== 'paga'), 'valor')))), h('span', { class: 'small', style: k.custoAlto ? 'color:#ff9b8a' : null }, 'Custos: ', h('b', {}, L.brl(k.custo))),
      k.margem != null && h('span', { class: 'small' }, 'Margem prevista: ', h('b', {}, L.brl(k.margem)))),
    lista(cobrancas.filter((c) => ef(c) !== 'cancelada').map((c) => h('li', { class: 'row between' }, h('span', {}, `${c.descricao} (${c.parcela}/${c.total_parcelas})`, h('span', { class: 'small muted' }, ` · vence ${fmtDate(c.vencimento)} · ${L.brl(c.valor)}`)),
      h('span', { class: 'row', style: 'gap:6px' }, badge(L.COBRANCA_STATUS[ef(c)], KIND_COB[ef(c)]), canFinEd && ef(c) !== 'paga' && h('button', { class: 'btn sm', onclick: () => registrarPagamento(c, reload) }, 'Registrar pagamento')))), 'Nenhuma cobrança ligada a este projeto.'),
    despesas.length > 0 && h('div', {}, h('h3', { style: 'margin:14px 0 6px;font-size:.95rem' }, 'Despesas do projeto'), lista(despesas.map((d) => h('li', { class: 'row between' }, h('span', {}, d.descricao, h('span', { class: 'small muted' }, ` · ${fmtDate(d.data)}`)), L.brl(d.valor))), ''))));
  }

  view.append(head,
    h('div', { class: 'cols2' },
      h('div', { class: 'stack' }, card('Resumo', null, resumo), card('Equipe do projeto', null, equipeBox), card('Alterações de escopo', canEdit && h('button', { class: 'btn sm primary', onclick: registrarEscopo }, 'Registrar pedido'), escBox)),
      h('div', { class: 'stack' }, card('Entregas e marcos', canEdit && h('button', { class: 'btn sm primary', onclick: novaEntrega }, 'Adicionar'), entBox),
        card('Tarefas', canEdit && h('button', { class: 'btn sm primary', onclick: () => novaTarefa({ base, projetos: [p], entregas, preset: { projeto_id: p.id, responsavel_id: ctx.user.id }, aoCriar: (r) => { tarefas.push(r); drawTarefas(); drawResumo(); } }) }, 'Nova tarefa'), tarBox), finBox)),
    h('section', { class: 'card', style: 'margin-top:18px' }, h('h2', { style: 'margin-bottom:4px' }, 'Histórico e decisões'),
      h('p', { class: 'small muted', style: 'margin-bottom:12px' }, 'Registre decisões, combinados e mudanças importantes. Apenas a equipe vê este histórico.'),
      timeline({ entidade: 'projetos', id: p.id }, { base, canEdit, tipos: ['decisao', 'nota', 'contato', 'mensagem'] })));
  drawHead(); drawResumo(); drawEquipe(); drawEntregas(); drawTarefas(); drawEscopo(); drawFin();
});
