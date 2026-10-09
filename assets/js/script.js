/* Vemax — interações da página (JS puro, sem dependências) */
(() => {
  'use strict';

  /* ---------- Configuração: veja assets/js/config.js ---------- */
  const CONFIG = window.VEMAX;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svgIcon = (id) => {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + id); s.append(u); return s;
  };

  $('#year').textContent = new Date().getFullYear();

  /* ---------- Menu mobile ---------- */
  const nav = $('#nav'), burger = $('#burger');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    burger.firstElementChild.firstElementChild.setAttribute('href', open ? '#i-x' : '#i-menu');
  };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Reveal no scroll + contagem de números ---------- */
  const countUp = (el) => {
    const end = +el.dataset.count;
    if (reduce) return;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / 1400, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('pt-BR');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      $$('[data-count]', en.target).forEach(countUp);
      revealIO.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el, i) => {
    el.style.setProperty('--d', (i % 4) * 0.08 + 's'); // pequena cascata dentro de grupos
    revealIO.observe(el);
  });

  /* ---------- Seção ativa no menu ---------- */
  const links = $$('.nav a[href^="#"]:not(.btn)');
  const map = { negocios: 'solucoes', problema: 'solucoes' };
  const secIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = map[en.target.id] || en.target.id;
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main > section[id]').forEach((s) => secIO.observe(s));

  /* ---------- Faíscas douradas ---------- */
  if (!reduce) {
    const small = matchMedia('(max-width: 899px)').matches;
    $$('[data-sparks]').forEach((box) => {
      const n = Math.round(+box.dataset.sparks / (small ? 2.5 : 1));
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'spark';
        s.style.cssText = `left:${Math.random() * 100}%;top:${20 + Math.random() * 75}%;--t:${6 + Math.random() * 7}s;--dl:${-Math.random() * 10}s`;
        box.append(s);
      }
    });
  }

  /* ---------- Conte seu problema (demonstrativo, sem IA real) ---------- */
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const RULES = [
    { keys: ['cliente', 'planilha', 'whatsapp', 'cadastro', 'organizar', 'controle', 'agenda', 'bagunc'],
      text: 'Sua empresa precisa centralizar clientes, organizar informações e reduzir tarefas manuais.',
      items: ['Sistema de gestão', 'Cadastro de clientes', 'Dashboard', 'Automação', 'Integração com WhatsApp'] },
    { keys: ['site', 'landing', 'online', 'loja', 'internet', 'instagram', 'divulg', 'pagina', 'vender', 'venda', 'digital'],
      text: 'Sua empresa precisa de uma presença digital que apresente bem o negócio e transforme visitas em contatos.',
      items: ['Site institucional', 'Landing page de conversão', 'Fluxo direto para WhatsApp', 'Otimização para buscas (SEO)', 'Painel de resultados'] },
    { keys: ['automatiz', 'repetitiv', 'manual', 'retrabalho', 'rotina', 'processo', 'demora'],
      text: 'Sua empresa precisa eliminar tarefas repetitivas e deixar os processos rodando sozinhos.',
      items: ['Mapeamento do processo', 'Automação de tarefas', 'Integração entre sistemas', 'Alertas automáticos', 'Relatório de tempo economizado'] },
    { keys: ['atendimento', 'chat', 'atendente', 'duvida', 'suporte', 'responder', 'bot', 'mensagem'],
      text: 'Sua empresa precisa de um atendimento mais rápido, que não dependa de alguém respondendo o tempo todo.',
      items: ['Assistente com IA', 'Atendimento integrado ao WhatsApp', 'Respostas automáticas inteligentes', 'Encaminhamento para uma pessoa', 'Painel de conversas'] },
    { keys: ['relatorio', 'indicador', 'dado', 'dashboard', 'grafico', 'metrica', 'resultado', 'numero'],
      text: 'Sua empresa precisa enxergar os números com clareza para decidir com segurança.',
      items: ['Dashboard de indicadores', 'Centralização dos dados', 'Relatórios automáticos', 'Metas e alertas', 'Acesso por perfil'] },
    { keys: ['ideia', 'app', 'aplicativo', 'produto', 'startup', 'plataforma', 'mvp', 'sistema'],
      text: 'Sua ideia precisa virar um produto de verdade, começando pequeno e crescendo com validação.',
      items: ['Validação da ideia', 'MVP enxuto', 'Plataforma escalável', 'Painel administrativo', 'Plano de evolução'] },
  ];
  const FALLBACK = {
    text: 'Ainda precisamos de mais detalhes, mas o seu cenário tem tudo para ser simplificado com tecnologia sob medida.',
    items: ['Diagnóstico do problema', 'Proposta de solução sob medida', 'Protótipo rápido', 'Desenvolvimento', 'Acompanhamento e evolução'],
  };

  const form = $('#pForm'), txt = $('#pText'), err = $('#pErr'), load = $('#pLoad'), res = $('#pRes');
  const state = { problem: '', solution: null };

  const analyze = (raw) => {
    const t = norm(raw);
    let best = null, top = 0;
    RULES.forEach((r) => { const s = r.keys.filter((k) => t.includes(k)).length; if (s > top) { top = s; best = r; } });
    return best || FALLBACK;
  };
  const show = (el) => { [form, load, res].forEach((x) => (x.hidden = x !== el)); };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = txt.value.trim();
    if (val.length < 3) { err.hidden = false; txt.focus(); return; }
    err.hidden = true;
    state.problem = val;
    state.solution = analyze(val);
    show(load);
    const msgs = ['Analisando seu cenário…', 'Conectando as peças…', 'Montando o melhor caminho…'];
    const msgEl = $('#pLoadMsg'); let k = 0;
    const iv = setInterval(() => { msgEl.textContent = msgs[++k % msgs.length]; }, 800);
    setTimeout(() => {
      clearInterval(iv);
      $('#resText').textContent = state.solution.text;
      const ul = $('#resList'); ul.replaceChildren();
      state.solution.items.forEach((it, n) => {
        const li = document.createElement('li'); li.style.setProperty('--n', n);
        li.append(svgIcon('i-check'), it); ul.append(li);
      });
      show(res);
      $('#resCta').focus({ preventScroll: true });
    }, reduce ? 300 : 2600);
  });
  txt.addEventListener('input', () => { err.hidden = true; });
  $('#resReset').addEventListener('click', () => { txt.value = ''; show(form); txt.focus(); });

  /* ---------- Formulário de contato / WhatsApp ---------- */
  const cForm = $('#cForm'), ctaBtn = $('#ctaBtn'), cMsg = $('#cMsg'), cErr = $('#cErr');
  let openedAt = 0;   // anti-spam: robôs preenchem e enviam em menos de 3 s
  const openForm = (prefill) => {
    if (!openedAt) openedAt = Date.now();
    cForm.hidden = false; ctaBtn.setAttribute('aria-expanded', 'true');
    if (prefill) cMsg.value = prefill;
  };
  ctaBtn.addEventListener('click', () => {
    openForm();
    cForm.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    $('#cName').focus({ preventScroll: true });
  });
  $('#resCta').addEventListener('click', () => {
    const s = state.solution;
    openForm(`Olá! Meu problema: ${state.problem}\n\nSolução sugerida no site: ${s.items.join(', ')}.\n\nGostaria de conversar sobre isso.`);
    setTimeout(() => $('#cName').focus({ preventScroll: true }), 600);
  });
  const readForm = () => {
    const d = { nome: $('#cName').value.trim(), contato: $('#cContact').value.trim(), msg: cMsg.value.trim() };
    const ok = d.nome && d.contato && d.msg;
    cErr.hidden = !!ok;
    return ok ? d : null;
  };
  // Registra o contato no portal (best effort: nunca bloqueia o envio ao WhatsApp/e-mail)
  const COOLDOWN = 60 * 1000;
  const spammy = () => {
    if ($('#cSite').value || Date.now() - openedAt < 3000) return true;   // honeypot preenchido ou rápido demais
    try { const last = +sessionStorage.getItem('vx_last') || 0; if (Date.now() - last < COOLDOWN) return true; } catch { /* sem storage: segue */ }
    return false;
  };
  const saveContact = (d) => {
    if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey || spammy()) return;
    try { sessionStorage.setItem('vx_last', String(Date.now())); } catch { /* ignora */ }
    fetch(CONFIG.supabaseUrl + '/rest/v1/contatos_site', {
      method: 'POST', keepalive: true,
      headers: { apikey: CONFIG.supabaseAnonKey, Authorization: 'Bearer ' + CONFIG.supabaseAnonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ nome: d.nome.slice(0, 120), contato: d.contato.slice(0, 160), mensagem: d.msg.slice(0, 2000),
        problema: state.problem ? state.problem.slice(0, 2000) : null,
        solucao_sugerida: state.solution ? state.solution.items.join(', ').slice(0, 600) : null }),
    }).catch(() => {});
  };
  const body = (d) => `Olá! Sou ${d.nome} (${d.contato}).\n\n${d.msg}`;
  cForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = readForm(); if (!d) return;
    saveContact(d);
    open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(body(d))}`, '_blank', 'noopener');
  });
  $('#cMail').addEventListener('click', () => {
    const d = readForm(); if (!d) return;
    saveContact(d);
    location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent('Contato pelo site')}&body=${encodeURIComponent(body(d))}`;
  });

  /* ---------- Negócios: painel muda conforme o item ---------- */
  const BIZ = {
    comercio: { t: 'Gestão de vendas e estoque', f: ['Controle de estoque em tempo real', 'Cadastro e histórico de clientes', 'Vendas e relatórios no painel', 'Avisos de reposição'] },
    servicos: { t: 'Agenda e orçamentos num só lugar', f: ['Agenda online com lembretes', 'Orçamentos gerados em minutos', 'Histórico de cada cliente', 'Atendimento integrado ao WhatsApp'] },
    condominios: { t: 'Gestão e comunicação do condomínio', f: ['Comunicados e avisos aos moradores', 'Reservas de áreas comuns', 'Controle de acesso e visitantes', 'Chamados e manutenção'] },
    clinicas: { t: 'Agendamentos e organização da clínica', f: ['Agenda por profissional', 'Confirmação automática de consultas', 'Cadastro e prontuário organizado', 'Indicadores de ocupação'] },
    empresas: { t: 'Processos internos que rodam sozinhos', f: ['Automação de rotinas repetitivas', 'Sistema interno sob medida', 'Dashboards de indicadores', 'Integração entre ferramentas'] },
    novos: { t: 'Da ideia ao produto no ar', f: ['Validação rápida com MVP', 'Plataforma pronta para crescer', 'Painel administrativo', 'Evolução contínua com feedback'] },
  };
  const out = $('#bizOut');
  const renderBiz = (key) => {
    const b = BIZ[key];
    $('#bizTitle').textContent = b.t;
    const ul = $('#bizFeat'); ul.replaceChildren();
    b.f.forEach((x) => { const li = document.createElement('li'); li.append(svgIcon('i-check'), x); ul.append(li); });
    out.classList.remove('swap'); void out.offsetWidth; out.classList.add('swap');
  };
  $('#bizList').addEventListener('click', (e) => {
    const btn = e.target.closest('.biz-item'); if (!btn) return;
    $$('.biz-item').forEach((x) => x.classList.toggle('is-on', x === btn));
    renderBiz(btn.dataset.biz);
  });
  renderBiz('comercio');

  /* ---------- Mockup: destaca a região do item ---------- */
  const mock = $('#mock');
  const hl = (regions) => {
    const set = regions ? regions.split(' ') : [];
    mock.classList.toggle('dim', set.length > 0);
    $$('[data-r]', mock).forEach((el) => el.classList.toggle('hl', set.includes(el.dataset.r)));
  };
  $$('#devList li').forEach((li) => {
    const on = () => { li.classList.add('on'); hl(li.dataset.r); };
    const off = () => { li.classList.remove('on'); hl(''); };
    li.addEventListener('mouseenter', on); li.addEventListener('mouseleave', off);
    li.addEventListener('focus', on); li.addEventListener('blur', off);
    li.addEventListener('click', () => { $$('#devList li.on').forEach((x) => x.classList.remove('on')); on(); }); // toque no mobile
  });
})();
