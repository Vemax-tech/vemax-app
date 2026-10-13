// Projetos: quadro por etapa, limite de itens em andamento (WIP), ciclos, métricas de fluxo e criação a partir de modelos
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, filtros, contem, kanban, colunas, loadBase, loadClientes, clienteOpts, quiet, pedirForm, registrarMudancas } from '../core.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, modal, fmtDate, toast, icon } from '../ui.js';

export const detalheHref = (id) => new URL(`../projetos/detalhe.html?id=${id}`, new URL('./', location.href)).href;
const PRIO_KIND = { baixa: 'dim', media: 'dim', alta: '', urgente: 'warn' };

/** Campos do formulário de projeto. `extra`: ciclos e nichos (quando existem) e modelos (só na criação). */
export function camposProjeto(p, { base, clientes, ciclos = [], nichos = [], modelos = null }) {
  return [
    { name: 'titulo', label: 'Nome do projeto', required: true, maxlength: 140, value: p.titulo },
    { name: 'cliente_id', label: 'Cliente', type: 'select', required: true, value: p.cliente_id, options: clienteOpts(clientes), hint: clientes.length ? null : 'Nenhum cliente cadastrado. Cadastre o cliente em Clientes antes de criar o projeto.' },
    ...(modelos ? [{ name: 'modelo', label: 'Modelo de projeto', type: 'select', nullable: true, options: [['', '— começar em branco —'], ...modelos.map((m) => [m.id, m.nome])], hint: 'O modelo cria tarefas e entregas iniciais e sugere prazo e esforço.' }] : []),
    { name: 'categoria_id', label: 'Categoria de serviço', type: 'select', nullable: true, value: p.categoria_id, options: [['', '— não definida —'], ...base.catOpts(p.categoria_id)] },
    { name: 'status', label: 'Etapa', type: 'select', value: p.status || 'planejado', options: base.opts('etapa_projeto', p.status) },
    { name: 'prioridade', label: 'Prioridade', type: 'select', value: p.prioridade || 'media', options: base.opts('prioridade', p.prioridade) },
    { name: 'responsavel_id', label: 'Responsável principal', type: 'select', nullable: true, value: p.responsavel_id, options: base.teamOpts() },
    { name: 'inicio_previsto', label: 'Início previsto', type: 'date', nullable: true, value: p.inicio_previsto },
    { name: 'prazo', label: 'Prazo de entrega', type: 'date', nullable: true, value: p.prazo },
    { name: 'valor_contratado', label: 'Valor contratado (R$)', type: 'number', step: '0.01', min: 0, nullable: true, value: p.valor_contratado },
    { name: 'esforco_horas', label: 'Esforço estimado (horas)', type: 'number', step: '0.5', min: 0, nullable: true, value: p.esforco_horas },
    ...(ciclos.length ? [{ name: 'ciclo_id', label: 'Ciclo', type: 'select', nullable: true, value: p.ciclo_id, options: [['', '— sem ciclo —'], ...ciclos.filter((c) => !c.encerrado || c.id === p.ciclo_id).map((c) => [c.id, c.nome])] }] : []),
    ...(nichos.length ? [{ name: 'nicho_id', label: 'Nicho de mercado', type: 'select', nullable: true, value: p.nicho_id, options: [['', '— nenhum —'], ...nichos.map((n) => [n.id, n.nome])] }] : []),
    { name: 'descricao', label: 'Descrição', type: 'textarea', maxlength: 4000, value: p.descricao },
    { name: 'escopo', label: 'Escopo (o que está e o que não está incluído)', type: 'textarea', maxlength: 8000, value: p.escopo },
    { name: 'link_repositorio', label: 'Repositório', type: 'url', maxlength: 300, value: p.link_repositorio, placeholder: 'https://github.com/…' },
    { name: 'link_ambiente', label: 'Ambiente publicado', type: 'url', maxlength: 300, value: p.link_ambiente, placeholder: 'https://' },
    { name: 'link_documentacao', label: 'Documentação', type: 'url', maxlength: 300, value: p.link_documentacao, placeholder: 'https://' },
  ];
}
export const validarProjeto = (v) => (v.inicio_previsto && v.prazo && v.prazo < v.inicio_previsto ? 'O prazo de entrega não pode ser antes do início previsto.' : '');
export const MUDANCAS_PROJETO = { status: 'Etapa', prazo: 'Prazo', valor_contratado: 'Valor contratado', esforco_horas: 'Esforço (h)', prioridade: 'Prioridade', inicio_previsto: 'Início previsto' };
export const FMT_PROJETO = { valor_contratado: L.brl, prazo: fmtDate, inicio_previsto: fmtDate };

/**
 * Abre o formulário de novo projeto. `preset` pré-preenche (ex.: vindo de um lead).
 * aoCriar(linha) roda depois de salvar e de aplicar o modelo.
 */
export async function novoProjeto({ ctx, base, clientes, preset = {}, aoCriar }) {
  const [modelos, ciclos, nichos] = await Promise.all([
    quiet(sb.from('modelos_projeto').select('*').eq('ativo', true).order('nome')),
    quiet(sb.from('projeto_ciclos').select('id,nome,encerrado').order('inicio', { ascending: false })),
    ctx.can('mercado') ? quiet(sb.from('nichos').select('id,nome').order('nome')) : [],
  ]);
  formModal({ title: 'Novo projeto', fields: camposProjeto(preset, { base, clientes, ciclos, nichos, modelos }), validate: validarProjeto, submitLabel: 'Criar projeto', onSubmit: async (v) => {
    const { modelo, ...dados } = v;
    const m = modelos.find((x) => x.id === modelo);
    if (m) {
      dados.categoria_id ??= m.categoria_id; dados.esforco_horas ??= m.esforco_horas;
      if (!dados.prazo && m.prazo_dias) dados.prazo = L.addDias(dados.inicio_previsto || L.hojeISO(), m.prazo_dias);
    }
    dados.cliente = clientes.find((c) => c.id === dados.cliente_id)?.nome.slice(0, 160) || '';
    if (preset.contato_id) dados.contato_id = preset.contato_id;
    const r = await run(sb.from('projetos').insert(dados).select().single(), 'Projeto criado.');
    if (!r) return false;
    if (m) {
      const { error } = await sb.rpc('aplicar_modelo_projeto', { p_projeto: r.id, p_modelo: m.id });
      if (error) toast('Projeto criado, mas não foi possível aplicar o modelo: ' + error.message, true);
    }
    aoCriar?.(r);
  } });
}

export const init = () => start('projetos/', 'Projetos', async (ctx, view) => {
  const canEdit = ctx.can('projetos', 'editar');
  const [rows, base, clientes, tarefasRaw, despesasRaw, ciclosRaw, wipRaw, nichos] = await Promise.all([
    run(sb.from('projetos').select('*').is('deleted_at', null).order('prazo', { ascending: true, nullsFirst: false })),
    loadBase(), ctx.can('clientes') ? loadClientes() : [],
    quiet(sb.from('tarefas').select('projeto_id,status,horas_gastas').is('deleted_at', null).not('projeto_id', 'is', null)),
    ctx.can('financeiro') ? quiet(sb.from('despesas').select('projeto_id,valor').is('deleted_at', null).not('projeto_id', 'is', null)) : [],
    quiet(sb.from('projeto_ciclos').select('*').order('inicio', { ascending: false })),   // se a migration 008 não foi aplicada, a página segue funcionando
    quiet(sb.from('projeto_wip').select('*')),
    ctx.can('mercado') ? quiet(sb.from('nichos').select('id,nome').order('nome')) : [],
  ]);
  const list = rows || [], ciclos = ciclosRaw, hoje = L.hojeISO();
  const wip = Object.fromEntries(wipRaw.map((w) => [w.status, w.limite]));
  const cicloOf = (id) => ciclos.find((c) => c.id === id);
  const clienteNome = (p) => clientes.find((c) => c.id === p.cliente_id)?.nome || p.cliente;
  const f = { q: '', resp: '', ciclo: '', cat: '', prio: '', cli: '', enc: '' };
  const board = h('div'), stats = h('div', { class: 'kstats', 'aria-label': 'Métricas de fluxo' });
  const tarefasDe = (p) => tarefasRaw.filter((t) => t.projeto_id === p.id);
  const consumoDe = (p) => L.consumo(p, tarefasDe(p), despesasRaw.filter((d) => d.projeto_id === p.id));

  const mover = async (p, status) => {
    if (p.status === status) { draw(); return; }
    if (status === 'cancelado' && !(await confirmDlg(`Cancelar o projeto “${p.titulo}”?`))) { draw(); return; }
    const antes = { ...p };
    const r = await run(sb.from('projetos').update({ status }).eq('id', p.id).select().single(), 'Etapa atualizada.');
    if (r) { Object.assign(p, r); await registrarMudancas('projetos', p.id, antes, r, { status: 'Etapa' }, { status: (v) => base.lab('etapa_projeto', v) }); }
    draw();
  };
  const bloquear = async (p) => {
    if (p.bloqueado) {
      const r = await run(sb.from('projetos').update({ bloqueado: false, motivo_bloqueio: '' }).eq('id', p.id).select().single(), 'Projeto desbloqueado.');
      if (r) { Object.assign(p, r); draw(); } return;
    }
    const v = await pedirForm({ title: 'Bloquear — ' + p.titulo, submitLabel: 'Bloquear', fields: [{ name: 'motivo_bloqueio', label: 'O que está travando?', required: true, maxlength: 300 }] });
    if (!v) return;
    const r = await run(sb.from('projetos').update({ bloqueado: true, motivo_bloqueio: v.motivo_bloqueio.slice(0, 300) }).eq('id', p.id).select().single(), 'Projeto marcado como bloqueado.');
    if (r) { Object.assign(p, r); draw(); }
  };
  const editar = async (p) => {
    const extras = { base, clientes, ciclos, nichos };
    formModal({ title: 'Editar projeto', fields: camposProjeto(p, extras), validate: validarProjeto, onSubmit: async (v) => {
      const antes = { ...p };
      if (v.cliente_id !== p.cliente_id) v.cliente = clientes.find((c) => c.id === v.cliente_id)?.nome.slice(0, 160) || '';
      const r = await run(sb.from('projetos').update(v).eq('id', p.id).select().single(), 'Projeto salvo.');
      if (!r) return false; Object.assign(p, r);
      await registrarMudancas('projetos', p.id, antes, r, MUDANCAS_PROJETO, { ...FMT_PROJETO, status: (x) => base.lab('etapa_projeto', x), prioridade: (x) => base.lab('prioridade', x) });
      draw();
    } });
  };

  const card = (p) => {
    const late = !L.FIM_PROJETO.includes(p.status) && p.prazo && p.prazo < hoje, ts = tarefasDe(p), feitas = ts.filter((t) => t.status === 'concluida').length, c = consumoDe(p);
    return h('article', { class: 'kcard' + (p.bloqueado ? ' blocked' : '') },
      h('h3', {}, h('a', { class: 't', href: detalheHref(p.id) }, p.titulo)),
      clienteNome(p) && h('p', { class: 'small' }, clienteNome(p)),
      p.bloqueado && h('p', { class: 'small', style: 'color:#ff9b8a', role: 'status' }, '⛔ Bloqueado' + (p.motivo_bloqueio ? ': ' + p.motivo_bloqueio : '')),
      ts.length > 0 && h('div', { style: 'margin-top:8px' }, h('div', { class: 'progress', role: 'img', 'aria-label': `${feitas} de ${ts.length} tarefas concluídas` }, h('i', { style: `width:${Math.round((feitas / ts.length) * 100)}%` })), h('p', { class: 'small muted' }, `${feitas}/${ts.length} tarefas`)),
      h('div', { class: 'chips' },
        p.prioridade !== 'media' && badge(base.lab('prioridade', p.prioridade), PRIO_KIND[p.prioridade]),
        cicloOf(p.ciclo_id) && badge(cicloOf(p.ciclo_id).nome),
        p.prazo && badge((late ? 'Atrasado · ' : 'Prazo ') + fmtDate(p.prazo), late ? 'warn' : 'dim'),
        base.nameOf(p.responsavel_id) && badge(base.nameOf(p.responsavel_id), 'dim'),
        base.catName(p.categoria_id) && badge(base.catName(p.categoria_id), 'dim'),
        c.horasAcima && badge('Horas acima do previsto', 'warn'), c.custoAlto && badge('Custo alto', 'warn')),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('a', { class: 'btn sm', href: detalheHref(p.id) }, 'Abrir'),
        canEdit && !L.FIM_PROJETO.includes(p.status) && h('button', { class: 'btn sm', onclick: () => bloquear(p) }, p.bloqueado ? 'Desbloquear' : 'Bloquear'),
        canEdit && h('button', { class: 'btn sm', onclick: () => editar(p) }, 'Editar')));
  };

  // ---- Métricas de fluxo (últimos 30 dias) ----
  const DAY = 864e5;
  const drawStats = () => {
    const now = Date.now(), doneAt = (p) => (p.concluido_em ? new Date(p.concluido_em).getTime() : null);
    const done30 = list.filter((p) => doneAt(p) && doneAt(p) >= now - 30 * DAY);
    const leads = done30.filter((p) => p.iniciado_em).map((p) => (doneAt(p) - new Date(p.iniciado_em).getTime()) / DAY);
    const avg = leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null;
    const weeks = [3, 2, 1, 0].map((i) => list.filter((p) => doneAt(p) && doneAt(p) >= now - (i + 1) * 7 * DAY && doneAt(p) < now - i * 7 * DAY).length);
    const max = Math.max(1, ...weeks), ativos = list.filter((p) => !L.FIM_PROJETO.includes(p.status));
    const tile = (v, l, warn) => h('div', { class: 'ktile' + (warn ? ' warn' : '') }, h('b', {}, String(v)), h('span', {}, l));
    stats.replaceChildren(
      tile(list.filter((p) => p.status === 'andamento').length, 'em andamento'),
      tile(ativos.filter((p) => p.prazo && p.prazo < hoje).length, 'atrasados', ativos.some((p) => p.prazo && p.prazo < hoje)),
      tile(ativos.filter((p) => p.bloqueado).length, 'bloqueados', ativos.some((p) => p.bloqueado)),
      tile(done30.length, 'entregues em 30 dias'),
      tile(avg == null ? '—' : avg.toFixed(1).replace('.', ',') + ' d', 'lead time médio'),
      h('div', { class: 'ktile kweeks', role: 'img', 'aria-label': `Entregas por semana, da mais antiga à atual: ${weeks.join(', ')}` },
        h('div', { class: 'bars4' }, weeks.map((n) => h('i', { style: `height:${Math.max(6, (n / max) * 100)}%`, title: `${n} entrega(s)` }))), h('span', {}, 'entregas por semana (4 sem.)')));
  };

  // ---- Quadro ----
  function draw() {
    const shown = list.filter((p) => (!f.resp || p.responsavel_id === f.resp) && (!f.cat || p.categoria_id === f.cat) && (!f.prio || p.prioridade === f.prio) && (!f.cli || p.cliente_id === f.cli)
      && (!f.ciclo || (f.ciclo === 'none' ? !p.ciclo_id : p.ciclo_id === f.ciclo)) && (!f.enc || !L.FIM_PROJETO.includes(p.status))
      && contem([p.titulo, clienteNome(p), p.descricao], f.q));
    const cols = colunas(base, 'etapa_projeto', shown).map((c) => {
      const total = list.filter((p) => p.status === c.key).length, lim = wip[c.key], over = lim != null && total > lim;
      return { ...c, label: lim != null ? `${c.label} ${total}/${lim}` : c.label, alerta: over, aviso: over ? `Acima do limite (${lim}). Termine algo antes de começar outro.` : null };
    });
    board.replaceChildren(list.length || canEdit ? kanban({ cols, card, canMove: canEdit, onMove: mover, vazio: 'Vazio' }) : empty('Nenhum projeto ainda.'));
    drawStats();
  }

  // ---- Limites de WIP ----
  const openWip = () => {
    const sts = base.opts('etapa_projeto').filter(([k]) => !['concluido', 'cancelado'].includes(k));
    const inputs = Object.fromEntries(sts.map(([st, l]) => [st, h('input', { type: 'number', min: 1, max: 99, 'aria-label': 'Limite de ' + l, value: wip[st] ?? '', placeholder: 'sem limite', style: 'width:140px' })]));
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    modal('Limites de itens por coluna (WIP)', h('div', {},
      h('p', { class: 'small muted' }, 'Quando uma coluna passa do limite, ela fica destacada. É um aviso para a equipe terminar antes de começar mais, não um bloqueio. Deixe vazio para não limitar.'),
      sts.map(([st, l]) => h('div', { class: 'row between', style: 'margin-top:10px' }, h('label', { style: 'margin:0' }, l), inputs[st])), err),
    (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: async () => {
        const set = [], clear = [];
        for (const [st, el] of Object.entries(inputs)) {
          const v = el.value.trim();
          if (!v) { clear.push(st); continue; }
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > 99) { err.textContent = 'Use números inteiros de 1 a 99.'; err.hidden = false; el.focus(); return; }
          set.push({ status: st, limite: n });
        }
        if (set.length && !(await run(sb.from('projeto_wip').upsert(set)))) return;
        if (clear.length && !(await run(sb.from('projeto_wip').delete().in('status', clear)))) return;
        Object.keys(wip).forEach((k) => delete wip[k]); set.forEach((s) => { wip[s.status] = s.limite; });
        toast('Limites salvos.'); close(); draw();
      } }, 'Salvar')));
  };

  // ---- Ciclos (2 semanas) e retrospectiva ----
  const cicloSlot = h('span');
  const drawCicloSel = () => cicloSlot.replaceChildren(ciclos.length ? h('select', { 'aria-label': 'Filtrar por ciclo', onchange: (e) => { f.ciclo = e.target.value; draw(); } },
    h('option', { value: '' }, 'Todos os ciclos'), h('option', { value: 'none', selected: f.ciclo === 'none' }, 'Sem ciclo'),
    ciclos.map((c) => h('option', { value: c.id, selected: f.ciclo === c.id }, c.nome + (c.encerrado ? ' (encerrado)' : '')))) : null);
  const openCiclos = () => {
    const body = h('div');
    const paint = () => body.replaceChildren(ciclos.length ? h('ul', { class: 'ul-list' }, ciclos.map((c) => {
      const mine = list.filter((p) => p.ciclo_id === c.id), done = mine.filter((p) => p.status === 'concluido').length;
      return h('li', {}, h('div', { class: 'row between' }, h('b', {}, c.nome), badge(c.encerrado ? 'Encerrado' : 'Aberto', c.encerrado ? 'dim' : 'ok')),
        h('p', { class: 'small muted' }, `${fmtDate(c.inicio)} a ${fmtDate(c.fim)} · ${done} de ${mine.length} concluído(s)`),
        c.meta && h('p', { class: 'small' }, 'Meta: ' + c.meta),
        c.retro_manter && h('p', { class: 'small' }, h('b', {}, 'Manter: '), c.retro_manter),
        c.retro_mudar && h('p', { class: 'small' }, h('b', {}, 'Mudar: '), c.retro_mudar),
        canEdit && h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn sm', onclick: () => formModal({ title: (c.encerrado ? 'Retrospectiva — ' : 'Encerrar e fazer retrospectiva — ') + c.nome, submitLabel: c.encerrado ? 'Salvar' : 'Encerrar ciclo',
            fields: [{ name: 'retro_manter', label: 'O que funcionou e vamos manter?', type: 'textarea', maxlength: 2000, value: c.retro_manter }, { name: 'retro_mudar', label: 'O que vamos mudar no próximo ciclo?', type: 'textarea', maxlength: 2000, value: c.retro_mudar }],
            onSubmit: async (v) => { const r = await run(sb.from('projeto_ciclos').update({ ...v, encerrado: true }).eq('id', c.id).select().single(), 'Ciclo encerrado.'); if (!r) return false; Object.assign(c, r); paint(); drawCicloSel(); draw(); } }) }, c.encerrado ? 'Editar retrospectiva' : 'Encerrar ciclo'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!(await confirmDlg(`Excluir o ciclo "${c.nome}"? Os projetos ficam sem ciclo.`))) return;
            if (await run(sb.from('projeto_ciclos').delete().eq('id', c.id), 'Ciclo excluído.')) { ciclos.splice(ciclos.indexOf(c), 1); list.forEach((p) => { if (p.ciclo_id === c.id) p.ciclo_id = null; }); if (f.ciclo === c.id) f.ciclo = ''; paint(); drawCicloSel(); draw(); }
          } }, 'Excluir')));
    })) : h('p', { class: 'small muted' }, 'Nenhum ciclo ainda. Ciclos de 2 semanas ajudam a planejar o que entra e a revisar o que funcionou.'));
    paint();
    modal('Ciclos', h('div', {}, canEdit && h('button', { class: 'btn primary sm', style: 'margin-bottom:14px', onclick: () => {
      formModal({ title: 'Novo ciclo', fields: [
        { name: 'nome', label: 'Nome', required: true, maxlength: 80, value: `Ciclo ${ciclos.length + 1}` },
        { name: 'inicio', label: 'Início', type: 'date', required: true, value: hoje },
        { name: 'fim', label: 'Fim', type: 'date', required: true, value: L.addDias(hoje, 13) },
        { name: 'meta', label: 'Meta do ciclo', type: 'textarea', maxlength: 500 }],
      validate: (v) => (v.fim < v.inicio ? 'A data final precisa ser depois da inicial.' : ''),
      onSubmit: async (v) => { const r = await run(sb.from('projeto_ciclos').insert(v).select().single(), 'Ciclo criado.'); if (!r) return false; ciclos.unshift(r); paint(); drawCicloSel(); } });
    } }, icon('plus'), 'Novo ciclo'), body), (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
  };

  const novo = canEdit && h('button', { class: 'btn primary', onclick: () => {
    if (!clientes.length) { toast('Cadastre o cliente em Clientes antes de criar o projeto.', true); return; }
    novoProjeto({ ctx, base, clientes, aoCriar: (r) => { list.unshift(r); draw(); } });
  } }, icon('plus'), 'Novo projeto');

  view.append(pageHead('Operação', 'Quadro de projetos', 'Arraste os cartões entre as colunas ou use “Mover para”.', novo,
    h('button', { class: 'btn', onclick: openCiclos }, 'Ciclos'), canEdit && h('button', { class: 'btn', onclick: openWip }, 'Limites WIP')),
  stats,
  filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar projeto ou cliente…' },
    { tipo: 'select', chave: 'resp', rotulo: 'Todos os responsáveis', opcoes: base.team.map((t) => [t.id, t.nome]) },
    { tipo: 'select', chave: 'cli', rotulo: 'Todos os clientes', opcoes: clientes.map((c) => [c.id, c.nome]) },
    { tipo: 'select', chave: 'cat', rotulo: 'Todas as categorias', opcoes: base.catOpts() },
    { tipo: 'select', chave: 'prio', rotulo: 'Todas as prioridades', opcoes: base.opts('prioridade') },
    { tipo: 'select', chave: 'enc', rotulo: 'Incluir encerrados', opcoes: [['ativos', 'Somente em aberto']] }], f, draw),
  h('div', { class: 'toolbar' }, cicloSlot), board);
  drawCicloSel();
  draw();
});
