// Propostas de um lead: criar, liberar o link privado para o cliente e acompanhar a resposta
import { sb } from '../supabase.js';
import { h, run, modal, formModal, confirmDlg, toast, fmtDate, copyText } from '../ui.js';

const ST = { rascunho: 'Rascunho', enviada: 'Enviada ao cliente', aceita: 'Aceita', recusada: 'Recusada' };
const BADGE = { rascunho: ' dim', enviada: '', aceita: ' ok', recusada: ' warn' };
const brl = (v) => (v == null ? 'A combinar' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const iso = (d) => d.toLocaleDateString('sv-SE');
// O portal está em /app/<módulo>/; a página pública fica na raiz do site.
const linkOf = (p) => new URL('../../proposta.html?t=' + p.token, location.href).href;

// ---- PDF da proposta: abre uma página de impressão (A4) pronta para "Salvar como PDF" ----
// Dados do emissor impressos no rodapé do PDF (ajuste aqui se mudar).
const EMISSOR = { nome: 'Vemax', email: 'mavsoares.oliveira@gmail.com', fone: '(11) 93954-7919', cidade: 'São Paulo, SP' };
const PDF_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.55 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
  .brand { font-weight: 700; font-size: 18pt; color: #1d4ed8; } .doc { color: #555; font-size: 10pt; text-transform: uppercase; letter-spacing: .12em; }
  h1 { font-size: 20pt; margin: 22px 0 4px; } .para { color: #555; margin: 0 0 18px; }
  .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 0 20px; }
  .info div { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; } .info small { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; color: #1d4ed8; } .info b { font-size: 11pt; }
  h2 { font-size: 13pt; margin: 18px 0 6px; } p { margin: 0 0 9px; white-space: pre-wrap; }
  .foot { margin-top: 30px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 9pt; color: #555; }
  .btnbar { position: fixed; top: 10px; right: 10px; } .btnbar button { padding: 8px 14px; font-size: 11pt; cursor: pointer; }
  @media print { .btnbar { display: none; } }
`;
const abrirPdf = (p, contato) => {
  const w = window.open('', '_blank');
  if (!w) { toast('O navegador bloqueou a nova janela. Libere pop-ups para este site.', true); return; }
  w.document.open(); w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title></title><style>' + PDF_CSS + '</style></head><body></body></html>'); w.document.close();
  w.document.title = p.titulo + ' — Proposta Vemax';
  const d = w.document;
  const el = (tag, cls, text) => { const e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const kv = (k, v) => { const x = el('div'); x.append(el('small', null, k), el('b', null, v)); return x; };
  const bar = el('div', 'btnbar'); const pr = el('button', null, 'Imprimir / Salvar como PDF'); pr.onclick = () => w.print(); bar.append(pr);
  const top = el('div', 'top'); top.append(el('span', 'brand', EMISSOR.nome), el('span', 'doc', 'Proposta comercial'));
  const info = el('div', 'info');
  info.append(kv('Investimento', brl(p.valor)), kv('Prazo estimado', p.prazo_texto || 'A combinar'), kv('Válida até', p.validade ? fmtDate(p.validade + 'T12:00') : 'Sem data limite'));
  d.body.append(bar, top, el('h1', null, p.titulo), el('p', 'para', `Para ${contato.nome} · emitida em ${new Date().toLocaleDateString('pt-BR')}`), info);
  const paras = String(p.escopo || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  if (paras.length) { d.body.append(el('h2', null, 'Escopo')); paras.forEach((x) => d.body.append(el('p', null, x))); }
  d.body.append(el('div', 'foot', `${EMISSOR.nome} · ${EMISSOR.email} · ${EMISSOR.fone} · ${EMISSOR.cidade}. Esta proposta registra o escopo e as condições acima; contrato e pagamento são combinados à parte.`));
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* o usuário pode usar o botão */ } }, 400);
};

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
      h('button', { class: 'btn sm', onclick: () => abrirPdf(p, contato) }, 'PDF'),
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
