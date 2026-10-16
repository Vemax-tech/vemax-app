// Helpers de interface compartilhados: criação segura de DOM (sem innerHTML com dados), modal, toast, formulário.
// Nada aqui conhece o banco nem os módulos de uma área: o conjunto de ícones e o registro de acesso negado
// entram por parâmetro (criarIcon, criarRun), para cada área manter os seus.
import { mensagemErro, telefoneValido, documentoOk, emailValido } from './validacao.js';
import { urlValida } from './formato.js';

/**
 * append/prepend/replaceChildren do DOM escrevem "false" ou "null" na tela quando recebem esses valores
 * (comum em `cond && h(...)`) e viram "[object HTMLElement]" quando recebem uma lista.
 * Aqui eles passam a aceitar listas e a ignorar null/undefined/false, como o h() já faz.
 */
export function instalarDom(El = globalThis.Element) {
  if (!El || El.prototype.__vemax) return;
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const orig = El.prototype[m];
    El.prototype[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false)); };
  }
  El.prototype.__vemax = true;
}
instalarDom();

const SVG = 'http://www.w3.org/2000/svg';
/**
 * Monta a função `icon(nome)` de uma área a partir do seu conjunto de ícones.
 * `icons` é um objeto {nome: trecho de SVG} com conteúdo FIXO, nunca vindo do usuário.
 */
export function criarIcon(icons, padrao = 'logo') {
  return (n) => {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'i'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = icons[n] || icons[padrao] || '';
    return s;
  };
}

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

/** Aceita timestamp ou data pura ('YYYY-MM-DD'); data pura é formatada sem fuso horário (evita "um dia antes"). */
export const fmtDate = (d) => {
  if (!d) return '—';
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(d));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(d).toLocaleDateString('pt-BR');
};
/** Prazo (date 'YYYY-MM-DD') já passou? Compara por dia, sem fuso. */
export const overdue = (d) => Boolean(d) && d < new Date().toLocaleDateString('sv-SE');
/** Link de contato seguro: e-mail vira mailto, telefone vira WhatsApp; senão null. */
export function contactHref(c) {
  const s = String(c || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'mailto:' + s;
  const d = s.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 13 ? 'https://wa.me/' + (d.length <= 11 ? '55' + d : d) : null;
}
/** Só abre link http(s); qualquer outro esquema (javascript:, data:) vira texto. */
export const linkSeguro = (url, texto) => (urlValida(url)
  ? h('a', { class: 't', href: url, target: '_blank', rel: 'noopener noreferrer' }, texto || url)
  : h('span', {}, texto || url || '—'));

export function toast(msg, err = false) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status' }); document.body.append(box); }
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  box.append(t); setTimeout(() => t.remove(), 4200);
}

export const copyText = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado.'); } catch { toast('Não foi possível copiar automaticamente.', true); } };

/**
 * Monta o `run(promise, okMsg)` de uma área: aguarda uma promise do Supabase, mostra erro amigável
 * e devolve os dados (ou null). `onNegado` é chamado quando o servidor recusa por permissão (42501),
 * para a área registrar o evento de segurança do jeito dela.
 */
export function criarRun(onNegado) {
  return async function run(p, okMsg) {
    const { data, error } = await p;
    if (error) {
      console.error(error);
      if (error.code === '42501') onNegado?.();
      toast(mensagemErro(error), true);
      return null;
    }
    if (okMsg) toast(okMsg);
    return data ?? true;
  };
}

/** onClose roda sempre que a janela fecha (botão, Esc ou clique fora). Esc fecha só a janela de cima. */
export function modal(title, body, actions, onClose) {
  const ov = h('div', { class: 'ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const esc = (e) => e.key === 'Escape' && [...document.querySelectorAll('.ov')].pop() === ov && close();
  const close = () => { if (!ov.isConnected) return; ov.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  document.addEventListener('keydown', esc);
  ov.addEventListener('mousedown', (e) => e.target === ov && close());
  const box = h('div', { class: 'modal' }, h('h2', {}, title), body, actions(close));
  ov.append(box); document.body.append(ov);
  (box.querySelector('input,select,textarea,button') || box).focus();
  return close;
}

export const confirmDlg = (msg) => new Promise((res) => {
  modal('Confirmar', h('p', {}, msg), (close) => h('div', { class: 'row' },
    h('button', { class: 'btn', onclick: () => { res(false); close(); } }, 'Cancelar'),
    h('button', { class: 'btn danger', onclick: () => { res(true); close(); } }, 'Confirmar')), () => res(false));
});

/**
 * fields: [{name,label,type:'text|textarea|select|number|url|email|date',options:[[v,l]],value,required,min,max,step,nullable,maxlength,hint,placeholder}]
 * validate(vals) -> mensagem de erro (string) ou vazio. onSubmit(vals) -> false mantém a janela aberta.
 */
export function formModal({ title, fields, onSubmit, validate, onClose, submitLabel = 'Salvar' }) {
  const form = h('form', { novalidate: true });
  fields.forEach((f) => {
    const id = 'f_' + f.name; let inp;
    const common = { id, name: f.name, maxlength: f.maxlength, placeholder: f.placeholder, 'aria-describedby': f.hint ? id + '_h' : null };
    if (f.type === 'textarea') inp = h('textarea', { ...common, value: f.value ?? '' });
    else if (f.type === 'select') inp = h('select', { id, name: f.name }, f.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(f.value ?? '') }, l)));
    else inp = h('input', { ...common, type: f.type || 'text', value: f.value ?? '', min: f.min, max: f.max, step: f.step });
    form.append(h('label', { for: id }, f.label + (f.required ? ' *' : '')), inp, f.hint && h('p', { class: 'small muted', id: id + '_h' }, f.hint));
  });
  const err = h('p', { class: 'err', role: 'alert', hidden: true });
  form.append(err);
  const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el?.focus(); };
  return modal(title, form, (close) => {
    const save = h('button', { class: 'btn primary', type: 'button' }, submitLabel);
    const go = async () => {
      const vals = {};
      for (const f of fields) {
        const el = form.elements[f.name]; let v = el.value.trim();
        if (f.required && !v) return fail(`Preencha: ${f.label}`, el);
        if (f.type === 'number') {
          v = v === '' ? null : Number(v);
          if (v != null && (!Number.isFinite(v) || (f.min != null && v < f.min) || (f.max != null && v > f.max))) return fail(`Valor inválido em: ${f.label}`, el);
        }
        if (f.type === 'email' && v && !emailValido(v)) return fail(`E-mail inválido em: ${f.label}`, el);
        if (f.kind === 'telefone' && v && !telefoneValido(v)) return fail(`Telefone inválido em: ${f.label}. Inclua o DDD e use só números, espaços, ( ) + e -.`, el);
        if (f.kind === 'documento' && v && !documentoOk(v)) return fail(`CPF ou CNPJ inválido em: ${f.label}. Confira os dígitos.`, el);
        if ((f.type === 'url') && v && !/^https?:\/\/\S+$/i.test(v)) return fail(`Use um endereço que comece com http:// ou https:// em: ${f.label}`, el);
        vals[f.name] = v === '' && f.nullable ? null : v;
      }
      const msg = validate?.(vals);
      if (msg) return fail(msg);
      err.hidden = true; save.disabled = true;
      let ok;
      try { ok = await onSubmit(vals); } catch (e) { console.error(e); toast(mensagemErro(e), true); ok = false; }
      save.disabled = false;
      if (ok !== false) close();
    };
    save.addEventListener('click', go);
    form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
    return h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'), save);
  }, onClose);
}

export const pageHead = (eyebrow, title, sub, ...actions) =>
  h('div', { class: 'head' }, h('div', {}, h('p', { class: 'eyebrow' }, eyebrow), h('h1', {}, title), sub && h('p', { class: 'muted' }, sub)), h('div', { class: 'row' }, actions));
export const tabs = (items, active) => h('nav', { class: 'tabs', 'aria-label': 'Seções' }, items.map(([href, l]) => h('a', { href, class: href === active ? 'on' : '' }, l)));
/** `ico` é o nó de ícone da área (cada uma tem o seu conjunto); sem ele, só a mensagem. */
export const empty = (msg, ico) => h('div', { class: 'empty' }, ico, h('p', {}, msg));
export const qs = (k) => new URLSearchParams(location.search).get(k);
