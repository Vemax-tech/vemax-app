/* Vemax — portfólio (lista na home + página de cada case).
   Os cases vêm do Supabase (tabela portfolio_cases, só publicados); se não houver nenhum
   ou a rede falhar, mostra os cases ILUSTRATIVOS abaixo (com selo visível).
   Todo texto vindo do banco entra no DOM via textContent: nada de innerHTML. */
(() => {
  'use strict';
  const C = window.VEMAX || {};
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, c = document) => c.querySelector(s);
  const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  };
  const icon = (id) => {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + id); s.append(u); return s;
  };
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const segIcon = (seg) => {
    const n = norm(seg);
    if (/comerc|loja|varej/.test(n)) return 'i-bag';
    if (/clinic|saude|medic/.test(n)) return 'i-heart';
    if (/condomin|imobil/.test(n)) return 'i-building';
    if (/servic/.test(n)) return 'i-wrench';
    if (/empres/.test(n)) return 'i-briefcase';
    if (/novo|startup/.test(n)) return 'i-rocket';
    return 'i-box';
  };
  const imgUrl = (p) => C.supabaseUrl + '/storage/v1/object/public/portfolio/' + String(p).split('/').map(encodeURIComponent).join('/');
  const caseHref = (slug) => 'portfolio/caso.html?c=' + encodeURIComponent(slug);

  /* ---------- Dados ---------- */
  const ETAPAS = (a, b, c, d) => [
    { titulo: 'Entendemos', texto: a }, { titulo: 'Pensamos', texto: b },
    { titulo: 'Construímos', texto: c }, { titulo: 'Evoluímos', texto: d },
  ];
  const FALLBACK = [
    { slug: 'estoque-e-pedidos', ilustrativo: true, segmento: 'Comércio', titulo: 'Estoque e pedidos em um só painel',
      problema: 'Estoque em planilhas e pedidos pelo WhatsApp, com vendas perdidas e dados duplicados.',
      solucao: 'Sistema único de estoque e pedidos, com alertas de reposição e painel de vendas.',
      resultado: 'Dados centralizados e menos retrabalho manual no dia a dia.',
      antes: 'Planilhas e mensagens soltas', depois: 'Um painel com tudo integrado',
      etapas: ETAPAS('Mapeamos como os pedidos chegavam e onde o estoque se perdia.', 'Definimos o mínimo que resolvia a dor principal antes de qualquer extra.', 'Entregas curtas, com o cliente validando cada versão.', 'Ajustes e novos recursos a partir do uso real.'),
      tags: ['Sistema', 'Dashboard', 'Automação'], historia: '' },
    { slug: 'agenda-com-lembretes', ilustrativo: true, segmento: 'Clínicas', titulo: 'Agenda com lembretes automáticos',
      problema: 'Agenda manual, faltas frequentes e recepção sobrecarregada com confirmações.',
      solucao: 'Agendamento online com confirmação e lembretes automáticos por mensagem.',
      resultado: 'Recepção liberada das confirmações e agenda mais organizada.',
      antes: 'Confirmação feita ligação a ligação', depois: 'Lembretes automáticos por mensagem',
      etapas: ETAPAS('Acompanhamos a rotina da recepção e levantamos os motivos das faltas.', 'Escolhemos o canal de aviso que os pacientes já usam.', 'Agenda, lembretes e um painel simples para a equipe.', 'Ajustamos horários e mensagens com base nas respostas.'),
      tags: ['Plataforma', 'Automação', 'Presença digital'], historia: '' },
    { slug: 'comunicacao-e-ocorrencias', ilustrativo: true, segmento: 'Condomínios', titulo: 'Comunicação e ocorrências organizadas',
      problema: 'Avisos espalhados em grupos de mensagem e ocorrências sem registro nem acompanhamento.',
      solucao: 'Portal com mural de avisos, registro de ocorrências e histórico por unidade.',
      resultado: 'Comunicação em um só lugar e ocorrências com responsável e prazo.',
      antes: 'Avisos perdidos em vários grupos', depois: 'Mural único e ocorrências com responsável',
      etapas: ETAPAS('Ouvimos síndico, portaria e moradores sobre o que mais travava.', 'Priorizamos o que dava mais ganho com menos mudança de hábito.', 'Lançamos por etapas, começando pelo mural de avisos.', 'Incluímos novos recursos conforme o condomínio pediu.'),
      tags: ['Portal', 'Sistema', 'Comunicação'], historia: '' },
  ];

  async function api(query) {
    if (!C.supabaseUrl || !C.supabaseAnonKey) return null;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(`${C.supabaseUrl}/rest/v1/portfolio_cases?${query}`, { signal: ctl.signal, headers: { apikey: C.supabaseAnonKey, Authorization: 'Bearer ' + C.supabaseAnonKey } });
      return r.ok ? await r.json() : null;
    } catch { return null; } finally { clearTimeout(t); }
  }
  const clean = (c) => ({ ...c, etapas: Array.isArray(c.etapas) ? c.etapas : [], tags: Array.isArray(c.tags) ? c.tags : [] });

  /* ---------- Peças ---------- */
  const media = (c, big) => c.imagem_path
    ? h('img', { class: 'pf-img' + (big ? ' big' : ''), src: imgUrl(c.imagem_path), alt: 'Tela do projeto ' + c.titulo, loading: big ? 'eager' : 'lazy', width: 800, height: 500 })
    : h('div', { class: 'pf-img ph' + (big ? ' big' : ''), 'aria-hidden': 'true' }, icon('i-logo'));
  const antesDepois = (c) => (c.antes || c.depois) && h('div', { class: 'pf-ba' },
    h('div', {}, h('small', {}, 'Antes'), h('span', {}, c.antes || '—')),
    h('span', { class: 'arr', 'aria-hidden': 'true' }, icon('i-arrow')),
    h('div', { class: 'on' }, h('small', {}, 'Depois'), h('span', {}, c.depois || '—')));
  const quote = (c) => c.depoimento && h('figure', { class: 'pf-quote' }, h('blockquote', {}, '“' + c.depoimento + '”'), c.depoimento_autor && h('figcaption', {}, c.depoimento_autor));
  const etapaItem = (e) => h('li', {}, h('b', {}, e.titulo, e.duracao && h('em', {}, e.duracao)), e.texto);

  function card(c) {
    return h('article', { class: 'card glass pf', 'data-seg': c.segmento || '' },
      media(c),
      h('div', { class: 'pf-top' }, h('span', { class: 'pf-seg' }, icon(segIcon(c.segmento)), c.segmento || 'Projeto'), c.ilustrativo && h('span', { class: 'pf-tag' }, 'Case ilustrativo')),
      h('h3', {}, c.titulo),
      antesDepois(c),
      h('dl', { class: 'pf-dl' },
        c.problema && h('div', {}, h('dt', {}, 'Problema'), h('dd', {}, c.problema)),
        c.solucao && h('div', {}, h('dt', {}, 'Solução'), h('dd', {}, c.solucao)),
        c.resultado && h('div', {}, h('dt', {}, 'Resultado'), h('dd', {}, c.resultado))),
      c.etapas.length > 0 && h('details', { class: 'pf-proc' }, h('summary', {}, 'Ver o processo'), h('ol', {}, c.etapas.map(etapaItem))),
      quote(c),
      c.tags.length > 0 && h('ul', { class: 'pf-tags' }, c.tags.map((t) => h('li', {}, t))),
      c.slug && h('a', { class: 'pf-link', href: caseHref(c.slug) }, 'Ver história completa', icon('i-arrow')));
  }

  /* ---------- Home: grade, filtros e contadores ---------- */
  async function mountList() {
    const grid = $('#pfGrid'); if (!grid) return;
    const rows = await api('select=*&publicado=eq.true&order=ordem.asc,criado_em.desc');
    const live = Array.isArray(rows) && rows.length > 0;
    const cases = (live ? rows : FALLBACK).map(clean);
    const cards = cases.map(card);
    grid.replaceChildren(...cards);
    grid.removeAttribute('aria-busy');

    const real = cases.filter((c) => !c.ilustrativo);
    const stats = $('#pfStats');
    if (stats && live && real.length) {
      const segs = new Set(real.map((c) => norm(c.segmento)).filter(Boolean));
      stats.replaceChildren(
        h('div', {}, h('b', {}, String(real.length)), h('span', {}, real.length === 1 ? 'projeto no portfólio' : 'projetos no portfólio')),
        segs.size > 0 && h('div', {}, h('b', {}, String(segs.size)), h('span', {}, segs.size === 1 ? 'segmento atendido' : 'segmentos atendidos')));
      stats.hidden = false;
    }

    const box = $('#pfFilters');
    const segs = [...new Set(cases.map((c) => c.segmento).filter(Boolean))];
    if (box && segs.length > 1) {
      const set = (val) => {
        cards.forEach((el, i) => { el.hidden = Boolean(val) && cases[i].segmento !== val; });
        [...box.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === val)));
      };
      box.replaceChildren(...['', ...segs].map((s) => h('button', { type: 'button', class: 'chip', 'data-v': s, 'aria-pressed': String(!s) }, s || 'Todos')));
      box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) set(b.dataset.v); });
      box.hidden = false;
    }
  }

  /* ---------- Página de um case ---------- */
  const missing = (root) => root.replaceChildren(h('div', { class: 'caso-empty' }, h('h1', {}, 'Case não encontrado'),
    h('p', {}, 'Esse projeto não existe ou ainda não foi publicado.'), h('a', { class: 'btn btn-primary', href: '../#portfolio' }, 'Ver o portfólio', icon('i-arrow'))));

  async function mountDetail() {
    const root = $('#caso'); if (!root) return;
    const slug = new URLSearchParams(location.search).get('c') || '';
    if (!SLUG.test(slug)) return missing(root);
    const rows = await api(`select=*&slug=eq.${encodeURIComponent(slug)}&publicado=eq.true&limit=1`);
    const c0 = (rows && rows[0]) || FALLBACK.find((x) => x.slug === slug);
    if (!c0) return missing(root);
    const c = clean(c0);

    document.title = `${c.titulo} — Vemax`;
    const meta = $('meta[name="description"]'); if (meta) meta.setAttribute('content', (c.solucao || c.problema || c.titulo).slice(0, 155));
    const hist = (c.historia || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

    root.replaceChildren(
      h('a', { class: 'caso-back', href: '../#portfolio' }, '← Voltar ao portfólio'),
      h('header', { class: 'caso-head' },
        h('div', { class: 'pf-top' }, h('span', { class: 'pf-seg' }, icon(segIcon(c.segmento)), c.segmento || 'Projeto'), c.ilustrativo && h('span', { class: 'pf-tag' }, 'Case ilustrativo')),
        h('h1', {}, c.titulo),
        c.tags.length > 0 && h('ul', { class: 'pf-tags' }, c.tags.map((t) => h('li', {}, t)))),
      media(c, true),
      antesDepois(c),
      h('div', { class: 'caso-cols' },
        c.problema && h('section', {}, h('h2', {}, 'O problema'), h('p', {}, c.problema)),
        c.solucao && h('section', {}, h('h2', {}, 'A solução'), h('p', {}, c.solucao)),
        c.resultado && h('section', {}, h('h2', {}, 'O resultado'), h('p', {}, c.resultado))),
      hist.length > 0 && h('section', { class: 'caso-story' }, h('h2', {}, 'A história do projeto'), hist.map((p) => h('p', {}, p))),
      c.etapas.length > 0 && h('section', { class: 'caso-proc' }, h('h2', {}, 'Como foi o processo'), h('ol', { class: 'pf-timeline' }, c.etapas.map(etapaItem))),
      quote(c),
      c.ilustrativo && h('p', { class: 'small caso-note' }, 'Este é um exemplo ilustrativo do nosso jeito de trabalhar, não um cliente real.'),
      h('div', { class: 'pf-cta glass' }, h('div', {}, h('h3', {}, 'Tem um problema parecido?'), h('p', {}, 'Conte o cenário. Mostramos o caminho até a solução.')),
        h('a', { class: 'btn btn-primary', href: '../#contato' }, 'Quero começar', icon('i-arrow'))));
  }

  mountList();
  mountDetail();
})();
