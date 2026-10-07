// Inteligência de Mercado — lista de pesquisas + modelo de prompt reutilizável
import { sb } from '../supabase.js';
import { start, h, run, pageHead, tabs, empty, formModal, confirmDlg, toast, fmtDate, STATUS, CONF, icon } from '../ui.js';

export const MERCADO_TABS = [['index.html', 'Pesquisas'], ['nichos.html', 'Nichos e comparador']];

export const init = () => start('mercado/', 'Inteligência de Mercado', async (ctx, view) => {
  const canEdit = ctx.can('mercado', 'editar');
  const [pesq, nichos, equipe] = await Promise.all([
    run(sb.from('pesquisas').select('*, nichos(nome), profiles(nome)').order('atualizado_em', { ascending: false })),
    run(sb.from('nichos').select('id,nome').order('nome')),
    run(sb.from('profiles').select('id,nome').eq('ativo', true)),
  ]);
  const list = pesq || [];
  const filters = { q: '', status: '' };
  const body = h('div');

  const fields = (p = {}) => [
    { name: 'titulo', label: 'Título', required: true, value: p.titulo },
    { name: 'nicho_id', label: 'Nicho', type: 'select', nullable: true, value: p.nicho_id, options: [['', '— sem nicho —'], ...(nichos || []).map((n) => [n.id, n.nome])] },
    { name: 'status', label: 'Status', type: 'select', value: p.status || 'planejada', options: Object.entries(STATUS) },
    { name: 'responsavel_id', label: 'Responsável', type: 'select', nullable: true, value: p.responsavel_id, options: [['', '— ninguém —'], ...(equipe || []).map((e) => [e.id, e.nome])] },
    { name: 'confianca', label: 'Nível de confiança', type: 'select', value: p.confianca || 'media', options: Object.entries(CONF) },
    { name: 'tags', label: 'Tags (separadas por vírgula)', value: (p.tags || []).join(', ') },
    { name: 'resumo', label: 'Resumo', type: 'textarea', value: p.resumo },
  ];
  const clean = (v) => ({ ...v, tags: v.tags ? v.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] });

  const render = () => {
    const q = filters.q.toLowerCase();
    const rows = list.filter((p) => (!filters.status || p.status === filters.status) &&
      (!q || [p.titulo, p.resumo, p.nichos?.nome, ...(p.tags || [])].join(' ').toLowerCase().includes(q)));
    body.replaceChildren(rows.length ? h('div', { class: 'tw' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Pesquisa', 'Nicho', 'Status', 'Responsável', 'Confiança', 'Atualizada', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((p) => h('tr', {},
        h('td', {}, h('a', { class: 't', href: 'pesquisa.html?id=' + p.id }, p.titulo), p.tags?.length ? h('div', { class: 'small muted' }, p.tags.join(' · ')) : null),
        h('td', {}, p.nichos?.nome || '—'),
        h('td', {}, h('span', { class: 'badge' + (p.status === 'concluida' ? ' ok' : '') }, STATUS[p.status])),
        h('td', {}, p.profiles?.nome || '—'),
        h('td', {}, h('span', { class: 'badge dim' }, CONF[p.confianca])),
        h('td', {}, fmtDate(p.atualizado_em)),
        h('td', {}, canEdit ? h('button', { class: 'btn sm danger', onclick: async () => {
          if (!(await confirmDlg(`Excluir a pesquisa "${p.titulo}" e seus anexos?`))) return;
          if (await run(sb.from('pesquisas').delete().eq('id', p.id), 'Pesquisa excluída.')) { list.splice(list.indexOf(p), 1); render(); }
        } }, 'Excluir') : null)))))) : empty(list.length ? 'Nenhuma pesquisa com esses filtros.' : 'Nenhuma pesquisa ainda. Crie a primeira.'));
  };

  const newBtn = canEdit && h('button', { class: 'btn primary', onclick: () => formModal({
    title: 'Nova pesquisa', fields: fields(), onSubmit: async (v) => {
      const row = await run(sb.from('pesquisas').insert(clean(v)).select('*, nichos(nome), profiles(nome)').single(), 'Pesquisa criada.');
      if (!row) return false; list.unshift(row); render();
    } }) }, icon('plus'), 'Nova pesquisa');

  view.append(pageHead('Inteligência de Mercado', 'Pesquisas estratégicas', 'Investigações de nicho com fontes verificáveis e entregáveis anexados.', newBtn),
    tabs(MERCADO_TABS, 'index.html'),
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: 'Buscar por título, nicho ou tag…', 'aria-label': 'Buscar', oninput: (e) => { filters.q = e.target.value; render(); } }),
      h('select', { 'aria-label': 'Filtrar por status', onchange: (e) => { filters.status = e.target.value; render(); } },
        h('option', { value: '' }, 'Todos os status'), Object.entries(STATUS).map(([v, l]) => h('option', { value: v }, l)))),
    body, await promptCard(ctx.isAdmin || canEdit));
  render();
});

/** Cartão do modelo de prompt: preenche [NICHO]/[REGIÃO]/[PERÍODO] e copia com um clique. */
async function promptCard(canEdit) {
  const models = (await run(sb.from('modelos_prompt').select('*').order('atualizado_em', { ascending: false }))) || [];
  const card = h('section', { class: 'card', style: 'margin-top:30px', 'aria-labelledby': 'tp' });
  if (!models.length) { card.append(h('h2', { id: 'tp' }, 'Modelo de prompt'), empty('Nenhum modelo cadastrado.')); return card; }
  let m = models[0];
  const vars = { NICHO: '', 'REGIÃO': 'todo o território nacional', 'PERÍODO': 'últimos 24 meses' };
  const pre = h('pre', { class: 'prompt' });
  const fill = () => { pre.textContent = Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`[${k}]`, v || `[${k}]`), m.corpo); };
  const inputs = h('div', { class: 'grid g3' }, Object.keys(vars).map((k) => h('div', {}, h('label', { for: 'v_' + k }, k),
    h('input', { id: 'v_' + k, value: vars[k], oninput: (e) => { vars[k] = e.target.value; fill(); } }))));
  card.append(h('div', { class: 'row between' }, h('h2', { id: 'tp' }, 'Modelo de prompt — ' + m.titulo),
    h('div', { class: 'row' },
      canEdit && h('button', { class: 'btn sm', onclick: () => formModal({ title: 'Editar modelo', fields: [
        { name: 'titulo', label: 'Título', required: true, value: m.titulo }, { name: 'corpo', label: 'Texto (use [NICHO], [REGIÃO], [PERÍODO])', type: 'textarea', required: true, value: m.corpo }],
        onSubmit: async (v) => { const r = await run(sb.from('modelos_prompt').update(v).eq('id', m.id).select().single(), 'Modelo salvo.'); if (!r) return false; m = r; fill(); card.querySelector('h2').textContent = 'Modelo de prompt — ' + m.titulo; } }) }, 'Editar'),
      h('button', { class: 'btn sm primary', onclick: async () => { try { await navigator.clipboard.writeText(pre.textContent); toast('Prompt copiado.'); } catch { toast('Não foi possível copiar automaticamente.', true); } } }, 'Copiar'))),
    inputs, h('div', { style: 'margin-top:14px' }, pre));
  fill();
  return card;
}
