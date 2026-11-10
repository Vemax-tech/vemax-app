/* Vemax — avaliação pós-entrega (link privado, resposta única). */
(() => {
  'use strict';
  const { h, rpc, token, empty } = window.VX;
  const root = document.getElementById('aval');

  (async () => {
    const t = token();
    if (!t) return empty(root, 'Link inválido', 'O endereço parece incompleto. Peça um novo à equipe da Vemax.');
    const a = await rpc('avaliacao_publica', { p_token: t });
    if (!a) return empty(root, 'Avaliação indisponível', 'O link não existe ou foi removido. Fale com a equipe da Vemax.');
    document.title = 'Avaliação — Vemax';
    if (a.respondida) return root.replaceChildren(h('div', { class: 'caso-empty' }, h('h1', {}, 'Obrigado pela sua resposta!'), h('p', {}, 'Sua avaliação já foi registrada. Ela nos ajuda a melhorar a cada projeto.')));

    let nota = null;
    const msg = h('p', { class: 'err', role: 'alert', hidden: true });
    const nome = h('input', { id: 'aNome', autocomplete: 'name', maxlength: 120 });
    const com = h('textarea', { id: 'aCom', rows: 4, maxlength: 1000, placeholder: 'O que funcionou bem? O que podemos melhorar?' });
    const aut = h('input', { id: 'aAut', type: 'checkbox', style: 'width:auto;margin-top:4px' });
    const btns = Array.from({ length: 11 }, (_, n) => h('button', { type: 'button', class: 'nps-b', role: 'radio', 'aria-checked': 'false', 'aria-label': `Nota ${n}` }, String(n)));
    btns.forEach((b, n) => b.addEventListener('click', () => { nota = n; btns.forEach((x, i) => { x.setAttribute('aria-checked', String(i === n)); x.classList.toggle('on', i === n); }); msg.hidden = true; }));
    const send = h('button', { class: 'btn btn-primary', type: 'button' }, 'Enviar avaliação');
    send.addEventListener('click', async () => {
      if (nota == null) { msg.textContent = 'Escolha uma nota de 0 a 10.'; msg.hidden = false; return; }
      send.disabled = true;
      const r = await rpc('responder_avaliacao', { p_token: t, p_nota: nota, p_comentario: com.value.trim(), p_nome: nome.value.trim(), p_autoriza: aut.checked });
      if (r === 'ok') return root.replaceChildren(h('div', { class: 'caso-empty' }, h('h1', {}, 'Obrigado!'), h('p', {}, 'Sua avaliação foi enviada. Ela nos ajuda a melhorar a cada projeto.')));
      send.disabled = false;
      msg.textContent = r === 'indisponivel' ? 'Esta avaliação já foi respondida.' : 'Não foi possível enviar agora. Tente novamente.';
      msg.hidden = false;
    });

    root.replaceChildren(
      h('header', { class: 'caso-head' }, h('p', { class: 'eyebrow' }, 'Avaliação'), h('h1', {}, 'Como foi trabalhar com a Vemax?'),
        h('p', { style: 'color:var(--muted)' }, a.titulo + (a.cliente ? ' · ' + a.cliente : ''))),
      h('section', { class: 'cform glass', style: 'margin:0;width:100%' },
        h('p', { id: 'aQ', style: 'font-weight:600' }, 'De 0 a 10, o quanto você recomendaria a Vemax a um amigo ou colega?'),
        h('div', { class: 'nps', role: 'radiogroup', 'aria-labelledby': 'aQ' }, btns),
        h('div', { class: 'nps-l' }, h('span', {}, '0 = nada provável'), h('span', {}, '10 = com certeza')),
        h('label', { for: 'aCom' }, 'Comentário (opcional)'), com,
        h('label', { for: 'aNome' }, 'Seu nome (opcional)'), nome,
        h('label', { class: 'chk', for: 'aAut', style: 'display:flex;gap:10px;font-weight:400;margin-top:14px' }, aut, h('span', {}, 'Autorizo a Vemax a usar meu comentário como depoimento no site, com o nome informado acima.')),
        msg, h('div', { class: 'actions' }, send)));
  })();
})();
