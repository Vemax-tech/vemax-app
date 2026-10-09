/* Vemax — acompanhamento do projeto pelo cliente (link privado). */
(() => {
  'use strict';
  const { h, rpc, dia, token, empty } = window.VX;
  const root = document.getElementById('acomp');
  const FASES = [['planejado', 'Planejado'], ['andamento', 'Em andamento'], ['concluido', 'Concluído']];

  (async () => {
    const t = token();
    if (!t) return empty(root, 'Link inválido', 'O endereço parece incompleto. Peça um novo à equipe da Vemax.');
    const p = await rpc('projeto_publico', { p_token: t });
    if (!p) return empty(root, 'Acompanhamento indisponível', 'O link não existe ou foi desativado. Fale com a equipe da Vemax.');
    document.title = `${p.titulo} — Acompanhamento Vemax`;

    // "Pausado" aparece como etapa de andamento com aviso; as 3 fases principais ficam sempre visíveis.
    const idx = p.status === 'concluido' ? 2 : p.status === 'planejado' ? 0 : 1;
    const info = [['Início', dia(p.iniciado_em)], ['Prazo previsto', p.prazo ? dia(p.prazo) : 'A combinar'], ['Conclusão', p.concluido_em ? dia(p.concluido_em) : '—']];
    const ups = Array.isArray(p.atualizacoes) ? p.atualizacoes : [];

    root.replaceChildren(
      h('header', { class: 'caso-head' }, h('p', { class: 'eyebrow' }, 'Acompanhamento do projeto'), h('h1', {}, p.titulo), p.cliente && h('p', { style: 'color:var(--muted)' }, p.cliente)),
      h('ol', { class: 'fases', 'aria-label': 'Etapas do projeto' }, FASES.map(([k, l], i) => h('li', { class: i < idx ? 'ok' : i === idx ? 'on' : '', 'aria-current': i === idx ? 'step' : null }, h('span', {}, i < idx || p.status === 'concluido' ? '✓' : String(i + 1)), l))),
      p.status === 'pausado' && h('p', { class: 'aviso', role: 'status' }, 'O projeto está temporariamente pausado. Nossa equipe entrará em contato.'),
      p.bloqueado && p.status !== 'concluido' && h('p', { class: 'aviso', role: 'status' }, 'Estamos aguardando uma definição para seguir. Se precisarmos de algo de você, entraremos em contato.'),
      h('dl', { class: 'prop-info' }, info.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
      h('section', {}, h('h2', {}, 'Atualizações'),
        ups.length ? h('ol', { class: 'pf-timeline' }, ups.map((u) => h('li', {}, h('b', {}, dia(u.criado_em)), u.texto))) : h('p', { style: 'color:var(--muted)' }, 'Ainda não há atualizações publicadas. Elas aparecem aqui conforme o projeto avança.')),
      h('p', { class: 'small', style: 'color:var(--muted)' }, 'Dúvidas? ', h('a', { href: './#contato', style: 'color:var(--amber-hi);text-decoration:underline' }, 'Fale com a equipe'), '.'));
  })();
})();
