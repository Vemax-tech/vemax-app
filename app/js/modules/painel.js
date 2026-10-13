// Visão geral: pendências e indicadores reais de leads, propostas, tarefas, projetos, suporte e financeiro
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, loadBase, quiet, filtros } from '../core.js';
import { start, h, run, pageHead, empty, fmtDate } from '../ui.js';

const PERIODOS = [['mes', 'Este mês'], ['mes_anterior', 'Mês anterior'], ['30d', 'Últimos 30 dias'], ['90d', 'Últimos 90 dias'], ['ano', 'Este ano'], ['todos', 'Todo o período']];
const ENTIDADE = { contatos_site: 'o lead', propostas: 'a proposta', clientes: 'o cliente', projetos: 'o projeto', tarefas: 'a tarefa', chamados: 'o chamado', cobrancas: 'a cobrança', despesas: 'a despesa',
  permissoes: 'a permissão de', profiles: 'o usuário', opcoes: 'a configuração', categorias_servico: 'a categoria', modelos_projeto: 'o modelo', nichos: 'o nicho', pesquisas: 'a pesquisa', conhecimento: 'o artigo', projeto_escopo_alteracoes: 'a alteração de escopo', portfolio_cases: 'o case' };

/** Top 5 nichos pela média ponderada das notas (mesma regra do comparador de mercado). */
async function ranking() {
  const [nichos, crit, notas] = await Promise.all([run(sb.from('nichos').select('id,nome,alvo')), run(sb.from('criterios').select('id,peso')), run(sb.from('notas_nicho').select('nicho_id,criterio_id,nota'))]);
  const peso = new Map((crit || []).map((c) => [c.id, Number(c.peso)]));
  return (nichos || []).map((n) => {
    let s = 0, w = 0; (notas || []).filter((x) => x.nicho_id === n.id).forEach((x) => { const p = peso.get(x.criterio_id) ?? 0; s += x.nota * p; w += p; });
    return { ...n, score: w ? s / w : null };
  }).filter((n) => n.score != null).sort((a, b) => b.score - a.score).slice(0, 5);
}

export const init = () => start('', 'Visão geral', async (ctx, view) => {
  const first = (ctx.profile.nome || '').split(' ')[0] || 'equipe', hoje = L.hojeISO();
  const f = { per: 'mes', resp: '', pend: '' };
  const [base, projs, leads, props, tars, chams, cobs, desp, tarefasHoras, atividades, contratos] = await Promise.all([
    loadBase(),
    ctx.can('projetos') ? quiet(sb.from('projetos').select('id,titulo,cliente,cliente_id,status,prazo,bloqueado,responsavel_id,esforco_horas,valor_contratado,concluido_em,criado_em').is('deleted_at', null)) : [],
    ctx.can('contatos') ? quiet(sb.from('contatos_site').select('id,nome,empresa,status,responsavel_id,primeiro_contato_em,proximo_contato,etapa_desde,criado_em,valor_estimado').is('deleted_at', null)) : [],
    ctx.can('contatos') ? quiet(sb.from('propostas').select('id,titulo,status,valor,validade,enviada_em,respondida_em,responsavel_id,criado_em').is('deleted_at', null)) : [],
    ctx.can('projetos') ? quiet(sb.from('tarefas').select('id,titulo,projeto_id,status,prazo,responsavel_id,prioridade').is('deleted_at', null)) : [],
    ctx.can('suporte') ? quiet(sb.from('chamados').select('id,numero,assunto,status,prazo,responsavel_id,prioridade,cliente_id').is('deleted_at', null)) : [],
    ctx.can('financeiro') ? quiet(sb.from('cobrancas').select('id,cliente_id,descricao,parcela,total_parcelas,valor,vencimento,status,pago_em,valor_pago').is('deleted_at', null)) : [],
    ctx.can('financeiro') ? quiet(sb.from('despesas').select('projeto_id,valor').is('deleted_at', null).not('projeto_id', 'is', null)) : [],
    ctx.can('projetos') ? quiet(sb.from('tarefas').select('projeto_id,horas_gastas').is('deleted_at', null).not('projeto_id', 'is', null)) : [],
    quiet(sb.from('atividades').select('*').order('criado_em', { ascending: false }).limit(10)),
    ctx.can('financeiro') ? quiet(sb.from('contratos').select('valor,periodicidade,status').is('deleted_at', null)) : [],
  ]);
  const nichos = ctx.can('mercado') ? await ranking() : [];
  const vazioTotal = !projs.length && !leads.length && !props.length && !tars.length && !chams.length && !cobs.length;
  const body = h('div');
  const eu = ctx.user.id;

  const mine = (r) => !f.resp || r.responsavel_id === f.resp;
  const lnk = (href, texto) => h('a', { class: 't', href }, texto);
  const lista = (itens, vazio, mais) => (itens.length ? h('ul', { class: 'ul-list' }, itens.slice(0, 6), mais && itens.length > 6 && h('li', { class: 'small muted' }, `e mais ${itens.length - 6}…`)) : h('p', { class: 'small muted' }, vazio));
  const bloco = (titulo, href, ...kids) => h('section', { class: 'card' }, h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h2', {}, titulo), href && h('a', { class: 'btn sm', href }, 'Abrir')), ...kids);
  const kpi = (rot, n, sub, href, perigo, ok) => h('a', { class: 'card kpi' + (perigo && n ? ' warn' : '') + (ok ? ' ok' : ''), href }, h('span', { class: 'small' }, rot), h('b', {}, n), sub && h('small', {}, sub));
  const item = (esq, ...dir) => h('li', { class: 'row between' }, esq, h('span', { class: 'row', style: 'gap:6px' }, ...dir));

  function draw() {
    const per = L.periodo(f.per, hoje), out = [];
    // ---------- comercial
    if (ctx.can('contatos')) {
      const ab = leads.filter((l) => !L.FIM_LEAD.includes(l.status) && mine(l));
      const novosSem = ab.filter((l) => l.status === 'novo' && (!l.responsavel_id || !l.primeiro_contato_em));
      const atras = ab.filter((l) => l.proximo_contato && l.proximo_contato < hoje);
      const aguard = props.filter((p) => L.statusProposta(p, hoje) === 'enviada' && mine(p)), venc = props.filter((p) => L.statusProposta(p, hoje) === 'vencida' && mine(p));
      const nome = (l) => l.empresa || l.nome;
      out.push(h('div', { class: 'grid g4' }, kpi('Leads novos sem retorno', novosSem.length, 'Sem responsável ou sem primeiro contato', 'contatos/', true), kpi('Retornos atrasados', atras.length, 'Data do próximo contato já passou', 'contatos/', true),
        kpi('Propostas aguardando resposta', aguard.length, aguard.length ? L.brl(L.soma(aguard, 'valor')) : 'Nenhuma em aberto', 'propostas/', false), kpi('Propostas vencidas', venc.length, 'Prorrogue ou encerre', 'propostas/', true)),
      h('div', { class: 'grid g2', style: 'margin-top:16px' },
        bloco('Leads que precisam de retorno', 'contatos/', lista([...novosSem, ...atras.filter((l) => !novosSem.includes(l))].map((l) => item(lnk('contatos/', nome(l)), !l.responsavel_id && badge('Sem responsável', 'warn'), l.proximo_contato && l.proximo_contato < hoje && badge('Atrasado · ' + fmtDate(l.proximo_contato), 'warn'), l.status === 'novo' && !l.primeiro_contato_em && badge('Sem 1º contato', 'info'))),
          leads.length ? 'Nenhum lead pendente de retorno.' : 'Nenhum lead ainda. Os contatos do site chegam sozinhos; cadastre outros em Leads.', true)),
        bloco('Propostas aguardando resposta', 'propostas/', lista(aguard.map((p) => item(lnk('propostas/', p.titulo), h('span', { class: 'small muted' }, L.brl(p.valor)), badge(p.enviada_em ? `há ${L.diasDesde(p.enviada_em)} d` : 'enviada', 'dim'))), props.length ? 'Nenhuma proposta aguardando resposta.' : 'Nenhuma proposta criada ainda.', true))));
    }
    // ---------- tarefas e projetos
    if (ctx.can('projetos')) {
      const ab = tars.filter((t) => t.status !== 'concluida' && mine(t));
      const atras = ab.filter((t) => t.prazo && t.prazo < hoje), prox = ab.filter((t) => t.prazo && t.prazo >= hoje && L.diffDias(t.prazo, hoje) <= L.SOON_DAYS), bloq = ab.filter((t) => t.status === 'bloqueada'), sem = tars.filter((t) => t.status !== 'concluida' && !t.responsavel_id);
      const ativos = projs.filter((p) => !L.FIM_PROJETO.includes(p.status) && mine(p));
      const projNome = (id) => projs.find((p) => p.id === id)?.titulo;
      const acima = ativos.map((p) => ({ p, k: L.consumo(p, tarefasHoras.filter((t) => t.projeto_id === p.id), desp.filter((d) => d.projeto_id === p.id)) })).filter((x) => x.k.horasAcima || x.k.custoAlto);
      out.push(h('div', { class: 'grid g4', style: 'margin-top:22px' }, kpi('Tarefas atrasadas', atras.length, f.resp ? 'Do responsável selecionado' : 'Todas as pessoas', 'tarefas/', true), kpi('Prazos nos próximos 7 dias', prox.length, 'Tarefas em aberto', 'tarefas/', false),
        kpi('Tarefas bloqueadas', bloq.length, 'Dependem de alguém ou algo', 'tarefas/', true), kpi('Tarefas sem responsável', sem.length, 'Ninguém assumiu', 'tarefas/', true)),
      h('div', { class: 'grid g2', style: 'margin-top:16px' },
        bloco('Tarefas que pedem atenção', 'tarefas/', lista([...atras, ...bloq.filter((t) => !atras.includes(t))].map((t) => item(h('span', {}, t.titulo, projNome(t.projeto_id) && h('span', { class: 'small muted' }, ' · ' + projNome(t.projeto_id))), t.status === 'bloqueada' && badge('Bloqueada', 'warn'), t.prazo && t.prazo < hoje && badge('Atrasada · ' + fmtDate(t.prazo), 'warn'))), tars.length ? 'Nenhuma tarefa atrasada ou bloqueada.' : 'Nenhuma tarefa ainda. Crie tarefas em Tarefas ou aplique um modelo ao criar um projeto.', true)),
        bloco('Projetos', 'projetos/',
          h('div', { class: 'row', style: 'gap:8px;margin-bottom:10px' }, ...[['andamento', 'Em andamento'], ['aguardando_cliente', 'Aguardando cliente'], ['revisao', 'Em revisão'], ['pausado', 'Parados']].map(([k, l]) => badge(`${base.lab('etapa_projeto', k) === k ? l : base.lab('etapa_projeto', k)}: ${ativos.filter((p) => p.status === k).length}`, k === 'pausado' && ativos.some((p) => p.status === k) ? 'warn' : 'dim'))),
          lista([...ativos.filter((p) => p.prazo && p.prazo < hoje).map((p) => item(lnk(`projetos/detalhe.html?id=${p.id}`, p.titulo), badge('Atrasado · ' + fmtDate(p.prazo), 'warn'))), ...ativos.filter((p) => p.bloqueado).map((p) => item(lnk(`projetos/detalhe.html?id=${p.id}`, p.titulo), badge('Bloqueado', 'warn')))], projs.length ? 'Nenhum projeto atrasado ou bloqueado.' : 'Nenhum projeto ainda. Crie o primeiro em Projetos ou a partir de uma proposta aprovada.', true)),
        acima.length > 0 && bloco('Consumindo mais que o previsto', 'projetos/', lista(acima.map(({ p, k }) => item(lnk(`projetos/detalhe.html?id=${p.id}`, p.titulo), k.horasAcima && badge(`${k.horas} de ${k.estimativa} h`, 'warn'), k.custoAlto && badge('Custo ≥ ' + Math.round(L.COST_ALERT * 100) + '% do contrato', 'warn'))), '', true))));
    }
    // ---------- suporte
    if (ctx.can('suporte')) {
      const ab = chams.filter((c) => !L.FIM_CHAMADO.includes(c.status) && mine(c));
      const sem = chams.filter((c) => !L.FIM_CHAMADO.includes(c.status) && !c.responsavel_id), atras = ab.filter((c) => L.chamadoAtrasado(c, hoje)), perto = ab.filter((c) => c.prazo && c.prazo >= hoje && L.diffDias(c.prazo, hoje) <= 2);
      out.push(h('div', { class: 'grid g4', style: 'margin-top:22px' }, kpi('Chamados abertos', ab.length, 'Novos e em atendimento', 'suporte/', false), kpi('Sem responsável', sem.length, 'Ninguém assumiu', 'suporte/', true), kpi('Fora do prazo', atras.length, 'Prazo combinado vencido', 'suporte/', true), kpi('Prazo em até 2 dias', perto.length, 'Merecem atenção hoje', 'suporte/', false)),
      h('div', { style: 'margin-top:16px' }, bloco('Chamados que pedem atenção', 'suporte/', lista([...atras, ...sem.filter((c) => !atras.includes(c))].map((c) => item(lnk('suporte/', `#${c.numero} · ${c.assunto}`), !c.responsavel_id && badge('Sem responsável', 'warn'), L.chamadoAtrasado(c, hoje) && badge('Fora do prazo · ' + fmtDate(c.prazo), 'warn'))), chams.length ? 'Nenhum chamado pendente de atenção.' : 'Nenhum chamado registrado. Registre pedidos de clientes em Suporte.', true))));
    }
    // ---------- financeiro
    if (ctx.can('financeiro')) {
      const ef = (c) => L.statusCobranca(c, hoje), recPer = cobs.filter((c) => c.status === 'paga' && L.dentro(c.pago_em, per));
      const venc = cobs.filter((c) => ef(c) === 'atrasada'), aRec = cobs.filter((c) => ['pendente', 'prevista'].includes(ef(c))), prox = [...aRec].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
      out.push(h('div', { class: 'grid g4', style: 'margin-top:22px' }, kpi('Recebido no período', L.brl(L.soma(recPer.map((c) => ({ v: c.valor_pago ?? c.valor })), 'v')), `${recPer.length} pagamento(s)`, 'financeiro/', false, true), kpi('A receber', L.brl(L.soma(aRec, 'valor')), `${aRec.length} cobrança(s) em dia`, 'financeiro/', false),
        kpi('Vencido', L.brl(L.soma(venc, 'valor')), venc.length ? `${venc.length} cobrança(s) em atraso` : 'Nada em atraso', 'financeiro/', true), kpi('Próximo vencimento', prox[0] ? fmtDate(prox[0].vencimento) : '—', prox[0] ? L.brl(prox[0].valor) : 'Nada a receber', 'financeiro/', false),
        contratos.length > 0 && kpi('Receita recorrente por mês', L.brl(L.receitaMensal(contratos)), `${contratos.filter((k) => k.status === 'ativo').length} contrato(s) ativo(s)`, 'financeiro/', false, true)),
      h('div', { style: 'margin-top:16px' }, bloco('Cobranças a acompanhar', 'financeiro/', lista([...venc, ...prox.slice(0, 4)].map((c) => item(lnk('financeiro/', `${c.descricao}${c.total_parcelas > 1 ? ` (${c.parcela}/${c.total_parcelas})` : ''}`), h('span', { class: 'small muted' }, L.brl(c.valor)), badge((ef(c) === 'atrasada' ? 'Venceu ' : 'Vence ') + fmtDate(c.vencimento), ef(c) === 'atrasada' ? 'warn' : 'dim'))), cobs.length ? 'Nada vencido nem a vencer.' : 'Nenhuma cobrança registrada. Gere as parcelas de um projeto em Financeiro.', true))));
    }
    if (nichos.length) {
      const max = 10;
      out.push(h('section', { class: 'card', style: 'margin-top:22px' }, h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h2', {}, 'Nichos mais bem avaliados'), h('a', { class: 'btn sm', href: 'mercado/' }, 'Abrir')),
        h('div', { class: 'bars' }, nichos.map((n) => h('div', { class: 'bar' }, h('span', {}, (n.alvo ? '★ ' : '') + n.nome), h('div', { style: 'background:rgba(91, 157, 255,.08);border-radius:7px' }, h('i', { style: `width:${(n.score / max) * 100}%` })), h('b', {}, n.score.toFixed(1)))))));
    }
    // ---------- resumo do período
    const res = [];
    if (ctx.can('contatos')) res.push(['Leads recebidos', leads.filter((l) => L.dentro(l.criado_em, per)).length], ['Negócios ganhos', leads.filter((l) => l.status === 'concluido' && L.dentro(l.etapa_desde, per)).length], ['Propostas aprovadas', props.filter((p) => p.status === 'aceita' && L.dentro(p.respondida_em, per)).length]);
    if (ctx.can('projetos')) res.push(['Projetos concluídos', projs.filter((p) => p.status === 'concluido' && L.dentro(p.concluido_em, per)).length]);
    const resumo = res;
    if (resumo.length) out.push(h('section', { class: 'card', style: 'margin-top:22px' }, h('h2', { style: 'margin-bottom:10px' }, 'No período selecionado'), h('div', { class: 'row', style: 'gap:22px' }, resumo.map(([l, n]) => h('div', {}, h('b', { style: 'font-size:1.5rem;color:var(--text)' }, String(n)), h('div', { class: 'small muted' }, l))))));
    // ---------- atividade
    out.push(h('section', { class: 'card', style: 'margin-top:22px' }, h('h2', { style: 'margin-bottom:8px' }, 'Atividade recente da equipe'),
      atividades.length ? h('ul', { class: 'ul-list' }, atividades.map((a) => h('li', {}, h('b', {}, base.nameOf(a.usuario_id) || 'Sistema'), ` ${a.acao} ${ENTIDADE[a.entidade] || a.entidade}`, a.detalhe ? ` “${a.detalhe.length > 120 ? a.detalhe.slice(0, 117) + '…' : a.detalhe}”` : '', h('span', { class: 'small muted' }, ' · ' + new Date(a.criado_em).toLocaleString('pt-BR')))))
        : empty('Ainda não há atividade registrada. As ações da equipe aparecem aqui.')));
    body.replaceChildren(...out);
  }

  const passos = vazioTotal && h('section', { class: 'card', style: 'margin-bottom:22px' }, h('h2', {}, 'Por onde começar'),
    h('ol', { style: 'margin:10px 0 0 18px;display:grid;gap:6px' },
      ctx.can('clientes', 'editar') && h('li', {}, 'Cadastre uma empresa em ', lnk('clientes/', 'Clientes'), '.'),
      ctx.can('contatos', 'editar') && h('li', {}, 'Registre uma oportunidade em ', lnk('contatos/', 'Leads'), ' (os contatos do site já chegam por lá).'),
      ctx.can('projetos', 'editar') && h('li', {}, 'Crie um projeto em ', lnk('projetos/', 'Projetos'), ' a partir de um modelo e distribua as tarefas.'),
      ctx.can('suporte', 'editar') && h('li', {}, 'Registre pedidos dos clientes em ', lnk('suporte/', 'Suporte'), '.'),
      ctx.isAdmin && h('li', {}, 'Ajuste etapas, categorias e modelos em ', lnk('configuracoes/', 'Configurações'), '.')));

  view.append(pageHead('Painel da equipe', `Olá, ${first}`, 'O que precisa de atenção hoje na Vemax.'), passos || null,
    filtros([{ tipo: 'select', chave: 'per', rotulo: 'Período', opcoes: PERIODOS }, { tipo: 'select', chave: 'resp', rotulo: 'Todos os responsáveis', opcoes: [[eu, 'Somente eu'], ...base.team.filter((t) => t.id !== eu).map((t) => [t.id, t.nome])] }], f, draw), body);
  draw();
});
