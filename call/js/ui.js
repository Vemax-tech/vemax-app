// VemaxCALL — casca da área: menu por papel, seletor de papel da demonstração e aviso de dados fictícios.
// Os helpers genéricos vêm de shared/js/ (os mesmos do portal), então a identidade visual é a mesma.
import { criarIcon, criarRun, empty as emptyBase, h, toast } from '../../shared/js/dom.js';
import { papelAtual, definirPapel, papeisAtuais, atorAtual, PAPEIS } from './papel.js';
import { pode, podeCompleto } from './permissoes.js';
import { nomeDe, usuarioPor, reiniciar } from './dados.js';

export { instalarDom, h, fmtDate, overdue, linkSeguro, toast, copyText, modal, confirmDlg, formModal, pageHead, tabs, qs } from '../../shared/js/dom.js';
export { badge, sec, dataTable, kanban, filtros, contem, baixarCsv } from '../../shared/js/tabela.js';

const ROOT = new URL('../', import.meta.url).href;

// Ícones estáticos (Lucide) — conteúdo fixo, nunca vindo do usuário.
const ICONS = {
  logo: '<path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><path d="M8 9l4 7 4-7"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
};
export const icon = criarIcon(ICONS);
export const empty = (msg) => emptyBase(msg, icon('logo'));
export const run = criarRun(() => toast('O servidor recusaria esta ação: ela não é do seu papel.', true));

// [pasta, rótulo, ícone, recurso exigido (null = todos), grupo]
const NAV = [
  ['', 'Visão geral', 'home', 'dashboard', ''],
  ['filas/', 'Minha fila', 'inbox', 'tarefa_ver', ''],
  ['solicitacoes/', 'Solicitações', 'list', 'solicitacao_ver', 'Operação'],
  ['prontuarios/', 'Prontuários', 'archive', 'prontuario_ver', 'Operação'],
  ['registros/', 'Documentos e comunicações', 'file', 'comunicacao_ver', 'Operação'],
  ['relatorios/', 'Relatórios', 'chart', 'relatorios', ''],
  ['permissoes/', 'Papéis e permissões', 'shield', null, 'Administração'],
];

/** Faixa fixa: ninguém pode confundir a demonstração com o sistema em produção. */
const faixaDemo = () => h('div', { class: 'demo-bar', role: 'note' },
  icon('alert'),
  h('span', {}, h('b', {}, 'Demonstração'), ' — dados fictícios, em memória. Nada é salvo e nenhum paciente real existe aqui. ',
    h('span', { class: 'small muted' }, 'Em produção as regras e as permissões vivem no banco, não no navegador.')),
  h('button', { class: 'btn sm', onclick: async () => { await reiniciar(); location.reload(); } }, icon('refresh'), 'Reiniciar dados'));

/** Seletor de papel — só existe na demonstração (ver call/js/papel.js). */
function seletorPapel(side) {
  const atual = papelAtual();
  const sel = h('select', { 'aria-label': 'Papel em uso na demonstração', onchange: (e) => { definirPapel(e.target.value); location.reload(); } },
    Object.entries(PAPEIS).map(([k, v]) => h('option', { value: k, selected: k === atual }, v)));
  const u = usuarioPor(atorAtual());
  side.append(h('div', { class: 'papel-box' },
    h('p', { class: 'eyebrow' }, 'Vendo como'),
    sel,
    h('p', { class: 'small muted', style: 'margin-top:6px' }, u ? `${u.nome} · ${u.cargo}` : ''),
    u?.registro_profissional && h('p', { class: 'small muted' }, u.registro_profissional)));
}

/**
 * Monta a casca e chama render(ctx, view).
 * ctx = { papeis, ator, nome, pode(recurso, acao), podeCompleto(recurso) } — a mesma forma do ctx do portal,
 * para as telas não precisarem mudar quando a origem virar o banco.
 */
export async function start(key, title, render) {
  const app = document.getElementById('app');
  const papeis = papeisAtuais(), ator = atorAtual();
  const ctx = {
    papeis, ator, nome: nomeDe(ator), usuario: usuarioPor(ator),
    pode: (recurso, acao = 'ver') => pode(papeis, recurso, acao),
    podeCompleto: (recurso) => podeCompleto(papeis, recurso),
  };

  const mod = NAV.find((n) => n[0] === key);
  const visiveis = NAV.filter((n) => !n[3] || ctx.pode(n[3]));
  const side = h('aside', { class: 'side', id: 'side' },
    h('a', { class: 'brand', href: ROOT }, icon('logo'), h('span', {}, 'Vemax', h('b', { class: 'grad' }, 'CALL'))),
    visiveis.map(([p, l, ic, , grupo], i, vis) =>
      [grupo !== (vis[i - 1]?.[4] ?? '') && (grupo ? h('p', { class: 'navgrp' }, grupo) : h('div', { class: 'navsep' })),
        h('a', { class: 'navi' + (p === key ? ' on' : ''), href: ROOT + p, 'aria-current': p === key ? 'page' : null }, icon(ic), l)]),
    h('div', { class: 'spacer' }));
  seletorPapel(side);
  // Sem link para /app/: a demonstração é publicada sozinha, e link quebrado na frente do cliente é pior
  // do que link ausente. No deploy completo, o portal fica em /app/.
  side.append(h('p', { class: 'small muted', style: 'padding:10px 12px' }, 'Terceira área do sistema Vemax, ao lado do site e do portal interno.'));

  const view = h('main', { class: 'content', id: 'view' });
  const top = h('div', { class: 'topbar' },
    h('a', { class: 'brand', href: ROOT, style: 'padding:0' }, icon('logo'), 'VemaxCALL'),
    h('button', { 'aria-label': 'Abrir menu', 'aria-expanded': 'false', onclick: (e) => { const o = side.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); } }, icon('menu')));
  app.replaceChildren(faixaDemo(), h('div', { class: 'shell' }, side, h('div', {}, top, view)));
  document.title = `${title} — VemaxCALL`;

  if (mod && mod[3] && !ctx.pode(mod[3])) {
    view.replaceChildren(h('div', {}, h('h1', {}, 'Sem acesso'),
      h('p', { class: 'muted' }, `O papel "${PAPEIS[papeis[0]]}" não tem acesso a esta área. Em produção o servidor recusaria a consulta, não só a tela.`),
      h('a', { class: 'btn', href: ROOT }, 'Voltar')));
    return;
  }
  view.append(h('div', { class: 'spin', 'aria-label': 'Carregando' }));
  try { view.replaceChildren(); await render(ctx, view); }
  catch (e) { console.error(e); view.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Não foi possível carregar esta página.'))); }
}

/** Etiqueta de etapa com cor por urgência. */
export const corEtapa = (etapa) => ({
  aberta: 'info', em_triagem: 'info', aguardando_prontuario: 'warn', prontuario_em_transito: 'warn',
  prontuario_na_recepcao: '', aguardando_medico: 'warn', aguardando_esclarecimento: 'warn',
  retorno_disponivel: 'ok', aguardando_contato_paciente: 'ok', aguardando_entrega: 'ok',
  concluida: 'dim', cancelada: 'dim',
}[etapa] ?? '');

/** "há 3 h", "há 2 d" — tempo na etapa, que é o indicador que a operação olha. */
export function desde(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3600e3);
  if (horas < 1) return 'agora';
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} d`;
}
export const horasNa = (iso) => (Date.now() - new Date(iso).getTime()) / 3600e3;
