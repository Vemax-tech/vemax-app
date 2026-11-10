/* Vemax — helpers das páginas públicas privadas por token (acompanhar.html, avaliar.html).
   Todo texto vindo do banco entra via textContent (nunca innerHTML). */
(() => {
  'use strict';
  const C = window.VEMAX || {};
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  };
  const rpc = async (fn, body) => {
    try {
      const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: C.supabaseAnonKey, Authorization: 'Bearer ' + C.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  const dia = (d) => (d ? new Date(String(d).length === 10 ? d + 'T12:00' : d).toLocaleDateString('pt-BR') : '—');
  const token = () => { const t = new URLSearchParams(location.search).get('t') || ''; return /^[a-f0-9]{64}$/.test(t) ? t : ''; };
  const empty = (root, titulo, msg) => root.replaceChildren(h('div', { class: 'caso-empty' }, h('h1', {}, titulo), h('p', {}, msg), h('a', { class: 'btn btn-primary', href: './#contato' }, 'Falar com a equipe')));
  window.VX = { h, rpc, dia, token, empty };
})();
