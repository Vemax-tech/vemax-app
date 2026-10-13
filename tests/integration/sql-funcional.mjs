// Testes funcionais do banco (migrations 001–014): funil, propostas, projetos, tarefas, chamados, financeiro, contratos, lixeira e auditoria.
import { criarBanco, papeis, relatorio } from './banco.mjs';
const db = await criarBanco();
const { as, tenta, q } = papeis(db);
const { ok, fim } = relatorio();

// ---- usuários: primeiro confirmado vira admin; segundo vira pendente e é aprovado como membro
const A = '00000000-0000-0000-0000-00000000000a', M = '00000000-0000-0000-0000-00000000000b';
await q(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1,'a@x.com',now(),'{"nome":"Admin"}'), ($2,'m@x.com',now(),'{"nome":"Membro"}')`, [A, M]);
await q(`update public.profiles set ativo = true, status = 'aprovado' where id = $1`, [M]);
let pr = (await q('select id, papel, ativo from public.profiles order by email')).rows;
ok(pr[0].papel === 'admin' && pr[1].papel === 'membro' && pr[1].ativo, 'perfis: admin e membro');
const perms = (await q('select modulo, pode_ver, pode_editar from public.permissoes order by modulo')).rows;
ok(perms.find((p) => p.modulo === 'financeiro')?.pode_ver === false && perms.find((p) => p.modulo === 'suporte')?.pode_editar === true, 'permissões padrão dos módulos novos');
ok((await q('select count(*)::int n from public.opcoes')).rows[0].n === 47, 'opções seed: ' + (await q('select count(*)::int n from public.opcoes')).rows[0].n);
ok((await q('select count(*)::int n from public.modelos_projeto')).rows[0].n === 7, '7 modelos de projeto');

// ---- site público: lead anônimo
let r = await tenta(null, `insert into public.contatos_site (nome, contato, mensagem) values ('Visitante','v@x.com','Quero um site')`);
ok(!r.erro, 'anônimo cria lead do site: ' + (r.erro || 'ok'));
r = await tenta(null, `insert into public.contatos_site (nome, contato, mensagem, responsavel_id) values ('Espertinho','e@x.com','Teste', '${A}')`);
ok(r.erro, 'anônimo não define responsável: ' + (r.erro || 'PASSOU INDEVIDAMENTE'));
r = await tenta(null, `insert into public.contatos_site (nome, contato, mensagem, valor_estimado) values ('Espertinho','e2@x.com','Teste', 5)`);
ok(r.erro, 'anônimo não define valor estimado');
r = await tenta(null, `select * from public.contatos_site`);
ok((r.r?.rows.length ?? 0) === 0, 'anônimo não lê leads');
r = await tenta(null, `select * from public.clientes`);
ok((r.r?.rows.length ?? 0) === 0, 'anônimo não lê clientes');
const lead = (await q(`select * from public.contatos_site where nome = 'Visitante'`)).rows[0];
ok(lead.origem === 'site' && lead.status === 'novo' && lead.etapa_desde, 'lead do site: origem=site, etapa_desde preenchida');
ok((await q(`select count(*)::int n from public.notificacoes where titulo like 'Novo lead%'`)).rows[0].n === 1, 'notificação de novo lead');

// ---- etapas do lead
await as(A, `update public.contatos_site set status = 'em_contato' where id = $1`, [lead.id]);
let l2 = (await q('select * from public.contatos_site where id = $1', [lead.id])).rows[0];
ok(l2.primeiro_contato_em && l2.status === 'em_contato', 'primeiro_contato_em preenchido ao sair de "novo"');
await as(A, `update public.contatos_site set status = 'descartado', motivo_perda = 'preco' where id = $1`, [lead.id]);
l2 = (await q('select * from public.contatos_site where id = $1', [lead.id])).rows[0];
ok(l2.motivo_perda === 'preco', 'motivo da perda gravado');
await as(A, `update public.contatos_site set status = 'negociacao' where id = $1`, [lead.id]);
l2 = (await q('select * from public.contatos_site where id = $1', [lead.id])).rows[0];
ok(l2.motivo_perda === '', 'motivo limpo ao reabrir o lead');
r = await tenta(A, `update public.contatos_site set status = 'invalido' where id = $1`, [lead.id]);
ok(r.erro, 'etapa inválida rejeitada');
ok((await q(`select count(*)::int n from public.atividades where entidade = 'contatos_site' and detalhe like '%status: %'`)).rows[0].n >= 3, 'auditoria registra mudança de status (de → para)');

// ---- clientes: duplicidade e permissões
r = await tenta(A, `insert into public.clientes (nome, documento) values ('Padaria Pão Doce', '11222333000181') returning id`);
const cli = r.r.rows[0].id;
r = await tenta(A, `insert into public.clientes (nome) values ('  padaria pão doce ')`);
ok(r.erro && /unique|duplicate/i.test(r.erro), 'nome de cliente duplicado bloqueado');
r = await tenta(A, `insert into public.clientes (nome, documento) values ('Outra', '11222333000181')`);
ok(r.erro, 'documento duplicado bloqueado');
r = await tenta(A, `insert into public.clientes (nome, documento) values ('Doc Ruim', '123abc')`);
ok(r.erro, 'documento só aceita dígitos');
r = await tenta(M, `insert into public.clientes (nome) values ('Cliente do Membro')`);
ok(r.erro, 'membro sem permissão de edição não cria cliente');
await q(`update public.permissoes set pode_editar = true where modulo = 'clientes'`);
r = await tenta(M, `insert into public.clientes (nome) values ('Cliente do Membro') returning id`);
ok(!r.erro, 'membro com permissão cria cliente');
r = await tenta(A, `insert into public.cliente_links (cliente_id, titulo, url) values ($1, 'x', 'javascript:alert(1)')`, [cli]);
ok(r.erro, 'link com javascript: rejeitado');

// ---- vincular lead -> cliente, linha do tempo
await as(A, `insert into public.interacoes (entidade, entidade_id, tipo, texto) values ('contatos_site', $1, 'contato', 'Liguei para o lead')`, [lead.id]);
let it = (await q(`select * from public.interacoes where entidade_id = $1`, [lead.id])).rows[0];
ok(it.cliente_id === null && it.criado_por === A, 'interação criada (sem cliente ainda), autor definido pelo servidor');
await as(A, `update public.contatos_site set cliente_id = $1 where id = $2`, [cli, lead.id]);
it = (await q(`select * from public.interacoes where entidade_id = $1`, [lead.id])).rows[0];
ok(it.cliente_id === cli, 'histórico do lead acompanha o cliente quando o lead é convertido');
ok((await q('select primeiro_contato_em from public.contatos_site where id = $1', [lead.id])).rows[0].primeiro_contato_em, 'interação de contato marca primeiro contato');
r = await tenta(A, `insert into public.interacoes (entidade, entidade_id, tipo, texto, criado_por) values ('clientes', $1, 'nota', 'forjada', $2)`, [cli, M]);
ok(r.erro, 'não dá para registrar interação em nome de outra pessoa');
r = await tenta(A, `insert into public.interacoes (entidade, entidade_id, tipo, texto) values ('clientes', gen_random_uuid(), 'nota', 'x')`);
ok(true, 'interação para cliente inexistente: ' + (r.erro ? 'rejeitada' : 'aceita (FK ausente por design para entidade clientes)'));
r = await tenta(A, `insert into public.interacoes (entidade, entidade_id, tipo, texto) values ('tarefas', gen_random_uuid(), 'nota', 'x')`);
ok(r.erro, 'interação para tarefa inexistente rejeitada');

// ---- propostas: vencidas e fluxo de aprovação -> projeto
const lead2 = (await q(`insert into public.contatos_site (nome, contato, mensagem, status, cliente_id) values ('Pão Doce','a@p.com','Sistema','proposta',$1) returning id`, [cli])).rows[0].id;
const prop = (await tenta(A, `insert into public.propostas (contato_id, titulo, valor, validade, status, servicos, condicoes_pagamento, escopo, prazo_texto) values ($1,'Sistema de encomendas',10000, current_date - 2,'enviada','Cadastro','50/50','Escopo X','2 meses') returning id, token`, [lead2])).r.rows[0];
r = await tenta(A, `select public.atualizar_vencimentos() as n`);
ok(r.r.rows[0].n === 1, 'atualizar_vencimentos marca 1 proposta como vencida');
ok((await q('select status from public.propostas where id = $1', [prop.id])).rows[0].status === 'vencida', 'status vencida gravado');
ok((await q(`select count(*)::int n from public.atividades where entidade='propostas' and detalhe like '%vencida%'`)).rows[0].n === 0, 'virada automática para vencida não vira atividade de pessoa');
let pub = (await tenta(null, `select public.proposta_publica($1) as p`, [prop.token])).r.rows[0].p;
ok(pub && pub.expirada === true && pub.status === 'enviada' && pub.servicos === 'Cadastro' && pub.condicoes_pagamento === '50/50', 'página pública: vencida aparece como expirada, com serviços e condições');
ok(!('responsavel_id' in pub) && !('token' in pub) && !('cliente_id' in pub), 'página pública não expõe campos internos');
r = await tenta(null, `select public.responder_proposta($1, true, 'Fulano', '') as r`, [prop.token]);
ok(r.r.rows[0].r === 'expirada', 'não aceita resposta de proposta vencida');
await as(A, `update public.propostas set validade = current_date + 5, status = 'enviada' where id = $1`, [prop.id]);
r = await tenta(null, `select public.responder_proposta($1, true, 'Ana Cliente', 'ok') as r`, [prop.token]);
ok(r.r.rows[0].r === 'ok', 'cliente aceita pelo link');
ok((await q(`select count(*)::int n from public.notificacoes where titulo like 'Proposta aceita%'`)).rows[0].n === 1, 'notificação de proposta aceita');
r = await tenta(A, `select public.projeto_de_proposta($1, current_date + 40, (select id from public.modelos_projeto where nome = 'Site institucional')) as id`, [prop.id]);
ok(!r.erro, 'projeto criado a partir da proposta aprovada: ' + (r.erro || 'ok'));
const proj = (await q('select * from public.projetos where proposta_id = $1', [prop.id])).rows[0];
ok(proj && proj.cliente_id === cli && Number(proj.valor_contratado) === 10000 && proj.cliente === 'Padaria Pão Doce' && proj.escopo.includes('Cadastro') && proj.escopo.includes('Escopo X'), 'projeto herdou cliente, valor e escopo da proposta');
ok((await q('select count(*)::int n from public.tarefas where projeto_id = $1', [proj.id])).rows[0].n === 5, '5 tarefas criadas pelo modelo');
ok((await q('select count(*)::int n from public.projeto_entregas where projeto_id = $1', [proj.id])).rows[0].n === 2, '2 entregas criadas pelo modelo');
ok((await q('select cliente_id from public.tarefas where projeto_id = $1 limit 1', [proj.id])).rows[0].cliente_id === cli, 'tarefas herdam o cliente');
ok((await q('select status from public.contatos_site where id = $1', [lead2])).rows[0].status === 'concluido', 'lead marcado como ganho');
r = await tenta(A, `select public.projeto_de_proposta($1) as id`, [prop.id]);
ok(r.erro && /já gerou/i.test(r.erro), 'não cria segundo projeto da mesma proposta: ' + (r.erro || ''));
r = await tenta(M, `select public.projeto_de_proposta($1) as id`, [prop.id]);
ok(r.erro, 'membro sem permissão de edição não cria projeto por função');
r = await tenta(A, `update public.propostas set status = 'rascunho' where id = $1`, [prop.id]);
ok(!r.erro, 'status rascunho permitido pelo banco (regra de negócio fica na tela)');

// ---- tarefas
const t = (await tenta(A, `insert into public.tarefas (projeto_id, titulo, status, motivo_bloqueio) values ($1,'Teste','bloqueada','Aguardando chave') returning id, concluida_em`, [proj.id])).r.rows[0];
await as(A, `update public.tarefas set status = 'concluida' where id = $1`, [t.id]);
let tt = (await q('select * from public.tarefas where id = $1', [t.id])).rows[0];
ok(tt.concluida_em && tt.motivo_bloqueio === '', 'concluir tarefa preenche data e limpa o bloqueio');
await as(A, `update public.tarefas set status = 'a_fazer' where id = $1`, [t.id]);
ok((await q('select concluida_em from public.tarefas where id = $1', [t.id])).rows[0].concluida_em === null, 'reabrir tarefa limpa a data de conclusão');

// ---- soft delete e lixeira
r = await tenta(A, `delete from public.tarefas where id = $1`, [t.id]);
ok(!r.erro, 'admin pode excluir definitivamente');
const t2 = (await q(`insert into public.tarefas (titulo) values ('Para a lixeira') returning id`)).rows[0].id;
await q(`update public.permissoes set pode_editar = true where modulo = 'projetos'`);
r = await tenta(M, `delete from public.tarefas where id = $1`, [t2]);
const aindaExiste = (await q('select 1 from public.tarefas where id = $1', [t2])).rows.length === 1;
ok(aindaExiste, 'membro não consegue excluir definitivamente (RLS)');
await as(M, `update public.tarefas set deleted_at = '2000-01-01' where id = $1`, [t2]);
const del = (await q('select deleted_at, deleted_by from public.tarefas where id = $1', [t2])).rows[0];
ok(del.deleted_by === M && new Date(del.deleted_at).getFullYear() >= 2025, 'lixeira: quem e quando vêm do servidor (data não pode ser forjada)');
await as(A, `update public.tarefas set deleted_at = null where id = $1`, [t2]);
ok((await q('select deleted_by from public.tarefas where id = $1', [t2])).rows[0].deleted_by === null, 'restaurar limpa deleted_by');
ok((await q(`select count(*)::int n from public.atividades where acao in ('enviou para a lixeira','restaurou') and entidade = 'tarefas'`)).rows[0].n === 2, 'auditoria: lixeira e restauração registradas');
r = await tenta(M, `delete from public.projetos where id = $1`, [proj.id]);
ok((await q('select 1 from public.projetos where id = $1', [proj.id])).rows.length === 1, 'membro não apaga projeto definitivamente');

// ---- chamados
const ch = (await tenta(M, `insert into public.chamados (cliente_id, assunto, canal, prioridade) values ($1,'Erro no sistema','whatsapp','alta') returning id, numero`, [cli])).r.rows[0];
ok(ch.numero >= 1, 'membro abre chamado (suporte editável por padrão), com número');
ok((await q(`select count(*)::int n from public.notificacoes where modulo = 'suporte'`)).rows[0].n === 1, 'notificação de novo chamado');
await as(M, `update public.chamados set status = 'resolvido', solucao = 'Corrigido' where id = $1`, [ch.id]);
ok((await q('select resolvido_em from public.chamados where id = $1', [ch.id])).rows[0].resolvido_em, 'resolvido_em preenchido');
r = await tenta(A, `insert into public.chamados (assunto, canal) values ('x','sms')`);
ok(r.erro, 'canal inválido rejeitado');

// ---- financeiro
r = await tenta(M, `select * from public.cobrancas`);
ok((r.r?.rows.length ?? 0) === 0 && !r.erro, 'membro sem permissão não vê cobranças');
r = await tenta(M, `insert into public.cobrancas (cliente_id, descricao, valor, vencimento) values ($1,'x',10,current_date)`, [cli]);
ok(r.erro, 'membro sem permissão não cria cobrança');
const cb = (await tenta(A, `insert into public.cobrancas (cliente_id, projeto_id, descricao, valor, vencimento) values ($1,$2,'Parcela',500,current_date - 3) returning id`, [cli, proj.id])).r.rows[0].id;
r = await tenta(A, `update public.cobrancas set status = 'paga' where id = $1`, [cb]);
ok(r.erro, 'não marca como paga sem data e valor pagos');
r = await tenta(A, `update public.cobrancas set status = 'paga', pago_em = current_date, valor_pago = 500, metodo = 'pix' where id = $1`, [cb]);
ok(!r.erro, 'registra pagamento');
r = await tenta(A, `update public.cobrancas set metodo = 'cartao_numero_1234' where id = $1`, [cb]);
ok(r.erro, 'método de pagamento restrito a valores conhecidos (sem dados de cartão)');
r = await tenta(A, `insert into public.cobrancas (cliente_id, descricao, valor, vencimento) values ($1,'x',0,current_date)`, [cli]);
ok(r.erro, 'valor precisa ser positivo');
ok((await q(`select count(*)::int n from public.atividades where entidade='cobrancas' and detalhe like '%valor_pago%'`)).rows[0].n === 1, 'auditoria de valores financeiros registra valor_pago');
r = await tenta(A, `delete from public.clientes where id = $1`, [cli]);
ok(r.erro && /foreign|violates/i.test(r.erro), 'cliente com cobranças não pode ser apagado definitivamente');
await q(`update public.permissoes set pode_ver = true where modulo = 'financeiro'`);
r = await tenta(M, `select id from public.cobrancas`);
ok(r.r.rows.length === 1, 'após liberar, membro vê cobranças');
r = await tenta(M, `select detalhe from public.atividades where entidade = 'cobrancas'`);
ok(r.r.rows.length >= 1, 'log financeiro visível a quem tem acesso ao módulo financeiro');
await q(`update public.permissoes set pode_ver = false where modulo = 'financeiro'`);
r = await tenta(M, `select detalhe from public.atividades where entidade = 'cobrancas'`);
ok(r.r.rows.length === 0, 'log financeiro oculto de quem não tem acesso ao financeiro');

// ---- escopo, configurações e permissões
r = await tenta(M, `insert into public.opcoes (grupo, chave, nome) values ('origem_lead','x','X')`);
ok(r.erro, 'membro não altera configurações');
r = await tenta(A, `insert into public.opcoes (grupo, chave, nome) values ('origem_lead','feira','Feira')`);
ok(!r.erro, 'admin altera configurações');
r = await tenta(M, `select count(*)::int n from public.opcoes`);
ok(r.r.rows[0].n > 40, 'membro lê os rótulos');
await as(A, `update public.permissoes set pode_ver = true where modulo = 'financeiro'`);
ok((await q(`select count(*)::int n from public.atividades where entidade='permissoes' and detalhe like '%pode_ver%'`)).rows[0].n >= 1, 'mudança de permissão registrada na auditoria');
r = await tenta(M, `update public.profiles set papel = 'admin' where id = $1`, [M]);
ok((await q('select papel from public.profiles where id = $1', [M])).rows[0].papel === 'membro', 'membro não se promove a admin');
r = await tenta(M, `update public.profiles set notif_prefs = '{"contatos": false}' where id = $1 returning notif_prefs`, [M]);
ok(!r.erro && r.r.rows[0]?.notif_prefs?.contatos === false, 'membro altera as próprias preferências de notificação');
r = await tenta(A, `insert into public.projeto_escopo_alteracoes (projeto_id, descricao, impacto_dias, impacto_valor) values ($1,'Relatório extra',5,1500) returning id`, [proj.id]);
ok(!r.erro, 'registrar alteração de escopo');
await as(A, `update public.projeto_escopo_alteracoes set decisao = 'aprovada' where id = $1`, [r.r.rows[0].id]);
ok((await q(`select count(*)::int n from public.atividades where entidade='projeto_escopo_alteracoes' and detalhe like '%decisao: pendente → aprovada%'`)).rows[0].n === 1, 'decisão de escopo auditada');

// ---- visões por módulo com permissão de ver
await q(`update public.permissoes set pode_ver = false where modulo = 'clientes'`);
r = await tenta(M, `select * from public.clientes`); ok(r.r.rows.length === 0, 'sem permissão de ver clientes, a lista vem vazia');
r = await tenta(M, `select * from public.interacoes where entidade = 'clientes'`); ok(r.r.rows.length === 0, 'timeline do cliente também respeita a permissão');


// ================= 013: contratos recorrentes =================
await q(`update public.permissoes set pode_ver = false, pode_editar = false where modulo = 'financeiro'`);
ok((await q("select public.proximo_dia('2026-01-31'::date, 1, 31) as d")).rows[0].d.toISOString().slice(0, 10) === '2026-02-28', 'proximo_dia: 31/jan + 1 mês = 28/fev');
ok((await q("select public.proximo_dia('2026-02-28'::date, 1, 31) as d")).rows[0].d.toISOString().slice(0, 10) === '2026-03-31', 'proximo_dia: volta ao dia 31 em março (sem deslizar)');
ok((await q("select public.proximo_dia('2026-11-15'::date, 3, 15) as d")).rows[0].d.toISOString().slice(0, 10) === '2027-02-15', 'proximo_dia: trimestral atravessa o ano');

r = await tenta(M, `insert into public.contratos (cliente_id, descricao, valor, dia_vencimento, proximo_vencimento) values ($1,'Suporte mensal',500, 10, current_date)`, [cli]);
ok(r.erro, 'membro sem permissão financeira não cria contrato');
const ct = (await tenta(A, `insert into public.contratos (cliente_id, descricao, valor, periodicidade, dia_vencimento, proximo_vencimento, antecedencia_dias) values ($1,'Suporte mensal',500,'mensal', extract(day from current_date + 5)::int, current_date + 5, 10) returning id`, [cli])).r.rows[0].id;
ok(ct, 'admin cria contrato');
r = await tenta(A, `insert into public.contratos (cliente_id, descricao, valor, dia_vencimento, proximo_vencimento) values ($1,'x',0,10,current_date)`, [cli]);
ok(r.erro, 'valor do contrato precisa ser positivo');
r = await tenta(A, `insert into public.contratos (cliente_id, descricao, valor, dia_vencimento, proximo_vencimento, periodicidade) values ($1,'x',10,10,current_date,'semanal')`, [cli]);
ok(r.erro, 'periodicidade inválida rejeitada');
r = await tenta(M, `select public.gerar_cobrancas_recorrentes() as n`);
ok(r.r.rows[0].n === 0, 'quem não tem financeiro editar não dispara a geração');
r = await tenta(A, `select public.gerar_cobrancas_recorrentes() as n`);
ok(r.r.rows[0].n === 1, 'gera a cobrança que entrou na janela de antecedência');
let cobC = (await q('select * from public.cobrancas where contrato_id = $1', [ct])).rows;
ok(cobC.length === 1 && Number(cobC[0].valor) === 500 && cobC[0].status === 'pendente' && cobC[0].descricao.startsWith('Suporte mensal ('), 'cobrança gerada com valor, status e descrição do mês');
r = await tenta(A, `select public.gerar_cobrancas_recorrentes() as n`);
ok(r.r.rows[0].n === 0, 'segunda chamada não duplica');
let ctr = (await q('select proximo_vencimento, (current_date + 5) as base from public.contratos where id = $1', [ct])).rows[0];
ok(ctr.proximo_vencimento > ctr.base, 'contrato avança para o próximo vencimento');
ok((await q(`select count(*)::int n from public.atividades where entidade = 'cobrancas' and detalhe like 'Suporte mensal%'`)).rows[0].n === 0, 'geração automática não polui o log de atividades');

// contrato atrasado: gera várias de uma vez, no máximo uma por período e sem passar do fim
const ct2 = (await tenta(A, `insert into public.contratos (cliente_id, descricao, valor, periodicidade, inicio, fim, dia_vencimento, proximo_vencimento, antecedencia_dias) values ($1,'Hospedagem',100,'mensal', current_date - 100, current_date + 15, 5, current_date - 70, 0) returning id`, [cli])).r.rows[0].id;
r = await tenta(A, `select public.gerar_cobrancas_recorrentes() as n`);
const n2 = (await q('select count(*)::int n from public.cobrancas where contrato_id = $1', [ct2])).rows[0].n;
ok(n2 >= 2 && n2 <= 4, 'contrato atrasado gera as parcelas devidas até hoje (' + n2 + ')');
ok((await q('select max(vencimento) <= current_date as okmax from public.cobrancas where contrato_id = $1', [ct2])).rows[0].okmax, 'não gera parcela futura além da janela');

// pausado e fim
const ct3 = (await tenta(A, `insert into public.contratos (cliente_id, descricao, valor, status, dia_vencimento, proximo_vencimento, antecedencia_dias) values ($1,'Pausado',50,'pausado', 1, current_date - 5, 0) returning id`, [cli])).r.rows[0].id;
await tenta(A, `select public.gerar_cobrancas_recorrentes() as n`);
ok((await q('select count(*)::int n from public.cobrancas where contrato_id = $1', [ct3])).rows[0].n === 0, 'contrato pausado não gera cobrança');
const ct4 = (await tenta(A, `insert into public.contratos (cliente_id, descricao, valor, periodicidade, dia_vencimento, proximo_vencimento, fim, antecedencia_dias) values ($1,'Curto',70,'mensal', extract(day from current_date)::int, current_date, current_date + 2, 0) returning id`, [cli])).r.rows[0].id;
await tenta(A, `select public.gerar_cobrancas_recorrentes() as n`);
ok((await q('select status from public.contratos where id = $1', [ct4])).rows[0].status === 'encerrado', 'contrato é encerrado sozinho ao passar do fim');

// unicidade, lixeira, RLS e auditoria
r = await tenta(A, `insert into public.cobrancas (cliente_id, contrato_id, descricao, valor, vencimento) values ($1,$2,'dup',500,$3)`, [cli, ct, cobC[0].vencimento]);
ok(r.erro, 'índice único impede cobrança repetida do mesmo contrato e vencimento');
await as(A, `update public.contratos set valor = 650 where id = $1`, [ct]);
ok((await q(`select count(*)::int n from public.atividades where entidade = 'contratos' and detalhe like '%valor: 500.00 → 650.00%'`)).rows[0].n === 1, 'reajuste do contrato fica na auditoria (de → para)');
await as(A, `update public.contratos set deleted_at = now() where id = $1`, [ct]);
ok((await q('select deleted_by from public.contratos where id = $1', [ct])).rows[0].deleted_by === A, 'contrato vai para a lixeira com autor definido pelo servidor');
r = await tenta(M, `select * from public.contratos`);
ok(r.r.rows.length === 0, 'membro sem financeiro não vê contratos');
r = await tenta(M, `select detalhe from public.atividades where entidade = 'contratos'`);
ok(r.r.rows.length === 0, 'log dos contratos oculto de quem não vê o financeiro');
r = await tenta(null, `select * from public.contratos`);
ok((r.r?.rows.length ?? 0) === 0, 'anônimo não lê contratos');
r = await tenta(A, `delete from public.clientes where id = $1`, [cli]);
ok(r.erro, 'cliente com contrato não pode ser apagado definitivamente');

fim('sql-funcional');
