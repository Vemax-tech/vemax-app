// Interface DO PORTAL: ícones, casca (barra lateral e topo), menu por permissão e aviso de 2FA.
// Os helpers genéricos (h, modal, formModal, toast…) moram em ../../shared/js/dom.js e são reexportados
// aqui para as telas seguirem importando tudo de './ui.js'.
import { requireSession, logout, evento } from './auth.js';
import { iniciarSessao } from '../../shared/js/sessao.js';
import { sb } from './supabase.js';
import { initNotifs } from './notifs.js';
import { initBusca } from './busca.js';
import { criarIcon, criarRun, empty as emptyBase, h, modal } from '../../shared/js/dom.js';

export { instalarDom, h, fmtDate, overdue, contactHref, linkSeguro, toast, copyText, modal, confirmDlg, formModal, pageHead, tabs, qs } from '../../shared/js/dom.js';

const ROOT = new URL('../', import.meta.url).href;
// Ícones estáticos (Lucide) — conteúdo fixo, nunca vindo do usuário.
const ICONS = {
  logo: '<path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><path d="M8 9l4 7 4-7"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  check: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  life: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
export const icon = criarIcon(ICONS);
export const empty = (msg) => emptyBase(msg, icon('logo'));

export const STATUS = { planejada: 'Planejada', andamento: 'Em andamento', concluida: 'Concluída', revisao: 'Em revisão' };
export const CONF = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

// Acesso negado pelo servidor entra no log de segurança (no máximo 1 por minuto por aba, para não encher o log).
let ultimoNegado = 0;
const negado = () => { if (Date.now() - ultimoNegado > 60000) { ultimoNegado = Date.now(); evento('acesso_negado', location.pathname.slice(0, 120)); } };
/** Aguarda uma promise do Supabase; mostra erro amigável e devolve os dados (ou null). */
export const run = criarRun(negado);

// [pasta, rótulo, ícone, permissão (módulo | 'ADMIN' | null = todos), grupo do menu]
const NAV = [
  ['', 'Visão geral', 'home', null, ''],
  ['minhas/', 'Minhas pendências', 'inbox', null, ''],
  ['contatos/', 'Leads', 'target', 'contatos', 'Comercial'],
  ['propostas/', 'Propostas', 'file', 'contatos', 'Comercial'],
  ['clientes/', 'Clientes', 'briefcase', 'clientes', ''],
  ['projetos/', 'Projetos', 'box', 'projetos', 'Operação'],
  ['tarefas/', 'Tarefas', 'check', 'projetos', 'Operação'],
  ['suporte/', 'Suporte', 'life', 'suporte', ''],
  ['financeiro/', 'Financeiro', 'wallet', 'financeiro', ''],
  ['mercado/', 'Inteligência de Mercado', 'chart', 'mercado', 'Conteúdo'],
  ['conhecimento/', 'Base de conhecimento', 'book', 'conhecimento', 'Conteúdo'],
  ['portfolio/', 'Portfólio do site', 'image', 'portfolio', 'Conteúdo'],
  ['equipe/', 'Equipe', 'users', 'ADMIN', ''],
  ['configuracoes/', 'Configurações', 'sliders', null, ''],
];

/** Monta a casca do portal e chama render(ctx, view). `key` = pasta do módulo ('' para o painel). */
export async function start(key, title, render) {
  const app = document.getElementById('app');
  app.replaceChildren(h('div', { class: 'spin', 'aria-label': 'Carregando' }));
  const ctx = await requireSession();
  if (ctx.redirect) return;
  if (ctx.setup) {
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, h('h1', {}, 'Configuração pendente'),
      h('p', {}, 'Preencha SUPABASE_URL e SUPABASE_ANON_KEY em app/js/config.js e aplique a migration de supabase/migrations. Veja o README.'))));
    return;
  }
  const mod = NAV.find((n) => n[0] === key);
  if (mod && mod[3] === 'ADMIN' && !ctx.isAdmin) { location.replace(ROOT); return; }
  if (mod && mod[3] && mod[3] !== 'ADMIN' && !ctx.can(mod[3])) {
    app.replaceChildren(h('div', { class: 'content' }, h('h1', {}, 'Sem acesso'), h('p', {}, 'Você não tem permissão para este módulo.'), h('a', { class: 'btn', href: ROOT }, 'Voltar ao painel')));
    return;
  }

  const side = h('aside', { class: 'side', id: 'side' },
    h('a', { class: 'brand', href: ROOT }, icon('logo'), 'Vemax'),
    NAV.filter((n) => !n[3] || (n[3] === 'ADMIN' ? ctx.isAdmin : ctx.can(n[3]))).map(([p, l, ic, , grupo], i, vis) =>
      [grupo !== (vis[i - 1]?.[4] ?? '') && (grupo ? h('p', { class: 'navgrp' }, grupo) : h('div', { class: 'navsep' })),
        h('a', { class: 'navi' + (p === key ? ' on' : ''), href: ROOT + p, 'aria-current': p === key ? 'page' : null }, icon(ic), l)]),
    h('div', { class: 'spacer' }),
    h('div', { class: 'me' },
      h('b', {}, ctx.profile.nome || ctx.user.email),
      h('span', { class: 'small' }, (ctx.isAdmin ? 'Administrador' : 'Membro') + (ctx.profile.cargo ? ' · ' + ctx.profile.cargo : '')),
      h('button', { class: 'btn sm', onclick: () => logout() }, icon('out'), 'Sair')));
  if (ctx.isAdmin) {   // selo com o nº de cadastros aguardando aprovação
    sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente').then(({ count }) => {
      const a = [...side.querySelectorAll('a.navi')].find((x) => x.getAttribute('href') === ROOT + 'equipe/');
      if (a && count) a.append(h('span', { class: 'pill', 'aria-label': `${count} cadastro(s) pendente(s)` }, String(count)));
    });
  }
  initNotifs({ sb, h, modal, icon, side, ctx, root: ROOT });
  initBusca({ sb, h, modal, icon, side, ctx, root: ROOT });
  iniciarSessao({ sb, h, modal, sair: (m) => logout(m), irParaLogin: () => location.replace(ROOT + 'login/') });
  const view = h('main', { class: 'content', id: 'view' });
  const top = h('div', { class: 'topbar' },
    h('a', { class: 'brand', href: ROOT, style: 'padding:0' }, icon('logo'), 'Vemax'),
    h('button', { 'aria-label': 'Abrir menu', 'aria-expanded': 'false', onclick: (e) => { const o = side.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); } }, icon('menu')));
  app.replaceChildren(h('div', { class: 'shell' }, side, h('div', {}, top, view)));
  document.title = `${title} — Vemax Portal`;
  view.append(h('div', { class: 'spin' }));
  try { view.replaceChildren(avisoSeguranca(ctx)); await render(ctx, view); }
  catch (e) { console.error(e); view.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Não foi possível carregar esta página.'))); }
}

/** Faixa de aviso para administradores sem 2FA (com 2FA obrigatório ou recomendado). */
function avisoSeguranca(ctx) {
  if (ctx.adminSemPoderes) return h('p', { class: 'pending-note', role: 'alert', style: 'margin-bottom:16px;color:#ff9b8a' }, 'Seu acesso de administrador está limitado até você ativar a verificação em duas etapas. ', h('a', { class: 't', href: ROOT + 'configuracoes/?aba=seguranca' }, 'Ativar agora'));
  let dispensado = false;
  try { dispensado = Boolean(sessionStorage.getItem('vx_aviso_2fa')); } catch { /* armazenamento bloqueado: mostra o aviso */ }
  if (ctx.isAdmin && !ctx.mfa?.ativo && !dispensado) return h('p', { class: 'pending-note', style: 'margin-bottom:16px' }, 'Proteja a conta de administrador: ative a verificação em duas etapas. ', h('a', { class: 't', href: ROOT + 'configuracoes/?aba=seguranca' }, 'Configurar'), ' · ', h('button', { class: 'linkbtn', style: 'margin:0', onclick: (e) => { try { sessionStorage.setItem('vx_aviso_2fa', '1'); } catch { /* ok */ } e.target.closest('p').remove(); } }, 'Agora não'));
  return null;
}
