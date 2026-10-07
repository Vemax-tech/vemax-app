// Painel inicial: números rápidos, atalhos e atividade recente
import { sb } from '../supabase.js';
import { start, h, run, pageHead, empty, fmtDate, icon } from '../ui.js';

const count = async (table, filter) => {
  let q = sb.from(table).select('*', { count: 'exact', head: true }); if (filter) q = filter(q);
  const { count: c } = await q; return c ?? 0;
};

export const init = () => start('', 'Painel', async (ctx, view) => {
  const first = (ctx.profile.nome || '').split(' ')[0] || 'equipe';
  const tasks = [];
  if (ctx.can('mercado')) tasks.push(['Pesquisas', count('pesquisas'), 'mercado/'], ['Nichos', count('nichos'), 'mercado/nichos.html']);
  if (ctx.can('contatos')) tasks.push(['Contatos novos', count('contatos_site', (q) => q.eq('status', 'novo')), 'contatos/']);
  const nums = await Promise.all(tasks.map((t) => t[1]));
  const logs = (await run(sb.from('atividades').select('*').order('criado_em', { ascending: false }).limit(8))) || [];

  view.append(pageHead('Portal da equipe', `Olá, ${first}`, 'Resumo do que está acontecendo na Vemax.'),
    h('div', { class: 'grid g3' }, tasks.map((t, i) => h('a', { class: 'card kpi', href: t[2] }, h('span', { class: 'small' }, t[0]), h('b', {}, nums[i])))),
    h('section', { class: 'card', style: 'margin-top:22px' }, h('h2', { style: 'margin-bottom:8px' }, 'Atividade recente'),
      logs.length ? h('ul', { class: 'ul-list' }, logs.map((l) => h('li', {}, h('b', {}, l.entidade), ` — ${l.acao} `, l.detalhe ? `“${l.detalhe}”` : '', h('span', { class: 'small muted' }, ' · ' + fmtDate(l.criado_em)))))
        : empty('Sem atividade registrada ainda.')));
});
