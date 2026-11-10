import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/app/js/lib.js';

test('addDias e addMeses respeitam fim de mês e virada de ano', () => {
  assert.equal(L.addDias('2026-02-27', 3), '2026-03-02');
  assert.equal(L.addDias('2026-01-01', -1), '2025-12-31');
  assert.equal(L.addMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(L.addMeses('2028-01-31', 1), '2028-02-29');
  assert.equal(L.addMeses('2026-11-15', 3), '2027-02-15');
});

test('diffDias conta dias corridos', () => {
  assert.equal(L.diffDias('2026-03-10', '2026-03-01'), 9);
  assert.equal(L.diffDias('2026-03-01', '2026-03-10'), -9);
});

test('periodo devolve intervalos corretos', () => {
  assert.deepEqual(L.periodo('mes', '2026-02-10'), { de: '2026-02-01', ate: '2026-02-28' });
  assert.deepEqual(L.periodo('mes_anterior', '2026-01-10'), { de: '2025-12-01', ate: '2025-12-31' });
  assert.deepEqual(L.periodo('30d', '2026-03-30'), { de: '2026-03-01', ate: '2026-03-30' });
  assert.deepEqual(L.periodo('todos'), {});
  assert.ok(L.dentro('2026-02-10T12:00:00Z', { de: '2026-02-01', ate: '2026-02-28' }));
  assert.ok(L.dentro('2026-02-10', { de: '2026-02-10', ate: '2026-02-10' }));
  assert.ok(!L.dentro('2026-03-01', { de: '2026-02-01', ate: '2026-02-28' }));
  const local = new Date(2026, 1, 28, 22, 0).toISOString();     // 28/fev às 22h no fuso de quem executa o teste
  assert.ok(L.dentro(local, { de: '2026-02-01', ate: '2026-02-28' }));
  assert.ok(!L.dentro(null, {}));
});

test('parcelar fecha o total em centavos', () => {
  const p = L.parcelar(1000, 3, '2026-01-31');
  assert.deepEqual(p.map((x) => x.valor), [333.33, 333.33, 333.34]);
  assert.equal(L.soma(p, 'valor'), 1000);
  assert.deepEqual(p.map((x) => x.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(L.parcelar(0, 3, '2026-01-01'), []);
  assert.deepEqual(L.parcelar(100, 0, '2026-01-01'), []);
  assert.equal(L.parcelar(0.1 + 0.2, 1, '2026-01-01')[0].valor, 0.3);
});

test('statusCobranca calcula atraso pela data', () => {
  const hoje = '2026-05-10';
  assert.equal(L.statusCobranca({ status: 'pendente', vencimento: '2026-05-09' }, hoje), 'atrasada');
  assert.equal(L.statusCobranca({ status: 'pendente', vencimento: '2026-05-10' }, hoje), 'pendente');
  assert.equal(L.statusCobranca({ status: 'prevista', vencimento: '2026-05-01' }, hoje), 'atrasada');
  assert.equal(L.statusCobranca({ status: 'atrasada', vencimento: '2026-06-01' }, hoje), 'pendente');
  assert.equal(L.statusCobranca({ status: 'paga', vencimento: '2026-01-01' }, hoje), 'paga');
  assert.equal(L.statusCobranca({ status: 'cancelada', vencimento: '2026-01-01' }, hoje), 'cancelada');
});

test('statusProposta marca vencida só quando enviada e fora da validade', () => {
  assert.equal(L.statusProposta({ status: 'enviada', validade: '2026-05-09' }, '2026-05-10'), 'vencida');
  assert.equal(L.statusProposta({ status: 'enviada', validade: '2026-05-10' }, '2026-05-10'), 'enviada');
  assert.equal(L.statusProposta({ status: 'aceita', validade: '2020-01-01' }, '2026-05-10'), 'aceita');
  assert.equal(L.statusProposta({ status: 'rascunho', validade: null }, '2026-05-10'), 'rascunho');
});

test('alertasLead destaca falta de responsável, próxima ação e parada', () => {
  const hoje = '2026-05-10', now = new Date('2026-05-10T12:00:00Z').getTime();
  const base = { status: 'em_contato', responsavel_id: 'u1', proximo_contato: '2026-05-12', etapa_desde: '2026-05-08T00:00:00Z' };
  assert.deepEqual(L.alertasLead(base, hoje, now), []);
  assert.deepEqual(L.alertasLead({ ...base, responsavel_id: null }, hoje, now), ['sem_responsavel']);
  assert.deepEqual(L.alertasLead({ ...base, proximo_contato: null }, hoje, now), ['sem_proxima_acao']);
  assert.deepEqual(L.alertasLead({ ...base, proximo_contato: '2026-05-01' }, hoje, now), ['contato_atrasado']);
  assert.deepEqual(L.alertasLead({ ...base, etapa_desde: '2026-04-01T00:00:00Z' }, hoje, now), ['parado']);
  assert.ok(L.alertasLead({ ...base, status: 'novo', primeiro_contato_em: null }, hoje, now).includes('sem_primeiro_contato'));
  assert.deepEqual(L.alertasLead({ ...base, status: 'concluido', responsavel_id: null }, hoje, now), []);
});

test('chamadoAtrasado ignora chamados encerrados', () => {
  assert.ok(L.chamadoAtrasado({ status: 'novo', prazo: '2026-05-01' }, '2026-05-10'));
  assert.ok(!L.chamadoAtrasado({ status: 'resolvido', prazo: '2026-05-01' }, '2026-05-10'));
  assert.ok(!L.chamadoAtrasado({ status: 'novo', prazo: null }, '2026-05-10'));
});

test('consumo aponta horas acima da estimativa e custo alto', () => {
  const c = L.consumo({ esforco_horas: 10, valor_contratado: 1000 }, [{ horas_gastas: 6 }, { horas_gastas: 5 }], [{ valor: 800 }]);
  assert.equal(c.horas, 11); assert.ok(c.horasAcima); assert.ok(c.custoAlto); assert.equal(c.margem, 200);
  const ok = L.consumo({ esforco_horas: 10, valor_contratado: 1000 }, [{ horas_gastas: 5 }], [{ valor: 100 }]);
  assert.ok(!ok.horasAcima && !ok.custoAlto);
  const semDados = L.consumo({}, [], []);
  assert.ok(!semDados.horasAcima && !semDados.custoAlto && semDados.margem === null);
});

test('normNome ignora acento, caixa e sufixo societário', () => {
  assert.equal(L.normNome('Padaria Pão Doce Ltda.'), L.normNome('padaria pao doce'));
  assert.equal(L.normNome('  ACME   S.A. '), 'acme');
});

test('possiveisDuplicados acha por nome, documento ou e-mail', () => {
  const cs = [{ id: 1, nome: 'Padaria Pão Doce', documento: '12345678000199', email: 'a@x.com' }, { id: 2, nome: 'Outra', documento: '', email: '' }];
  assert.equal(L.possiveisDuplicados({ nome: 'padaria pao doce ltda' }, cs).length, 1);
  assert.equal(L.possiveisDuplicados({ nome: 'x', documento: '12.345.678/0001-99' }, cs)[0].id, 1);
  assert.equal(L.possiveisDuplicados({ nome: 'y', email: 'A@X.com' }, cs)[0].id, 1);
  assert.equal(L.possiveisDuplicados({ nome: 'y', email: 'z@z.com' }, cs, [{ cliente_id: 2, email: 'z@z.com' }])[0].id, 2);
  assert.equal(L.possiveisDuplicados({ id: 1, nome: 'Padaria Pão Doce' }, cs).length, 0);
});

test('validações de e-mail e URL', () => {
  assert.ok(L.emailValido('a@b.co')); assert.ok(!L.emailValido('a@b')); assert.ok(!L.emailValido(''));
  assert.ok(L.urlValida('https://github.com/x')); assert.ok(!L.urlValida('javascript:alert(1)')); assert.ok(!L.urlValida('github.com'));
});

test('csvCell escapa aspas e neutraliza fórmulas', () => {
  assert.equal(L.csvCell('a;b'), '"a;b"');
  assert.equal(L.csvCell('diz "oi"'), '"diz ""oi"""');
  assert.equal(L.csvCell('=SOMA(A1)'), "'=SOMA(A1)");
  assert.equal(L.csvCell(-5), '-5');
  assert.equal(L.csvCell(null), '');
});

test('prazoDeTexto entende dias, semanas e meses', () => {
  assert.equal(L.prazoDeTexto('6 semanas', '2026-01-01'), '2026-02-12');
  assert.equal(L.prazoDeTexto('Cerca de 30 dias úteis', '2026-01-01'), '2026-01-31');
  assert.equal(L.prazoDeTexto('2 meses', '2026-01-31'), '2026-03-31');
  assert.equal(L.prazoDeTexto('a combinar', '2026-01-01'), null);
  assert.equal(L.prazoDeTexto('', '2026-01-01'), null);
});

test('lerLinhasModelo entende tarefas e entregas e aponta a linha com erro', () => {
  const t = L.lerLinhasModelo('Briefing | alta | 3\n\nLayout | média | 8\nPublicar', 'tarefa');
  assert.deepEqual(t.itens, [{ titulo: 'Briefing', prioridade: 'alta', dias: 3 }, { titulo: 'Layout', prioridade: 'media', dias: 8 }, { titulo: 'Publicar', prioridade: 'media', dias: 0 }]);
  assert.match(L.lerLinhasModelo('Ok\nX | grave | 2', 'tarefa').erro, /Linha 2.*prioridade/);
  assert.match(L.lerLinhasModelo('A | -1', 'entrega').erro, /Linha 1/);
  assert.match(L.lerLinhasModelo(' | alta', 'tarefa').erro, /título/);
  assert.deepEqual(L.lerLinhasModelo('Entrega final | 30', 'entrega').itens, [{ titulo: 'Entrega final', dias: 30 }]);
});

test('formatarLinhasModelo é o inverso de lerLinhasModelo', () => {
  const itens = [{ titulo: 'A', prioridade: 'urgente', dias: 2 }, { titulo: 'B', prioridade: 'media', dias: 0 }];
  assert.deepEqual(L.lerLinhasModelo(L.formatarLinhasModelo(itens, 'tarefa'), 'tarefa').itens, itens);
});

test('slug gera chaves seguras', () => {
  assert.equal(L.slug('Redes sociais!'), 'redes_sociais');
  assert.equal(L.slug('  Indicação do João  '), 'indicacao_do_joao');
  assert.equal(L.slug('???'), '');
});

test('valorMensal e receitaMensal consideram a periodicidade e só contratos ativos', () => {
  assert.equal(L.valorMensal({ valor: 300, periodicidade: 'mensal' }), 300);
  assert.equal(L.valorMensal({ valor: 900, periodicidade: 'trimestral' }), 300);
  assert.equal(L.valorMensal({ valor: 1200, periodicidade: 'anual' }), 100);
  assert.equal(L.valorMensal({ valor: 100, periodicidade: 'trimestral' }), 33.33);
  const cs = [{ valor: 500, periodicidade: 'mensal', status: 'ativo' }, { valor: 1200, periodicidade: 'anual', status: 'ativo' }, { valor: 999, periodicidade: 'mensal', status: 'pausado' }, { valor: 999, periodicidade: 'mensal', status: 'encerrado' }];
  assert.equal(L.receitaMensal(cs), 600);
  assert.equal(L.receitaMensal([]), 0);
});
