// Painel inicial: leads, projetos, prazos, nichos mais bem avaliados e atividade recente
import { sb } from '../supabase.js';
import { start, h, run, pageHead, empty, fmtDate, overdue, PROJ_STATUS } from '../ui.js';

const count = async (table, filter) => {
  let q = sb.from(table).select('*', { count: 'exact', head: true }); if (filter) q = filter(q);
  const { count: c } = await q; return c ?? 0;
};
const bars = (items) => h('div', { class: 'bars' }, items.map(([label, pct, val]) =>
  h('div', { class: 'bar' }, h('span', {}, label), h('div', { style: 'background:rgba(91, 157, 255,.08);border-radius:7px' }, h('i', { style: `width:${pct}%` })), h('b', {}, val))));

export const init = () => start('', 'Painel', async (ctx, view) => {
  const first = (ctx.profile.nome || '').split(' ')[0] || 'equipe';
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const kpis = [], sections = [];

  if (ctx.can('contatos')) {
    const [novos, semana] = await Promise.all([count('contatos_site', (q) => q.eq('status', 'novo')), count('contatos_site', (q) => q.gte('criado_em', week))]);
    kpis.push(['Contatos novos', novos, 'contatos/'], ['Contatos na semana', semana, 'contatos/']);
  }
  if (ctx.can('projetos')) {
    const projs = (await run(sb.from('projetos').select('id,titulo,cliente,status,prazo'))) || [];
    const ativos = projs.filter((p) => p.status !== 'concluido');
    kpis.push(['Projetos em andamento', projs.filter((p) => p.status === 'andamento').length, 'projetos/'],
      ['Projetos atrasados', ativos.filter((p) => overdue(p.prazo)).length, 'projetos/']);
    const max = Math.max(1, ...Object.keys(PROJ_STATUS).map((s) => projs.filter((p) => p.status === s).length));
    const prox = ativos.filter((p) => p.prazo).sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 5);
    sections.push(h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:12px' }, 'Projetos por status'),
      projs.length ? bars(Object.entries(PROJ_STATUS).map(([s, l]) => { const n = projs.filter((p) => p.status === s).length; return [l, (n / max) * 100, n]; })) : empty('Sem projetos.')),
    h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:8px' }, 'Próximos prazos'),
      prox.length ? h('ul', { class: 'ul-list' }, prox.map((p) => h('li', {}, h('a', { class: 't', href: 'projetos/' }, p.titulo), ' ',
        h('span', { class: 'badge' + (overdue(p.prazo) ? ' warn' : ' dim') }, (overdue(p.prazo) ? 'Atrasado · ' : '') + fmtDate(p.prazo + 'T12:00'))))) : empty('Nenhum prazo definido.')));
  }
  if (ctx.can('mercado')) {
    const [nichos, crit, notas] = await Promise.all([run(sb.from('nichos').select('id,nome,alvo')), run(sb.from('criterios').select('id,peso')), run(sb.from('notas_nicho').select('nicho_id,criterio_id,nota'))]);
    const peso = new Map((crit || []).map((c) => [c.id, Number(c.peso)]));
    const ranked = (nichos || []).map((n) => {
      let s = 0, w = 0; (notas || []).filter((x) => x.nicho_id === n.id).forEach((x) => { const p = peso.get(x.criterio_id) ?? 0; s += x.nota * p; w += p; });
      return { ...n, score: w ? s / w : null };
    }).filter((n) => n.score != null).sort((a, b) => b.score - a.score).slice(0, 5);
    kpis.push(['Nichos', (nichos || []).length, 'mercado/nichos.html']);
    sections.push(h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:12px' }, 'Nichos mais bem avaliados'),
      ranked.length ? bars(ranked.map((n) => [(n.alvo ? '★ ' : '') + n.nome, n.score * 10, n.score.toFixed(1)])) : empty('Avalie nichos no comparador.')));
  }
  const logs = (await run(sb.from('atividades').select('*').order('criado_em', { ascending: false }).limit(8))) || [];

  view.append(pageHead('Portal da equipe', `Olá, ${first}`, 'Resumo do que está acontecendo na Vemax.'),
    h('div', { class: 'grid g3' }, kpis.map(([l, n, href]) => h('a', { class: 'card kpi', href }, h('span', { class: 'small' }, l), h('b', {}, n)))),
    h('div', { class: 'grid g2', style: 'margin-top:22px' }, sections),
    h('section', { class: 'card', style: 'margin-top:22px' }, h('h2', { style: 'margin-bottom:8px' }, 'Atividade recente'),
      logs.length ? h('ul', { class: 'ul-list' }, logs.map((l) => h('li', {}, h('b', {}, l.entidade), ` — ${l.acao} `, l.detalhe ? `“${l.detalhe}”` : '', h('span', { class: 'small muted' }, ' · ' + fmtDate(l.criado_em)))))
        : empty('Sem atividade registrada ainda.')));
});
