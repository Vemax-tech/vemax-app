// Projeto x cliente: link de acompanhamento, atualizações públicas/internas e avaliação pós-entrega
import { sb } from '../supabase.js';
import { h, run, modal, confirmDlg, toast, fmtDate, copyText } from '../ui.js';

// O portal está em /app/<módulo>/; as páginas públicas ficam na raiz do site.
const pub = (file, token) => new URL(`../../${file}?t=${token}`, location.href).href;
const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** p: linha de projetos (atualizada em memória). onChange(): redesenha o quadro. */
export async function openCliente(p, { canEdit, canPortfolio, onChange }) {
  const [ups, avs] = await Promise.all([
    run(sb.from('projeto_updates').select('*').eq('projeto_id', p.id).order('criado_em', { ascending: false })),
    run(sb.from('avaliacoes').select('*').eq('projeto_id', p.id).order('criado_em', { ascending: false })),
  ]);
  const updates = ups || [], avaliacoes = avs || [];
  const body = h('div');

  const setToken = async (token) => {
    const r = await run(sb.from('projetos').update({ token_cliente: token }).eq('id', p.id).select().single(), token ? 'Link de acompanhamento ativado.' : 'Link desativado.');
    if (r) { Object.assign(p, r); onChange?.(); paint(); }
  };

  // Leva o comentário autorizado para o campo "depoimento" de um case do portfólio.
  const usarNoPortfolio = async (a) => {
    const cases = await run(sb.from('portfolio_cases').select('id,titulo,depoimento').order('criado_em', { ascending: false }));
    if (!cases) return;
    if (!cases.length) { toast('Crie um case no módulo Portfólio primeiro.', true); return; }
    const texto = a.comentario.length > 600 ? a.comentario.slice(0, 597) + '…' : a.comentario;
    const autor = (a.nome || '').trim();
    const sel = h('select', { 'aria-label': 'Case do portfólio' }, cases.map((k) => h('option', { value: k.id }, k.titulo + (k.depoimento ? ' (já tem depoimento)' : ''))));
    modal('Usar como depoimento', h('div', {},
      h('p', { class: 'small muted' }, 'O cliente autorizou o uso deste comentário no site. Revise antes de publicar.'),
      h('blockquote', { class: 'pf-quote', style: 'margin:12px 0' }, '“' + texto + '”', autor && h('div', { class: 'small muted', style: 'margin-top:6px' }, '— ' + autor)),
      a.comentario.length > 600 && h('p', { class: 'small', style: 'color:#ff9b8a' }, 'O comentário passa de 600 caracteres e será cortado.'),
      !autor && h('p', { class: 'small', style: 'color:#ff9b8a' }, 'O cliente não informou o nome: o depoimento ficará sem autor.'),
      h('label', {}, 'Em qual case?'), sel),
    (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: async () => {
        const alvo = cases.find((k) => k.id === sel.value);
        if (alvo.depoimento && !(await confirmDlg('Esse case já tem um depoimento. Substituir?'))) return;
        if (await run(sb.from('portfolio_cases').update({ depoimento: texto, depoimento_autor: autor.slice(0, 120) }).eq('id', alvo.id), 'Depoimento salvo no case. Publique o case para aparecer no site.')) close();
      } }, 'Usar no case')));
  };

  const sec = (title, ...kids) => h('section', { style: 'margin-top:20px' }, h('h3', { style: 'margin-bottom:8px' }, title), ...kids);

  const linkBox = () => sec('Acompanhamento pelo cliente',
    p.token_cliente
      ? h('div', {},
        h('p', { class: 'small muted' }, 'Quem tiver este link vê o andamento e as atualizações marcadas como públicas. Não mostramos anexos nem notas internas.'),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn sm primary', onclick: () => copyText(pub('acompanhar.html', p.token_cliente)) }, 'Copiar link'),
          h('a', { class: 'btn sm', href: pub('acompanhar.html', p.token_cliente), target: '_blank', rel: 'noopener' }, 'Abrir'),
          canEdit && h('button', { class: 'btn sm', onclick: async () => { if (await confirmDlg('Gerar um novo link? O anterior deixa de funcionar.')) setToken(newToken()); } }, 'Gerar novo link'),
          canEdit && h('button', { class: 'btn sm danger', onclick: () => setToken(null) }, 'Desativar')))
      : h('div', {}, h('p', { class: 'small muted' }, 'Link desativado. Ative para o cliente acompanhar o projeto sem precisar de login.'),
        canEdit && h('button', { class: 'btn sm primary', style: 'margin-top:8px', onclick: () => setToken(newToken()) }, 'Ativar link')));

  const updBox = () => {
    const txt = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': 'Nova atualização', placeholder: 'O que aconteceu? Ex.: Protótipo aprovado, iniciamos o desenvolvimento.' });
    const vis = h('input', { type: 'checkbox', checked: true, style: 'width:auto' });
    const add = h('button', { class: 'btn sm primary', onclick: async () => {
      const texto = txt.value.trim(); if (!texto) { toast('Escreva a atualização.', true); return; }
      add.disabled = true;
      const r = await run(sb.from('projeto_updates').insert({ projeto_id: p.id, texto, publico: vis.checked }).select().single(), 'Atualização registrada.');
      add.disabled = false;
      if (r) { updates.unshift(r); paint(); }
    } }, 'Registrar');
    return sec('Atualizações',
      canEdit && h('div', { style: 'display:grid;gap:8px;margin-bottom:12px' }, txt,
        h('div', { class: 'row between' }, h('label', { class: 'chk', style: 'margin:0' }, vis, h('span', {}, 'Visível ao cliente')), add)),
      updates.length ? h('ul', { class: 'ul-list' }, updates.map((u) => h('li', {},
        h('div', { class: 'row between' }, h('span', { class: 'small muted' }, fmtDate(u.criado_em)), h('span', { class: 'badge' + (u.publico ? '' : ' dim') }, u.publico ? 'Público' : 'Interno')),
        h('p', {}, u.texto),
        canEdit && h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: async () => { const r = await run(sb.from('projeto_updates').update({ publico: !u.publico }).eq('id', u.id).select().single()); if (r) { Object.assign(u, r); paint(); } } }, u.publico ? 'Tornar interna' : 'Tornar pública'),
          h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Excluir esta atualização?') && await run(sb.from('projeto_updates').delete().eq('id', u.id))) { updates.splice(updates.indexOf(u), 1); paint(); } } }, 'Excluir'))))) : h('p', { class: 'small muted' }, 'Nenhuma atualização ainda.'));
  };

  const avalBox = () => sec('Avaliação pós-entrega',
    h('p', { class: 'small muted' }, 'Depois de entregar, peça uma nota de 0 a 10 e um comentário. Cada link aceita uma única resposta.'),
    canEdit && h('button', { class: 'btn sm primary', style: 'margin:8px 0', onclick: async () => {
      const r = await run(sb.from('avaliacoes').insert({ projeto_id: p.id }).select().single(), 'Link de avaliação criado.');
      if (r) { avaliacoes.unshift(r); copyText(pub('avaliar.html', r.token)); paint(); }
    } }, 'Pedir avaliação'),
    avaliacoes.length ? h('ul', { class: 'ul-list' }, avaliacoes.map((a) => h('li', {},
      h('div', { class: 'row between' },
        a.respondida_em ? h('b', {}, `Nota ${a.nota}/10`) : h('span', { class: 'small muted' }, 'Aguardando resposta'),
        h('span', { class: 'badge' + (a.respondida_em ? ' ok' : ' dim') }, a.respondida_em ? 'Respondida' : 'Pendente')),
      a.respondida_em && (a.comentario || a.nome) && h('p', { class: 'small' }, a.comentario ? `“${a.comentario}”` : '', a.nome ? ` — ${a.nome}` : ''),
      a.autoriza_depoimento && h('p', { class: 'small', style: 'color:var(--ok)' }, '✓ Autorizou usar como depoimento no site'),
      h('div', { class: 'row', style: 'margin-top:6px' },
        !a.respondida_em && h('button', { class: 'btn sm', onclick: () => copyText(pub('avaliar.html', a.token)) }, 'Copiar link'),
        a.autoriza_depoimento && a.comentario && canPortfolio && h('button', { class: 'btn sm primary', onclick: () => usarNoPortfolio(a) }, 'Usar no portfólio'),
        canEdit && h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Excluir esta avaliação?') && await run(sb.from('avaliacoes').delete().eq('id', a.id))) { avaliacoes.splice(avaliacoes.indexOf(a), 1); paint(); } } }, 'Excluir'))))) : null);

  const paint = () => body.replaceChildren(linkBox(), updBox(), avalBox());
  paint();
  modal('Cliente — ' + p.titulo, body, (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
}
