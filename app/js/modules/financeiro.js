// Financeiro básico: contas a receber, parcelas, pagamentos registrados à mão, despesas e custo por projeto.
// Controle operacional apenas: não guarda dados de cartão ou conta, não emite nota fiscal e não movimenta dinheiro.
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, dataTable, filtros, contem, loadBase, loadClientes, clienteOpts, projetoOpts, lixeira, quiet, pedirForm, baixarCsv, registrarMudancas } from '../core.js';
import { fichaHref } from './clientes.js';
import { start, h, run, pageHead, empty, formModal, confirmDlg, fmtDate, toast, qs } from '../ui.js';

const KIND = { prevista: 'dim', pendente: '', paga: 'ok', atrasada: 'warn', cancelada: 'dim' };
const PERIODOS = [['mes', 'Este mês'], ['mes_anterior', 'Mês anterior'], ['30d', 'Últimos 30 dias'], ['90d', 'Últimos 90 dias'], ['ano', 'Este ano'], ['todos', 'Todo o período']];
const MUD = { valor: 'Valor', vencimento: 'Vencimento', status: 'Situação', pago_em: 'Pago em', valor_pago: 'Valor pago' };
const FMT = { valor: L.brl, valor_pago: L.brl, vencimento: fmtDate, pago_em: fmtDate, status: (x) => L.COBRANCA_STATUS[x] || x };

// ---------------------------------------------------------------- ações reaproveitadas pela ficha do projeto
/** Registra o recebimento de uma cobrança (manual). aoSalvar(linha) roda depois. */
export async function registrarPagamento(c, aoSalvar) {
  const v = await pedirForm({ title: 'Registrar pagamento', submitLabel: 'Registrar pagamento', fields: [
    { name: 'valor_pago', label: 'Valor recebido (R$)', type: 'number', step: '0.01', min: 0.01, required: true, value: c.valor },
    { name: 'pago_em', label: 'Data do recebimento', type: 'date', required: true, value: L.hojeISO() },
    { name: 'metodo', label: 'Forma de recebimento', type: 'select', required: true, options: [['', '— escolha —'], ...Object.entries(L.METODOS)], hint: 'Registre apenas a forma (Pix, boleto…). Não digite dados de cartão ou de conta.' }],
  validate: (x) => (x.pago_em > L.hojeISO() ? 'A data do recebimento não pode ser no futuro.' : '') });
  if (!v) return null;
  const antes = { ...c };
  const r = await run(sb.from('cobrancas').update({ status: 'paga', ...v }).eq('id', c.id).select().single(), 'Pagamento registrado.');
  if (r) { Object.assign(c, r); await registrarMudancas('cobrancas', c.id, antes, r, MUD, FMT); aoSalvar?.(c); }
  return r;
}

export function gerarCobrancas({ base, clientes, projetos, preset = {}, aoCriar }) {
  formModal({ title: 'Gerar cobranças em parcelas', submitLabel: 'Gerar parcelas', fields: [
    { name: 'cliente_id', label: 'Cliente', type: 'select', required: true, value: preset.cliente_id, options: clienteOpts(clientes) },
    { name: 'projeto_id', label: 'Projeto', type: 'select', nullable: true, value: preset.projeto_id, options: projetoOpts(projetos) },
    { name: 'descricao', label: 'Descrição', required: true, maxlength: 190, value: preset.descricao, placeholder: 'Ex.: Site institucional' },
    { name: 'valor', label: 'Valor total (R$)', type: 'number', step: '0.01', min: 0.01, required: true, value: preset.valor },
    { name: 'parcelas', label: 'Número de parcelas', type: 'number', step: '1', min: 1, max: 60, required: true, value: preset.parcelas ?? 1 },
    { name: 'primeiro', label: 'Vencimento da primeira parcela', type: 'date', required: true, value: preset.primeiro || L.addDias(L.hojeISO(), 7), hint: 'As demais vencem a cada mês, no mesmo dia.' }],
  validate: (v) => (!Number.isInteger(v.parcelas) ? 'O número de parcelas deve ser inteiro.' : ''),
  onSubmit: async (v) => {
    const plano = L.parcelar(v.valor, v.parcelas, v.primeiro);
    if (!plano.length) { toast('Confira o valor e o número de parcelas.', true); return false; }
    const rows = plano.map((p) => ({ cliente_id: v.cliente_id, projeto_id: v.projeto_id, descricao: v.descricao, status: 'pendente', ...p }));
    const r = await run(sb.from('cobrancas').insert(rows).select(), `${rows.length} cobrança(s) criada(s).`);
    if (!r) return false; aoCriar?.(r);
  } });
}

export function formDespesa(d, { base, projetos, aoSalvar }) {
  formModal({ title: d.id ? 'Editar despesa' : 'Nova despesa', fields: [
    { name: 'descricao', label: 'Descrição', required: true, maxlength: 200, value: d.descricao },
    { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0.01, required: true, value: d.valor },
    { name: 'data', label: 'Data', type: 'date', required: true, value: d.data || L.hojeISO() },
    { name: 'categoria', label: 'Categoria', type: 'select', value: d.categoria || 'outro', options: base.opts('categoria_despesa', d.categoria) },
    { name: 'projeto_id', label: 'Projeto (custo do projeto)', type: 'select', nullable: true, value: d.projeto_id, options: projetoOpts(projetos, '— despesa geral da empresa —') },
    { name: 'fornecedor', label: 'Fornecedor', maxlength: 120, value: d.fornecedor },
    { name: 'observacoes', label: 'Observações', type: 'textarea', maxlength: 1000, value: d.observacoes }],
  onSubmit: async (v) => {
    const antes = { ...d };
    const r = await run(d.id ? sb.from('despesas').update(v).eq('id', d.id).select().single() : sb.from('despesas').insert(v).select().single(), 'Despesa salva.');
    if (!r) return false;
    if (d.id) { Object.assign(d, r); await registrarMudancas('despesas', d.id, antes, r, { valor: 'Valor', data: 'Data' }, { valor: L.brl, data: fmtDate }); }
    aoSalvar?.(r);
  } });
}

// ---------------------------------------------------------------- página
export const init = () => start('financeiro/', 'Financeiro', async (ctx, view) => {
  const canEdit = ctx.can('financeiro', 'editar'), hoje = L.hojeISO();
  const [cobs, desp, base, clientes, projetos, tarefas] = await Promise.all([
    run(sb.from('cobrancas').select('*').is('deleted_at', null).order('vencimento')),
    run(sb.from('despesas').select('*').is('deleted_at', null).order('data', { ascending: false })),
    loadBase(), loadClientes(),
    quiet(sb.from('projetos').select('id,titulo,cliente_id,status,valor_contratado,esforco_horas').is('deleted_at', null).order('titulo')),
    quiet(sb.from('tarefas').select('projeto_id,horas_gastas').is('deleted_at', null).not('projeto_id', 'is', null)),
  ]);
  const cobrancas = cobs || [], despesas = desp || [];
  const f = { q: '', cli: qs('cliente') || '', proj: qs('projeto') || '', sit: '', per: 'mes', aba: 'cobrancas' };
  const stC = { sort: 'venc', dir: 1, page: 0 }, stD = { sort: 'data', dir: -1, page: 0 }, stP = { sort: 'margem', dir: 1, page: 0 };
  const tiles = h('div', { class: 'grid g4', style: 'margin-bottom:18px' }), body = h('div'), abas = h('nav', { class: 'tabs', 'aria-label': 'Seções do financeiro' });
  const cliNome = (id) => clientes.find((c) => c.id === id)?.nome || '—';
  const projNome = (id) => projetos.find((p) => p.id === id)?.titulo || '';
  const ef = (c) => L.statusCobranca(c, hoje);
  const periodo = () => L.periodo(f.per, hoje);

  const baseC = () => cobrancas.filter((c) => (!f.cli || c.cliente_id === f.cli) && (!f.proj || c.projeto_id === f.proj));
  const baseD = () => despesas.filter((d) => (!f.proj || d.projeto_id === f.proj));
  const reload = async () => {
    const [c, d] = await Promise.all([run(sb.from('cobrancas').select('*').is('deleted_at', null).order('vencimento')), run(sb.from('despesas').select('*').is('deleted_at', null).order('data', { ascending: false }))]);
    if (c) cobrancas.splice(0, cobrancas.length, ...c); if (d) despesas.splice(0, despesas.length, ...d); draw();
  };

  // ---- cobranças ----
  const formCobranca = (c) => formModal({ title: 'Editar cobrança', fields: [
    { name: 'cliente_id', label: 'Cliente', type: 'select', required: true, value: c.cliente_id, options: clienteOpts(clientes) },
    { name: 'projeto_id', label: 'Projeto', type: 'select', nullable: true, value: c.projeto_id, options: projetoOpts(projetos) },
    { name: 'descricao', label: 'Descrição', required: true, maxlength: 200, value: c.descricao },
    { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0.01, required: true, value: c.valor },
    { name: 'vencimento', label: 'Vencimento', type: 'date', required: true, value: c.vencimento },
    { name: 'observacoes', label: 'Observações', type: 'textarea', maxlength: 1000, value: c.observacoes }],
  onSubmit: async (v) => {
    const antes = { ...c };
    const r = await run(sb.from('cobrancas').update(v).eq('id', c.id).select().single(), 'Cobrança salva.');
    if (!r) return false; Object.assign(c, r); await registrarMudancas('cobrancas', c.id, antes, r, MUD, FMT); draw();
  } });
  const patch = async (c, v, msg) => {
    const antes = { ...c }, r = await run(sb.from('cobrancas').update(v).eq('id', c.id).select().single(), msg);
    if (r) { Object.assign(c, r); await registrarMudancas('cobrancas', c.id, antes, r, MUD, FMT); draw(); }
  };
  const acoes = (c) => { const s = ef(c); return h('div', { class: 'row' },
    canEdit && ['pendente', 'prevista', 'atrasada'].includes(s) && h('button', { class: 'btn sm primary', onclick: () => registrarPagamento(c, draw) }, 'Registrar pagamento'),
    canEdit && s === 'prevista' && h('button', { class: 'btn sm', onclick: () => patch(c, { status: 'pendente' }, 'Cobrança marcada como pendente.') }, 'Cobrar'),
    canEdit && s === 'paga' && h('button', { class: 'btn sm', onclick: async () => { if (await confirmDlg('Desfazer o registro deste pagamento?')) patch(c, { status: 'pendente', pago_em: null, valor_pago: null, metodo: null }, 'Pagamento desfeito.'); } }, 'Desfazer'),
    canEdit && s !== 'cancelada' && s !== 'paga' && h('button', { class: 'btn sm', onclick: async () => { if (await confirmDlg('Cancelar esta cobrança? Ela deixa de entrar nos totais.')) patch(c, { status: 'cancelada' }, 'Cobrança cancelada.'); } }, 'Cancelar'),
    canEdit && h('button', { class: 'btn sm', onclick: () => formCobranca(c) }, 'Editar'),
    canEdit && h('button', { class: 'btn sm danger', 'aria-label': 'Enviar para a lixeira: ' + c.descricao, onclick: () => lixeira('cobrancas', c, c.descricao, () => { cobrancas.splice(cobrancas.indexOf(c), 1); draw(); }) }, 'Lixeira')); };

  const colsC = [
    { key: 'cli', label: 'Cliente', sort: (c) => cliNome(c.cliente_id).toLowerCase(), render: (c) => h('span', {}, h('a', { class: 't', href: fichaHref(c.cliente_id) }, cliNome(c.cliente_id)), h('div', { class: 'small muted' }, c.descricao + (c.total_parcelas > 1 ? ` (${c.parcela}/${c.total_parcelas})` : '') + (c.projeto_id ? ' · ' + projNome(c.projeto_id) : ''))) },
    { key: 'venc', label: 'Vencimento', sort: (c) => c.vencimento, render: (c) => fmtDate(c.vencimento) },
    { key: 'valor', label: 'Valor', sort: (c) => Number(c.valor), render: (c) => L.brl(c.valor) },
    { key: 'sit', label: 'Situação', sort: (c) => ef(c), render: (c) => badge(L.COBRANCA_STATUS[ef(c)], KIND[ef(c)]) },
    { key: 'pago', label: 'Recebimento', sort: (c) => c.pago_em, render: (c) => (c.pago_em ? `${fmtDate(c.pago_em)} · ${L.brl(c.valor_pago)}${c.metodo ? ' · ' + L.METODOS[c.metodo] : ''}` : '—') },
    { key: 'a', label: '', render: acoes },
  ];
  const colsD = [
    { key: 'data', label: 'Data', sort: (d) => d.data, render: (d) => fmtDate(d.data) },
    { key: 'desc', label: 'Despesa', sort: (d) => d.descricao.toLowerCase(), render: (d) => h('span', {}, d.descricao, d.fornecedor && h('div', { class: 'small muted' }, d.fornecedor)) },
    { key: 'cat', label: 'Categoria', render: (d) => base.lab('categoria_despesa', d.categoria) },
    { key: 'proj', label: 'Projeto', sort: (d) => projNome(d.projeto_id).toLowerCase() || null, render: (d) => projNome(d.projeto_id) || h('span', { class: 'muted' }, 'Geral') },
    { key: 'valor', label: 'Valor', sort: (d) => Number(d.valor), render: (d) => L.brl(d.valor) },
    { key: 'a', label: '', render: (d) => canEdit && h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => formDespesa(d, { base, projetos, aoSalvar: reload }) }, 'Editar'),
      h('button', { class: 'btn sm danger', 'aria-label': 'Enviar para a lixeira: ' + d.descricao, onclick: () => lixeira('despesas', d, d.descricao, () => { despesas.splice(despesas.indexOf(d), 1); draw(); }) }, 'Lixeira')) },
  ];

  // ---- visão por projeto ----
  const linhasProjeto = () => projetos.filter((p) => !f.cli || p.cliente_id === f.cli).map((p) => {
    const cs = cobrancas.filter((c) => c.projeto_id === p.id && ef(c) !== 'cancelada'), ds = despesas.filter((d) => d.projeto_id === p.id);
    const k = L.consumo(p, tarefas.filter((t) => t.projeto_id === p.id), ds);
    return { p, k, recebido: L.soma(cs.filter((c) => ef(c) === 'paga').map((c) => ({ v: c.valor_pago ?? c.valor })), 'v'), aReceber: L.soma(cs.filter((c) => ef(c) !== 'paga'), 'valor') };
  }).filter((x) => x.p.valor_contratado != null || x.k.custo > 0 || x.recebido > 0 || x.k.horas > 0);
  const colsP = [
    { key: 'proj', label: 'Projeto', sort: (x) => x.p.titulo.toLowerCase(), render: (x) => h('span', {}, h('a', { class: 't', href: `../projetos/detalhe.html?id=${x.p.id}` }, x.p.titulo), h('div', { class: 'small muted' }, cliNome(x.p.cliente_id))) },
    { key: 'contr', label: 'Contratado', sort: (x) => x.k.contratado, render: (x) => L.brl(x.k.contratado) },
    { key: 'rec', label: 'Recebido', sort: (x) => x.recebido, render: (x) => L.brl(x.recebido) },
    { key: 'arec', label: 'A receber', sort: (x) => x.aReceber, render: (x) => L.brl(x.aReceber) },
    { key: 'custo', label: 'Custos', sort: (x) => x.k.custo, render: (x) => h('span', { style: x.k.custoAlto ? 'color:#ff9b8a' : null }, L.brl(x.k.custo)) },
    { key: 'margem', label: 'Margem prevista', sort: (x) => x.k.margem, render: (x) => (x.k.margem == null ? '—' : h('span', { style: x.k.margem < 0 ? 'color:#ff9b8a' : null }, L.brl(x.k.margem))) },
    { key: 'horas', label: 'Horas (gastas / previstas)', sort: (x) => x.k.horas, render: (x) => h('span', { style: x.k.horasAcima ? 'color:#ff9b8a' : null }, `${x.k.horas.toLocaleString('pt-BR')} / ${x.k.estimativa ?? '—'}`) },
  ];

  function draw() {
    const per = periodo(), cs = baseC(), ds = baseD();
    const previsto = cs.filter((c) => ef(c) !== 'cancelada' && L.dentro(c.vencimento, per)), recebido = cs.filter((c) => c.status === 'paga' && L.dentro(c.pago_em, per));
    const vencido = cs.filter((c) => ef(c) === 'atrasada'), custos = ds.filter((d) => L.dentro(d.data, per));
    const tile = (rot, v, sub, cls = '') => h('div', { class: 'card kpi ' + cls }, h('span', { class: 'small' }, rot), h('b', {}, v), h('small', {}, sub));
    tiles.replaceChildren(tile('Previsto no período', L.brl(L.soma(previsto, 'valor')), `${previsto.length} cobrança(s) com vencimento no período`),
      tile('Recebido no período', L.brl(L.soma(recebido.map((c) => ({ v: c.valor_pago ?? c.valor })), 'v')), `${recebido.length} pagamento(s)`, 'ok'),
      tile('Vencido e não pago', L.brl(L.soma(vencido, 'valor')), vencido.length ? `${vencido.length} cobrança(s) em atraso` : 'Nenhuma em atraso', vencido.length ? 'warn' : ''),
      tile('Despesas no período', L.brl(L.soma(custos, 'valor')), `Saldo recebido − despesas: ${L.brl(L.soma(recebido.map((c) => ({ v: c.valor_pago ?? c.valor })), 'v') - L.soma(custos, 'valor'))}`));
    abas.replaceChildren(...[['cobrancas', 'A receber'], ['despesas', 'Despesas'], ['projetos', 'Custo por projeto']].map(([k, l]) => h('a', { href: '#', class: f.aba === k ? 'on' : '', onclick: (e) => { e.preventDefault(); f.aba = k; draw(); } }, l)));
    if (f.aba === 'despesas') {
      const rows = ds.filter((d) => L.dentro(d.data, per) && contem([d.descricao, d.fornecedor], f.q));
      body.replaceChildren(dataTable({ cols: colsD, rows, state: stD, onState: draw, vazio: empty(despesas.length ? 'Nenhuma despesa neste período e filtro.' : canEdit ? 'Nenhuma despesa registrada. Use “Nova despesa” para lançar custos de projetos e da operação.' : 'Nenhuma despesa registrada.') }));
    } else if (f.aba === 'projetos') {
      const rows = linhasProjeto();
      body.replaceChildren(h('p', { class: 'small muted', style: 'margin-bottom:10px' }, `Custos = despesas ligadas ao projeto (todo o período). Alerta quando as horas passam do previsto ou os custos chegam a ${Math.round(L.COST_ALERT * 100)}% do valor contratado.`),
        dataTable({ cols: colsP, rows, state: stP, onState: draw, vazio: empty('Preencha o valor contratado e o esforço estimado nos projetos, e lance as despesas, para ver custo e margem aqui.') }));
    } else {
      const sit = f.sit;
      const rows = cs.filter((c) => (!sit || ef(c) === sit) && (f.per === 'todos' || sit === 'atrasada' || L.dentro(c.vencimento, per) || L.dentro(c.pago_em, per)) && contem([c.descricao, cliNome(c.cliente_id), projNome(c.projeto_id)], f.q));
      body.replaceChildren(dataTable({ cols: colsC, rows, state: stC, onState: draw, rowClass: (c) => (ef(c) === 'atrasada' ? 'late' : null),
        vazio: empty(cobrancas.length ? 'Nenhuma cobrança neste período e filtro.' : canEdit ? 'Nenhuma cobrança ainda. Gere as parcelas de um projeto aprovado com “Gerar cobranças”.' : 'Nenhuma cobrança registrada.') }));
    }
  }

  const exportar = () => {
    if (f.aba === 'despesas') baixarCsv('despesas.csv', [{ label: 'Data', val: (d) => d.data }, { label: 'Descrição', val: (d) => d.descricao }, { label: 'Categoria', val: (d) => base.lab('categoria_despesa', d.categoria) }, { label: 'Projeto', val: (d) => projNome(d.projeto_id) }, { label: 'Fornecedor', val: (d) => d.fornecedor }, { label: 'Valor', val: (d) => d.valor }], baseD().filter((d) => L.dentro(d.data, periodo())));
    else baixarCsv('cobrancas.csv', [{ label: 'Cliente', val: (c) => cliNome(c.cliente_id) }, { label: 'Projeto', val: (c) => projNome(c.projeto_id) }, { label: 'Descrição', val: (c) => c.descricao }, { label: 'Parcela', val: (c) => `${c.parcela}/${c.total_parcelas}` },
      { label: 'Vencimento', val: (c) => c.vencimento }, { label: 'Valor', val: (c) => c.valor }, { label: 'Situação', val: (c) => L.COBRANCA_STATUS[ef(c)] }, { label: 'Pago em', val: (c) => c.pago_em }, { label: 'Valor pago', val: (c) => c.valor_pago }, { label: 'Forma', val: (c) => (c.metodo ? L.METODOS[c.metodo] : '') }],
    baseC().filter((c) => (!f.sit || ef(c) === f.sit)));
  };

  view.append(pageHead('Financeiro', 'Contas a receber e despesas', 'Controle simples de cobranças, recebimentos e custos. Não substitui contabilidade nem emite nota fiscal.',
    canEdit && h('button', { class: 'btn primary', onclick: () => (clientes.length ? gerarCobrancas({ base, clientes, projetos, aoCriar: reload }) : toast('Cadastre o cliente antes de gerar cobranças.', true)) }, 'Gerar cobranças'),
    canEdit && h('button', { class: 'btn', onclick: () => formDespesa({}, { base, projetos, aoSalvar: reload }) }, 'Nova despesa'),
    h('button', { class: 'btn', onclick: exportar }, 'Exportar CSV')),
  tiles, abas,
  filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar por cliente, projeto ou descrição…' },
    { tipo: 'select', chave: 'per', rotulo: 'Período', opcoes: PERIODOS },
    { tipo: 'select', chave: 'cli', rotulo: 'Todos os clientes', opcoes: clientes.map((c) => [c.id, c.nome]) },
    { tipo: 'select', chave: 'proj', rotulo: 'Todos os projetos', opcoes: projetos.map((p) => [p.id, p.titulo]) },
    { tipo: 'select', chave: 'sit', rotulo: 'Todas as situações', opcoes: Object.entries(L.COBRANCA_STATUS) }], f, draw), body);
  draw();
});
