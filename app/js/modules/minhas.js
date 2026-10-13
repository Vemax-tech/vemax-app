// Minhas pendências: tudo o que é seu hoje (tarefas, retornos de lead, chamados, propostas e projetos) numa lista só, por data
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, loadBase, quiet } from '../core.js';
import { start, h, run, pageHead, empty, fmtDate, toast } from '../ui.js';

const FAIXAS = [['atrasado', 'Atrasado'], ['hoje', 'Hoje'], ['semana', 'Próximos 7 dias'], ['depois', 'Mais adiante'], ['semdata', 'Sem data definida']];

export const init = () => start('minhas/', 'Minhas pendências', async (ctx, view) => {
  const me = ctx.user.id, hoje = L.hojeISO();
  const canProjEd = ctx.can('projetos', 'editar'), canLeadEd = ctx.can('contatos', 'editar'), canSupEd = ctx.can('suporte', 'editar');
  const base = await loadBase();
  const [tarefas, leads, chamados, propostas, projetos, livresT, livresL, livresC] = await Promise.all([
    ctx.can('projetos') ? quiet(sb.from('tarefas').select('id,titulo,status,prazo,projeto_id,motivo_bloqueio').eq('responsavel_id', me).neq('status', 'concluida').is('deleted_at', null)) : [],
    ctx.can('contatos') ? quiet(sb.from('contatos_site').select('*').eq('responsavel_id', me).not('status', 'in', '(concluido,descartado)').is('deleted_at', null)) : [],
    ctx.can('suporte') ? quiet(sb.from('chamados').select('id,numero,assunto,status,prazo,prioridade').eq('responsavel_id', me).not('status', 'in', '(resolvido,fechado)').is('deleted_at', null)) : [],
    ctx.can('contatos') ? quiet(sb.from('propostas').select('id,titulo,status,validade,valor').eq('responsavel_id', me).in('status', ['enviada', 'vencida']).is('deleted_at', null)) : [],
    ctx.can('projetos') ? quiet(sb.from('projetos').select('id,titulo,status,prazo,bloqueado,motivo_bloqueio').eq('responsavel_id', me).not('status', 'in', '(concluido,cancelado)').is('deleted_at', null)) : [],
    ctx.can('projetos') ? quiet(sb.from('tarefas').select('id,titulo,prazo').is('responsavel_id', null).neq('status', 'concluida').is('deleted_at', null).limit(10)) : [],
    ctx.can('contatos') ? quiet(sb.from('contatos_site').select('id,nome,empresa,criado_em').is('responsavel_id', null).not('status', 'in', '(concluido,descartado)').is('deleted_at', null).limit(10)) : [],
    ctx.can('suporte') ? quiet(sb.from('chamados').select('id,numero,assunto,prazo').is('responsavel_id', null).not('status', 'in', '(resolvido,fechado)').is('deleted_at', null).limit(10)) : [],
  ]);

  // Cada pendência vira {tipo, titulo, data, href, extra[], acao?}. "data" é o dia em que ela pede atenção.
  const itens = [];
  tarefas.forEach((t) => itens.push({ tipo: 'Tarefa', titulo: t.titulo, data: t.prazo, href: `../tarefas/?abrir=${t.id}`, extra: [t.status === 'bloqueada' && ['Bloqueada: ' + (t.motivo_bloqueio || 'sem motivo'), 'warn']], tarefa: t }));
  leads.forEach((l) => {
    const al = L.alertasLead(l, hoje).filter((a) => a !== 'sem_responsavel');
    if (!al.length) return;                                    // lead em dia não é pendência
    itens.push({ tipo: 'Lead', titulo: l.empresa || l.nome, data: l.proximo_contato, href: `../contatos/?abrir=${l.id}`, extra: al.map((a) => [L.ALERTA_LEAD[a], a === 'contato_atrasado' || a === 'parado' ? 'warn' : 'info']) });
  });
  chamados.forEach((c) => itens.push({ tipo: 'Chamado', titulo: `#${c.numero} · ${c.assunto}`, data: c.prazo, href: `../suporte/?abrir=${c.id}`, extra: [c.prioridade === 'urgente' && ['Urgente', 'warn']] }));
  propostas.forEach((p) => itens.push({ tipo: 'Proposta', titulo: p.titulo, data: p.validade, href: `../propostas/?abrir=${p.id}`, extra: [[L.statusProposta(p, hoje) === 'vencida' ? 'Vencida: prorrogue ou encerre' : 'Aguardando resposta do cliente', L.statusProposta(p, hoje) === 'vencida' ? 'warn' : 'dim']] }));
  projetos.filter((p) => p.bloqueado || (p.prazo && p.prazo < hoje)).forEach((p) => itens.push({ tipo: 'Projeto', titulo: p.titulo, data: p.prazo, href: `../projetos/detalhe.html?id=${p.id}`, extra: [p.bloqueado && ['Bloqueado: ' + (p.motivo_bloqueio || 'sem motivo'), 'warn']] }));

  const faixa = (d) => (!d ? 'semdata' : d < hoje ? 'atrasado' : d === hoje ? 'hoje' : L.diffDias(d, hoje) <= L.SOON_DAYS ? 'semana' : 'depois');
  const body = h('div');

  const linha = (it) => h('li', { class: 'row between' },
    h('span', {}, badge(it.tipo, 'dim'), ' ', h('a', { class: 't', href: it.href }, it.titulo),
      it.data && h('span', { class: 'small muted' }, ' · ' + fmtDate(it.data)),
      (it.extra || []).filter(Boolean).map(([t, k]) => h('span', {}, ' ', badge(t, k)))),
    it.tarefa && canProjEd && h('button', { class: 'btn sm', 'aria-label': 'Concluir: ' + it.titulo, onclick: async (e) => {
      e.target.disabled = true;
      const r = await run(sb.from('tarefas').update({ status: 'concluida' }).eq('id', it.tarefa.id).select().single(), 'Tarefa concluída.');
      if (r) { itens.splice(itens.indexOf(it), 1); draw(); } else e.target.disabled = false;
    } }, 'Concluir'));

  const assumir = (tabela, id, permitido) => permitido && h('button', { class: 'btn sm', onclick: async (e) => {
    e.target.disabled = true;
    const r = await run(sb.from(tabela).update({ responsavel_id: me }).eq('id', id).select().single(), 'Agora é seu.');
    if (r) { location.reload(); } else { e.target.disabled = false; toast('Não foi possível assumir.', true); }
  } }, 'Assumir');

  function draw() {
    const por = Object.fromEntries(FAIXAS.map(([k]) => [k, []]));
    itens.forEach((it) => por[faixa(it.data)].push(it));
    Object.values(por).forEach((l) => l.sort((a, b) => (a.data || '9').localeCompare(b.data || '9')));
    const tile = (rot, n, perigo) => h('div', { class: 'card kpi' + (perigo && n ? ' warn' : '') }, h('span', { class: 'small' }, rot), h('b', {}, n));
    const livres = livresT.length + livresL.length + livresC.length;
    body.replaceChildren(...[
      h('div', { class: 'grid g4', style: 'margin-bottom:18px' }, tile('Atrasado', por.atrasado.length, true), tile('Hoje', por.hoje.length, false), tile('Próximos 7 dias', por.semana.length, false), tile('Sem data', por.semdata.length, false)),
      itens.length
        ? FAIXAS.filter(([k]) => por[k].length).map(([k, rot]) => h('section', { class: 'card', style: 'margin-bottom:16px' }, h('h2', { style: 'margin-bottom:6px' }, `${rot} (${por[k].length})`), h('ul', { class: 'ul-list' }, por[k].map(linha))))
        : empty('Você está em dia. Nada seu pede atenção agora.'),
      livres > 0 && h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:6px' }, 'Sem responsável: quer assumir?'),
        h('ul', { class: 'ul-list' },
          livresL.map((l) => h('li', { class: 'row between' }, h('span', {}, badge('Lead', 'dim'), ' ', h('a', { class: 't', href: `../contatos/?abrir=${l.id}` }, l.empresa || l.nome)), assumir('contatos_site', l.id, canLeadEd))),
          livresC.map((c) => h('li', { class: 'row between' }, h('span', {}, badge('Chamado', 'dim'), ' ', h('a', { class: 't', href: `../suporte/?abrir=${c.id}` }, `#${c.numero} · ${c.assunto}`)), assumir('chamados', c.id, canSupEd))),
          livresT.map((t) => h('li', { class: 'row between' }, h('span', {}, badge('Tarefa', 'dim'), ' ', h('a', { class: 't', href: `../tarefas/?abrir=${t.id}` }, t.titulo)), assumir('tarefas', t.id, canProjEd))))),
    ].flat().filter(Boolean));
  }

  view.append(pageHead('Para você', 'Minhas pendências', 'Tarefas, retornos de lead, chamados, propostas e projetos que são seus, na ordem de data.'), body);
  draw();
});
