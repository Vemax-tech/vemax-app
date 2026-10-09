// Contatos do site: leads recebidos pelo formulário, com status, responsável, notas e conversão em projeto
import { sb } from '../supabase.js';
import { openPropostas } from './propostas.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, fmtDate, contactHref, CONTATO_STATUS } from '../ui.js';

const BADGE = { novo: '', em_contato: '', proposta: '', concluido: ' ok', descartado: ' dim' };

export const init = () => start('contatos/', 'Contatos do site', async (ctx, view) => {
  const canEdit = ctx.can('contatos', 'editar');
  const canProj = ctx.can('projetos', 'editar');
  const [rows, equipe, projs] = await Promise.all([
    run(sb.from('contatos_site').select('*').order('criado_em', { ascending: false })),
    run(sb.from('profiles').select('id,nome').eq('ativo', true).order('nome')),
    ctx.can('projetos') ? sb.from('projetos').select('id,contato_id').not('contato_id', 'is', null).then((r) => r.data || []) : [],
  ]);
  const list = rows || [], team = equipe || [];
  const nameOf = (id) => team.find((t) => t.id === id)?.nome || '—';
  const hasProj = (c) => projs.some((p) => p.contato_id === c.id);
  const f = { q: '', status: '', view: 'lista' };
  const body = h('div'), chips = h('div', { class: 'row', style: 'margin-bottom:16px' });

  const edit = (c) => formModal({
    title: 'Contato — ' + c.nome,
    fields: [
      { name: 'status', label: 'Status', type: 'select', value: c.status, options: Object.entries(CONTATO_STATUS) },
      { name: 'responsavel_id', label: 'Responsável', type: 'select', nullable: true, value: c.responsavel_id, options: [['', '— ninguém —'], ...team.map((t) => [t.id, t.nome])] },
      { name: 'notas', label: 'Notas internas', type: 'textarea', value: c.notas },
    ],
    onSubmit: async (v) => {
      const r = await run(sb.from('contatos_site').update(v).eq('id', c.id).select().single(), 'Contato atualizado.');
      if (!r) return false; Object.assign(c, r); draw();
    },
  });

  const convert = async (c) => {
    if (!(await confirmDlg(`Criar um projeto a partir do contato de ${c.nome}?`))) return;
    const descricao = [c.mensagem, c.problema && 'Problema: ' + c.problema, c.solucao_sugerida && 'Solução sugerida: ' + c.solucao_sugerida].filter(Boolean).join('\n\n');
    const p = await run(sb.from('projetos').insert({ titulo: 'Projeto — ' + c.nome, cliente: c.nome, contato_id: c.id, descricao, responsavel_id: c.responsavel_id }).select('id').single(), 'Projeto criado.');
    if (!p) return;
    projs.push({ id: p.id, contato_id: c.id });
    if (c.status === 'novo') { const r = await run(sb.from('contatos_site').update({ status: 'em_contato' }).eq('id', c.id).select().single()); if (r) Object.assign(c, r); }
    draw();
  };

  const perfilBadges = (c) => c.perfil && h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, ['segmento', 'porte', 'prazo', 'orcamento'].filter((k) => c.perfil[k]).map((k) => h('span', { class: 'badge' + (k === 'prazo' && c.perfil[k] === 'O quanto antes' ? ' warn' : ' dim') }, String(c.perfil[k]).slice(0, 40))));
  const move = async (c, st) => { const r = await run(sb.from('contatos_site').update({ status: st }).eq('id', c.id).select().single(), 'Lead movido.'); if (r) { Object.assign(c, r); draw(); } };
  const leadCard = (c) => h('article', { class: 'kcard', draggable: canEdit ? 'true' : null, ondragstart: (e) => e.dataTransfer.setData('text/plain', c.id) },
    h('h3', {}, c.nome), h('p', { class: 'small' }, c.contato), h('p', { class: 'small muted clamp' }, c.mensagem), perfilBadges(c),
    h('p', { class: 'small muted', style: 'margin-top:6px' }, fmtDate(c.criado_em) + (nameOf(c.responsavel_id) !== '—' ? ' · ' + nameOf(c.responsavel_id) : '')),
    h('div', { class: 'row', style: 'margin-top:8px' },
      canEdit && h('button', { class: 'btn sm', onclick: () => edit(c) }, 'Gerenciar'),
      h('button', { class: 'btn sm', onclick: () => openPropostas(c, { canEdit, onChange: draw }) }, 'Propostas')));
  const funnel = (shown) => h('div', { class: 'kanban', style: 'grid-template-columns:repeat(5,minmax(230px,1fr))' }, Object.entries(CONTATO_STATUS).map(([st, label]) => {
    const items = shown.filter((c) => c.status === st);
    const col = h('section', { class: 'kcol', 'aria-label': label,
      ondragover: (e) => { if (canEdit) { e.preventDefault(); col.classList.add('over'); } },
      ondragleave: () => col.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); col.classList.remove('over'); const c = list.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (c && canEdit && c.status !== st) move(c, st); } },
      h('h2', {}, label, h('span', { class: 'small muted' }, ' ' + items.length)),
      items.length ? items.map(leadCard) : h('p', { class: 'small muted' }, 'Vazio'));
    return col;
  }));
  const viewBtn = (v, l) => h('button', { class: 'btn sm' + (f.view === v ? ' primary' : ''), 'aria-pressed': String(f.view === v), onclick: () => { f.view = v; draw(); } }, l);

  const draw = () => {
    const q = f.q.toLowerCase();
    const shown = list.filter((c) => (!f.status || c.status === f.status) && (!q || [c.nome, c.contato, c.mensagem, c.problema].join(' ').toLowerCase().includes(q)));
    chips.replaceChildren(...[['', 'Todos'], ...Object.entries(CONTATO_STATUS)].map(([v, l]) => {
      const n = v ? list.filter((c) => c.status === v).length : list.length;
      return h('button', { class: 'btn sm' + (f.status === v ? ' primary' : ''), 'aria-pressed': String(f.status === v), onclick: () => { f.status = v; draw(); } }, `${l} (${n})`);
    }));
    chips.append(h('span', { style: 'flex:1' }), viewBtn('lista', 'Lista'), viewBtn('quadro', 'Quadro'));
    if (f.view === 'quadro') { body.replaceChildren(shown.length || !list.length ? funnel(shown) : empty('Nenhum contato com esses filtros.')); return; }
    body.replaceChildren(shown.length ? h('div', { class: 'tw' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Quem', 'Mensagem', 'Status', 'Responsável', 'Recebido', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, shown.map((c) => {
        const href = contactHref(c.contato);
        return h('tr', {},
          h('td', {}, h('b', { style: 'color:var(--text)' }, c.nome), h('div', { class: 'small' }, href ? h('a', { class: 't', href, target: '_blank', rel: 'noopener noreferrer' }, c.contato) : c.contato)),
          h('td', { style: 'max-width:420px' }, h('div', {}, c.mensagem),
            c.problema && h('div', { class: 'small muted' }, 'Problema: ' + c.problema),
            c.solucao_sugerida && h('div', { class: 'small muted' }, 'Sugestão: ' + c.solucao_sugerida),
            c.perfil && h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, ['segmento', 'porte', 'prazo', 'orcamento'].filter((k) => c.perfil[k]).map((k) => h('span', { class: 'badge' + (k === 'prazo' && c.perfil[k] === 'O quanto antes' ? ' warn' : ' dim') }, String(c.perfil[k]).slice(0, 40)))),
            c.notas && h('div', { class: 'small', style: 'color:var(--amber-hi)' }, 'Nota: ' + c.notas)),
          h('td', {}, h('span', { class: 'badge' + BADGE[c.status] }, CONTATO_STATUS[c.status])),
          h('td', {}, nameOf(c.responsavel_id)),
          h('td', {}, fmtDate(c.criado_em)),
          h('td', {}, h('div', { class: 'row' },
            canEdit && h('button', { class: 'btn sm', onclick: () => edit(c) }, 'Gerenciar'),
            h('button', { class: 'btn sm', onclick: () => openPropostas(c, { canEdit, onChange: draw }) }, 'Propostas'),
            canEdit && canProj && (hasProj(c) ? h('a', { class: 'btn sm', href: '../projetos/' }, 'Ver projeto') : h('button', { class: 'btn sm primary', onclick: () => convert(c) }, 'Converter em projeto')),
            ctx.isAdmin && h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Excluir este contato definitivamente?') && await run(sb.from('contatos_site').delete().eq('id', c.id), 'Contato excluído.')) { list.splice(list.indexOf(c), 1); draw(); } } }, 'Excluir'))));
      })))) : empty(list.length ? 'Nenhum contato com esses filtros.' : 'Nenhum contato recebido ainda.'));
  };

  view.append(pageHead('Contatos do site', 'Leads do site', 'Mensagens enviadas pelo formulário do site institucional.'), chips,
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Buscar por nome, contato ou mensagem…', 'aria-label': 'Buscar', oninput: (e) => { f.q = e.target.value; draw(); } })), body);
  draw();
});
