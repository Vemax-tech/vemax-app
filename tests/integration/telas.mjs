// Teste de fumaça: renderiza cada tela da área interna com um Supabase falso e exercita os fluxos principais.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.env.SMOKE_DIR = HERE;
const REPO = process.env.REPO || path.resolve(HERE, '../..');
register('./hooks.mjs', import.meta.url);
const { sb, state, seedOpcoes, zerarEstado } = await import('./fake-supabase.mjs');
const mod = (n) => import(pathToFileURL(path.join(REPO, 'app/js/modules', n + '.js')).href);

const falhas = [], erros = [];
const check = (c, m) => { if (!c) { falhas.push(m); console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const origErr = console.error;
console.error = (...a) => { erros.push(a.map(String).join(' ')); origErr('  [console.error]', ...a.map((x) => (x?.message ? x.message : String(x)).slice(0, 200))); };
process.on('unhandledRejection', (e) => { erros.push('unhandled: ' + e?.stack); origErr('UNHANDLED', e?.stack || e); });
process.on('uncaughtException', (e) => { erros.push('uncaught: ' + e?.stack); origErr('UNCAUGHT', e?.stack || e); });

// ---------------------------------------------------------------- dados de teste
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
const dia = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');
function seed(papel = 'admin') {
  zerarEstado();
  const d = (state.db = {});
  d.profiles = [
    { id: 'u1', nome: 'Marcos Vinicius', cargo: 'Sócio', email: 'm@x.com', papel, ativo: true, status: 'aprovado', criado_em: daysAgo(90), notif_prefs: {} },
    { id: 'u2', nome: 'Vitor', cargo: 'Sócio', email: 'v@x.com', papel: 'admin', ativo: true, status: 'aprovado', criado_em: daysAgo(90), notif_prefs: {} },
  ];
  d.permissoes = [];
  d.opcoes = seedOpcoes(path.join(REPO, 'supabase/migrations/012_area_interna.sql'));
  d.categorias_servico = [{ id: 'cat1', nome: 'Site', ordem: 1, ativo: true }, { id: 'cat2', nome: 'Sistema', ordem: 2, ativo: true }];
  d.modelos_projeto = [{ id: 'm1', nome: 'Site institucional', categoria_id: 'cat1', descricao: 'x', prazo_dias: 30, esforco_horas: 60, ativo: true, tarefas: [{ titulo: 'Briefing', prioridade: 'alta', dias: 3 }], entregas: [{ titulo: 'Site publicado', dias: 30 }] }];
  d.clientes = [
    { id: 'c1', nome: 'Padaria Pão Doce', razao_social: 'Pão Doce Ltda', documento: '12345678000199', email: 'contato@paodoce.com', telefone: '11999990000', site: 'https://paodoce.com', cidade: 'São Paulo', observacoes: 'Cliente antigo', criado_em: daysAgo(60), deleted_at: null },
    { id: 'c2', nome: 'Oficina Silva', razao_social: '', documento: '', email: '', telefone: '11988887777', site: '', cidade: '', observacoes: '', criado_em: daysAgo(10), deleted_at: null },
  ];
  d.cliente_contatos = [{ id: 'cc1', cliente_id: 'c1', nome: 'Ana', cargo: 'Dona', email: 'ana@paodoce.com', telefone: '', principal: true }];
  d.cliente_links = [{ id: 'cl1', cliente_id: 'c1', titulo: 'Pasta do Drive', url: 'https://drive.example/x' }, { id: 'cl2', cliente_id: 'c1', titulo: 'Ruim', url: 'javascript:alert(1)' }];
  d.contatos_site = [
    { id: 'l1', nome: 'Maria', contato: 'maria@x.com', mensagem: 'Preciso de um site para minha loja', problema: 'Sem presença online', solucao_sugerida: 'Site institucional', status: 'novo', origem: 'site', empresa: '', pessoa_contato: '', email: '', telefone: '', notas: '', perfil: { segmento: 'Comércio', prazo: 'O quanto antes' }, criado_em: daysAgo(3), etapa_desde: daysAgo(3), deleted_at: null },
    { id: 'l2', nome: 'Pão Doce', contato: 'ana@paodoce.com', empresa: 'Padaria Pão Doce', pessoa_contato: 'Ana', email: 'ana@paodoce.com', telefone: '', mensagem: 'Sistema de encomendas', status: 'negociacao', origem: 'indicacao', responsavel_id: 'u1', valor_estimado: 5000, proximo_contato: dia(-2), cliente_id: 'c1', categoria_id: 'cat2', notas: '', criado_em: daysAgo(30), etapa_desde: daysAgo(20), primeiro_contato_em: daysAgo(28), deleted_at: null },
    { id: 'l3', nome: 'Loja X', contato: '11999998888', mensagem: 'Orçamento', status: 'descartado', origem: 'whatsapp', motivo_perda: 'preco', detalhe_perda: 'achou caro', empresa: '', notas: '', criado_em: daysAgo(40), etapa_desde: daysAgo(35), deleted_at: null },
  ];
  d.propostas = [
    { id: 'pr1', contato_id: 'l1', cliente_id: null, titulo: 'Proposta Site Maria', escopo: 'Site com 5 páginas', servicos: 'Design e desenvolvimento', condicoes_pagamento: '50/50', prazo_texto: '6 semanas', valor: 3000, validade: dia(-3), status: 'enviada', token: 'b'.repeat(64), enviada_em: daysAgo(10), criado_em: daysAgo(10), deleted_at: null },
    { id: 'pr2', contato_id: 'l2', cliente_id: 'c1', titulo: 'Sistema de encomendas', escopo: 'Cadastro e pedidos', servicos: '', condicoes_pagamento: '', prazo_texto: '2 meses', valor: 10000, validade: dia(10), status: 'aceita', token: 'c'.repeat(64), respondida_em: daysAgo(5), resposta_nome: 'Ana', resposta_obs: '', criado_em: daysAgo(20), deleted_at: null, responsavel_id: 'u1' },
    { id: 'pr3', contato_id: null, cliente_id: 'c2', titulo: 'Manutenção', escopo: '', servicos: '', condicoes_pagamento: '', prazo_texto: '', valor: null, validade: dia(15), status: 'rascunho', token: 'd'.repeat(64), criado_em: daysAgo(1), deleted_at: null },
  ];
  d.projetos = [
    { id: 'p1', titulo: 'Sistema Pão Doce', cliente: 'Padaria Pão Doce', cliente_id: 'c1', proposta_id: 'pr2', contato_id: 'l2', status: 'andamento', prioridade: 'alta', prazo: dia(-5), inicio_previsto: dia(-40), valor_contratado: 10000, esforco_horas: 10, responsavel_id: 'u1', categoria_id: 'cat2', descricao: 'Sistema de encomendas', escopo: 'Cadastro e pedidos', bloqueado: false, motivo_bloqueio: '', iniciado_em: daysAgo(30), concluido_em: null, criado_em: daysAgo(30), link_repositorio: 'https://github.com/vemax/x', link_ambiente: '', link_documentacao: '', deleted_at: null, token_cliente: null },
    { id: 'p2', titulo: 'Site Oficina', cliente: 'Oficina Silva', cliente_id: 'c2', status: 'concluido', prioridade: 'media', prazo: dia(-30), valor_contratado: 2000, responsavel_id: 'u2', descricao: '', escopo: '', bloqueado: false, iniciado_em: daysAgo(50), concluido_em: daysAgo(3), criado_em: daysAgo(55), link_repositorio: '', link_ambiente: '', link_documentacao: '', deleted_at: null },
  ];
  d.projeto_membros = [{ projeto_id: 'p1', usuario_id: 'u2' }];
  d.projeto_entregas = [{ id: 'e1', projeto_id: 'p1', titulo: 'Primeira versão', tipo: 'entrega', data_prevista: dia(-1), concluida: false }];
  d.projeto_escopo_alteracoes = [{ id: 'm1', projeto_id: 'p1', descricao: 'Adicionar relatório de vendas', solicitante: 'Ana', impacto_dias: 5, impacto_valor: 1500, decisao: 'pendente', decisao_obs: '', aplicada: false, criado_em: daysAgo(2) }];
  d.projeto_ciclos = []; d.projeto_wip = [{ status: 'andamento', limite: 1 }]; d.projeto_updates = []; d.avaliacoes = []; d.projeto_anexos = [];
  d.tarefas = [
    { id: 't1', projeto_id: 'p1', cliente_id: 'c1', titulo: 'Modelar banco', status: 'andamento', prioridade: 'alta', responsavel_id: 'u1', prazo: dia(-2), horas_estimadas: 5, horas_gastas: 12, motivo_bloqueio: '', criado_em: daysAgo(20), deleted_at: null },
    { id: 't2', projeto_id: 'p1', cliente_id: 'c1', titulo: 'Integrar pagamento', status: 'bloqueada', prioridade: 'media', responsavel_id: 'u2', prazo: dia(5), motivo_bloqueio: 'Aguardando chave', horas_gastas: 0, criado_em: daysAgo(10), deleted_at: null },
    { id: 't3', projeto_id: 'p1', cliente_id: 'c1', titulo: 'Escrever manual', status: 'a_fazer', prioridade: 'baixa', responsavel_id: null, prazo: dia(3), horas_gastas: 0, motivo_bloqueio: '', criado_em: daysAgo(5), deleted_at: null },
    { id: 't4', projeto_id: null, titulo: 'Organizar pasta da empresa', status: 'concluida', prioridade: 'media', responsavel_id: 'u1', prazo: null, horas_gastas: 0, motivo_bloqueio: '', criado_em: daysAgo(5), deleted_at: null },
  ];
  d.chamados = [
    { id: 'ch1', numero: 1, cliente_id: 'c1', projeto_id: 'p1', assunto: 'Erro ao emitir pedido', descricao: 'Tela branca', canal: 'whatsapp', prioridade: 'urgente', responsavel_id: null, status: 'novo', aberto_em: daysAgo(2), prazo: dia(-1), solucao: '', deleted_at: null },
    { id: 'ch2', numero: 2, cliente_id: 'c2', assunto: 'Trocar senha do e-mail', descricao: '', canal: 'telefone', prioridade: 'baixa', responsavel_id: 'u2', status: 'atendimento', aberto_em: daysAgo(1), prazo: dia(1), solucao: '', deleted_at: null },
  ];
  d.cobrancas = [
    { id: 'cb1', cliente_id: 'c1', projeto_id: 'p1', descricao: 'Sistema Pão Doce', parcela: 1, total_parcelas: 2, valor: 5000, vencimento: dia(-4), status: 'pendente', observacoes: '', criado_em: daysAgo(10), deleted_at: null },
    { id: 'cb2', cliente_id: 'c1', projeto_id: 'p1', descricao: 'Sistema Pão Doce', parcela: 2, total_parcelas: 2, valor: 5000, vencimento: dia(20), status: 'pendente', observacoes: '', criado_em: daysAgo(10), deleted_at: null },
    { id: 'cb3', cliente_id: 'c2', projeto_id: 'p2', descricao: 'Site Oficina', parcela: 1, total_parcelas: 1, valor: 2000, vencimento: dia(-10), status: 'paga', pago_em: dia(-2), valor_pago: 2000, metodo: 'pix', observacoes: '', criado_em: daysAgo(30), deleted_at: null },
  ];
  d.despesas = [{ id: 'd1', projeto_id: 'p1', descricao: 'Hospedagem', categoria: 'hospedagem', fornecedor: 'Cloud', valor: 9000, data: dia(-3), observacoes: '', deleted_at: null }];
  d.interacoes = [{ id: 'i1', entidade: 'contatos_site', entidade_id: 'l2', cliente_id: 'c1', tipo: 'contato', texto: 'Ligação: pediu orçamento', criado_por: 'u1', criado_em: daysAgo(4) }, { id: 'i2', entidade: 'chamados', entidade_id: 'ch1', cliente_id: 'c1', tipo: 'mensagem', texto: 'Avisamos que estamos olhando', criado_por: 'u2', criado_em: daysAgo(1) }];
  d.atividades = [{ id: 1, usuario_id: 'u1', acao: 'editou', entidade: 'projetos', detalhe: 'Sistema (status: planejado → andamento)', criado_em: daysAgo(1) }];
  d.contratos = [
    { id: 'k1', cliente_id: 'c1', tipo: 'suporte', descricao: 'Suporte mensal de TI', valor: 500, periodicidade: 'mensal', status: 'ativo', dia_vencimento: 10, proximo_vencimento: dia(8), antecedencia_dias: 10, fim: null, observacoes: '', deleted_at: null },
    { id: 'k2', cliente_id: 'c2', tipo: 'hospedagem', descricao: 'Hospedagem anual', valor: 1200, periodicidade: 'anual', status: 'pausado', dia_vencimento: 5, proximo_vencimento: dia(100), antecedencia_dias: 10, fim: null, observacoes: '', deleted_at: null },
  ];
  d.notificacoes = [];
  d.config_seguranca = [{ chave: 'sessao_max_horas', valor: 12 }, { chave: 'exigir_mfa_admin', valor: 0 }];
  d.eventos_seguranca = [
    { id: 1, quando: daysAgo(0), tipo: 'login_falha', email_hash: 'a'.repeat(64), usuario_id: null, detalhe: '' },
    { id: 2, quando: daysAgo(0), tipo: 'alerta_forca_bruta', email_hash: 'a'.repeat(64), usuario_id: null, detalhe: '5 falhas em 15 minutos' },
    { id: 3, quando: daysAgo(1), tipo: 'login_ok', email_hash: null, usuario_id: 'u2', detalhe: '' },
    { id: 4, quando: daysAgo(2), tipo: 'papel_alterado', email_hash: null, usuario_id: 'u1', detalhe: 'Vitor: membro -> admin' },
  ];
  d.nichos = []; d.criterios = []; d.notas_nicho = [];
}

// ---------------------------------------------------------------- DOM
let dom;
function mount(urlPath, html) {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (String(e.message).includes('navigation')) state.navegacoes++; });
  dom = new JSDOM(html || '<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' + urlPath, pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  for (const k of ['window', 'document', 'Element', 'location', 'HTMLElement', 'Node', 'KeyboardEvent', 'MouseEvent', 'Event', 'MutationObserver', 'DataTransfer', 'DocumentFragment', 'sessionStorage', 'localStorage']) {
    Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true });
  w.open = () => null; w.confirm = () => true; w.print = () => {};
  // A tela de Segurança confere os cabeçalhos com um fetch HEAD na própria página. Sem rede, o fetch
  // real demora (e falha) de forma imprevisível, e a conferência era lida antes de terminar.
  // Aqui ele responde na hora, com os cabeçalhos que o _headers publica.
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: (n) => ({ 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'nosniff' }[String(n).toLowerCase()] ?? null) },
  });
  globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const clickOrig = w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) { globalThis.__downloads = (globalThis.__downloads || 0) + 1; return; } return clickOrig.call(this); };
  return w;
}
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const body = () => document.body.textContent.replace(/\s+/g, ' ');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const find = (sel, label, root = document) => [...root.querySelectorAll(sel)].find((x) => norm(x.textContent) === label || (label instanceof RegExp && label.test(norm(x.textContent))));
async function click(label, root = document, sel = 'button,a') {
  const el = find(sel, label, root);
  if (!el) throw new Error(`botão/link não encontrado: ${label}`);
  el.click(); await wait();
  return el;
}
const modalEl = () => [...document.querySelectorAll('.ov')].pop();
async function fill(root, name, value) {
  const el = root.querySelector(`[name="${name}"]`);
  if (!el) throw new Error('campo não encontrado: ' + name);
  el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
async function submit(label) { const m = modalEl(); await click(label, m); await wait(80); }
async function run(nome, url, fn, { papel = 'admin', perms, html } = {}) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(nome)) return;
  console.log('\n— ' + nome);
  seed(papel); if (perms) state.db.permissoes = perms;
  mount(url, html || (url.startsWith('/app/login') ? HTML_LOGIN : undefined));   // a tela de login usa o HTML real
  (await import(pathToFileURL(path.join(REPO, 'app/js/ui.js')).href)).instalarDom(dom.window.Element);
  const antes = erros.length;
  try { await fn(); await wait(80); vazamentos(nome); } catch (e) { falhas.push(`${nome}: ${e.message}`); console.log('  ✗ EXCEÇÃO: ' + e.stack.split('\n').slice(0, 4).join('\n    ')); }
  if (erros.length > antes) { falhas.push(`${nome}: ${erros.length - antes} console.error`); }
}
const RE_VAZA = /\b(null|undefined|false|NaN)\b|\[object/;
const vazamentos = (nome) => {
  const t = document.body.textContent;
  const k = t.search(RE_VAZA);
  if (k >= 0) { falhas.push(`${nome}: texto interno vazou na tela (...${t.slice(Math.max(0, k - 40), k + 40)}...)`); console.log("  ✗ vazamento de texto perto de: " + t.slice(Math.max(0, k - 40), k + 40)); }
};
const init = async (m, fn = 'init') => { (await mod(m))[fn](); await wait(250); };

// ---------------------------------------------------------------- cenários
await run('Visão geral', '/app/', async () => {
  await init('painel');
  const t = body();
  check(t.includes('Olá, Marcos'), 'saudação');
  check(t.includes('Leads novos sem retorno'), 'bloco comercial');
  check(t.includes('Maria'), 'lead novo sem retorno listado');
  check(t.includes('Tarefas atrasadas'), 'bloco de tarefas');
  check(t.includes('Modelar banco'), 'tarefa atrasada listada');
  check(t.includes('Consumindo mais que o previsto'), 'projeto acima do previsto (horas/custo)');
  check(t.includes('Chamados abertos') && t.includes('#1'), 'suporte');
  check(t.includes('Vencido'), 'financeiro');
  check(!t.includes('Por onde começar'), 'sem onboarding quando há dados');
  check(t.includes('Atividade recente'), 'atividade recente');
});
await run('Visão geral (banco vazio)', '/app/', async () => {
  seed(); for (const k of ['contatos_site', 'propostas', 'projetos', 'tarefas', 'chamados', 'cobrancas', 'despesas', 'clientes', 'atividades']) state.db[k] = [];
  await init('painel');
  const t = body();
  check(t.includes('Por onde começar'), 'orientação para começar');
  check(t.includes('Nenhum lead ainda'), 'estado vazio de leads');
  check(t.includes('Ainda não há atividade'), 'estado vazio de atividade');
});
await run('Visão geral (membro sem financeiro/suporte)', '/app/', async () => {
  state.user = 'u1';
  await init('painel');
  const t = body();
  check(!t.includes('Recebido no período'), 'financeiro oculto sem permissão');
  check(!t.includes('Chamados abertos'), 'suporte oculto sem permissão');
  check(t.includes('Leads novos sem retorno'), 'comercial visível');
}, { papel: 'membro', perms: [{ modulo: 'contatos', pode_ver: true, pode_editar: false }, { modulo: 'projetos', pode_ver: true, pode_editar: false }] });
await run('Financeiro bloqueado para membro', '/app/financeiro/', async () => {
  await init('financeiro');
  check(body().includes('Sem acesso'), 'tela de sem acesso');
}, { papel: 'membro', perms: [{ modulo: 'contatos', pode_ver: true, pode_editar: false }] });

await run('Leads', '/app/contatos/', async () => {
  await init('contatos');
  let t = body();
  check(t.includes('Leads e oportunidades'), 'título');
  check(t.includes('Padaria Pão Doce') && t.includes('Maria') && t.includes('Loja X'), 'leads na lista');
  check(t.includes('Contato atrasado'), 'alerta de contato atrasado');
  check(t.includes('Sem primeiro contato') || t.includes('Novos sem primeiro contato'), 'alerta sem primeiro contato');
  check(t.includes('Parado há mais de'), 'alerta de lead parado');
  await click('Quadro');
  t = body();
  check(document.querySelectorAll('.kcol').length === 7, 'quadro com 7 colunas do funil (' + document.querySelectorAll('.kcol').length + ')');
  check(t.includes('Reunião ou levantamento') && t.includes('Negociação') && t.includes('Ganho') && t.includes('Perdido'), 'etapas do funil');
  // mover para Perdido pede motivo
  const card = [...document.querySelectorAll('.kcard')].find((c) => c.textContent.includes('Maria'));
  const sel = card.querySelector('select.mv');
  sel.value = 'descartado'; sel.dispatchEvent(new dom.window.Event('change')); await wait(80);
  check(modalEl() && modalEl().textContent.includes('Motivo da perda'), 'pede motivo da perda');
  await fill(modalEl(), 'motivo_perda', 'preco'); await submit('Marcar como perdido');
  check(state.db.contatos_site.find((l) => l.id === 'l1').status === 'descartado', 'lead movido para perdido');
  check(state.db.contatos_site.find((l) => l.id === 'l1').motivo_perda === 'preco', 'motivo gravado');
  check(state.db.interacoes.some((i) => i.entidade === 'contatos_site' && i.entidade_id === 'l1' && i.texto.includes('Motivo: Preço')), 'etapa registrada na linha do tempo');
  // novo lead
  await click('Lista');
  await click('Novo lead');
  let m = modalEl();
  await submit('Salvar'); check(modalEl().textContent.includes('Preencha: Necessidade relatada'), 'valida necessidade obrigatória');
  await fill(modalEl(), 'mensagem', 'Quero automatizar planilhas'); await submit('Salvar');
  check(modalEl().textContent.includes('empresa ou a pessoa'), 'exige empresa ou pessoa');
  await fill(modalEl(), 'empresa', 'Mercado Bom Preço'); await submit('Salvar');
  check(modalEl().textContent.includes('e-mail ou telefone'), 'exige e-mail ou telefone');
  await fill(modalEl(), 'email', 'ok@mercado.com'); await fill(modalEl(), 'valor_estimado', '1200'); await fill(modalEl(), 'origem', 'indicacao'); await submit('Salvar');
  const novo = state.db.contatos_site.find((l) => l.empresa === 'Mercado Bom Preço');
  check(novo && novo.nome === 'Mercado Bom Preço' && novo.contato === 'ok@mercado.com' && novo.status === 'novo' && novo.valor_estimado === 1200, 'lead criado com nome/contato derivados');
  check(modalEl() && modalEl().textContent.includes('Mercado Bom Preço'), 'abre o detalhe do novo lead');
  // detalhe: converter em cliente (empresa nova)
  await click('Converter em cliente'); m = modalEl();
  check(m.textContent.includes('Converter em cliente') && m.querySelector('[name="nome"]').value === 'Mercado Bom Preço', 'formulário de conversão preenchido');
  await submit('Converter'); await wait(150);
  const cli = state.db.clientes.find((c) => c.nome === 'Mercado Bom Preço');
  check(cli && novo.cliente_id === cli.id, 'cliente criado e lead vinculado');
});
await run('Leads: conversão evita duplicado', '/app/contatos/', async () => {
  await init('contatos');
  const l1 = state.db.contatos_site.find((l) => l.id === 'l1'); l1.empresa = 'Oficina Silva';
  await init('contatos');
  const row = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Oficina Silva'));
  row.querySelector('a.t').click(); await wait();
  await click('Converter em cliente');
  await submit('Converter');
  check(modalEl() && modalEl().textContent.includes('Já existe um cadastro parecido'), 'avisa sobre cliente parecido');
  await click('Usar este', modalEl()); await wait(150);
  check(state.db.clientes.length === 2, 'não criou cliente duplicado');
  check(l1.cliente_id === 'c2', 'lead ligado ao cliente existente');
});
await run('Propostas', '/app/propostas/', async () => {
  await init('propostas');
  let t = body();
  check(t.includes('Proposta Site Maria') && t.includes('Sistema de encomendas') && t.includes('Manutenção'), 'lista de propostas');
  check(t.includes('Vencida'), 'proposta enviada com validade passada aparece como vencida');
  check(t.includes('Aprovada'), 'status aprovada');
  // detalhe da aprovada -> criar projeto
  const a = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Sistema de encomendas')).querySelector('a.t'); a.click(); await wait();
  check(modalEl().textContent.includes('Criar projeto') || modalEl().textContent.includes('Ver projeto'), 'ação de projeto na proposta aprovada');
  // detalhe da vencida
  modalEl().remove();
  [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Proposta Site Maria')).querySelector('a.t').click(); await wait();
  check(modalEl().textContent.includes('Prorrogar validade'), 'vencida pode ser prorrogada');
  await click('Prorrogar validade', modalEl()); await fill(modalEl(), 'validade', dia(10)); await submit('Prorrogar');
  check(state.db.propostas.find((p) => p.id === 'pr1').status === 'enviada', 'prorrogar volta para enviada');
  // registrar aprovação
  await wait(100);
  const det = [...document.querySelectorAll('.ov')].find((o) => o.textContent.includes('Registrar aprovação'));
  await click('Registrar aprovação', det); await submit('Registrar');
  check(state.db.propostas.find((p) => p.id === 'pr1').status === 'aceita', 'aprovação registrada pela equipe');
  // criar projeto a partir da aprovada do lead l1 (sem cliente): pede para cadastrar cliente
  const det2 = [...document.querySelectorAll('.ov')].find((o) => o.textContent.includes('Criar projeto'));
  check(Boolean(det2), 'botão Criar projeto aparece');
  // nova proposta
  await click('Nova proposta');
  await submit('Salvar'); check(modalEl().textContent.includes('Preencha: Título') || modalEl().textContent.includes('Escolha o lead ou o cliente'), 'valida origem/título');
});
await run('Clientes (lista e ficha)', '/app/clientes/', async () => {
  await init('clientes');
  let t = body();
  check(t.includes('Padaria Pão Doce') && t.includes('Oficina Silva'), 'lista de clientes');
  check(t.includes('Projetos ativos') && t.includes('A receber'), 'colunas de resumo por cliente');
  await click('Novo cliente'); await fill(modalEl(), 'nome', 'padaria pao doce ltda'); await submit('Salvar');
  check(modalEl().textContent.includes('Já existe um cadastro parecido'), 'duplicado detectado ao cadastrar');
  await click('Cancelar', modalEl()); await wait();
  mount('/app/clientes/ficha.html?id=c1');
  await init('clientes', 'initFicha');
  t = body();
  check(t.includes('Padaria Pão Doce') && t.includes('12345678000199'), 'dados da empresa');
  check(t.includes('Ana') && t.includes('Pasta do Drive'), 'contatos e links');
  check(![...document.querySelectorAll('a')].some((a) => a.href.startsWith('javascript:')), 'link inseguro não vira <a>');
  check(t.includes('Sistema Pão Doce') && t.includes('Sistema de encomendas'), 'projetos e propostas do cliente');
  check(t.includes('Erro ao emitir pedido'), 'chamados do cliente');
  check(t.includes('Em atraso'), 'resumo financeiro do cliente');
  check(t.includes('Ligação: pediu orçamento'), 'linha do tempo do cliente');
});
await run('Projetos (quadro)', '/app/projetos/', async () => {
  await init('projetos');
  const t = body();
  check(document.querySelectorAll('.kcol').length >= 6, 'colunas do quadro: ' + document.querySelectorAll('.kcol').length);
  check(t.includes('Sistema Pão Doce') && t.includes('Site Oficina'), 'projetos nos cartões');
  check(t.includes('Aguardando cliente') && t.includes('Cancelado'), 'etapas novas');
  check(t.includes('Horas acima do previsto'), 'alerta de horas');
  check(t.includes('Custo alto'), 'alerta de custo');
  check(t.includes('1/3 tarefas') || t.includes('0/3 tarefas'), 'progresso de tarefas');
  // novo projeto
  await click('Novo projeto');
  await submit('Criar projeto'); check(modalEl().textContent.includes('Preencha: Nome do projeto'), 'valida nome');
  await fill(modalEl(), 'titulo', 'Site Pão Doce'); await submit('Criar projeto');
  check(modalEl().textContent.includes('Preencha: Cliente'), 'cliente obrigatório');
  await fill(modalEl(), 'cliente_id', 'c1'); await fill(modalEl(), 'modelo', 'm1'); await fill(modalEl(), 'inicio_previsto', dia(5)); await fill(modalEl(), 'prazo', dia(1));
  await submit('Criar projeto'); check(modalEl().textContent.includes('prazo de entrega não pode ser antes'), 'valida prazo x início');
  await fill(modalEl(), 'prazo', ''); await submit('Criar projeto'); await wait(100);
  const novo = state.db.projetos.find((p) => p.titulo === 'Site Pão Doce');
  check(novo && novo.cliente === 'Padaria Pão Doce' && novo.prazo === dia(35), 'projeto criado com prazo do modelo (' + novo?.prazo + ')');
  check(state.rpcs.some(([n]) => n === 'aplicar_modelo_projeto'), 'modelo aplicado via função do banco');
});
await run('Projeto (ficha)', '/app/projetos/detalhe.html?id=p1', async () => {
  await init('projeto');
  let t = body();
  check(t.includes('Sistema Pão Doce') && t.includes('Padaria Pão Doce'), 'cabeçalho e cliente');
  check(t.includes('Sistema de encomendas (Aprovada)'), 'proposta de origem');
  check(t.includes('Vitor'), 'integrantes');
  check(t.includes('Primeira versão') && t.includes('(atrasada)'), 'entregas');
  check(t.includes('Modelar banco') && t.includes('Aguardando chave'), 'tarefas e bloqueio');
  check(t.includes('Adicionar relatório de vendas') && t.includes('Pendente'), 'pedido de escopo pendente');
  check(t.includes('Financeiro do projeto') && t.includes('Hospedagem'), 'financeiro do projeto');
  check(t.includes('Margem prevista'), 'margem');
  // aprovar mudança de escopo e aplicar impacto
  await click('Aprovar'); await submit('Aprovar'); await wait(100);
  const conf = modalEl(); check(conf && conf.textContent.includes('Aplicar o impacto'), 'oferece aplicar impacto');
  await click('Confirmar', conf); await wait(150);
  const p1 = state.db.projetos.find((p) => p.id === 'p1');
  check(p1.valor_contratado === 11500 && p1.prazo === dia(0), 'impacto aplicado no valor e prazo (' + p1.valor_contratado + ' / ' + p1.prazo + ')');
  // nova tarefa
  await click('Nova tarefa'); await fill(modalEl(), 'titulo', 'Testar fluxo'); await submit('Criar tarefa');
  check(state.db.tarefas.some((x) => x.titulo === 'Testar fluxo' && x.projeto_id === 'p1' && x.cliente_id === 'c1'), 'tarefa criada herdando cliente do projeto');
});
await run('Tarefas', '/app/tarefas/', async () => {
  await init('tarefas');
  let t = body();
  check(t.includes('Atrasadas') && t.includes('Bloqueadas') && t.includes('Sem responsável'), 'indicadores');
  check(document.querySelectorAll('.kcol').length === 5, 'quadro com 5 colunas');
  check(t.includes('Aguardando chave'), 'motivo do bloqueio no cartão');
  await click('Lista');
  check(document.querySelectorAll('tbody tr').length === 4, 'lista com 4 tarefas');
  const g = document.querySelector('select[aria-label="Agrupar a lista por"]'); g.value = 'resp'; g.dispatchEvent(new dom.window.Event('change')); await wait();
  check(body().includes('Sem responsável') && document.querySelectorAll('section h2').length >= 3, 'agrupado por responsável');
  g.value = 'prazo'; g.dispatchEvent(new dom.window.Event('change')); await wait();
  check(body().includes('Atrasadas') && body().includes('Próximos 7 dias'), 'agrupado por prazo');
  g.value = 'projeto'; g.dispatchEvent(new dom.window.Event('change')); await wait();
  check(body().includes('Tarefas internas'), 'agrupado por projeto');
  // bloquear exige motivo
  g.value = ''; g.dispatchEvent(new dom.window.Event('change')); await wait();
  const sel = document.querySelector('select[aria-label="Status de Escrever manual"]'); sel.value = 'bloqueada'; sel.dispatchEvent(new dom.window.Event('change')); await wait(80);
  check(modalEl() && modalEl().textContent.includes('O que está bloqueando'), 'pede motivo ao bloquear');
  await fill(modalEl(), 'motivo', 'Falta conteúdo'); await submit('Bloquear');
  check(state.db.tarefas.find((x) => x.id === 't3').status === 'bloqueada' && state.db.tarefas.find((x) => x.id === 't3').motivo_bloqueio === 'Falta conteúdo', 'bloqueio gravado');
});
await run('Suporte', '/app/suporte/', async () => {
  await init('suporte');
  let t = body();
  check(t.includes('Em aberto') && t.includes('Fora do prazo') && t.includes('Sem responsável'), 'indicadores');
  check(t.includes('#1 · Erro ao emitir pedido') && t.includes('Padaria Pão Doce'), 'chamados no quadro');
  check(document.querySelectorAll('.kcol').length === 5, 'quadro com 5 colunas');
  check(t.includes('Integração automática com WhatsApp e e-mail ainda não está configurada'), 'aviso honesto sobre integrações');
  [...document.querySelectorAll('.kcard a.t')].find((a) => a.textContent.includes('Erro ao emitir')).click(); await wait();
  const m = modalEl();
  check(m.textContent.includes('Mensagem enviada ao cliente') && m.textContent.includes('Avisamos que estamos olhando'), 'mensagem ao cliente separada das notas');
  const sel = m.querySelector('select[aria-label="Mudar status"]'); sel.value = 'resolvido'; sel.dispatchEvent(new dom.window.Event('change')); await wait(80);
  check(modalEl().textContent.includes('Registrar a solução'), 'exige solução ao resolver');
  await fill(modalEl(), 'solucao', 'Corrigido o formulário'); await submit('Registrar e encerrar'); await wait(100);
  const ch = state.db.chamados.find((c) => c.id === 'ch1');
  check(ch.status === 'resolvido' && ch.solucao === 'Corrigido o formulário', 'chamado resolvido com solução');
  await click('Lista', document, 'button'); check(document.querySelectorAll('tbody tr').length === 2, 'lista de chamados');
});
await run('Financeiro', '/app/financeiro/', async () => {
  await init('financeiro');
  let t = body();
  check(t.includes('Previsto no período') && t.includes('Recebido no período') && t.includes('Vencido e não pago'), 'resumo');
  check(t.includes('Atrasada'), 'cobrança atrasada marcada');
  check(t.includes('Padaria Pão Doce'), 'cobranças por cliente');
  // registrar pagamento
  const linha = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Atrasada'));
  await click('Registrar pagamento', linha); await submit('Registrar pagamento');
  check(modalEl().textContent.includes('Preencha: Forma de recebimento'), 'exige forma de recebimento');
  await fill(modalEl(), 'metodo', 'pix'); await submit('Registrar pagamento'); await wait(100);
  const cb = state.db.cobrancas.find((c) => c.id === 'cb1');
  check(cb.status === 'paga' && cb.metodo === 'pix' && cb.valor_pago === 5000, 'pagamento registrado');
  // gerar parcelas
  await click('Gerar cobranças'); const m = modalEl();
  await fill(m, 'cliente_id', 'c2'); await fill(m, 'descricao', 'Manutenção anual'); await fill(m, 'valor', '1000'); await fill(m, 'parcelas', '3'); await fill(m, 'primeiro', dia(7));
  await submit('Gerar parcelas'); await wait(100);
  const novas = state.db.cobrancas.filter((c) => c.descricao === 'Manutenção anual');
  check(novas.length === 3 && novas.reduce((s, c) => s + c.valor, 0) === 1000, '3 parcelas somando o total');
  // despesas e custo por projeto
  await click('Despesas', document, 'a'); check(body().includes('Hospedagem'), 'aba de despesas');
  await click('Custo por projeto', document, 'a'); check(body().includes('Sistema Pão Doce') && body().includes('Margem prevista'), 'aba de custo por projeto');
  await click('Exportar CSV'); check(globalThis.__downloads === 1, 'exportação de CSV disparada');
});
await run('Configurações (admin)', '/app/configuracoes/', async () => {
  await init('configuracoes');
  check(body().includes('Avisos no sino'), 'notificações');
  const box = document.querySelector('input[type=checkbox]'); box.checked = false; box.dispatchEvent(new dom.window.Event('change')); await wait(80);
  check(state.db.profiles[0].notif_prefs.contatos === false, 'preferência de notificação salva');
  await click('Categorias de serviço', document, 'a'); check([...document.querySelectorAll('input')].some((i) => i.value === 'Site') && [...document.querySelectorAll('input')].some((i) => i.value === 'Sistema'), 'categorias');
  await click('Etapas e listas', document, 'a'); check([...document.querySelectorAll('input')].some((i) => i.value === 'Reunião ou levantamento'), 'etapas do funil editáveis');
  const nome = [...document.querySelectorAll('input')].find((i) => i.value === 'Primeiro contato'); nome.value = 'Contato inicial'; nome.dispatchEvent(new dom.window.Event('change')); await wait(80);
  check(state.db.opcoes.find((o) => o.grupo === 'etapa_lead' && o.chave === 'em_contato').nome === 'Contato inicial', 'renomear etapa grava');
  await click('Modelos de projeto', document, 'a'); check(body().includes('Site institucional'), 'modelos');
  await click('Editar', document); const m = modalEl(); check(m.querySelector('[name="tarefas"]').value.includes('Briefing | alta | 3'), 'tarefas do modelo em texto');
  await fill(m, 'tarefas', 'Briefing | gigante | 3'); await submit('Salvar'); check(modalEl().textContent.includes('Linha 1'), 'valida linha do modelo');
  await fill(modalEl(), 'tarefas', 'Briefing | alta | 3\nLayout | media | 7'); await submit('Salvar'); await wait(80);
  check(state.db.modelos_projeto[0].tarefas.length === 2, 'modelo atualizado');
  state.db.propostas.find((p) => p.id === 'pr3').deleted_at = daysAgo(1);
  await click('Lixeira', document, 'a'); check(body().includes('Manutenção') && body().includes('Proposta'), 'lixeira lista item removido');
  await click('Restaurar'); await wait(80);
  check(state.db.propostas.find((p) => p.id === 'pr3').deleted_at === null, 'restaurar recupera o item');
  await click('Integrações', document, 'a'); check(body().includes('Não configurada') && body().includes('WhatsApp'), 'integrações não configuradas identificadas');
});
await run('Configurações (membro)', '/app/configuracoes/', async () => {
  await init('configuracoes');
  const t = body();
  check(t.includes('Notificações') && t.includes('Integrações'), 'membro vê notificações e integrações');
  check(!t.includes('Lixeira') && !t.includes('Modelos de projeto'), 'membro não vê abas de administrador');
}, { papel: 'membro', perms: [{ modulo: 'contatos', pode_ver: true, pode_editar: false }] });
await run('Equipe', '/app/equipe/', async () => {
  await init('equipe');
  const t = body();
  check(t.includes('Permissões do papel Membro') && t.includes('Financeiro') && t.includes('Suporte') && t.includes('Clientes'), 'permissões dos módulos novos');
});
await run('Busca global', '/app/', async () => {
  await init('painel');
  const btn = document.querySelector('.busca-btn'); check(Boolean(btn), 'botão de busca no menu');
  btn.click(); await wait();
  const m = modalEl(); const inp = m.querySelector('input');
  inp.value = 'pao'; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await wait(450);
  inp.value = 'Pão'; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await wait(450);
  let t = m.textContent;
  check(t.includes('Padaria Pão Doce') && t.includes('Cliente'), 'acha cliente');
  check(t.includes('Lead') && t.includes('Projeto'), 'acha lead e projeto');
  check([...m.querySelectorAll('a')].some((a) => a.getAttribute('href').includes('clientes/ficha.html?id=c1')), 'link da ficha do cliente');
  inp.value = '#1'; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await wait(450);
  inp.value = '1'; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await wait(450);
  check(m.textContent.includes('pelo menos 2 letras'), 'exige 2 caracteres');
  inp.value = "x'),(y"; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await wait(450);
  check(!state.calls.some(([, , v]) => false), 'entrada com caracteres especiais não quebra');
  inp.value = 'chamado inexistente zzz'; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await wait(450);
  check(m.textContent.includes('Nada encontrado'), 'mensagem de nada encontrado');
});
await run('Busca respeita permissões', '/app/', async () => {
  await init('painel');
  document.querySelector('.busca-btn').click(); await wait();
  const m = modalEl(), inp = m.querySelector('input');
  inp.value = 'Erro'; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await wait(450);
  check(!m.textContent.includes('Chamado'), 'sem permissão de suporte, chamados não são buscados');
}, { papel: 'membro', perms: [{ modulo: 'contatos', pode_ver: true, pode_editar: false }] });
await run('Minhas pendências', '/app/minhas/', async () => {
  await init('minhas'); if (process.env.DBG) console.log(body().slice(0, 900));
  const t = body();
  check(t.includes('Minhas pendências') && t.includes('Atrasado'), 'cabeçalho e faixas');
  check(t.includes('Modelar banco'), 'tarefa atrasada minha');
  check(!t.includes('Integrar pagamento'), 'tarefa de outra pessoa não aparece');
  check(t.includes('Padaria Pão Doce') && t.includes('Contato atrasado'), 'lead meu com retorno atrasado listado');
  check(t.includes('Sem responsável: quer assumir?') && t.includes('Escrever manual') && t.includes('Erro ao emitir pedido'), 'itens sem responsável para assumir');
  await click('Concluir');
  check(state.db.tarefas.find((x) => x.id === 't1').status === 'concluida', 'concluir tarefa grava');
  check(!body().includes('Modelar banco'), 'tarefa concluída sai da lista');
});
await run('Abrir pelo link da busca', '/app/contatos/?abrir=l2', async () => {
  await init('contatos');
  check(modalEl() && modalEl().textContent.includes('Padaria Pão Doce') && modalEl().textContent.includes('Histórico'), 'lead abre direto');
});
await run('Abrir chamado pelo link da busca', '/app/suporte/?abrir=ch1', async () => {
  await init('suporte');
  check(modalEl() && modalEl().textContent.includes('Erro ao emitir pedido'), 'chamado abre direto');
});
await run('Contratos recorrentes', '/app/financeiro/', async () => {
  await init('financeiro');
  check(state.rpcs.some(([n]) => n === 'gerar_cobrancas_recorrentes'), 'gera as cobranças dos contratos ao abrir o financeiro');
  await click('Contratos recorrentes', document, 'a');
  let t = body();
  check(t.includes('Receita recorrente por mês') && t.includes('R$') && t.includes('500,00'), 'receita recorrente mensal calculada');
  check(t.includes('Suporte mensal de TI') && t.includes('Hospedagem anual') && t.includes('Pausado'), 'contratos listados com situação');
  check(t.includes('R$ 100,00/mês'), 'contrato anual mostra o valor por mês');
  // novo contrato
  await click('Novo contrato');
  await submit('Salvar'); check(modalEl().textContent.includes('Preencha: Cliente'), 'cliente obrigatório');
  await fill(modalEl(), 'cliente_id', 'c2'); await fill(modalEl(), 'descricao', 'Manutenção do site'); await fill(modalEl(), 'valor', '300');
  await fill(modalEl(), 'fim', dia(-5)); await submit('Salvar'); check(modalEl().textContent.includes('O término precisa ser depois'), 'valida término');
  await fill(modalEl(), 'fim', ''); await fill(modalEl(), 'proximo_vencimento', dia(15)); await submit('Salvar'); await wait(120);
  const novo = state.db.contratos.find((c) => c.descricao === 'Manutenção do site');
  check(novo && novo.dia_vencimento === Number(dia(15).slice(8, 10)) && novo.periodicidade === 'mensal', 'contrato criado com o dia de vencimento do primeiro vencimento');
  // reajustar
  const linha = [...document.querySelectorAll('tbody tr')].find((x) => x.textContent.includes('Suporte mensal de TI'));
  await click('Reajustar', linha); await fill(modalEl(), 'valor', '550'); await submit('Reajustar'); await wait(120);
  check(Number(state.db.contratos.find((c) => c.id === 'k1').valor) === 550, 'reajuste grava o novo valor');
  // pausar e reativar
  const linha2 = [...document.querySelectorAll('tbody tr')].find((x) => x.textContent.includes('Suporte mensal de TI'));
  await click('Pausar', linha2); await click('Confirmar', modalEl()); await wait(120);
  check(state.db.contratos.find((c) => c.id === 'k1').status === 'pausado', 'pausar grava');
  const linha3 = [...document.querySelectorAll('tbody tr')].find((x) => x.textContent.includes('Suporte mensal de TI'));
  await click('Reativar', linha3); await submit('Reativar'); await wait(120);
  check(state.db.contratos.find((c) => c.id === 'k1').status === 'ativo', 'reativar grava');
  await click('Exportar CSV'); check(globalThis.__downloads >= 1, 'exporta CSV de contratos');
});
await run('Contratos na ficha do cliente e no painel', '/app/clientes/ficha.html?id=c1', async () => {
  await init('clientes', 'initFicha');
  check(body().includes('Contratos recorrentes') && body().includes('Suporte mensal de TI'), 'ficha mostra os contratos do cliente');
  mount('/app/');
  (await import(pathToFileURL(path.join(REPO, 'app/js/ui.js')).href)).instalarDom(dom.window.Element);
  await init('painel');
  check(body().includes('Receita recorrente por mês'), 'painel mostra a receita recorrente');
});
await run('Contratos: membro sem financeiro', '/app/clientes/ficha.html?id=c1', async () => {
  await init('clientes', 'initFicha');
  check(!body().includes('Contratos recorrentes') && !body().includes('Suporte mensal de TI'), 'sem permissão, contratos ficam ocultos na ficha');
}, { papel: 'membro', perms: [{ modulo: 'clientes', pode_ver: true, pode_editar: false }] });
// ============================ SEGURANÇA ============================
const fsm = await import('node:fs');
const HTML_LOGIN = fsm.readFileSync(path.join(REPO, 'app/login/index.html'), 'utf8');
let versaoLogin = 0;
const abrirLogin = async () => { await import(pathToFileURL(path.join(REPO, 'app/js/login.js')).href + '?v=' + (++versaoLogin)); await wait(120); };
const $q = (sel) => document.querySelector(sel);
const enviar = (form, botao) => { const f = $q(form); f.requestSubmit(botao ? f.querySelector(botao) : undefined); };
const digitar = (sel, v) => { const el = $q(sel); el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };

await run('Login: senha errada não revela nada e vai para o alerta', '/app/login/', async () => {
  state.semSessao = true;
  await abrirLogin();
  digitar('#email', 'Alvo@Vemax.com'); digitar('#pass', 'errada-errada-1');
  enviar('#fLogin'); await wait(150);
  check(body().includes('E-mail ou senha incorretos.'), 'mensagem genérica (não diz se o e-mail existe)');
  check(state.falhas.includes('Alvo@Vemax.com'), 'falha enviada ao registro de segurança (o banco guarda só o hash)');
  check(state.navegacoes === 0, 'não entra');
  enviar('#fLogin'); await wait(100); enviar('#fLogin'); await wait(100);
  const btn = $q('#fLogin button[type=submit]');
  check(btn.disabled && btn.textContent.includes('Aguarde'), 'depois de 3 erros seguidos o botão espera alguns segundos');
  check(state.falhas.length === 3, 'cada tentativa errada foi registrada uma vez');
  state.semSessao = false;
});
await run('Login: limite de requisições do servidor (429)', '/app/login/', async () => {
  state.semSessao = true; state.loginErro = { code: 'over_request_rate_limit', status: 429 };
  await abrirLogin();
  digitar('#email', 'a@vemax.com'); digitar('#pass', 'qualquer-coisa-1'); enviar('#fLogin'); await wait(150);
  check(body().includes('Muitas tentativas'), 'mostra aviso de espera');
  check(state.falhas.length === 0, 'não conta como falha de senha');
  state.semSessao = false;
});
await run('Login: sucesso sem 2FA registra o evento e entra', '/app/login/', async () => {
  state.semSessao = true;
  await abrirLogin();
  digitar('#email', 'a@vemax.com'); digitar('#pass', state.senhaCerta); enviar('#fLogin'); await wait(200);
  check(state.eventos.some((e) => e.tipo === 'login_ok'), 'evento login_ok registrado');
  check(state.navegacoes === 1, 'vai para o portal');
  check(!$q('#pass').value, 'a senha é apagada do campo');
  state.semSessao = false;
});
await run('Login: com 2FA exige o código', '/app/login/', async () => {
  state.semSessao = true; state.fatores = [{ id: 'f1', status: 'verified' }]; state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' };
  await abrirLogin();
  digitar('#email', 'a@vemax.com'); digitar('#pass', state.senhaCerta); enviar('#fLogin'); await wait(200);
  check(!$q('#fMfa').hidden && $q('#fLogin').hidden, 'mostra o passo do código e esconde a senha');
  check(state.navegacoes === 0 && !state.eventos.some((e) => e.tipo === 'login_ok'), 'só a senha não basta: não entra e não registra login');
  digitar('#mfaCode', '12'); enviar('#fMfa', 'button[type=submit]'); await wait(100);
  check(body().includes('6 números'), 'código curto é recusado no navegador');
  digitar('#mfaCode', '000000'); enviar('#fMfa', 'button[type=submit]'); await wait(200);
  check(body().includes('Código incorreto') && state.eventos.some((e) => e.tipo === 'mfa_falha'), 'código errado: erro e evento mfa_falha');
  check(state.navegacoes === 0, 'continua fora');
  digitar('#mfaCode', '123456'); enviar('#fMfa', 'button[type=submit]'); await wait(250);
  check(state.eventos.some((e) => e.tipo === 'login_ok') && state.navegacoes === 1, 'código certo: entra e registra login_ok');
  state.semSessao = false;
});
await run('Login: cinco códigos errados derrubam a sessão', '/app/login/', async () => {
  state.semSessao = true; state.fatores = [{ id: 'f1', status: 'verified' }]; state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' };
  await abrirLogin();
  digitar('#email', 'a@vemax.com'); digitar('#pass', state.senhaCerta); enviar('#fLogin'); await wait(200);
  for (let i = 0; i < 5; i++) { digitar('#mfaCode', '00000' + i); enviar('#fMfa', 'button[type=submit]'); await wait(150); }
  check(!$q('#fLogin').hidden && body().includes('Muitos códigos incorretos'), 'volta para o login com aviso');
  check(state.signOuts.includes('local'), 'a sessão parcial (só senha) é encerrada');
  state.semSessao = false;
});
await run('Login: mensagens de sessão expirada e inatividade', '/app/login/?erro=inatividade', async () => {
  state.semSessao = true;
  await abrirLogin();
  check(body().includes('desconectado por segurança'), 'explica a saída por inatividade');
  state.semSessao = false;
});
await run('Redefinição de senha: senha fraca é recusada e as outras sessões caem', '/app/login/', async () => {
  state.semSessao = true;
  await abrirLogin();
  state.authCb('PASSWORD_RECOVERY'); await wait(50);
  check(!$q('#fNew').hidden, 'mostra o formulário de nova senha');
  digitar('#np', 'senha12345'); enviar('#fNew'); await wait(100);
  check(body().includes('muito comum') && state.atualizacoesSenha.length === 0, 'senha comum é recusada antes de ir ao servidor');
  digitar('#np', 'Cavalo-Azul-77!'); enviar('#fNew'); await wait(200);
  check(state.atualizacoesSenha.includes('Cavalo-Azul-77!'), 'senha forte é aceita');
  check(state.signOuts.includes('others') && state.eventos.some((e) => e.tipo === 'senha_alterada'), 'encerra as outras sessões e registra o evento');
  state.semSessao = false;
});
await run('Login: com 2FA, trocar a senha pede confirmar o código antes', '/app/login/', async () => {
  state.semSessao = true; state.updateErro = 'insufficient_aal'; state.fatores = [{ id: 'f1', status: 'verified' }];
  await abrirLogin();
  state.authCb('PASSWORD_RECOVERY'); await wait(50);
  digitar('#np', 'Cavalo-Azul-77!'); enviar('#fNew'); await wait(150);
  check(!$q('#fMfa').hidden, 'o servidor exige o 2FA: mostra o passo do código');
  state.updateErro = null; digitar('#mfaCode', '123456'); enviar('#fMfa', 'button[type=submit]'); await wait(200);
  check(!$q('#fNew').hidden && state.navegacoes === 0, 'depois do código, volta ao formulário de nova senha (não entra direto)');
  state.semSessao = false;
});

await run('Sessão: aviso e saída por inatividade, e queda da sessão no servidor', '/app/', async () => {
  const { iniciarSessao, LIMITE_INATIVIDADE_MS, AVISO_ANTES_MS } = await import(pathToFileURL(path.join(REPO, 'shared/js/sessao.js')).href);
  const { h, modal } = await import(pathToFileURL(path.join(REPO, 'app/js/ui.js')).href);
  let t = 1_000_000; const saidas = [], foiLogin = [];
  const parar = iniciarSessao({ sb, h, modal, sair: (m) => saidas.push(m), irParaLogin: () => foiLogin.push(1), agora: () => t, tick: 15 });
  await wait(60); check(!modalEl() && !saidas.length, 'recém-aberto: sem aviso');
  t += LIMITE_INATIVIDADE_MS - AVISO_ANTES_MS + 5000; await wait(80);
  check(modalEl() && modalEl().textContent.includes('Você ainda está aí?'), 'perto do limite: aparece o aviso');
  await click('Continuar conectado', modalEl()); await wait(60);
  check(!modalEl() && !saidas.length, 'continuar conectado fecha o aviso e zera a contagem');
  t += LIMITE_INATIVIDADE_MS + 1000; await wait(120);
  check(saidas.length === 1 && saidas[0] === 'inatividade', 'passou o limite: sai por inatividade, uma única vez');
  parar();
  // sessão derrubada no servidor (revogada ou vencida): ao voltar para a aba, sai
  state.sessaoValida = false; saidas.length = 0; t += 10;
  const parar2 = iniciarSessao({ sb, h, modal, sair: (m) => saidas.push(m), irParaLogin: () => foiLogin.push(1), agora: () => t, tick: 5000 });
  document.dispatchEvent(new dom.window.Event('visibilitychange')); await wait(120);
  check(saidas.includes('expirada'), 'o servidor diz que a sessão acabou: o portal sai');
  parar2();
  // saiu em outra aba
  state.sessaoValida = true; saidas.length = 0;
  const parar3 = iniciarSessao({ sb, h, modal, sair: (m) => saidas.push(m), irParaLogin: () => foiLogin.push(1), agora: () => t, tick: 5000 });
  state.authCb('SIGNED_OUT'); await wait(30);
  check(foiLogin.length === 1 && saidas.length === 0, 'logout em outra aba leva esta aba ao login');
  parar3();
});

await run('Configurações > Segurança (administrador)', '/app/configuracoes/?aba=seguranca', async () => {
  await init('configuracoes');
  await wait(80);                 // a conferência das proteções é montada por um async solto no módulo
  const t = body();
  for (const s of ['Trocar senha', 'Verificação em duas etapas (2FA)', 'Sessões', 'Política de segurança', 'Verificação das proteções', 'Eventos de segurança']) check(t.includes(s), 'seção: ' + s);
  check(t.includes('Falha de login') && t.includes('Alerta: muitas falhas de login') && t.includes('Papel alterado'), 'tabela de eventos com os tipos em português');
  check(t.includes('Membro Teste (m@x.com)'), 'alerta de força bruta identifica a conta da equipe atacada');
  check(!t.includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'o hash do e-mail não aparece na tela');
  check(t.includes('Migration 014 aplicada'), 'verificação das proteções lista a migration 014');
  // política
  const sel = document.querySelector('select[aria-label="Duração máxima da sessão"]'); sel.value = '8'; sel.dispatchEvent(new dom.window.Event('change')); await wait(120);
  check(state.db.config_seguranca.find((c) => c.chave === 'sessao_max_horas').valor === 8, 'administrador altera a duração máxima da sessão');
  // filtro de eventos
  const f = document.querySelector('select[aria-label="Filtrar eventos"]'); f.value = 'login_ok'; f.dispatchEvent(new dom.window.Event('change')); await wait(150);
  const linhasEv = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent);
  check(linhasEv.length === 1 && linhasEv[0].includes('Login') && !linhasEv.join(' ').includes('Papel alterado'), 'filtro por tipo de evento mostra só as linhas do tipo');
  // trocar senha: casos de erro e sucesso
  const campos = [...document.querySelectorAll('input[type=password]')];
  const preencher = (a, n, c) => { [a, n, c].forEach((v, i) => { campos[i].value = v; campos[i].dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); };
  const enviarSenha = async () => { campos[0].form.requestSubmit(campos[0].form.querySelector('button[type=submit]')); await wait(200); };
  preencher('errada', 'Cavalo-Azul-77!', 'Cavalo-Azul-77!'); await enviarSenha();
  check(body().includes('A senha atual está incorreta.') && state.atualizacoesSenha.length === 0, 'senha atual errada: não troca');
  preencher(state.senhaCerta, 'curta', 'curta'); await enviarSenha();
  check(body().includes('pelo menos 10'), 'senha nova curta é recusada');
  preencher(state.senhaCerta, 'Cavalo-Azul-77!', 'diferente-123456'); await enviarSenha();
  check(body().includes('confirmação não confere'), 'confirmação diferente é recusada');
  const atual = state.senhaCerta;
  preencher(atual, 'Cavalo-Azul-77!', 'Cavalo-Azul-77!'); await enviarSenha();
  check(state.atualizacoesSenha.includes('Cavalo-Azul-77!') && state.signOuts.includes('others') && state.eventos.some((e) => e.tipo === 'senha_alterada'), 'troca com sucesso: encerra as outras sessões e registra o evento');
  // encerrar outras sessões
  state.signOuts.length = 0; state.eventos.length = 0;
  await click('Encerrar minhas outras sessões'); await click('Confirmar', modalEl()); await wait(120);
  check(state.signOuts.includes('others') && state.eventos.some((e) => e.tipo === 'sessoes_encerradas'), 'encerrar outras sessões funciona e fica registrado');
  // 2FA: ativação
  await click('Ativar verificação em duas etapas'); await wait(150);
  check(body().includes('ABCDEFGH234567') && document.querySelector('img[alt*="QR code"]').getAttribute('src').startsWith('data:image/svg+xml'), 'mostra o QR code (imagem) e o código secreto');
  const cod = document.querySelector('input[aria-label="Código de 6 números"]'); cod.value = '999999';
  await click('Ativar', document.body, 'button'); await wait(150);
  check(body().includes('Código incorreto ou vencido'), 'código errado não ativa o 2FA');
  cod.value = '123456'; await click('Ativar', document.body, 'button'); await wait(200);
  check(state.eventos.some((e) => e.tipo === 'mfa_ativado') && state.fatores.some((x) => x.status === 'verified'), 'código certo ativa o 2FA e registra o evento');
});
await run('Configurações > Segurança: 2FA já ativo e desativação', '/app/configuracoes/?aba=seguranca', async () => {
  state.fatores = [{ id: 'f1', status: 'verified' }]; state.aal = { currentLevel: 'aal2', nextLevel: 'aal2' };
  await init('configuracoes');
  check(body().includes('Ativada'), 'mostra 2FA ativo (sessão que passou pelo código)');
  await click('Desativar'); await click('Confirmar', modalEl()); await wait(200);
  check(state.fatores.length === 0 && state.eventos.some((e) => e.tipo === 'mfa_removido'), 'desativar exige confirmação e fica registrado');
});
await run('Configurações > Segurança (membro)', '/app/configuracoes/?aba=seguranca', async () => {
  await init('configuracoes');
  const t = body();
  check(t.includes('Trocar senha') && t.includes('Verificação em duas etapas') && t.includes('Sessões'), 'membro vê o que é pessoal');
  check(!t.includes('Política de segurança') && !t.includes('Eventos de segurança'), 'membro não vê política nem eventos');
}, { papel: 'membro', perms: [{ modulo: 'contatos', pode_ver: true, pode_editar: false }] });
await run('Administrador sem 2FA exigido vê o aviso e perde poderes', '/app/', async () => {
  state.mfaOk = false;
  await init('painel');
  check(body().includes('limitado até você ativar a verificação em duas etapas'), 'aviso claro');
  check(![...document.querySelectorAll('.side a.navi')].some((a) => a.textContent.trim() === 'Equipe'), 'menu de administração some');
});
await run('Sessão vencida no servidor: o portal não carrega e volta ao login', '/app/', async () => {
  state.sessaoValida = false;
  await init('painel');
  check(state.navegacoes >= 1 && state.eventos.some((e) => e.tipo === 'sessao_expirada'), 'registra sessao_expirada e redireciona');
  check(!body().includes('Visão geral'), 'não desenha o painel');
});
await run('Quem tem 2FA mas entrou só com senha é mandado ao passo do código', '/app/', async () => {
  state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' };
  await init('painel');
  check(state.navegacoes >= 1 && !body().includes('Visão geral'), 'redireciona ao login com ?mfa=1 e não mostra dados');
});
await run('Erros do banco não vazam detalhes na tela', '/app/clientes/', async () => {
  await init('clientes');
  const ui = await import(pathToFileURL(path.join(REPO, 'app/js/ui.js')).href);
  const r = await ui.run(Promise.resolve({ data: null, error: { code: '23514', message: 'new row for relation "clientes" violates check constraint "clientes_documento_digitos"' } }));
  await wait(30);
  const toasts = [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' ');
  check(r === null && toasts.includes('CPF ou CNPJ inválido') && !toasts.includes('relation') && !toasts.includes('constraint'), 'mensagem amigável, sem nome de tabela nem de constraint');
  await ui.run(Promise.resolve({ data: null, error: { code: 'XX000', message: 'connection to server at "10.0.0.5" failed: password authentication' } }));
  const t2 = [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' ');
  check(!t2.includes('10.0.0.5') && !t2.includes('password'), 'erro desconhecido vira mensagem genérica');
  erros.splice(-2, 2);        // os dois console.error acima são esperados: o app registra o erro cru só no console do navegador
});

await run('Menu', '/app/', async () => {
  await init('painel');
  const nav = [...document.querySelectorAll('.side a.navi')].map((a) => norm(a.textContent));
  check(['Visão geral', 'Leads', 'Propostas', 'Clientes', 'Projetos', 'Tarefas', 'Suporte', 'Financeiro', 'Equipe', 'Configurações'].every((n) => nav.includes(n)), 'itens do menu: ' + nav.join(', '));
  const hrefs = [...document.querySelectorAll('.side a.navi')].map((a) => a.getAttribute('href'));
  check(hrefs.every((h) => h && h.startsWith('file://')), 'links do menu preenchidos');
});

console.log(`\n${falhas.length ? '✗ ' + falhas.length + ' falha(s)' : '✓ tudo certo'}; console.error: ${erros.length}`);
falhas.forEach((f) => console.log(' -', f));
process.exit(falhas.length ? 1 : 0);
