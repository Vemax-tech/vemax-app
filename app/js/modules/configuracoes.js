// Configurações: notificações (todos) e, para administradores, categorias, etapas, prioridades, modelos de projeto e lixeira
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, quiet } from '../core.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, toast } from '../ui.js';

const GRUPOS = [
  ['etapa_lead', 'Etapas do funil de leads', false], ['etapa_projeto', 'Etapas do quadro de projetos', false], ['etapa_tarefa', 'Etapas do quadro de tarefas', false], ['etapa_chamado', 'Etapas do quadro de suporte', false],
  ['prioridade', 'Prioridades', false], ['origem_lead', 'Origens de lead', true], ['motivo_perda', 'Motivos de perda', true], ['categoria_despesa', 'Categorias de despesa', true],
];
const NOTIF = { contatos: ['Leads e propostas', 'Novo lead e resposta de proposta'], projetos: ['Projetos', 'Avaliações recebidas dos clientes'], suporte: ['Suporte', 'Novos chamados'], equipe: ['Equipe', 'Cadastros aguardando aprovação'] };
const LIXEIRA = [
  ['clientes', 'Cliente', (r) => r.nome], ['contatos_site', 'Lead', (r) => r.empresa || r.nome], ['propostas', 'Proposta', (r) => r.titulo], ['projetos', 'Projeto', (r) => r.titulo],
  ['tarefas', 'Tarefa', (r) => r.titulo], ['chamados', 'Chamado', (r) => `#${r.numero} ${r.assunto}`], ['cobrancas', 'Cobrança', (r) => r.descricao], ['despesas', 'Despesa', (r) => r.descricao],
];

export const init = () => start('configuracoes/', 'Configurações', async (ctx, view) => {
  const admin = ctx.isAdmin;
  const abas = [['notif', 'Notificações'], ...(admin ? [['cat', 'Categorias de serviço'], ['etapas', 'Etapas e listas'], ['modelos', 'Modelos de projeto'], ['lixeira', 'Lixeira']] : []), ['integ', 'Integrações']];
  const st = { aba: 'notif', grupo: 'etapa_lead' };
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Seções das configurações' }), body = h('div');

  // ---------------------------------------------------------------- notificações
  const secNotif = () => {
    const prefs = { ...(ctx.profile.notif_prefs || {}) };
    const mods = Object.entries(NOTIF).filter(([k]) => (k === 'equipe' ? admin : ctx.can(k)));
    return h('div', { class: 'card' }, h('h2', {}, 'Avisos no sino do portal'), h('p', { class: 'small muted', style: 'margin:4px 0 12px' }, 'Escolha quais avisos aparecem no sino para você. Isso não afeta o que os outros veem.'),
      mods.map(([k, [t, sub]]) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: prefs[k] !== false, onchange: async (e) => {
        const prev = { ...prefs }; prefs[k] = e.target.checked;
        const r = await run(sb.from('profiles').update({ notif_prefs: prefs }).eq('id', ctx.user.id).select().single(), 'Preferência salva.');
        if (r) ctx.profile.notif_prefs = r.notif_prefs; else { Object.assign(prefs, prev); e.target.checked = prev[k] !== false; } } }), h('span', {}, h('b', {}, t), h('div', { class: 'small muted' }, sub)))),
      h('p', { class: 'small muted', style: 'margin-top:14px' }, 'Os avisos por e-mail dependem de uma função que o administrador precisa publicar e configurar no Supabase. Enquanto isso não for feito, os avisos aparecem apenas no portal.'));
  };

  // ---------------------------------------------------------------- categorias
  const secCat = async () => {
    const rows = (await run(sb.from('categorias_servico').select('*').order('ordem'))) || [];
    const box = h('div');
    const paint = () => box.replaceChildren(rows.length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Categoria', 'Ativa', 'Ordem', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((c, i) => h('tr', {},
        h('td', {}, h('input', { value: c.nome, maxlength: 60, 'aria-label': 'Nome da categoria', onchange: async (e) => {
          const nome = e.target.value.trim(); if (!nome) { e.target.value = c.nome; return; }
          const r = await run(sb.from('categorias_servico').update({ nome }).eq('id', c.id).select().single(), 'Categoria renomeada.'); if (r) Object.assign(c, r); else e.target.value = c.nome; } })),
        h('td', {}, h('input', { type: 'checkbox', style: 'width:auto', checked: c.ativo, 'aria-label': 'Ativa: ' + c.nome, onchange: async (e) => { const r = await run(sb.from('categorias_servico').update({ ativo: e.target.checked }).eq('id', c.id).select().single()); if (r) Object.assign(c, r); else e.target.checked = c.ativo; } })),
        h('td', {}, mover(rows, i, 'categorias_servico', 'id', paint)), h('td', {}, '')))))) : empty('Nenhuma categoria cadastrada.'));
    paint();
    return h('div', {}, h('div', { class: 'card' }, h('h2', {}, 'Categorias de serviço'), h('p', { class: 'small muted', style: 'margin:4px 0 12px' }, 'Usadas em leads, projetos e modelos. Desative em vez de apagar: o histórico continua mostrando a categoria antiga.'),
      h('button', { class: 'btn primary sm', onclick: () => formModal({ title: 'Nova categoria', fields: [{ name: 'nome', label: 'Nome', required: true, maxlength: 60 }], onSubmit: async (v) => {
        const r = await run(sb.from('categorias_servico').insert({ nome: v.nome, ordem: Math.max(0, ...rows.map((x) => x.ordem)) + 1 }).select().single(), 'Categoria criada.');
        if (!r) return false; rows.push(r); paint(); } }) }, 'Nova categoria')), box);
  };
  /** Botões ↑ ↓ que trocam a ordem de dois itens vizinhos. */
  const mover = (rows, i, tabela, chave, repintar, extra = {}) => h('span', { class: 'row', style: 'gap:4px' },
    ...[[-1, '↑', 'Subir'], [1, '↓', 'Descer']].map(([d, s, t]) => h('button', { class: 'btn sm', disabled: i + d < 0 || i + d >= rows.length, 'aria-label': t, onclick: async () => {
      const a = rows[i], b = rows[i + d], oa = a.ordem, ob = b.ordem === a.ordem ? a.ordem + d : b.ordem;
      const sel = (r) => ({ ...(tabela === 'opcoes' ? { grupo: r.grupo, chave: r.chave } : { id: r.id }) });
      const ok1 = await run(sb.from(tabela).update({ ordem: ob }).match(sel(a))), ok2 = ok1 && await run(sb.from(tabela).update({ ordem: oa }).match(sel(b)));
      if (!ok2) return;
      a.ordem = ob; b.ordem = oa; rows.sort((x, y) => x.ordem - y.ordem); repintar();
    } }, s)));

  // ---------------------------------------------------------------- etapas e listas
  const secEtapas = async () => {
    const todos = (await run(sb.from('opcoes').select('*').order('ordem'))) || [];
    const box = h('div');
    const paint = () => {
      const [, titulo, aberto] = GRUPOS.find((g) => g[0] === st.grupo);
      const rows = todos.filter((o) => o.grupo === st.grupo).sort((a, b) => a.ordem - b.ordem);
      box.replaceChildren(h('div', { class: 'card' }, h('h2', {}, titulo),
        h('p', { class: 'small muted', style: 'margin:4px 0 12px' }, aberto ? 'Você pode renomear, ocultar, reordenar e acrescentar itens.' : 'Você pode renomear, reordenar e ocultar. Ocultar uma etapa a retira das listas e colunas, mas cards que já estão nela continuam visíveis.'),
        aberto && h('button', { class: 'btn primary sm', style: 'margin-bottom:12px', onclick: () => formModal({ title: 'Novo item', fields: [{ name: 'nome', label: 'Nome', required: true, maxlength: 60 }], validate: (v) => (L.slug(v.nome) ? '' : 'Use letras ou números no nome.') || (rows.some((r) => r.chave === L.slug(v.nome)) ? 'Já existe um item com esse nome.' : ''),
          onSubmit: async (v) => { const r = await run(sb.from('opcoes').insert({ grupo: st.grupo, chave: L.slug(v.nome), nome: v.nome, ordem: Math.max(0, ...rows.map((x) => x.ordem)) + 1 }).select().single(), 'Item criado.'); if (!r) return false; todos.push(r); paint(); } }) }, 'Novo item'),
        h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nome exibido', 'Ativo', 'Ordem'].map((t) => h('th', {}, t)))),
          h('tbody', {}, rows.map((o, i) => h('tr', {},
            h('td', {}, h('input', { value: o.nome, maxlength: 60, 'aria-label': 'Nome de ' + o.chave, onchange: async (e) => { const nome = e.target.value.trim(); if (!nome) { e.target.value = o.nome; return; } const r = await run(sb.from('opcoes').update({ nome }).match({ grupo: o.grupo, chave: o.chave }).select().single(), 'Nome atualizado.'); if (r) Object.assign(o, r); else e.target.value = o.nome; } })),
            h('td', {}, h('input', { type: 'checkbox', style: 'width:auto', checked: o.ativo, 'aria-label': 'Ativo: ' + o.nome, onchange: async (e) => {
              if (!e.target.checked && rows.filter((x) => x.ativo).length <= 1) { toast('Mantenha pelo menos um item ativo.', true); e.target.checked = true; return; }
              const r = await run(sb.from('opcoes').update({ ativo: e.target.checked }).match({ grupo: o.grupo, chave: o.chave }).select().single()); if (r) Object.assign(o, r); else e.target.checked = o.ativo; } })),
            h('td', {}, mover(rows, i, 'opcoes', 'chave', paint)))))))));
    };
    const sel = h('select', { 'aria-label': 'Lista a configurar', style: 'max-width:360px;margin-bottom:14px', onchange: (e) => { st.grupo = e.target.value; paint(); } }, GRUPOS.map(([k, l]) => h('option', { value: k, selected: k === st.grupo }, l)));
    paint(); return h('div', {}, sel, box);
  };

  // ---------------------------------------------------------------- modelos
  const secModelos = async () => {
    const [rows, cats] = await Promise.all([run(sb.from('modelos_projeto').select('*').order('nome')), run(sb.from('categorias_servico').select('id,nome,ativo').order('ordem'))]);
    const lista = rows || [], box = h('div');
    const form = (m = {}) => formModal({ title: m.id ? 'Editar modelo' : 'Novo modelo', fields: [
      { name: 'nome', label: 'Nome do modelo', required: true, maxlength: 80, value: m.nome },
      { name: 'categoria_id', label: 'Categoria', type: 'select', nullable: true, value: m.categoria_id, options: [['', '— nenhuma —'], ...(cats || []).filter((c) => c.ativo || c.id === m.categoria_id).map((c) => [c.id, c.nome])] },
      { name: 'descricao', label: 'Descrição', type: 'textarea', maxlength: 1000, value: m.descricao },
      { name: 'prazo_dias', label: 'Prazo sugerido (dias)', type: 'number', step: '1', min: 1, max: 1000, nullable: true, value: m.prazo_dias },
      { name: 'esforco_horas', label: 'Esforço sugerido (horas)', type: 'number', step: '0.5', min: 0, nullable: true, value: m.esforco_horas },
      { name: 'tarefas', label: 'Tarefas iniciais (uma por linha)', type: 'textarea', value: L.formatarLinhasModelo(m.tarefas, 'tarefa'), hint: 'Formato: Título | prioridade | dias após o início. Ex.: Levantar requisitos | alta | 5' },
      { name: 'entregas', label: 'Entregas e marcos (um por linha)', type: 'textarea', value: L.formatarLinhasModelo(m.entregas, 'entrega'), hint: 'Formato: Título | dias após o início. Ex.: Protótipo aprovado | 10' },
      { name: 'ativo', label: 'Disponível para uso?', type: 'select', value: m.ativo === false ? 'nao' : 'sim', options: [['sim', 'Sim'], ['nao', 'Não, ocultar']] }],
    validate: (v) => L.lerLinhasModelo(v.tarefas, 'tarefa').erro || L.lerLinhasModelo(v.entregas, 'entrega').erro || '',
    onSubmit: async (v) => {
      const row = { nome: v.nome, categoria_id: v.categoria_id, descricao: v.descricao, prazo_dias: v.prazo_dias, esforco_horas: v.esforco_horas, ativo: v.ativo === 'sim',
        tarefas: L.lerLinhasModelo(v.tarefas, 'tarefa').itens, entregas: L.lerLinhasModelo(v.entregas, 'entrega').itens };
      const r = await run(m.id ? sb.from('modelos_projeto').update(row).eq('id', m.id).select().single() : sb.from('modelos_projeto').insert(row).select().single(), 'Modelo salvo.');
      if (!r) return false; if (m.id) Object.assign(m, r); else lista.push(r); paint();
    } });
    const paint = () => box.replaceChildren(lista.length ? h('ul', { class: 'ul-list card' }, lista.map((m) => h('li', {},
      h('div', { class: 'row between' }, h('b', {}, m.nome), h('span', { class: 'row', style: 'gap:6px' }, !m.ativo && badge('Oculto', 'dim'), badge((cats || []).find((c) => c.id === m.categoria_id)?.nome || 'Sem categoria', 'dim'))),
      h('p', { class: 'small muted' }, `${m.tarefas.length} tarefa(s) · ${m.entregas.length} entrega(s)${m.prazo_dias ? ' · ' + m.prazo_dias + ' dias' : ''}${m.esforco_horas != null ? ' · ' + m.esforco_horas + ' h' : ''}`),
      m.descricao && h('p', { class: 'small' }, m.descricao),
      h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn sm', onclick: () => form(m) }, 'Editar'),
        h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg(`Excluir o modelo “${m.nome}”? Projetos já criados com ele não são afetados.`) && await run(sb.from('modelos_projeto').delete().eq('id', m.id), 'Modelo excluído.')) { lista.splice(lista.indexOf(m), 1); paint(); } } }, 'Excluir'))))) : empty('Nenhum modelo. Crie um para começar projetos com tarefas e entregas prontas.'));
    paint();
    return h('div', {}, h('p', { class: 'small muted', style: 'margin-bottom:12px' }, 'Ao criar um projeto a partir de um modelo, as tarefas e entregas abaixo são criadas com prazos contados a partir do início.'),
      h('button', { class: 'btn primary sm', style: 'margin-bottom:12px', onclick: () => form() }, 'Novo modelo'), box);
  };

  // ---------------------------------------------------------------- lixeira
  const secLixeira = async () => {
    const nomes = (await quiet(sb.from('profiles').select('id,nome'))), quem = (id) => nomes.find((n) => n.id === id)?.nome || '—';
    const itens = (await Promise.all(LIXEIRA.map(async ([tabela, tipo, nome]) => (await quiet(sb.from(tabela).select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(100))).map((r) => ({ tabela, tipo, nome: nome(r), r }))))).flat()
      .sort((a, b) => b.r.deleted_at.localeCompare(a.r.deleted_at));
    const box = h('div');
    const paint = () => box.replaceChildren(itens.length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Item', 'Tipo', 'Removido em', 'Por', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, itens.map((it) => h('tr', {}, h('td', {}, it.nome), h('td', {}, it.tipo), h('td', {}, new Date(it.r.deleted_at).toLocaleString('pt-BR')), h('td', {}, quem(it.r.deleted_by)),
        h('td', {}, h('div', { class: 'row' },
          h('button', { class: 'btn sm primary', onclick: async () => { if (await run(sb.from(it.tabela).update({ deleted_at: null }).eq('id', it.r.id), 'Item restaurado.')) { itens.splice(itens.indexOf(it), 1); paint(); } } }, 'Restaurar'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!(await confirmDlg(`Excluir “${it.nome}” de forma definitiva? Isso não pode ser desfeito.`))) return;
            if (await run(sb.from(it.tabela).delete().eq('id', it.r.id), 'Excluído definitivamente.')) { itens.splice(itens.indexOf(it), 1); paint(); } } }, 'Excluir de vez')))))))) : empty('A lixeira está vazia. Itens excluídos nos módulos ficam aqui até serem restaurados ou apagados de vez.'));
    paint();
    return h('div', {}, h('p', { class: 'small muted', style: 'margin-bottom:12px' }, 'Clientes, leads, propostas, projetos, tarefas, chamados, cobranças e despesas removidos ficam aqui. Só administradores restauram ou apagam definitivamente. Mostra os 100 mais recentes de cada tipo.'), box);
  };

  // ---------------------------------------------------------------- integrações
  const secInteg = () => {
    const linha = (nome, estado, kind, texto) => h('li', {}, h('div', { class: 'row between' }, h('b', {}, nome), badge(estado, kind)), h('p', { class: 'small muted' }, texto));
    return h('div', { class: 'card' }, h('h2', {}, 'Integrações'), h('p', { class: 'small muted', style: 'margin:4px 0 8px' }, 'O que está ligado hoje e o que ainda depende de configuração ou contratação.'),
      h('ul', { class: 'ul-list' },
        linha('Formulário do site → Leads', 'Ativa', 'ok', 'Contatos enviados pelo site entram em Leads e geram aviso no sino.'),
        linha('Link de proposta e de acompanhamento do cliente', 'Ativa', 'ok', 'Páginas públicas com link privado, sem login. Não mostram notas internas nem valores de outros registros.'),
        linha('Aviso por e-mail da equipe', 'Não configurada', 'dim', 'A função existe no repositório, mas precisa ser publicada e receber chave do serviço de e-mail.'),
        linha('WhatsApp', 'Não configurada', 'dim', 'Sem integração oficial. Registre as conversas manualmente em Suporte e Leads.'),
        linha('Recebimento de e-mails como chamados', 'Não configurada', 'dim', 'Registre os pedidos manualmente em Suporte.'),
        linha('Calendário', 'Não configurada', 'dim', 'Use a data do próximo contato dos leads e os prazos de projetos e tarefas.'),
        linha('Bancos, boletos e notas fiscais', 'Não configurada', 'dim', 'O financeiro é manual: registre vencimentos e pagamentos.')));
  };

  async function mostrar() {
    nav.replaceChildren(...abas.map(([k, l]) => h('a', { href: '#', class: st.aba === k ? 'on' : '', 'aria-current': st.aba === k ? 'page' : null, onclick: (e) => { e.preventDefault(); st.aba = k; mostrar(); } }, l)));
    body.replaceChildren(h('div', { class: 'spin', 'aria-label': 'Carregando' }));
    const sec = { notif: secNotif, cat: secCat, etapas: secEtapas, modelos: secModelos, lixeira: secLixeira, integ: secInteg }[st.aba];
    try { body.replaceChildren(await sec()); } catch (e) { console.error(e); body.replaceChildren(empty('Não foi possível carregar esta seção.')); }
  }
  view.append(pageHead('Preferências', 'Configurações', admin ? 'Ajuste o portal ao jeito da equipe, sem mexer em código.' : 'Suas preferências no portal.'), nav, body);
  await mostrar();
});
