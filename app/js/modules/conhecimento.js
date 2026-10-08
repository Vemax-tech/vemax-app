// Base de conhecimento: processos, templates, prompts e documentos com busca e cópia rápida
import { sb } from '../supabase.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, copyText, fmtDate, icon } from '../ui.js';

const CATS = { processo: 'Processo', template: 'Template', prompt: 'Prompt', documento: 'Documento' };

export const init = () => start('conhecimento/', 'Base de conhecimento', async (ctx, view) => {
  const canEdit = ctx.can('conhecimento', 'editar');
  const list = (await run(sb.from('conhecimento').select('*').order('atualizado_em', { ascending: false }))) || [];
  const f = { q: '', cat: '' };
  const body = h('div', { class: 'stack' }), chips = h('div', { class: 'row', style: 'margin-bottom:16px' });

  const fields = (k = {}) => [
    { name: 'titulo', label: 'Título', required: true, value: k.titulo },
    { name: 'categoria', label: 'Categoria', type: 'select', value: k.categoria || 'processo', options: Object.entries(CATS) },
    { name: 'corpo', label: 'Conteúdo', type: 'textarea', value: k.corpo },
  ];

  const draw = () => {
    const q = f.q.toLowerCase();
    const shown = list.filter((k) => (!f.cat || k.categoria === f.cat) && (!q || (k.titulo + ' ' + k.corpo).toLowerCase().includes(q)));
    chips.replaceChildren(...[['', 'Tudo'], ...Object.entries(CATS)].map(([v, l]) =>
      h('button', { class: 'btn sm' + (f.cat === v ? ' primary' : ''), 'aria-pressed': String(f.cat === v), onclick: () => { f.cat = v; draw(); } },
        `${l} (${v ? list.filter((k) => k.categoria === v).length : list.length})`)));
    body.replaceChildren(...(shown.length ? shown.map((k) => h('details', { class: 'card kn' },
      h('summary', {}, h('b', {}, k.titulo), ' ', h('span', { class: 'badge dim' }, CATS[k.categoria]), h('span', { class: 'small muted' }, ' · atualizado ' + fmtDate(k.atualizado_em))),
      h('pre', { class: 'prompt', style: 'margin-top:12px' }, k.corpo || '(sem conteúdo)'),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn sm primary', onclick: () => copyText(k.corpo) }, 'Copiar'),
        canEdit && h('button', { class: 'btn sm', onclick: () => formModal({ title: 'Editar item', fields: fields(k), onSubmit: async (v) => {
          const r = await run(sb.from('conhecimento').update(v).eq('id', k.id).select().single(), 'Item salvo.');
          if (!r) return false; Object.assign(k, r); list.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)); draw();
        } }) }, 'Editar'),
        canEdit && h('button', { class: 'btn sm danger', onclick: async () => {
          if (await confirmDlg(`Excluir "${k.titulo}"?`) && await run(sb.from('conhecimento').delete().eq('id', k.id), 'Item excluído.')) { list.splice(list.indexOf(k), 1); draw(); }
        } }, 'Excluir')))) : [empty(list.length ? 'Nada encontrado com esses filtros.' : 'A base está vazia. Cadastre o primeiro processo, template ou prompt.')]));
  };

  const newBtn = canEdit && h('button', { class: 'btn primary', onclick: () => formModal({ title: 'Novo item', fields: fields(), onSubmit: async (v) => {
    const r = await run(sb.from('conhecimento').insert(v).select().single(), 'Item criado.');
    if (!r) return false; list.unshift(r); draw();
  } }) }, icon('plus'), 'Novo item');

  view.append(pageHead('Base de conhecimento', 'Processos, templates e prompts', 'Tudo que a equipe reutiliza, em um só lugar.', newBtn), chips,
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Buscar no título e no conteúdo…', 'aria-label': 'Buscar', oninput: (e) => { f.q = e.target.value; draw(); } })), body);
  draw();
});
