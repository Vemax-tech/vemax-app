import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoInatividade, LIMITE_INATIVIDADE_MS, AVISO_ANTES_MS } from '../app/js/sessao.js';
import { esperaLogin, mensagemErro } from '../app/js/validacao.js';

test('inatividade: ativo, aviso e expirou nos pontos certos', () => {
  const t0 = 1_000_000;
  assert.equal(estadoInatividade(t0, t0).estado, 'ativo');
  assert.equal(estadoInatividade(t0 + 10 * 60000, t0).estado, 'ativo');
  assert.equal(estadoInatividade(t0 + LIMITE_INATIVIDADE_MS - AVISO_ANTES_MS, t0).estado, 'aviso');
  assert.equal(estadoInatividade(t0 + LIMITE_INATIVIDADE_MS - 1000, t0).estado, 'aviso');
  assert.equal(estadoInatividade(t0 + LIMITE_INATIVIDADE_MS, t0).estado, 'expirou');
  assert.equal(estadoInatividade(t0 + 5 * LIMITE_INATIVIDADE_MS, t0).estado, 'expirou');
  assert.equal(estadoInatividade(t0 - 5000, t0).estado, 'ativo', 'relógio andando para trás não derruba a sessão');
  assert.equal(estadoInatividade(t0 + 1000, t0, { limiteMs: 2000, avisoMs: 1500 }).estado, 'aviso', 'aceita limites diferentes');
});

test('login: espera progressiva depois de erros seguidos, com teto de 5 minutos', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(esperaLogin), [0, 0, 0, 5, 10, 20, 40, 80, 160, 300, 300]);
});

test('erros do banco viram mensagens seguras, sem detalhes internos', () => {
  const cru = 'new row for relation "clientes" violates check constraint "clientes_documento_digitos" (host 10.0.0.5)';
  for (const e of [{ code: '23514', message: cru }, { code: '23505', message: cru }, { code: '42501', message: cru }, { code: '23503', message: cru }, { code: 'XX000', message: cru }, { code: '22001', message: cru }]) {
    const m = mensagemErro(e);
    assert.ok(!/relation|constraint|10\.0\.0\.5|clientes_/.test(m), `vazou: ${m}`);
  }
  assert.equal(mensagemErro({ code: '23514', message: 'violates ... documento ...' }), 'CPF ou CNPJ inválido.');
  assert.match(mensagemErro({ code: '23514', message: '... email ...' }), /E-mail/);
  assert.equal(mensagemErro({ code: '42501', message: 'x' }), 'Sem permissão para esta ação.');
  assert.match(mensagemErro({ message: 'Failed to fetch' }), /Sem conexão/);
  assert.match(mensagemErro({ code: 'PGRST301' }), /sessão expirou/);
  assert.equal(mensagemErro({ code: 'P0001', message: 'Informe um e-mail ou telefone válido para retorno.' }), 'Informe um e-mail ou telefone válido para retorno.', 'mensagens que nós escrevemos nas funções passam');
  assert.match(mensagemErro({ code: 'P0001', message: 'x'.repeat(500) }), /Tente de novo/, 'mensagem enorme de função não passa');
  assert.match(mensagemErro(null), /Tente de novo/);
});
