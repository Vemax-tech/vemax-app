// Propostas de um lead: criar, liberar o link privado para o cliente e acompanhar a resposta
import { sb } from '../supabase.js';
import { h, run, modal, formModal, confirmDlg, toast, fmtDate, copyText } from '../ui.js';

const ST = { rascunho: 'Rascunho', enviada: 'Enviada ao cliente', aceita: 'Aceita', recusada: 'Recusada' };
const BADGE = { rascunho: ' dim', enviada: '', aceita: ' ok', recusada: ' warn' };
const brl = (v) => (v == null ? 'A combinar' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const iso = (d) => d.toLocaleDateString('sv-SE');
// O portal está em /app/<módulo>/; a página pública fica na raiz do site.
const linkOf = (p) => new URL('../../proposta.html?t=' + p.token, location.href).href;

/** contato: linha de contatos_site (é atualizada em memória). onChange(): redesenha a tela de contatos. */
export async function openPropostas(contato, { canEdit, onChange }) {
  const list = (await run(sb.from('propostas').select('*').eq('contato_id', contato.id).order('criado_em', { ascending: false }))) || [];
  const body = h('div');

  const fields = (p = {}) => [
    { name: 'titulo', label: 'Título', required: true, value: p.titulo ?? 'Proposta — ' + contato.nome },
    { name: 'escopo', label: 'Escopo (separe os parágrafos com uma linha em branco)', type: 'textarea', value: p.escopo },
    { name: 'prazo_texto', label: 'Prazo estimado', value: p.prazo_texto, },
    { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, nullable: true, value: p.valor },
    { name: 'validade', label: 'Válida até', type: 'date', nullable: true, value: p.validade ?? iso(new Date(Date.now() + 15 * 864e5)) },
  ];
  const patch = async (p, v, msg) => {
    const r = await run(sb.from('propostas').update(v).eq('id', p.id).select().single(), msg);
    if (r) { Object.assign(p, r); paint(); }
    return r;
  };
  const liberar = async (p) => {
    if (!(await confirmDlg('Liberar o link desta proposta para o cliente? Quem tiver o link poderá ver e responder.'))) return;
    if (!(await patch(p, { status: 'enviada', enviada_em: new Date().toISOString() }, 'Link liberado.'))) return;
    if (['novo', 'em_contato'].includes(contato.status)) {
      const r = await run(sb.from('contatos_site').update({ status: 'proposta' }).eq('id', contato.id).select().single());
      if (r) { Object.assign(contato, r); onChange?.(); }
    }
    copyText(linkOf(p));
  };

  const paint = () => body.replaceChildren(list.length ? h('ul', { class: 'ul-list' }, list.map((p) => h('li', {},
    h('div', { class: 'row between' }, h('b', {}, p.titulo), h('span', { class: 'badge' + BADGE[p.status] }, ST[p.status])),
    h('p', { class: 'small muted' }, `${brl(p.valor)} · ${p.prazo_texto || 'prazo a combinar'}${p.validade ? ' · válida até ' + fmtDate(p.validade + 'T12:00') : ''}`),
    p.respondida_em && h('p', { class: 'small' }, `${p.status === 'aceita' ? 'Aceita' : 'Recusada'} por ${p.resposta_nome} em ${fmtDate(p.respondida_em)}`, p.resposta_obs && ` — “${p.resposta_obs}”`),
    h('div', { class: 'row', style: 'margin-top:8px' },
      p.status !== 'rascunho' && h('button', { class: 'btn sm', onclick: () => copyText(linkOf(p)) }, 'Copiar link'),
      p.status !== 'rascunho' && h('a', { class: 'btn sm', href: linkOf(p), target: '_blank', rel: 'noopener' }, 'Abrir'),
      canEdit && p.status === 'rascunho' && h('button', { class: 'btn sm primary', onclick: () => liberar(p) }, 'Liberar link'),
      canEdit && p.status === 'rascunho' && h('button', { class: 'btn sm', onclick: () => formModal({ title: 'Editar proposta', fields: fields(p), onSubmit: async (v) => !!(await patch(p, v, 'Proposta salva.')) && undefined }) }, 'Editar'),
      canEdit && p.status === 'enviada' && h('button', { class: 'btn sm', onclick: () => patch(p, { status: 'rascunho', enviada_em: null }, 'Link recolhido.') }, 'Recolher link'),
      canEdit && h('button', { class: 'btn sm danger', onclick: async () => {
        if (await confirmDlg(`Excluir a proposta "${p.titulo}"?`) && await run(sb.from('propostas').delete().eq('id', p.id), 'Proposta excluída.')) { list.splice(list.indexOf(p), 1); paint(); }
      } }, 'Excluir'))))) : h('p', { class: 'small muted' }, 'Nenhuma proposta para este lead ainda.'));
  paint();

  modal('Propostas — ' + contato.nome, h('div', {},
    canEdit && h('button', { class: 'btn primary sm', style: 'margin-bottom:14px', onclick: () => formModal({ title: 'Nova proposta', fields: fields(), onSubmit: async (v) => {
      const r = await run(sb.from('propostas').insert({ ...v, contato_id: contato.id }).select().single(), 'Rascunho criado.');
      if (!r) return false; list.unshift(r); paint();
    } }) }, 'Nova proposta'), body,
    h('p', { class: 'small muted', style: 'margin-top:12px' }, 'O cliente só enxerga a proposta depois que você libera o link. O aceite registra nome e data, mas não substitui um contrato.')),
  (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
}
