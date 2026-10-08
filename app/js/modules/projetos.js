// Projetos: quadro kanban por status, prazos, responsáveis e anexos de entregáveis
import { sb } from '../supabase.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, modal, fmtDate, overdue, toast, icon, PROJ_STATUS } from '../ui.js';

const BUCKET = 'projetos';
const MAX = 50 * 1024 * 1024;

export const init = () => start('projetos/', 'Projetos', async (ctx, view) => {
  const canEdit = ctx.can('projetos', 'editar');
  const [rows, equipe, nichos] = await Promise.all([
    run(sb.from('projetos').select('*').order('prazo', { ascending: true, nullsFirst: false })),
    run(sb.from('profiles').select('id,nome').eq('ativo', true).order('nome')),
    ctx.can('mercado') ? run(sb.from('nichos').select('id,nome').order('nome')) : [],
  ]);
  const list = rows || [], team = equipe || [], N = nichos || [];
  const nameOf = (id) => team.find((t) => t.id === id)?.nome;
  const nicheOf = (id) => N.find((n) => n.id === id)?.nome;
  const f = { q: '', resp: '' };
  const board = h('div', { class: 'kanban' });

  const fields = (p = {}) => [
    { name: 'titulo', label: 'Título', required: true, value: p.titulo },
    { name: 'cliente', label: 'Cliente', value: p.cliente },
    { name: 'status', label: 'Status', type: 'select', value: p.status || 'planejado', options: Object.entries(PROJ_STATUS) },
    { name: 'responsavel_id', label: 'Responsável', type: 'select', nullable: true, value: p.responsavel_id, options: [['', '— ninguém —'], ...team.map((t) => [t.id, t.nome])] },
    { name: 'prazo', label: 'Prazo', type: 'date', nullable: true, value: p.prazo },
    ...(N.length ? [{ name: 'nicho_id', label: 'Nicho de mercado', type: 'select', nullable: true, value: p.nicho_id, options: [['', '— nenhum —'], ...N.map((n) => [n.id, n.nome])] }] : []),
    { name: 'descricao', label: 'Descrição', type: 'textarea', value: p.descricao },
  ];

  const move = async (p, status) => {
    if (p.status === status) return;
    const r = await run(sb.from('projetos').update({ status }).eq('id', p.id).select().single(), 'Status atualizado.');
    if (r) { Object.assign(p, r); draw(); }
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
    return h('article', { class: 'kcard', draggable: canEdit ? 'true' : null, ondragstart: (e) => e.dataTransfer.setData('text/plain', p.id) },
      h('h3', {}, p.titulo),
      p.cliente && h('p', { class: 'small' }, p.cliente),
      p.descricao && h('p', { class: 'small muted clamp' }, p.descricao),
      h('div', { class: 'row', style: 'gap:6px;margin-top:8px' },
        p.prazo && h('span', { class: 'badge' + (late ? ' warn' : ' dim') }, (late ? 'Atrasado · ' : 'Prazo ') + fmtDate(p.prazo + 'T12:00')),
        nameOf(p.responsavel_id) && h('span', { class: 'badge dim' }, nameOf(p.responsavel_id)),
        nicheOf(p.nicho_id) && h('span', { class: 'badge dim' }, nicheOf(p.nicho_id))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        canEdit && h('select', { class: 'sm', 'aria-label': 'Mover ' + p.titulo, onchange: (e) => move(p, e.target.value) },
          Object.entries(PROJ_STATUS).map(([v, l]) => h('option', { value: v, selected: v === p.status }, l))),
        h('button', { class: 'btn sm', onclick: () => anexos(p) }, 'Anexos'),
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

  function draw() {
    const q = f.q.toLowerCase();
    const shown = list.filter((p) => (!f.resp || p.responsavel_id === f.resp) && (!q || [p.titulo, p.cliente, p.descricao].join(' ').toLowerCase().includes(q)));
    board.replaceChildren(...Object.entries(PROJ_STATUS).map(([st, label]) => {
      const items = shown.filter((p) => p.status === st);
      const col = h('section', { class: 'kcol', 'aria-label': label,
        ondragover: (e) => { if (canEdit) { e.preventDefault(); col.classList.add('over'); } },
        ondragleave: () => col.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); col.classList.remove('over'); const p = list.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (p && canEdit) move(p, st); } },
        h('h2', {}, label, h('span', { class: 'small muted' }, ` ${items.length}`)),
        items.length ? items.map(card) : h('p', { class: 'small muted' }, 'Vazio'));
      return col;
    }));
  }

  const newBtn = canEdit && h('button', { class: 'btn primary', onclick: () => formModal({ title: 'Novo projeto', fields: fields(), onSubmit: async (v) => {
    const r = await run(sb.from('projetos').insert(v).select().single(), 'Projeto criado.');
    if (!r) return false; list.unshift(r); draw();
  } }) }, icon('plus'), 'Novo projeto');

  view.append(pageHead('Projetos', 'Quadro de projetos', 'Arraste os cartões entre as colunas ou use o seletor de status.', newBtn),
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: 'Buscar projeto ou cliente…', 'aria-label': 'Buscar', oninput: (e) => { f.q = e.target.value; draw(); } }),
      h('select', { 'aria-label': 'Filtrar por responsável', onchange: (e) => { f.resp = e.target.value; draw(); } }, h('option', { value: '' }, 'Todos os responsáveis'), team.map((t) => h('option', { value: t.id }, t.nome)))),
    list.length || canEdit ? board : empty('Nenhum projeto ainda.'));
  draw();
});
