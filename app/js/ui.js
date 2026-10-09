// Helpers de interface: criação segura de DOM (sem innerHTML com dados), shell, modal, toast.
import { requireSession, logout } from './auth.js';
import { sb } from './supabase.js';

const ROOT = new URL('../', import.meta.url).href;
const SVG = 'http://www.w3.org/2000/svg';
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
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
};
export const icon = (n) => {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('class', 'i'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[n] || ICONS.logo;
  return s;
};

/** h('div', {class:'x', onclick: fn}, 'texto', outroNo) — texto sempre via nó de texto, nunca HTML. */
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
export const STATUS = { planejada: 'Planejada', andamento: 'Em andamento', concluida: 'Concluída', revisao: 'Em revisão' };
export const CONF = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
export const PROJ_STATUS = { planejado: 'Planejado', andamento: 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' };
export const CONTATO_STATUS = { novo: 'Novo', em_contato: 'Em contato', concluido: 'Concluído', descartado: 'Descartado' };
/** Prazo (date 'YYYY-MM-DD') já passou? Compara por dia, sem fuso. */
export const overdue = (d) => Boolean(d) && d < new Date().toLocaleDateString('sv-SE');
/** Link de contato seguro: e-mail vira mailto, telefone vira WhatsApp; senão null. */
export function contactHref(c) {
  const s = String(c || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'mailto:' + s;
  const d = s.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 13 ? 'https://wa.me/' + (d.length <= 11 ? '55' + d : d) : null;
}

export function toast(msg, err = false) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status' }); document.body.append(box); }
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  box.append(t); setTimeout(() => t.remove(), 4200);
}

export const copyText = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado.'); } catch { toast('Não foi possível copiar automaticamente.', true); } };

/** Aguarda uma promise do Supabase; mostra erro amigável e devolve os dados (ou null). */
export async function run(p, okMsg) {
  const { data, error } = await p;
  if (error) {
    console.error(error);
    toast(error.code === '42501' ? 'Sem permissão para esta ação.' : 'Algo deu errado: ' + error.message, true);
    return null;
  }
  if (okMsg) toast(okMsg);
  return data ?? true;
}

export function modal(title, body, actions) {
  const ov = h('div', { class: 'ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const esc = (e) => e.key === 'Escape' && close();
  const close = () => { ov.remove(); document.removeEventListener('keydown', esc); };
  document.addEventListener('keydown', esc);
  ov.addEventListener('mousedown', (e) => e.target === ov && close());
  const box = h('div', { class: 'modal' }, h('h2', {}, title), body, actions(close));
  ov.append(box); document.body.append(ov);
  (box.querySelector('input,select,textarea,button') || box).focus();
  return close;
}

export const confirmDlg = (msg) => new Promise((res) => {
  modal('Confirmar', h('p', {}, msg), (close) => h('div', { class: 'row' },
    h('button', { class: 'btn', onclick: () => { close(); res(false); } }, 'Cancelar'),
    h('button', { class: 'btn danger', onclick: () => { close(); res(true); } }, 'Confirmar')));
});

/** fields: [{name,label,type:'text|textarea|select|number|url|date',options:[[v,l]],value,required,min,max,step,nullable}] */
export function formModal({ title, fields, onSubmit, submitLabel = 'Salvar' }) {
  const form = h('form', { novalidate: true });
  fields.forEach((f) => {
    const id = 'f_' + f.name; let inp;
    if (f.type === 'textarea') inp = h('textarea', { id, name: f.name, value: f.value ?? '' });
    else if (f.type === 'select') inp = h('select', { id, name: f.name }, f.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(f.value ?? '') }, l)));
    else inp = h('input', { id, name: f.name, type: f.type || 'text', value: f.value ?? '', min: f.min, max: f.max, step: f.step });
    form.append(h('label', { for: id }, f.label + (f.required ? ' *' : '')), inp);
  });
  const err = h('p', { class: 'err', role: 'alert', hidden: true });
  form.append(err);
  return modal(title, form, (close) => {
    const save = h('button', { class: 'btn primary', type: 'button' }, submitLabel);
    const go = async () => {
      const vals = {};
      for (const f of fields) {
        const el = form.elements[f.name]; let v = el.value.trim();
        if (f.required && !v) { err.textContent = `Preencha: ${f.label}`; err.hidden = false; el.focus(); return; }
        if (f.type === 'number') v = v === '' ? null : Number(v);
        vals[f.name] = v === '' && f.nullable ? null : v;
      }
      save.disabled = true;
      const ok = await onSubmit(vals);
      save.disabled = false;
      if (ok !== false) close();
    };
    save.addEventListener('click', go);
    form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
    return h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'), save);
  });
}

const NAV = [
  ['', 'Painel', 'home', null],
  ['mercado/', 'Inteligência de Mercado', 'chart', 'mercado'],
  ['projetos/', 'Projetos', 'box', 'projetos'],
  ['contatos/', 'Contatos do site', 'mail', 'contatos'],
  ['conhecimento/', 'Base de conhecimento', 'book', 'conhecimento'],
  ['portfolio/', 'Portfólio do site', 'image', 'portfolio'],
  ['equipe/', 'Equipe', 'users', 'ADMIN'],
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
    NAV.filter((n) => !n[3] || (n[3] === 'ADMIN' ? ctx.isAdmin : ctx.can(n[3]))).map(([p, l, ic]) =>
      h('a', { class: 'navi' + (p === key ? ' on' : ''), href: ROOT + p, 'aria-current': p === key ? 'page' : null }, icon(ic), l)),
    h('div', { class: 'spacer' }),
    h('div', { class: 'me' },
      h('b', {}, ctx.profile.nome || ctx.user.email),
      h('span', { class: 'small' }, (ctx.isAdmin ? 'Administrador' : 'Membro') + (ctx.profile.cargo ? ' · ' + ctx.profile.cargo : '')),
      h('button', { class: 'btn sm', onclick: logout }, icon('out'), 'Sair')));
  if (ctx.isAdmin) {   // selo com o nº de cadastros aguardando aprovação
    sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente').then(({ count }) => {
      const a = [...side.querySelectorAll('a.navi')].find((x) => x.getAttribute('href') === ROOT + 'equipe/');
      if (a && count) a.append(h('span', { class: 'pill', 'aria-label': `${count} cadastro(s) pendente(s)` }, String(count)));
    });
  }
  const view = h('main', { class: 'content', id: 'view' });
  const top = h('div', { class: 'topbar' },
    h('a', { class: 'brand', href: ROOT, style: 'padding:0' }, icon('logo'), 'Vemax'),
    h('button', { 'aria-label': 'Abrir menu', 'aria-expanded': 'false', onclick: (e) => { const o = side.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); } }, icon('menu')));
  app.replaceChildren(h('div', { class: 'shell' }, side, h('div', {}, top, view)));
  document.title = `${title} — Vemax Portal`;
  view.append(h('div', { class: 'spin' }));
  try { view.replaceChildren(); await render(ctx, view); }
  catch (e) { console.error(e); view.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Não foi possível carregar esta página.'))); }
}

export const pageHead = (eyebrow, title, sub, ...actions) =>
  h('div', { class: 'head' }, h('div', {}, h('p', { class: 'eyebrow' }, eyebrow), h('h1', {}, title), sub && h('p', { class: 'muted' }, sub)), h('div', { class: 'row' }, actions));
export const tabs = (items, active) => h('nav', { class: 'tabs', 'aria-label': 'Seções' }, items.map(([href, l]) => h('a', { href, class: href === active ? 'on' : '' }, l)));
export const empty = (msg) => h('div', { class: 'empty' }, icon('logo'), h('p', {}, msg));
export const qs = (k) => new URLSearchParams(location.search).get(k);
