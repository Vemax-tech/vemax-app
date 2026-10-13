// Ficha da pesquisa: dados, fontes e entregáveis (Storage privado)
import { sb } from '../supabase.js';
import { validarArquivo, mensagemErro } from '../validacao.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, toast, fmtDate, qs, STATUS, CONF, icon } from '../ui.js';

const BUCKET = 'entregaveis';
const EXT = { pdf: 'pdf', xlsx: 'xlsx', pbix: 'pbix', csv: 'csv', png: 'png' };
const MAX = 50 * 1024 * 1024;
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const size = (b) => (b ? (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB') : '');

export const init = () => start('mercado/', 'Pesquisa', async (ctx, view) => {
  const id = qs('id');
  if (!id) { view.append(empty('Pesquisa não informada.')); return; }
  const canEdit = ctx.can('mercado', 'editar');
  const [p, anexos, fontes, nichos] = await Promise.all([
    run(sb.from('pesquisas').select('*, nichos(id,nome), profiles(nome)').eq('id', id).single()),
    run(sb.from('anexos').select('*').eq('pesquisa_id', id).order('criado_em', { ascending: false })),
    run(sb.from('fontes').select('*').eq('pesquisa_id', id).order('acessado_em', { ascending: false })),
    run(sb.from('nichos').select('id,nome').order('nome')),
  ]);
  if (!p) { view.append(empty('Pesquisa não encontrada ou sem permissão.')); return; }
  const A = anexos || [], F = fontes || [];

  const edit = () => formModal({ title: 'Editar pesquisa', fields: [
    { name: 'titulo', label: 'Título', required: true, value: p.titulo },
    { name: 'nicho_id', label: 'Nicho', type: 'select', nullable: true, value: p.nicho_id, options: [['', '— sem nicho —'], ...(nichos || []).map((n) => [n.id, n.nome])] },
    { name: 'status', label: 'Status', type: 'select', value: p.status, options: Object.entries(STATUS) },
    { name: 'confianca', label: 'Nível de confiança', type: 'select', value: p.confianca, options: Object.entries(CONF) },
    { name: 'tags', label: 'Tags (vírgula)', value: (p.tags || []).join(', ') },
    { name: 'resumo', label: 'Resumo', type: 'textarea', value: p.resumo }],
  onSubmit: async (v) => { const r = await run(sb.from('pesquisas').update({ ...v, tags: v.tags ? v.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] }).eq('id', id), 'Salvo.'); if (!r) return false; location.reload(); } });

  /* ---- anexos ---- */
  const aBox = h('div');
  const drawA = () => aBox.replaceChildren(A.length ? h('ul', { class: 'ul-list card' }, A.map((a) => h('li', { class: 'row between' },
    h('div', {}, h('b', {}, a.nome), h('div', { class: 'small muted' }, `${a.tipo.toUpperCase()} · ${size(a.tamanho)} · ${fmtDate(a.criado_em)}`)),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: async () => {
        if (a.tipo === 'link') { const u = safeUrl(a.url); return u ? window.open(u, '_blank', 'noopener') : toast('Link inválido.', true); }
        const r = await run(sb.storage.from(BUCKET).createSignedUrl(a.caminho, 120)); if (r) window.open(r.signedUrl, '_blank', 'noopener');
      } }, 'Abrir'),
      canEdit && h('button', { class: 'btn sm danger', onclick: async () => {
        if (!(await confirmDlg(`Excluir "${a.nome}"?`))) return;
        if (a.caminho) await sb.storage.from(BUCKET).remove([a.caminho]);
        if (await run(sb.from('anexos').delete().eq('id', a.id), 'Anexo excluído.')) { A.splice(A.indexOf(a), 1); drawA(); }
      } }, 'Excluir'))))) : empty('Nenhum entregável anexado ainda.'));

  const file = h('input', { type: 'file', accept: '.pdf,.xlsx,.pbix,.csv,.png', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!EXT[ext]) return toast('Tipo não permitido. Use pdf, xlsx, pbix, csv ou png.', true);
    if (f.size > MAX) return toast('Arquivo maior que 50 MB.', true);
    const conf = validarArquivo(f, new Uint8Array(await f.slice(0, 512).arrayBuffer()), { permitidas: Object.keys(EXT) });
    if (!conf.ok) return toast(conf.erro, true);          // confere o conteúdo real, não só a extensão
    const path = `${id}/${crypto.randomUUID()}.${ext}`;       // nome interno aleatório; nome original fica na tabela
    toast('Enviando…');
    const up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream' });
    if (up.error) return toast(mensagemErro(up.error, 'Falha no envio do arquivo.'), true);
    const row = await run(sb.from('anexos').insert({ pesquisa_id: id, tipo: EXT[ext], nome: f.name.slice(0, 160), caminho: path, tamanho: f.size }).select().single(), 'Entregável anexado.');
    if (row) { A.unshift(row); drawA(); } else await sb.storage.from(BUCKET).remove([path]);
  } });

  const addLink = () => formModal({ title: 'Anexar link', fields: [{ name: 'nome', label: 'Nome', required: true }, { name: 'url', label: 'URL (https://…)', type: 'url', required: true }],
    onSubmit: async (v) => {
      if (!safeUrl(v.url)) { toast('Use um link começando com http:// ou https://', true); return false; }
      const r = await run(sb.from('anexos').insert({ pesquisa_id: id, tipo: 'link', ...v }).select().single(), 'Link anexado.'); if (!r) return false; A.unshift(r); drawA();
    } });

  /* ---- fontes ---- */
  const fBox = h('div');
  const drawF = () => fBox.replaceChildren(F.length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Fonte', 'Acesso', 'Confiabilidade', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, F.map((f) => h('tr', {}, h('td', {}, safeUrl(f.url) ? h('a', { class: 't', href: safeUrl(f.url), target: '_blank', rel: 'noopener noreferrer' }, f.titulo) : f.titulo), h('td', {}, fmtDate(f.acessado_em)),
      h('td', {}, h('span', { class: 'badge dim' }, CONF[f.confiabilidade])),
      h('td', {}, canEdit && h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Remover fonte?') && await run(sb.from('fontes').delete().eq('id', f.id))) { F.splice(F.indexOf(f), 1); drawF(); } } }, 'Remover'))))))) : empty('Sem fontes. Cite URL e data de acesso de cada fonte.'));
  const addF = () => formModal({ title: 'Nova fonte', fields: [{ name: 'titulo', label: 'Título / órgão', required: true }, { name: 'url', label: 'URL', type: 'url', required: true },
    { name: 'acessado_em', label: 'Data de acesso', type: 'date', required: true, value: new Date().toISOString().slice(0, 10) }, { name: 'confiabilidade', label: 'Confiabilidade', type: 'select', value: 'media', options: Object.entries(CONF) }],
  onSubmit: async (v) => { if (!safeUrl(v.url)) { toast('Use um link http(s).', true); return false; } const r = await run(sb.from('fontes').insert({ ...v, pesquisa_id: id }).select().single(), 'Fonte adicionada.'); if (!r) return false; F.unshift(r); drawF(); } });

  view.append(
    pageHead('Pesquisa', p.titulo, null, h('a', { class: 'btn', href: './' }, 'Voltar'), canEdit && h('button', { class: 'btn primary', onclick: edit }, 'Editar')),
    h('div', { class: 'card' }, h('div', { class: 'row' },
      h('span', { class: 'badge' + (p.status === 'concluida' ? ' ok' : '') }, STATUS[p.status]), h('span', { class: 'badge dim' }, 'Confiança ' + CONF[p.confianca].toLowerCase()),
      p.nichos ? h('a', { class: 'badge', href: 'nicho.html?id=' + p.nichos.id }, 'Nicho: ' + p.nichos.nome) : null,
      p.profiles ? h('span', { class: 'small' }, 'Resp.: ' + p.profiles.nome) : null, h('span', { class: 'small' }, 'Atualizada em ' + fmtDate(p.atualizado_em)),
      ...(p.tags || []).map((t) => h('span', { class: 'badge dim' }, '#' + t))),
      h('p', { style: 'margin-top:14px;white-space:pre-wrap' }, p.resumo || 'Sem resumo ainda.')),
    h('section', { style: 'margin-top:28px' }, h('div', { class: 'row between', style: 'margin-bottom:12px' }, h('h2', {}, 'Entregáveis'),
      canEdit && h('div', { class: 'row' }, file, h('button', { class: 'btn sm primary', onclick: () => file.click() }, icon('plus'), 'Enviar arquivo'), h('button', { class: 'btn sm', onclick: addLink }, 'Anexar link'))),
      h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Relatório PDF, planilha Excel com dashboard, arquivo Power BI (.pbix), CSV ou imagem — até 50 MB.'), aBox),
    h('section', { style: 'margin-top:28px' }, h('div', { class: 'row between', style: 'margin-bottom:12px' }, h('h2', {}, 'Fontes da pesquisa'), canEdit && h('button', { class: 'btn sm primary', onclick: addF }, icon('plus'), 'Adicionar')), fBox));
  drawA(); drawF();
});
