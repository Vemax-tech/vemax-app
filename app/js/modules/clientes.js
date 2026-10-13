// Clientes: cadastro único por empresa, ficha com tudo o que já foi feito, e conversão de lead sem duplicar
import { sb } from '../supabase.js';
import * as L from '../lib.js';
import { badge, dataTable, filtros, contem, loadBase, lixeira, linkSeguro, timeline, quiet } from '../core.js';
import { start, h, run, toast, modal, formModal, confirmDlg, pageHead, empty, fmtDate, qs, contactHref } from '../ui.js';

const FICHA = new URL('./ficha.html', new URL('../../clientes/', import.meta.url)).href;
export const fichaHref = (id) => `${FICHA}?id=${id}`;

// ---------------------------------------------------------------- cadastro
const camposCliente = (c = {}) => [
  { name: 'nome', label: 'Nome da empresa ou pessoa', required: true, maxlength: 160, value: c.nome },
  { name: 'razao_social', label: 'Razão social', maxlength: 160, value: c.razao_social },
  { name: 'documento', label: 'CNPJ ou CPF', maxlength: 18, value: c.documento, hint: 'Opcional. Só números ou com pontuação; evita cadastrar a mesma empresa duas vezes.' },
  { name: 'email', label: 'E-mail', type: 'email', maxlength: 160, value: c.email },
  { name: 'telefone', label: 'Telefone / WhatsApp', maxlength: 40, value: c.telefone },
  { name: 'site', label: 'Site', type: 'url', maxlength: 200, value: c.site, placeholder: 'https://' },
  { name: 'cidade', label: 'Cidade', maxlength: 120, value: c.cidade },
  { name: 'observacoes', label: 'Observações', type: 'textarea', maxlength: 4000, value: c.observacoes },
];
const validarCliente = (v) => {
  const d = L.soDigitos(v.documento);
  return d && d.length !== 11 && d.length !== 14 ? 'O CPF deve ter 11 números e o CNPJ, 14.' : '';
};
const limpar = (v) => ({ ...v, documento: L.soDigitos(v.documento) });

/** Pergunta o que fazer quando já existe cliente parecido. Devolve {acao:'usar', cliente} | {acao:'criar'} | {acao:'cancelar'}. */
const dialogoDuplicado = (dups) => new Promise((res) => {
  modal('Já existe um cadastro parecido', h('div', {},
    h('p', {}, 'Encontramos cliente(s) com o mesmo nome, documento ou e-mail. Para não duplicar o histórico, prefira usar o cadastro existente.'),
    h('ul', { class: 'ul-list', style: 'margin-top:10px' }, dups.map((c) => h('li', { class: 'row between' },
      h('span', {}, h('b', {}, c.nome), h('span', { class: 'small muted' }, [c.documento, c.email, c.telefone].filter(Boolean).map((x) => ' · ' + x).join(''))),
      h('button', { class: 'btn sm primary', onclick: (e) => { res({ acao: 'usar', cliente: c }); e.target.closest('.ov').querySelector('[data-cancel]').click(); } }, 'Usar este'))))),
  (close) => h('div', { class: 'row' },
    h('button', { class: 'btn', 'data-cancel': '', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn', onclick: () => { res({ acao: 'criar' }); close(); } }, 'Cadastrar mesmo assim')),
  () => res({ acao: 'cancelar' }));            // fechar por Esc/clique fora = cancelar (só vale se nada foi escolhido antes)
});

async function existentes() {
  const [clientes, contatos] = await Promise.all([
    run(sb.from('clientes').select('id,nome,documento,email,telefone').is('deleted_at', null)),
    quiet(sb.from('cliente_contatos').select('cliente_id,email')),
  ]);
  return { clientes: clientes || [], contatos };
}

/**
 * Cria um cliente verificando duplicidade. Devolve a linha do cliente (novo ou o existente escolhido) ou null se cancelou/falhou.
 * `ignorarId`: ao editar, não compara o cliente consigo mesmo.
 */
export async function criarCliente(vals, { aoCriar } = {}) {
  const v = limpar(vals);
  const { clientes, contatos } = await existentes();
  const dups = L.possiveisDuplicados(v, clientes, contatos);
  if (dups.length) {
    const r = await dialogoDuplicado(dups);
    if (r.acao === 'cancelar') return null;
    if (r.acao === 'usar') return r.cliente;
  }
  const { data, error } = await sb.from('clientes').insert(v).select().single();
  if (error) {
    toast(error.code === '23505' ? 'Já existe um cliente com este nome ou documento. Use o cadastro existente.' : error.code === '42501' ? 'Sem permissão para cadastrar clientes.' : 'Não foi possível cadastrar: ' + error.message, true);
    return null;
  }
  toast('Cliente cadastrado.');
  aoCriar?.(data);
  return data;
}

/** Liga um lead a um cliente e leva junto o que já existia dele (propostas e projetos), registrando na linha do tempo. */
export async function vincularLead(lead, cliente) {
  const r = await run(sb.from('contatos_site').update({ cliente_id: cliente.id }).eq('id', lead.id).select().single());
  if (!r) return null;
  Object.assign(lead, r);
  await Promise.all([
    sb.from('propostas').update({ cliente_id: cliente.id }).eq('contato_id', lead.id).is('cliente_id', null),
    sb.from('projetos').update({ cliente_id: cliente.id, cliente: cliente.nome.slice(0, 160) }).eq('contato_id', lead.id).is('cliente_id', null),
  ]);
  await sb.from('interacoes').insert({ entidade: 'clientes', entidade_id: cliente.id, tipo: 'sistema', texto: `Lead “${(lead.empresa || lead.nome).slice(0, 80)}” vinculado a este cliente. O histórico do lead foi preservado.` });
  return cliente;
}

/** Converte um lead em cliente (ou o liga a um cliente que já existe). Devolve o cliente ou null. */
export async function converterLead(lead) {
  if (lead.cliente_id) return { id: lead.cliente_id };
  const nome = (lead.empresa || lead.nome || '').trim();
  const cli = await new Promise((res) => {
    let enviado = false;
    formModal({ title: 'Converter em cliente', submitLabel: 'Converter', fields: camposCliente({
      nome, email: lead.email || (lead.contato.includes('@') ? lead.contato : ''), telefone: lead.telefone || (!lead.contato.includes('@') ? lead.contato : '') }),
    validate: validarCliente,
    onSubmit: async (v) => {
      const c = await criarCliente(v);
      if (!c) return false;
      enviado = true; res(c);
    },
    onClose: () => { if (!enviado) res(null); } });
  });
  if (!cli) return null;
  if (lead.pessoa_contato) {
    const { data: ja } = await sb.from('cliente_contatos').select('id').eq('cliente_id', cli.id).ilike('nome', lead.pessoa_contato);
    if (!ja?.length) await sb.from('cliente_contatos').insert({ cliente_id: cli.id, nome: lead.pessoa_contato, email: lead.email || '', telefone: lead.telefone || '', principal: true });
  }
  const ok = await vincularLead(lead, cli);
  if (ok) toast('Lead vinculado ao cliente.');
  return ok;
}

// ---------------------------------------------------------------- lista
export const init = () => start('clientes/', 'Clientes', async (ctx, view) => {
  const canEdit = ctx.can('clientes', 'editar');
  const [rows, projs, chams, cobs] = await Promise.all([
    run(sb.from('clientes').select('*').is('deleted_at', null).order('nome')),
    ctx.can('projetos') ? quiet(sb.from('projetos').select('id,cliente_id,status').is('deleted_at', null).not('cliente_id', 'is', null)) : [],
    ctx.can('suporte') ? quiet(sb.from('chamados').select('id,cliente_id,status').is('deleted_at', null).not('cliente_id', 'is', null)) : [],
    ctx.can('financeiro') ? quiet(sb.from('cobrancas').select('cliente_id,valor,vencimento,status').is('deleted_at', null)) : [],
  ]);
  const list = rows || [], hoje = L.hojeISO();
  const f = { q: '' }, st = { sort: 'nome', dir: 1, page: 0 }, body = h('div');
  const ativos = (c) => projs.filter((p) => p.cliente_id === c.id && !L.FIM_PROJETO.includes(p.status)).length;
  const abertos = (c) => chams.filter((x) => x.cliente_id === c.id && !L.FIM_CHAMADO.includes(x.status)).length;
  const aReceber = (c) => L.soma(cobs.filter((x) => x.cliente_id === c.id && ['pendente', 'prevista', 'atrasada'].includes(L.statusCobranca(x, hoje))), 'valor');

  const cols = [
    { key: 'nome', label: 'Cliente', sort: (c) => c.nome.toLowerCase(), render: (c) => h('a', { class: 't', href: fichaHref(c.id) }, c.nome) },
    { key: 'contato', label: 'Contato', render: (c) => { const href = contactHref(c.email || c.telefone); return h('span', { class: 'small' }, href ? h('a', { class: 't', href, target: '_blank', rel: 'noopener noreferrer' }, c.email || c.telefone) : (c.email || c.telefone || '—')); } },
    ctx.can('projetos') && { key: 'proj', label: 'Projetos ativos', sort: ativos, render: (c) => String(ativos(c)) },
    ctx.can('suporte') && { key: 'cham', label: 'Chamados abertos', sort: abertos, render: (c) => { const n = abertos(c); return n ? badge(String(n), 'warn') : '0'; } },
    ctx.can('financeiro') && { key: 'rec', label: 'A receber', sort: aReceber, render: (c) => L.brl(aReceber(c)) },
    { key: 'desde', label: 'Cliente desde', sort: (c) => c.criado_em, render: (c) => fmtDate(c.criado_em) },
  ].filter(Boolean);

  const draw = () => {
    const shown = list.filter((c) => contem([c.nome, c.razao_social, c.documento, c.email, c.telefone, c.cidade], f.q));
    body.replaceChildren(dataTable({ cols, rows: shown, state: st, onState: draw,
      vazio: empty(list.length ? 'Nenhum cliente com essa busca.' : canEdit ? 'Nenhum cliente cadastrado ainda. Cadastre o primeiro ou converta um lead em cliente.' : 'Nenhum cliente cadastrado ainda.') }));
  };
  const novo = canEdit && h('button', { class: 'btn primary', onclick: () => formModal({ title: 'Novo cliente', fields: camposCliente(), validate: validarCliente,
    onSubmit: async (v) => { const c = await criarCliente(v); if (!c) return false; location.href = fichaHref(c.id); } }) }, 'Novo cliente');
  view.append(pageHead('Relacionamento', 'Clientes', 'Cada empresa em um só lugar: contatos, negócios, projetos, chamados e cobranças.', novo),
    filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar por nome, documento, e-mail ou cidade…' }], f, draw), body);
  draw();
});

// ---------------------------------------------------------------- ficha
export const initFicha = () => start('clientes/', 'Cliente', async (ctx, view) => {
  const id = qs('id');
  const cli = id ? (await run(sb.from('clientes').select('*').eq('id', id).maybeSingle())) : null;
  if (!cli || cli.deleted_at) { view.append(pageHead('Clientes', 'Cliente não encontrado', 'O cadastro pode ter sido removido ou o endereço está incompleto.', h('a', { class: 'btn', href: './' }, 'Voltar para clientes'))); return; }
  const canEdit = ctx.can('clientes', 'editar'), hoje = L.hojeISO();
  const base = await loadBase();
  const [contatos, links, leads, propostas, projetos, tarefas, chamados, cobrancas, contratos] = await Promise.all([
    quiet(sb.from('cliente_contatos').select('*').eq('cliente_id', id).order('principal', { ascending: false }).order('nome')),
    quiet(sb.from('cliente_links').select('*').eq('cliente_id', id).order('criado_em', { ascending: false })),
    ctx.can('contatos') ? quiet(sb.from('contatos_site').select('id,nome,empresa,status,valor_estimado,criado_em').eq('cliente_id', id).is('deleted_at', null).order('criado_em', { ascending: false })) : [],
    ctx.can('contatos') ? quiet(sb.from('propostas').select('id,titulo,status,valor,validade,criado_em').eq('cliente_id', id).is('deleted_at', null).order('criado_em', { ascending: false })) : [],
    ctx.can('projetos') ? quiet(sb.from('projetos').select('id,titulo,status,prazo,valor_contratado').eq('cliente_id', id).is('deleted_at', null).order('criado_em', { ascending: false })) : [],
    ctx.can('projetos') ? quiet(sb.from('tarefas').select('id,titulo,status,prazo,projeto_id').eq('cliente_id', id).is('deleted_at', null).order('prazo', { nullsFirst: false })) : [],
    ctx.can('suporte') ? quiet(sb.from('chamados').select('id,numero,assunto,status,prazo').eq('cliente_id', id).is('deleted_at', null).order('aberto_em', { ascending: false })) : [],
    ctx.can('financeiro') ? quiet(sb.from('cobrancas').select('*').eq('cliente_id', id).is('deleted_at', null).order('vencimento')) : [],
    ctx.can('financeiro') ? quiet(sb.from('contratos').select('*').eq('cliente_id', id).is('deleted_at', null).neq('status', 'encerrado').order('descricao')) : [],
  ]);

  const head = h('div'), dados = h('div'), contatosBox = h('div'), linksBox = h('div');
  const drawHead = () => {
    document.title = `${cli.nome} — Vemax Portal`;
    head.replaceChildren(pageHead('Cliente', cli.nome, cli.razao_social && cli.razao_social !== cli.nome ? cli.razao_social : null,
      h('a', { class: 'btn', href: './' }, 'Todos os clientes'),
      canEdit && h('button', { class: 'btn', onclick: editar }, 'Editar dados'),
      canEdit && h('button', { class: 'btn danger', onclick: async () => { if (await lixeira('clientes', cli, cli.nome, () => { location.href = './'; })) { /* redireciona */ } } }, 'Enviar para a lixeira')));
    dados.replaceChildren(h('dl', { class: 'dl' },
      h('dt', {}, 'CNPJ / CPF'), h('dd', {}, cli.documento || '—'),
      h('dt', {}, 'E-mail'), h('dd', {}, cli.email ? (contactHref(cli.email) ? h('a', { class: 't', href: contactHref(cli.email) }, cli.email) : cli.email) : '—'),
      h('dt', {}, 'Telefone'), h('dd', {}, cli.telefone || '—'),
      h('dt', {}, 'Site'), h('dd', {}, cli.site ? linkSeguro(cli.site) : '—'),
      h('dt', {}, 'Cidade'), h('dd', {}, cli.cidade || '—'),
      h('dt', {}, 'Cliente desde'), h('dd', {}, fmtDate(cli.criado_em))),
    cli.observacoes && h('p', { style: 'margin-top:12px;white-space:pre-wrap' }, cli.observacoes));
  };
  const editar = () => formModal({ title: 'Editar cliente', fields: camposCliente(cli), validate: validarCliente, onSubmit: async (v) => {
    const nv = limpar(v);
    const { clientes, contatos: cs } = await existentes();
    const dups = L.possiveisDuplicados({ ...nv, id: cli.id }, clientes, cs);
    if (dups.length && !(await confirmDlg(`Já existe cadastro parecido (${dups.map((d) => d.nome).join(', ')}). Salvar mesmo assim?`))) return false;
    const { data, error } = await sb.from('clientes').update(nv).eq('id', cli.id).select().single();
    if (error) { toast(error.code === '23505' ? 'Já existe outro cliente com este nome ou documento.' : 'Não foi possível salvar: ' + error.message, true); return false; }
    Object.assign(cli, data); drawHead(); toast('Cliente salvo.');
  } });

  // --- pessoas de contato
  const drawContatos = () => contatosBox.replaceChildren(contatos.length ? h('ul', { class: 'ul-list' }, contatos.map((p) => h('li', { class: 'row between' },
    h('span', {}, h('b', {}, p.nome), p.principal && h('span', {}, ' ', badge('Principal')), p.cargo && h('span', { class: 'small muted' }, ' · ' + p.cargo),
      h('div', { class: 'small' }, [p.email, p.telefone].filter(Boolean).map((x, i) => { const hr = contactHref(x); return [i ? ' · ' : '', hr ? h('a', { class: 't', href: hr, target: '_blank', rel: 'noopener noreferrer' }, x) : x]; }))),
    canEdit && h('span', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => formContato(p) }, 'Editar'),
      h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg(`Remover ${p.nome} dos contatos?`) && await run(sb.from('cliente_contatos').delete().eq('id', p.id), 'Contato removido.')) { contatos.splice(contatos.indexOf(p), 1); drawContatos(); } } }, 'Remover'))))) : h('p', { class: 'small muted' }, 'Nenhuma pessoa de contato cadastrada.'));
  const formContato = (p = {}) => formModal({ title: p.id ? 'Editar contato' : 'Novo contato', fields: [
    { name: 'nome', label: 'Nome', required: true, maxlength: 120, value: p.nome }, { name: 'cargo', label: 'Cargo', maxlength: 80, value: p.cargo },
    { name: 'email', label: 'E-mail', type: 'email', maxlength: 160, value: p.email }, { name: 'telefone', label: 'Telefone / WhatsApp', maxlength: 40, value: p.telefone },
    { name: 'principal', label: 'Contato principal?', type: 'select', value: p.principal ? 'sim' : 'nao', options: [['nao', 'Não'], ['sim', 'Sim']] }],
  onSubmit: async (v) => {
    const row = { ...v, principal: v.principal === 'sim', cliente_id: cli.id };
    if (row.principal) await sb.from('cliente_contatos').update({ principal: false }).eq('cliente_id', cli.id);
    const r = await run(p.id ? sb.from('cliente_contatos').update(row).eq('id', p.id).select().single() : sb.from('cliente_contatos').insert(row).select().single(), 'Contato salvo.');
    if (!r) return false;
    if (row.principal) contatos.forEach((x) => { x.principal = false; });
    if (p.id) Object.assign(p, r); else contatos.push(r);
    drawContatos();
  } });

  // --- links importantes
  const drawLinks = () => linksBox.replaceChildren(links.length ? h('ul', { class: 'ul-list' }, links.map((l) => h('li', { class: 'row between' },
    h('span', {}, linkSeguro(l.url, l.titulo)),
    canEdit && h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Remover este link?') && await run(sb.from('cliente_links').delete().eq('id', l.id), 'Link removido.')) { links.splice(links.indexOf(l), 1); drawLinks(); } } }, 'Remover')))) : h('p', { class: 'small muted' }, 'Guarde aqui pastas, contratos e documentos importantes (endereços http/https).'));

  const card = (titulo, acao, ...kids) => h('section', { class: 'card' }, h('div', { class: 'row between', style: 'margin-bottom:8px' }, h('h2', {}, titulo), acao), ...kids);
  const lista = (itens, vazio) => itens.length ? h('ul', { class: 'ul-list' }, itens) : h('p', { class: 'small muted' }, vazio);

  const blocoComercial = ctx.can('contatos') && card('Oportunidades e propostas', h('a', { class: 'btn sm', href: '../contatos/' }, 'Ver leads'),
    lista([...leads.map((l) => h('li', { class: 'row between' }, h('span', {}, 'Lead: ', h('b', {}, l.empresa || l.nome), l.valor_estimado != null && h('span', { class: 'small muted' }, ' · ' + L.brl(l.valor_estimado))), badge(base.lab('etapa_lead', l.status), l.status === 'concluido' ? 'ok' : l.status === 'descartado' ? 'dim' : ''))),
      ...propostas.map((p) => { const s = L.statusProposta(p, hoje); return h('li', { class: 'row between' }, h('span', {}, 'Proposta: ', h('b', {}, p.titulo), h('span', { class: 'small muted' }, ' · ' + L.brl(p.valor))), badge(L.PROPOSTA_STATUS[s], s === 'aceita' ? 'ok' : s === 'recusada' || s === 'vencida' ? 'warn' : 'dim')); })], 'Nenhum lead ou proposta ligado a este cliente.'));

  const blocoProjetos = ctx.can('projetos') && card('Projetos', h('a', { class: 'btn sm', href: '../projetos/' }, 'Abrir quadro'),
    lista(projetos.map((p) => h('li', { class: 'row between' }, h('a', { class: 't', href: `../projetos/detalhe.html?id=${p.id}` }, p.titulo),
      h('span', { class: 'row', style: 'gap:6px' }, p.valor_contratado != null && h('span', { class: 'small muted' }, L.brl(p.valor_contratado)), badge(base.lab('etapa_projeto', p.status), L.FIM_PROJETO.includes(p.status) ? 'dim' : '')))), 'Nenhum projeto ainda.'));

  const abertas = tarefas.filter((t) => t.status !== 'concluida');
  const blocoTarefas = ctx.can('projetos') && card(`Tarefas em aberto (${abertas.length})`, h('a', { class: 'btn sm', href: '../tarefas/' }, 'Abrir tarefas'),
    lista(abertas.slice(0, 8).map((t) => { const pz = L.prazoInfo(t.prazo, hoje); return h('li', { class: 'row between' }, h('span', {}, t.titulo), h('span', { class: 'row', style: 'gap:6px' }, pz?.atrasado && badge('Atrasada', 'warn'), t.prazo && h('span', { class: 'small muted' }, fmtDate(t.prazo)), badge(base.lab('etapa_tarefa', t.status), 'dim'))); }), 'Nenhuma tarefa em aberto.'));

  const blocoChamados = ctx.can('suporte') && card('Chamados de suporte', h('a', { class: 'btn sm', href: '../suporte/' }, 'Abrir suporte'),
    lista(chamados.slice(0, 8).map((c) => h('li', { class: 'row between' }, h('span', {}, `#${c.numero} · ${c.assunto}`), h('span', { class: 'row', style: 'gap:6px' }, L.chamadoAtrasado(c, hoje) && badge('Fora do prazo', 'warn'), badge(base.lab('etapa_chamado', c.status), L.FIM_CHAMADO.includes(c.status) ? 'dim' : '')))), 'Nenhum chamado registrado.'));

  const ef = cobrancas.map((c) => ({ ...c, ef: L.statusCobranca(c, hoje) }));
  const blocoFin = ctx.can('financeiro') && card('Cobranças e pagamentos', h('a', { class: 'btn sm', href: '../financeiro/' }, 'Abrir financeiro'),
    h('div', { class: 'row', style: 'gap:18px;margin-bottom:8px' },
      h('span', { class: 'small' }, 'Recebido: ', h('b', {}, L.brl(L.soma(ef.filter((c) => c.ef === 'paga').map((c) => ({ v: c.valor_pago ?? c.valor })), 'v')))),
      h('span', { class: 'small' }, 'A receber: ', h('b', {}, L.brl(L.soma(ef.filter((c) => ['pendente', 'prevista'].includes(c.ef)), 'valor')))),
      h('span', { class: 'small', style: 'color:#ff9b8a' }, 'Em atraso: ', h('b', {}, L.brl(L.soma(ef.filter((c) => c.ef === 'atrasada'), 'valor'))))),
    lista(ef.filter((c) => c.ef !== 'cancelada').slice(0, 8).map((c) => h('li', { class: 'row between' }, h('span', {}, `${c.descricao} (${c.parcela}/${c.total_parcelas})`), h('span', { class: 'row', style: 'gap:6px' }, h('span', { class: 'small muted' }, fmtDate(c.vencimento) + ' · ' + L.brl(c.valor)), badge(L.COBRANCA_STATUS[c.ef], c.ef === 'paga' ? 'ok' : c.ef === 'atrasada' ? 'warn' : 'dim')))), 'Nenhuma cobrança registrada.'));

  const blocoContratos = ctx.can('financeiro') && contratos.length > 0 && card(`Contratos recorrentes · ${L.brl(L.receitaMensal(contratos))}/mês`, h('a', { class: 'btn sm', href: `../financeiro/?cliente=${id}` }, 'Abrir financeiro'),
    lista(contratos.map((k) => h('li', { class: 'row between' }, h('span', {}, k.descricao, h('span', { class: 'small muted' }, ` · ${L.brl(k.valor)} ${L.PERIODICIDADES[k.periodicidade].toLowerCase()}`)), badge(k.status === 'ativo' ? 'Próxima: ' + fmtDate(k.proximo_vencimento) : L.CONTRATO_STATUS[k.status], k.status === 'ativo' ? 'ok' : 'dim'))), ''));

  view.append(head,
    h('div', { class: 'cols2' },
      h('div', { class: 'stack' }, card('Dados da empresa', null, dados),
        card('Pessoas de contato', canEdit && h('button', { class: 'btn sm primary', onclick: () => formContato() }, 'Adicionar'), contatosBox),
        card('Arquivos e links importantes', canEdit && h('button', { class: 'btn sm primary', onclick: () => formModal({ title: 'Novo link', fields: [
          { name: 'titulo', label: 'Título', required: true, maxlength: 120 }, { name: 'url', label: 'Endereço', type: 'url', required: true, maxlength: 500, placeholder: 'https://' }],
        onSubmit: async (v) => { const r = await run(sb.from('cliente_links').insert({ ...v, cliente_id: cli.id }).select().single(), 'Link salvo.'); if (!r) return false; links.unshift(r); drawLinks(); } }) }, 'Adicionar'), linksBox)),
      h('div', { class: 'stack' }, blocoComercial, blocoProjetos, blocoTarefas, blocoChamados, blocoContratos, blocoFin)),
    h('section', { class: 'card', style: 'margin-top:18px' }, h('h2', { style: 'margin-bottom:4px' }, 'Linha do tempo'),
      h('p', { class: 'small muted', style: 'margin-bottom:12px' }, 'Interações, decisões e alterações de tudo o que envolve este cliente. Notas e mensagens são só para a equipe.'),
      timeline({ cliente_id: id, entidade: 'clientes', id }, { base, canEdit })));
  drawHead(); drawContatos(); drawLinks();
});
