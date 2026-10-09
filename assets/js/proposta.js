/* Vemax — página pública de uma proposta (acesso por token privado).
   Fala só com duas funções do banco (proposta_publica / responder_proposta). Todo texto entra via textContent. */
(() => {
  'use strict';
  const C = window.VEMAX || {};
  const root = document.getElementById('prop');
  const TOKEN = /^[a-f0-9]{64}$/;

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
  const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dia = (d) => new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('pt-BR');
  const empty = (t, m) => root.replaceChildren(h('div', { class: 'caso-empty' }, h('h1', {}, t), h('p', {}, m), h('a', { class: 'btn btn-primary', href: './#contato' }, 'Falar com a equipe')));

  const token = new URLSearchParams(location.search).get('t') || '';

  async function main() {
    if (!TOKEN.test(token)) return empty('Proposta não encontrada', 'O link parece incompleto. Peça um novo à equipe da Vemax.');
    const p = await rpc('proposta_publica', { p_token: token });
    if (!p) return empty('Proposta indisponível', 'Ela não existe ou ainda não foi enviada. Fale com a equipe da Vemax.');
    document.title = `${p.titulo} — Proposta Vemax`;

    const status = p.status === 'aceita' ? h('p', { class: 'pf-tag', style: 'color:var(--ok)' }, `Aceita por ${p.resposta_nome} em ${dia(p.respondida_em)}`)
      : p.status === 'recusada' ? h('p', { class: 'pf-tag' }, `Recusada em ${dia(p.respondida_em)}`)
      : p.expirada ? h('p', { class: 'pf-tag', style: 'color:#ff9b8a' }, 'Proposta expirada') : null;

    const paras = String(p.escopo || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    const info = [['Investimento', p.valor != null ? brl(p.valor) : 'A combinar'], ['Prazo estimado', p.prazo_texto || 'A combinar'], ['Válida até', p.validade ? dia(p.validade) : 'Sem data limite']];

    const out = [
      h('header', { class: 'caso-head' }, h('p', { class: 'eyebrow' }, 'Proposta'), h('h1', {}, p.titulo), status),
      h('dl', { class: 'prop-info' }, info.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
      paras.length > 0 && h('section', { class: 'caso-story' }, h('h2', {}, 'Escopo'), paras.map((x) => h('p', {}, x))),
    ];

    if (p.status === 'enviada' && !p.expirada) {
      const msg = h('p', { class: 'err', role: 'alert', hidden: true });
      const nome = h('input', { id: 'rNome', autocomplete: 'name', maxlength: 120, required: true });
      const obs = h('textarea', { id: 'rObs', rows: 3, maxlength: 1000, placeholder: 'Dúvidas, ajustes ou comentários (opcional)' });
      const send = async (aceita) => {
        msg.hidden = true;
        if (nome.value.trim().length < 2) { msg.textContent = 'Informe seu nome para registrar a resposta.'; msg.hidden = false; nome.focus(); return; }
        if (!confirm(aceita ? 'Confirmar o aceite desta proposta?' : 'Confirmar que você recusa esta proposta?')) return;
        btns.forEach((b) => { b.disabled = true; });
        const r = await rpc('responder_proposta', { p_token: token, p_aceita: aceita, p_nome: nome.value.trim(), p_obs: obs.value.trim() });
        if (r === 'ok') return main();
        btns.forEach((b) => { b.disabled = false; });
        msg.textContent = r === 'expirada' ? 'Esta proposta expirou. Fale com a equipe.' : r === 'indisponivel' ? 'Esta proposta já foi respondida.' : 'Não foi possível registrar agora. Tente novamente.';
        msg.hidden = false;
      };
      const btns = [
        h('button', { class: 'btn btn-primary', type: 'button' }, 'Aceitar proposta'),
        h('button', { class: 'btn btn-outline', type: 'button' }, 'Recusar'),
      ];
      btns[0].addEventListener('click', () => send(true)); btns[1].addEventListener('click', () => send(false));
      out.push(h('section', { class: 'cform glass', style: 'margin:0;width:100%' },
        h('h2', {}, 'Sua resposta'),
        h('label', { for: 'rNome' }, 'Seu nome completo'), nome,
        h('label', { for: 'rObs' }, 'Observações'), obs, msg,
        h('p', { class: 'small', style: 'color:var(--muted);margin-top:10px' }, 'O aceite fica registrado com seu nome e a data. Ele confirma o interesse nesta proposta; contrato e pagamento são combinados à parte com a equipe.'),
        h('div', { class: 'actions' }, btns)));
    } else if (p.status === 'recusada' || p.expirada) {
      out.push(h('p', { style: 'color:var(--muted)' }, 'Se mudar de ideia ou quiser ajustar algo, é só falar com a gente.'), h('a', { class: 'btn btn-primary', href: './#contato' }, 'Falar com a equipe'));
    } else if (p.status === 'aceita') {
      out.push(h('p', { style: 'color:var(--muted)' }, 'Obrigado! Nossa equipe vai entrar em contato para os próximos passos.'));
    }
    root.replaceChildren(...out.filter(Boolean));
  }
  main();
})();
