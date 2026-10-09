// Projetos: quadro kanban por status, prazos, responsáveis e anexos de entregáveis
import { sb } from '../supabase.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, modal, fmtDate, overdue, toast, icon, PROJ_STATUS } from '../ui.js';

const BUCKET = 'projetos';
const MAX = 50 * 1024 * 1024;

export const init = () => start('projetos/', 'Projetos', async (ctx, view) => {
  const canEdit = ctx.can('projetos', 'editar');
  const quiet = (p) => p.then((r) => r.data || []);   // ciclos/WIP: se a migration 008 ainda não foi aplicada, a página segue funcionando
  const [rows, equipe, nichos, ciclosRaw, wipRaw] = await Promise.all([
    run(sb.from('projetos').select('*').order('prazo', { ascending: true, nullsFirst: false })),
    run(sb.from('profiles').select('id,nome').eq('ativo', true).order('nome')),
    ctx.can('mercado') ? run(sb.from('nichos').select('id,nome').order('nome')) : [],
    quiet(sb.from('projeto_ciclos').select('*').order('inicio', { ascending: false })),
    quiet(sb.from('projeto_wip').select('*')),
  ]);
  const list = rows || [], team = equipe || [], N = nichos || [], ciclos = ciclosRaw;
  const wip = Object.fromEntries(wipRaw.map((w) => [w.status, w.limite]));
  const cicloOf = (id) => ciclos.find((c) => c.id === id);
  const nameOf = (id) => team.find((t) => t.id === id)?.nome;
  const nicheOf = (id) => N.find((n) => n.id === id)?.nome;
  const f = { q: '', resp: '', ciclo: '' };   // ciclo: '' = todos, 'none' = sem ciclo, ou id
  const board = h('div', { class: 'kanban' });

  const fields = (p = {}) => [
    { name: 'titulo', label: 'Título', required: true, value: p.titulo },
    { name: 'cliente', label: 'Cliente', value: p.cliente },
    { name: 'status', label: 'Status', type: 'select', value: p.status || 'planejado', options: Object.entries(PROJ_STATUS) },
    { name: 'responsavel_id', label: 'Responsável', type: 'select', nullable: true, value: p.responsavel_id, options: [['', '— ninguém —'], ...team.map((t) => [t.id, t.nome])] },
    { name: 'prazo', label: 'Prazo', type: 'date', nullable: true, value: p.prazo },
    ...(ciclos.length ? [{ name: 'ciclo_id', label: 'Ciclo', type: 'select', nullable: true, value: p.ciclo_id, options: [['', '— sem ciclo —'], ...ciclos.filter((c) => !c.encerrado || c.id === p.ciclo_id).map((c) => [c.id, c.nome])] }] : []),
    ...(N.length ? [{ name: 'nicho_id', label: 'Nicho de mercado', type: 'select', nullable: true, value: p.nicho_id, options: [['', '— nenhum —'], ...N.map((n) => [n.id, n.nome])] }] : []),
    { name: 'descricao', label: 'Descrição', type: 'textarea', value: p.descricao },
  ];

  const move = async (p, status) => {
    if (p.status === status) return;
    const r = await run(sb.from('projetos').update({ status }).eq('id', p.id).select().single(), 'Status atualizado.');
    if (r) { Object.assign(p, r); draw(); }
  };

  const block = (p) => {
    if (p.bloqueado) {
      return run(sb.from('projetos').update({ bloqueado: false, motivo_bloqueio: '' }).eq('id', p.id).select().single(), 'Projeto desbloqueado.').then((r) => { if (r) { Object.assign(p, r); draw(); } });
    }
    formModal({ title: 'Bloquear — ' + p.titulo, submitLabel: 'Bloquear', fields: [{ name: 'motivo_bloqueio', label: 'O que está travando?', required: true, value: '' }],
      onSubmit: async (v) => {
        const r = await run(sb.from('projetos').update({ bloqueado: true, motivo_bloqueio: v.motivo_bloqueio.slice(0, 300) }).eq('id', p.id).select().single(), 'Projeto marcado como bloqueado.');
        if (!r) return false; Object.assign(p, r); draw();
      } });
  };

  const edit = (p) => formModal({ title: 'Editar projeto', fields: fields(p), onSubmit: async (v) => {
    const r = await run(sb.from('projetos').update(v).eq('id', p.id).select().single(), 'Projeto salvo.');
    if (!r) return false; Object.assign(p, r); draw();
  } });

  const anexos = async (p) => {
    const files = (await run(sb.from('projeto_anexos').select('*').eq('projeto_id', p.id).order('criado_em', { ascending: false }))) || [];
    const box = h('div');
    const paint = () => box.replaceChildren(files.length ? h('ul', { class: 'ul-list' }, files.map((a) => h('li', { class: 'row between' },
      h('span', {}, h('b', {}, a.nome), a.tamanho ? h('span', { class: 'small muted' }, ` · ${(a.tamanho / 1048576).toFixed(1)} MB`) : null),
      h('span', { class: 'row' },
        h('button', { class: 'btn sm', onclick: async () => { const r = await run(sb.storage.from(BUCKET).createSignedUrl(a.caminho, 120)); if (r) window.open(r.signedUrl, '_blank', 'noopener'); } }, 'Baixar'),
        canEdit && h('button', { class: 'btn sm danger', onclick: async () => {
          if (!(await confirmDlg(`Remover ${a.nome}?`))) return;
          if (await run(sb.from('projeto_anexos').delete().eq('id', a.id))) { await sb.storage.from(BUCKET).remove([a.caminho]); files.splice(files.indexOf(a), 1); paint(); }
        } }, 'Remover'))))) : h('p', { class: 'small muted' }, 'Nenhum arquivo anexado.'));
    const pick = h('input', { type: 'file', 'aria-label': 'Escolher arquivo' });
    const send = h('button', { class: 'btn sm primary', onclick: async () => {
      const file = pick.files[0];
      if (!file) { toast('Escolha um arquivo.', true); return; }
      if (file.size > MAX) { toast('Arquivo acima de 50 MB.', true); return; }
      send.disabled = true;
      const path = `${p.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (up.error) { console.error(up.error); toast('Falha no envio: ' + up.error.message, true); send.disabled = false; return; }
      const row = await run(sb.from('projeto_anexos').insert({ projeto_id: p.id, nome: file.name, caminho: path, tamanho: file.size }).select().single(), 'Arquivo anexado.');
      if (row) { files.unshift(row); paint(); pick.value = ''; } else await sb.storage.from(BUCKET).remove([path]);
      send.disabled = false;
    } }, 'Enviar');
    paint();
    modal('Anexos — ' + p.titulo, h('div', {}, box, canEdit && h('div', { class: 'row', style: 'margin-top:16px' }, pick, send)),
      (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
  };

  const card = (p) => {
    const late = p.status !== 'concluido' && overdue(p.prazo);
    return h('article', { class: 'kcard' + (p.bloqueado ? ' blocked' : ''), draggable: canEdit ? 'true' : null, ondragstart: (e) => e.dataTransfer.setData('text/plain', p.id) },
      h('h3', {}, p.titulo),
      p.cliente && h('p', { class: 'small' }, p.cliente),
      p.descricao && h('p', { class: 'small muted clamp' }, p.descricao),
      p.bloqueado && h('p', { class: 'small', style: 'color:#ff9b8a', role: 'status' }, '⛔ Bloqueado' + (p.motivo_bloqueio ? ': ' + p.motivo_bloqueio : '')),
      h('div', { class: 'row', style: 'gap:6px;margin-top:8px' },
        cicloOf(p.ciclo_id) && h('span', { class: 'badge' }, cicloOf(p.ciclo_id).nome),
        p.prazo && h('span', { class: 'badge' + (late ? ' warn' : ' dim') }, (late ? 'Atrasado · ' : 'Prazo ') + fmtDate(p.prazo + 'T12:00')),
        nameOf(p.responsavel_id) && h('span', { class: 'badge dim' }, nameOf(p.responsavel_id)),
        nicheOf(p.nicho_id) && h('span', { class: 'badge dim' }, nicheOf(p.nicho_id))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        canEdit && h('select', { class: 'sm', 'aria-label': 'Mover ' + p.titulo, onchange: (e) => move(p, e.target.value) },
          Object.entries(PROJ_STATUS).map(([v, l]) => h('option', { value: v, selected: v === p.status }, l))),
        h('button', { class: 'btn sm', onclick: () => anexos(p) }, 'Anexos'),
        canEdit && p.status !== 'concluido' && h('button', { class: 'btn sm', onclick: () => block(p) }, p.bloqueado ? 'Desbloquear' : 'Bloquear'),
        canEdit && h('button', { class: 'btn sm', onclick: () => edit(p) }, 'Editar'),
        canEdit && h('button', { class: 'btn sm danger', 'aria-label': 'Excluir ' + p.titulo, onclick: async () => {
          if (!(await confirmDlg(`Excluir o projeto "${p.titulo}"?`))) return;
          const { data: fs } = await sb.from('projeto_anexos').select('caminho').eq('projeto_id', p.id);
          if (await run(sb.from('projetos').delete().eq('id', p.id), 'Projeto excluído.')) {
            if (fs?.length) await sb.storage.from(BUCKET).remove(fs.map((x) => x.caminho));
            list.splice(list.indexOf(p), 1); draw();
          }
        } }, 'Excluir')));
  };

  // ---- Métricas de fluxo (últimos 30 dias) ----
  const DAY = 864e5;
  const stats = h('div', { class: 'kstats', 'aria-label': 'Métricas de fluxo' });
  const drawStats = () => {
    const now = Date.now();
    const doneAt = (p) => (p.concluido_em ? new Date(p.concluido_em).getTime() : null);
    const done30 = list.filter((p) => doneAt(p) && doneAt(p) >= now - 30 * DAY);
    const leads = done30.filter((p) => p.iniciado_em).map((p) => (doneAt(p) - new Date(p.iniciado_em).getTime()) / DAY);
    const avg = leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null;
    const weeks = [3, 2, 1, 0].map((i) => list.filter((p) => doneAt(p) && doneAt(p) >= now - (i + 1) * 7 * DAY && doneAt(p) < now - i * 7 * DAY).length);
    const max = Math.max(1, ...weeks);
    const tile = (v, l, warn) => h('div', { class: 'ktile' + (warn ? ' warn' : '') }, h('b', {}, String(v)), h('span', {}, l));
    stats.replaceChildren(
      tile(list.filter((p) => p.status === 'andamento').length, 'em andamento'),
      tile(list.filter((p) => p.bloqueado && p.status !== 'concluido').length, 'bloqueados', list.some((p) => p.bloqueado && p.status !== 'concluido')),
      tile(done30.length, 'entregues em 30 dias'),
      tile(avg == null ? '—' : avg.toFixed(1).replace('.', ',') + ' d', 'lead time médio'),
      h('div', { class: 'ktile kweeks', role: 'img', 'aria-label': `Entregas por semana, da mais antiga à atual: ${weeks.join(', ')}` },
        h('div', { class: 'bars4' }, weeks.map((n) => h('i', { style: `height:${Math.max(6, (n / max) * 100)}%`, title: `${n} entrega(s)` }))), h('span', {}, 'entregas por semana (4 sem.)')));
  };

  // ---- Quadro com limite de WIP e filtro de ciclo ----
  function draw() {
    const q = f.q.toLowerCase();
    const shown = list.filter((p) => (!f.resp || p.responsavel_id === f.resp)
      && (!f.ciclo || (f.ciclo === 'none' ? !p.ciclo_id : p.ciclo_id === f.ciclo))
      && (!q || [p.titulo, p.cliente, p.descricao].join(' ').toLowerCase().includes(q)));
    board.replaceChildren(...Object.entries(PROJ_STATUS).map(([st, label]) => {
      const items = shown.filter((p) => p.status === st);
      const total = list.filter((p) => p.status === st).length, lim = wip[st];
      const over = lim != null && total > lim;
      const col = h('section', { class: 'kcol' + (over ? ' wip-over' : ''), 'aria-label': label,
        ondragover: (e) => { if (canEdit) { e.preventDefault(); col.classList.add('over'); } },
        ondragleave: () => col.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); col.classList.remove('over'); const p = list.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (p && canEdit) move(p, st); } },
        h('h2', {}, label, h('span', { class: 'small muted' }, lim != null ? ` ${total}/${lim}` : ` ${items.length}`)),
        over && h('p', { class: 'small', style: 'color:#ff9b8a', role: 'status' }, `Acima do limite (${lim}). Termine algo antes de começar outro.`),
        items.length ? items.map(card) : h('p', { class: 'small muted' }, 'Vazio'));
      return col;
    }));
    drawStats();
  }

  // ---- Limites de WIP ----
  const openWip = () => {
    const inputs = Object.fromEntries(Object.keys(PROJ_STATUS).map((st) => [st, h('input', { type: 'number', min: 1, max: 99, 'aria-label': 'Limite de ' + PROJ_STATUS[st], value: wip[st] ?? '', placeholder: 'sem limite', style: 'width:140px' })]));
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    modal('Limites de itens por coluna (WIP)', h('div', {},
      h('p', { class: 'small muted' }, 'Quando uma coluna passa do limite, ela fica destacada. É um aviso para a equipe terminar antes de começar mais, não um bloqueio. Deixe vazio para não limitar.'),
      Object.entries(PROJ_STATUS).map(([st, l]) => h('div', { class: 'row between', style: 'margin-top:10px' }, h('label', { style: 'margin:0' }, l), inputs[st])), err),
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
  const drawCicloSel = () => {
    cicloSlot.replaceChildren(ciclos.length ? h('select', { 'aria-label': 'Filtrar por ciclo', onchange: (e) => { f.ciclo = e.target.value; draw(); } },
      h('option', { value: '' }, 'Todos os ciclos'), h('option', { value: 'none', selected: f.ciclo === 'none' }, 'Sem ciclo'),
      ciclos.map((c) => h('option', { value: c.id, selected: f.ciclo === c.id }, c.nome + (c.encerrado ? ' (encerrado)' : '')))) : null);
  };
  const iso = (d) => d.toLocaleDateString('sv-SE');
  const openCiclos = () => {
    const body = h('div');
    const paint = () => body.replaceChildren(ciclos.length ? h('ul', { class: 'ul-list' }, ciclos.map((c) => {
      const mine = list.filter((p) => p.ciclo_id === c.id), done = mine.filter((p) => p.status === 'concluido').length;
      return h('li', {}, h('div', { class: 'row between' }, h('b', {}, c.nome), h('span', { class: 'badge' + (c.encerrado ? ' dim' : ' ok') }, c.encerrado ? 'Encerrado' : 'Aberto')),
        h('p', { class: 'small muted' }, `${fmtDate(c.inicio + 'T12:00')} a ${fmtDate(c.fim + 'T12:00')} · ${done} de ${mine.length} concluído(s)`),
        c.meta && h('p', { class: 'small' }, 'Meta: ' + c.meta),
        c.retro_manter && h('p', { class: 'small' }, h('b', {}, 'Manter: '), c.retro_manter),
        c.retro_mudar && h('p', { class: 'small' }, h('b', {}, 'Mudar: '), c.retro_mudar),
        canEdit && h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn sm', onclick: () => formModal({ title: (c.encerrado ? 'Retrospectiva — ' : 'Encerrar e fazer retrospectiva — ') + c.nome, submitLabel: c.encerrado ? 'Salvar' : 'Encerrar ciclo',
            fields: [{ name: 'retro_manter', label: 'O que funcionou e vamos manter?', type: 'textarea', value: c.retro_manter }, { name: 'retro_mudar', label: 'O que vamos mudar no próximo ciclo?', type: 'textarea', value: c.retro_mudar }],
            onSubmit: async (v) => { const r = await run(sb.from('projeto_ciclos').update({ ...v, encerrado: true }).eq('id', c.id).select().single(), 'Ciclo encerrado.'); if (!r) return false; Object.assign(c, r); paint(); drawCicloSel(); draw(); } }) }, c.encerrado ? 'Editar retrospectiva' : 'Encerrar ciclo'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!(await confirmDlg(`Excluir o ciclo "${c.nome}"? Os projetos ficam sem ciclo.`))) return;
            if (await run(sb.from('projeto_ciclos').delete().eq('id', c.id), 'Ciclo excluído.')) { ciclos.splice(ciclos.indexOf(c), 1); list.forEach((p) => { if (p.ciclo_id === c.id) p.ciclo_id = null; }); if (f.ciclo === c.id) f.ciclo = ''; paint(); drawCicloSel(); draw(); }
          } }, 'Excluir')));
    })) : h('p', { class: 'small muted' }, 'Nenhum ciclo ainda. Ciclos de 2 semanas ajudam a planejar o que entra e a revisar o que funcionou.'));
    paint();
    modal('Ciclos', h('div', {}, canEdit && h('button', { class: 'btn primary sm', style: 'margin-bottom:14px', onclick: () => {
      const hoje = new Date(), fim = new Date(Date.now() + 13 * DAY);
      formModal({ title: 'Novo ciclo', fields: [
        { name: 'nome', label: 'Nome', required: true, value: `Ciclo ${ciclos.length + 1}` },
        { name: 'inicio', label: 'Início', type: 'date', required: true, value: iso(hoje) },
        { name: 'fim', label: 'Fim', type: 'date', required: true, value: iso(fim) },
        { name: 'meta', label: 'Meta do ciclo', type: 'textarea' }],
      onSubmit: async (v) => {
        if (v.fim < v.inicio) { toast('A data final precisa ser depois da inicial.', true); return false; }
        const r = await run(sb.from('projeto_ciclos').insert(v).select().single(), 'Ciclo criado.');
        if (!r) return false; ciclos.unshift(r); paint(); drawCicloSel();
      } });
    } }, icon('plus'), 'Novo ciclo'), body), (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
  };

  const newBtn = canEdit && h('button', { class: 'btn primary', onclick: () => formModal({ title: 'Novo projeto', fields: fields(), onSubmit: async (v) => {
    const r = await run(sb.from('projetos').insert(v).select().single(), 'Projeto criado.');
    if (!r) return false; list.unshift(r); draw();
  } }) }, icon('plus'), 'Novo projeto');

  view.append(pageHead('Projetos', 'Quadro de projetos', 'Arraste os cartões entre as colunas ou use o seletor de status.', newBtn,
    h('button', { class: 'btn', onclick: openCiclos }, 'Ciclos'), canEdit && h('button', { class: 'btn', onclick: openWip }, 'Limites WIP')),
    stats,
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: 'Buscar projeto ou cliente…', 'aria-label': 'Buscar', oninput: (e) => { f.q = e.target.value; draw(); } }),
      h('select', { 'aria-label': 'Filtrar por responsável', onchange: (e) => { f.resp = e.target.value; draw(); } }, h('option', { value: '' }, 'Todos os responsáveis'), team.map((t) => h('option', { value: t.id }, t.nome))),
      cicloSlot),
    list.length || canEdit ? board : empty('Nenhum projeto ainda.'));
  drawCicloSel();
  draw();
});
