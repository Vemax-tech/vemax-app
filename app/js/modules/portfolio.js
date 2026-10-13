// Portfólio: cases exibidos no site institucional (publicar/ocultar, imagem, etapas, depoimento)
import { sb } from '../supabase.js';
import { validarArquivo, mensagemErro } from '../validacao.js';
import { start, h, run, pageHead, empty, modal, confirmDlg, toast, fmtDate } from '../ui.js';

const BUCKET = 'portfolio';
const ETAPAS = ['Entendemos', 'Pensamos', 'Construímos', 'Evoluímos'];
const TIPOS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugify = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const publicUrl = (p) => sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;

export const init = () => start('portfolio/', 'Portfólio', async (ctx, view) => {
  const canEdit = ctx.can('portfolio', 'editar');
  const list = (await run(sb.from('portfolio_cases').select('*').order('ordem').order('criado_em', { ascending: false }))) || [];
  const segmentos = () => [...new Set(list.map((c) => c.segmento).filter(Boolean))];
  const body = h('div');

  const form = (c) => {
    const isNew = !c;
    c = c || { etapas: [], tags: [], ordem: list.length, publicado: false, ilustrativo: false };
    const et = ETAPAS.map((t, i) => c.etapas[i] || { titulo: t, texto: '', duracao: '' });
    const f = {};
    const field = (name, label, props = {}, tag = 'input') => {
      const id = 'pf_' + name;
      f[name] = h(tag, { id, name, value: props.value ?? c[name] ?? '', maxlength: props.max, type: tag === 'input' ? (props.type || 'text') : null, rows: props.rows, list: props.list, placeholder: props.ph, ...(props.attrs || {}) });
      return [h('label', { for: id }, label + (props.required ? ' *' : '')), f[name], props.hint && h('p', { class: 'small muted' }, props.hint)];
    };
    const check = (name, label, hint) => h('label', { class: 'chk' }, f[name] = h('input', { type: 'checkbox', checked: c[name] }), h('span', {}, h('b', {}, label), hint && h('small', { class: 'muted' }, ' — ' + hint)));
    const etRows = et.map((e, i) => h('div', { class: 'et' },
      h('b', {}, `${i + 1}. ${ETAPAS[i]}`),
      f['et_t' + i] = h('textarea', { 'aria-label': `O que foi feito em "${ETAPAS[i]}"`, rows: 2, maxlength: 300, placeholder: 'O que fizemos nesta etapa', value: e.texto }),
      f['et_d' + i] = h('input', { 'aria-label': `Duração de "${ETAPAS[i]}"`, maxlength: 30, placeholder: 'Duração (ex.: 3 dias)', value: e.duracao || '' })));
    f.arquivo = h('input', { id: 'pf_arquivo', type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    f.rmImg = h('input', { type: 'checkbox' });

    const box = h('form', { novalidate: true, class: 'pfform' },
      ...field('titulo', 'Título', { required: true, max: 140 }),
      ...field('segmento', 'Segmento', { max: 60, list: 'pf_segs', ph: 'Ex.: Comércio, Clínicas, Condomínios' }),
      h('datalist', { id: 'pf_segs' }, segmentos().map((s) => h('option', { value: s }))),
      ...field('slug', 'Endereço da página (slug)', { max: 80, ph: 'gerado a partir do título', hint: 'Só letras minúsculas, números e hífen. Vira portfolio/caso.html?c=…' }),
      ...field('problema', 'Problema', { rows: 2, max: 600 }, 'textarea'),
      ...field('solucao', 'Solução', { rows: 2, max: 600 }, 'textarea'),
      ...field('resultado', 'Resultado', { rows: 2, max: 600, hint: 'Só afirme o que puder ser comprovado. Prefira números reais.' }, 'textarea'),
      ...field('antes', 'Antes (frase curta)', { max: 200, ph: 'Ex.: Planilhas e mensagens soltas' }),
      ...field('depois', 'Depois (frase curta)', { max: 200, ph: 'Ex.: Um painel com tudo integrado' }),
      h('h3', { style: 'margin:18px 0 4px' }, 'Processo'), ...etRows,
      ...field('historia', 'História completa (página do case)', { rows: 6, max: 8000, hint: 'Separe os parágrafos com uma linha em branco.' }, 'textarea'),
      ...field('tags', 'Tags (separadas por vírgula)', { value: c.tags.join(', '), ph: 'Sistema, Dashboard, Automação' }),
      h('label', { for: 'pf_arquivo' }, 'Imagem do projeto'),
      c.imagem_path && h('div', { class: 'pfimg' }, h('img', { src: publicUrl(c.imagem_path), alt: 'Imagem atual', width: 160 }), h('label', { class: 'chk' }, f.rmImg, h('span', {}, 'Remover imagem atual'))),
      f.arquivo, h('p', { class: 'small muted' }, 'PNG, JPG ou WebP, até 5 MB. Proporção 16:10 fica melhor. Não use dados sensíveis de clientes.'),
      ...field('depoimento', 'Depoimento do cliente (opcional)', { rows: 2, max: 600 }, 'textarea'),
      ...field('depoimento_autor', 'Autor do depoimento', { max: 120, ph: 'Nome, cargo, empresa' }),
      ...field('ordem', 'Ordem na página (menor aparece primeiro)', { type: 'number' }),
      check('publicado', 'Publicar no site', 'visível para qualquer visitante'),
      check('ilustrativo', 'Case ilustrativo', 'mostra o selo "Case ilustrativo"; marque se não for um cliente real'));
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    box.append(err);
    return { box, f, err, c, isNew };
  };

  const open = (existing) => {
    const { box, f, err, c, isNew } = form(existing);
    modal(isNew ? 'Novo case' : 'Editar case', box, (close) => {
      const save = h('button', { class: 'btn primary', type: 'button' }, 'Salvar');
      const fail = (m, el) => { err.textContent = m; err.hidden = false; el?.focus(); };
      const go = async () => {
        const v = (k) => f[k].value.trim();
        if (!v('titulo')) return fail('Preencha o título.', f.titulo);
        const slug = v('slug') || slugify(v('titulo'));
        if (!SLUG.test(slug)) return fail('Endereço inválido: use letras minúsculas, números e hífen.', f.slug);
        const file = f.arquivo.files[0];
        if (file && (!TIPOS[file.type] || file.size > 5 * 1024 * 1024)) return fail('Imagem: use PNG, JPG ou WebP de até 5 MB.', f.arquivo);
        const etapas = ETAPAS.map((t, i) => ({ titulo: t, texto: v('et_t' + i), duracao: v('et_d' + i) })).filter((e) => e.texto || e.duracao);
        const row = {
          slug, titulo: v('titulo'), segmento: v('segmento'), problema: v('problema'), solucao: v('solucao'), resultado: v('resultado'),
          antes: v('antes'), depois: v('depois'), historia: v('historia'), etapas,
          tags: v('tags').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
          depoimento: v('depoimento'), depoimento_autor: v('depoimento_autor'),
          ordem: Number(v('ordem')) || 0, publicado: f.publicado.checked, ilustrativo: f.ilustrativo.checked,
        };
        save.disabled = true; err.hidden = true;
        let novoPath = null;
        if (file) {
          const conf = validarArquivo({ name: 'imagem.' + TIPOS[file.type], size: file.size }, new Uint8Array(await file.slice(0, 512).arrayBuffer()), { permitidas: ['png', 'jpg', 'webp'], maxBytes: 5 * 1024 * 1024 });
          if (!conf.ok) { save.disabled = false; return fail(conf.erro); }       // o conteúdo precisa ser mesmo uma imagem
          novoPath = `${slug}-${Date.now()}.${TIPOS[file.type]}`;
          const up = await sb.storage.from(BUCKET).upload(novoPath, file, { contentType: file.type, upsert: false });
          if (up.error) { save.disabled = false; console.error(up.error); return fail(mensagemErro(up.error, 'Não foi possível enviar a imagem.')); }
          row.imagem_path = novoPath;
        } else if (f.rmImg.checked) row.imagem_path = null;

        const q = isNew ? sb.from('portfolio_cases').insert(row) : sb.from('portfolio_cases').update(row).eq('id', c.id);
        const { data, error } = await q.select().single();
        save.disabled = false;
        if (error) {
          console.error(error);
          if (novoPath) sb.storage.from(BUCKET).remove([novoPath]);   // não deixa imagem órfã
          return fail(error.code === '23505' ? 'Já existe um case com esse endereço. Mude o slug.' : error.code === '42501' ? 'Sem permissão para salvar.' : mensagemErro(error, 'Não foi possível salvar.'));
        }
        if (!isNew && c.imagem_path && (novoPath || f.rmImg.checked)) sb.storage.from(BUCKET).remove([c.imagem_path]);
        toast(isNew ? 'Case criado.' : 'Case atualizado.');
        if (isNew) list.push(data); else Object.assign(c, data);
        list.sort((a, b) => a.ordem - b.ordem);
        close(); draw();
      };
      save.addEventListener('click', go);
      box.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      return h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'), save);
    });
  };

  const toggle = async (c) => {
    const r = await run(sb.from('portfolio_cases').update({ publicado: !c.publicado }).eq('id', c.id).select().single(), c.publicado ? 'Case ocultado do site.' : 'Case publicado no site.');
    if (r) { Object.assign(c, r); draw(); }
  };
  const del = async (c) => {
    if (!(await confirmDlg(`Excluir o case "${c.titulo}" definitivamente?`))) return;
    if (await run(sb.from('portfolio_cases').delete().eq('id', c.id), 'Case excluído.')) {
      if (c.imagem_path) sb.storage.from(BUCKET).remove([c.imagem_path]);
      list.splice(list.indexOf(c), 1); draw();
    }
  };

  const draw = () => {
    const pub = list.filter((c) => c.publicado).length;
    body.replaceChildren(
      h('p', { class: 'small muted', style: 'margin-bottom:12px' }, `${pub} publicado(s) de ${list.length}. ` + (pub === 0 ? 'Sem cases publicados, o site mostra 3 exemplos ilustrativos.' : 'Os contadores do site contam só cases publicados e não ilustrativos.')),
      list.length ? h('div', { class: 'tw' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Case', 'Status', 'Ordem', 'Atualizado', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, list.map((c) => h('tr', {},
          h('td', {}, h('b', { style: 'color:var(--text)' }, c.titulo), h('div', { class: 'small muted' }, [c.segmento, c.slug].filter(Boolean).join(' · '))),
          h('td', {}, h('span', { class: 'badge' + (c.publicado ? ' ok' : ' dim') }, c.publicado ? 'Publicado' : 'Rascunho'), c.ilustrativo && h('span', { class: 'badge dim', style: 'margin-left:6px' }, 'Ilustrativo')),
          h('td', {}, String(c.ordem)),
          h('td', {}, fmtDate(c.atualizado_em)),
          h('td', {}, h('div', { class: 'row' },
            c.publicado && h('a', { class: 'btn sm', href: '../../portfolio/caso.html?c=' + encodeURIComponent(c.slug), target: '_blank', rel: 'noopener' }, 'Ver no site'),
            canEdit && h('button', { class: 'btn sm', onclick: () => open(c) }, 'Editar'),
            canEdit && h('button', { class: 'btn sm', onclick: () => toggle(c) }, c.publicado ? 'Ocultar' : 'Publicar'),
            canEdit && h('button', { class: 'btn sm danger', onclick: () => del(c) }, 'Excluir'))))))))
      : empty('Nenhum case cadastrado. O site mostra exemplos ilustrativos até você publicar o primeiro.'));
  };

  view.append(pageHead('Site institucional', 'Portfólio', 'Cases exibidos na página inicial do site. Só os publicados aparecem para visitantes.',
    canEdit && h('button', { class: 'btn primary', onclick: () => open(null) }, 'Novo case')), body);
  draw();
});
