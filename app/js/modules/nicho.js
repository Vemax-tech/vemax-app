// Ficha do nicho: problemas, necessidades, oportunidades, riscos, concorrentes e fontes
import { sb } from '../supabase.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, toast, fmtDate, qs, CONF, icon } from '../ui.js';

const TEXTS = [['problemas', 'Problemas reais encontrados'], ['necessidades', 'Necessidades tecnológicas não atendidas'], ['oportunidades', 'Oportunidades'], ['riscos', 'Riscos']];

// só aceita http(s) em links vindos de usuário
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const link = (u, t) => { const s = safeUrl(u); return s ? h('a', { class: 't', href: s, target: '_blank', rel: 'noopener noreferrer' }, t || s) : h('span', {}, t || u); };

export const init = () => start('mercado/', 'Ficha do nicho', async (ctx, view) => {
  const id = qs('id');
  if (!id) { view.append(empty('Nicho não informado.')); return; }
  const canEdit = ctx.can('mercado', 'editar');
  const [nicho, conc, fontes, pesq] = await Promise.all([
    run(sb.from('nichos').select('*').eq('id', id).single()),
    run(sb.from('concorrentes').select('*').eq('nicho_id', id).order('nome')),
    run(sb.from('fontes').select('*').eq('nicho_id', id).order('acessado_em', { ascending: false })),
    run(sb.from('pesquisas').select('id,titulo,status').eq('nicho_id', id)),
  ]);
  if (!nicho) { view.append(empty('Nicho não encontrado ou sem permissão.')); return; }
  const C = conc || [], F = fontes || [];

  const textCard = (key, label) => {
    const ta = h('textarea', { 'aria-label': label, value: nicho[key], disabled: !canEdit, placeholder: canEdit ? 'Registre fatos com fonte e marque inferências como tal…' : '' });
    return h('div', { class: 'card' }, h('h2', {}, label), ta, canEdit && h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn sm primary', onclick: async () => { if (await run(sb.from('nichos').update({ [key]: ta.value }).eq('id', id), 'Salvo.')) nicho[key] = ta.value; } }, 'Salvar')));
  };

  const concBox = h('div'), fonteBox = h('div');
  const drawConc = () => concBox.replaceChildren(C.length ? h('div', { class: 'tw' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Concorrente', 'O que oferece', 'Preço (se público)', 'Pontos fracos', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, C.map((c) => h('tr', {}, h('td', {}, c.site ? link(c.site, c.nome) : h('b', {}, c.nome)), h('td', {}, c.oferta), h('td', {}, c.preco || '—'), h('td', {}, c.pontos_fracos),
      h('td', {}, canEdit && h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => concForm(c) }, 'Editar'),
        h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg(`Remover ${c.nome}?`) && await run(sb.from('concorrentes').delete().eq('id', c.id))) { C.splice(C.indexOf(c), 1); drawConc(); } } }, 'Remover')))))))) : empty('Nenhum concorrente registrado.'));
  const concForm = (c = {}) => formModal({ title: c.id ? 'Editar concorrente' : 'Novo concorrente', fields: [
    { name: 'nome', label: 'Nome', required: true, value: c.nome }, { name: 'site', label: 'Site (https://…)', type: 'url', value: c.site },
    { name: 'oferta', label: 'O que oferece', type: 'textarea', value: c.oferta }, { name: 'preco', label: 'Preço (somente se público)', value: c.preco },
    { name: 'pontos_fracos', label: 'Pontos fracos', type: 'textarea', value: c.pontos_fracos }],
  onSubmit: async (v) => {
    if (v.site && !safeUrl(v.site)) { toast('Use um link começando com http:// ou https://', true); return false; }
    const r = await run(c.id ? sb.from('concorrentes').update(v).eq('id', c.id).select().single() : sb.from('concorrentes').insert({ ...v, nicho_id: id }).select().single(), 'Salvo.');
    if (!r) return false; if (c.id) C[C.findIndex((x) => x.id === c.id)] = r; else C.push(r); drawConc();
  } });

  const drawFontes = () => fonteBox.replaceChildren(F.length ? h('div', { class: 'tw' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Fonte', 'Acessada em', 'Confiabilidade', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, F.map((f) => h('tr', {}, h('td', {}, link(f.url, f.titulo)), h('td', {}, fmtDate(f.acessado_em)), h('td', {}, h('span', { class: 'badge' + (f.confiabilidade === 'alta' ? ' ok' : ' dim') }, CONF[f.confiabilidade])),
      h('td', {}, canEdit && h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Remover esta fonte?') && await run(sb.from('fontes').delete().eq('id', f.id))) { F.splice(F.indexOf(f), 1); drawFontes(); } } }, 'Remover'))))))) : empty('Nenhuma fonte cadastrada. Toda informação do nicho deve ter fonte.'));
  const fonteForm = () => formModal({ title: 'Nova fonte', fields: [
    { name: 'titulo', label: 'Título / órgão', required: true }, { name: 'url', label: 'URL (https://…)', type: 'url', required: true },
    { name: 'acessado_em', label: 'Data de acesso', type: 'date', required: true, value: new Date().toISOString().slice(0, 10) },
    { name: 'confiabilidade', label: 'Confiabilidade', type: 'select', value: 'media', options: Object.entries(CONF) }],
  onSubmit: async (v) => {
    if (!safeUrl(v.url)) { toast('Use um link começando com http:// ou https://', true); return false; }
    const r = await run(sb.from('fontes').insert({ ...v, nicho_id: id }).select().single(), 'Fonte adicionada.');
    if (!r) return false; F.unshift(r); drawFontes();
  } });

  view.append(
    pageHead('Nicho', nicho.nome, nicho.descricao || null, h('a', { class: 'btn', href: 'nichos.html' }, 'Voltar ao comparador'),
      canEdit && h('button', { class: 'btn', onclick: () => formModal({ title: 'Editar nicho', fields: [{ name: 'nome', label: 'Nome', required: true, value: nicho.nome }, { name: 'descricao', label: 'Descrição', type: 'textarea', value: nicho.descricao }],
        onSubmit: async (v) => { const r = await run(sb.from('nichos').update(v).eq('id', id).select().single(), 'Salvo.'); if (!r) return false; location.reload(); } }) }, 'Editar')),
    h('div', { class: 'grid g2' }, TEXTS.map(([k, l]) => textCard(k, l))),
    h('section', { style: 'margin-top:28px' }, h('div', { class: 'row between', style: 'margin-bottom:12px' }, h('h2', {}, 'Concorrentes'), canEdit && h('button', { class: 'btn sm primary', onclick: () => concForm() }, icon('plus'), 'Adicionar')), concBox),
    h('section', { style: 'margin-top:28px' }, h('div', { class: 'row between', style: 'margin-bottom:12px' }, h('h2', {}, 'Fontes'), canEdit && h('button', { class: 'btn sm primary', onclick: fonteForm }, icon('plus'), 'Adicionar')), fonteBox),
    h('section', { style: 'margin-top:28px' }, h('h2', { style: 'margin-bottom:12px' }, 'Pesquisas deste nicho'),
      (pesq || []).length ? h('ul', { class: 'ul-list card' }, pesq.map((p) => h('li', {}, h('a', { class: 't', href: 'pesquisa.html?id=' + p.id }, p.titulo)))) : empty('Nenhuma pesquisa vinculada.')));
  drawConc(); drawFontes();
});
