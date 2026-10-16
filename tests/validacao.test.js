import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../shared/js/validacao.js';

const bytes = (...v) => new Uint8Array(v);
const pdf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0);
const exe = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);          // "MZ": executável do Windows (tem bytes nulos)
const texto = new TextEncoder().encode('nome;valor\nAção;10\n');

test('e-mail: formato e tamanho', () => {
  for (const ok of ['ana@exemplo.com', 'a.b+c@sub.dominio.com.br']) assert.ok(V.emailValido(ok), ok);
  for (const ruim of ['', 'sem-arroba', 'a@b', 'a@b.c', 'a b@c.com', 'a@@c.com', 'a@c.com ' + 'x'.repeat(300)]) assert.ok(!V.emailValido(ruim), ruim);
  assert.ok(V.emailOk(''), 'vazio é permitido em campo opcional');
});

test('telefone: máscara aceita, lixo rejeitado', () => {
  for (const ok of ['(11) 99999-8888', '+55 11 3333-4444', '11999998888', '11 3333.4444']) assert.ok(V.telefoneValido(ok), ok);
  for (const ruim of ['', '12345', 'abc', '11 9999 abcd', '1'.repeat(30), '(11) 99999-8888; drop table']) assert.ok(!V.telefoneValido(ruim), ruim);
});

test('contato do formulário público: e-mail ou telefone', () => {
  assert.ok(V.contatoValido('ana@exemplo.com') && V.contatoValido('(11) 99999-8888'));
  assert.ok(!V.contatoValido('Maria whatsapp 11 9999') && !V.contatoValido('   ') && !V.contatoValido('<script>alert(1)</script>'));
});

test('CPF e CNPJ conferem os dígitos verificadores', () => {
  assert.ok(V.cpfValido('529.982.247-25') && V.cpfValido('52998224725'));
  assert.ok(!V.cpfValido('529.982.247-24') && !V.cpfValido('111.111.111-11') && !V.cpfValido('1234'));
  assert.ok(V.cnpjValido('11.222.333/0001-81'));
  assert.ok(!V.cnpjValido('11.222.333/0001-82') && !V.cnpjValido('00000000000000') && !V.cnpjValido('123'));
  assert.ok(V.documentoOk('') && V.documentoOk('52998224725') && V.documentoOk('11222333000181') && !V.documentoOk('12345678901'));
});

test('senha: tamanho, comuns, repetidas, sequências e e-mail', () => {
  assert.ok(V.avaliarSenha('Cavalo-Azul-77!').ok);
  assert.match(V.avaliarSenha('curta').motivos.join(' '), /pelo menos 10/);
  assert.match(V.avaliarSenha('senha12345').motivos.join(' '), /comum/);
  assert.match(V.avaliarSenha('1234567890').motivos.join(' '), /comum|sequência/);
  assert.match(V.avaliarSenha('aaaaaaaaaaaa').motivos.join(' '), /repetido/);
  assert.match(V.avaliarSenha('marcos.oliveira-2026', 'marcos.oliveira@gmail.com').motivos.join(' '), /e-mail/);
  assert.ok(!V.avaliarSenha('x'.repeat(200)).ok);
});

test('busca: caracteres de filtro são neutralizados e curingas do LIKE são escapados', () => {
  assert.equal(V.limparBusca("maria),nome.eq.x,(y%"), 'maria nome.eq.x y');
  assert.equal(V.limparBusca('  João   D\'Ávila  '), 'João D Ávila');
  assert.equal(V.escaparLike('50%_off\\'), '50\\%\\_off\\\\');
});

test('arquivo: assinatura real, extensão e nome', () => {
  assert.equal(V.tipoPorAssinatura(pdf), 'pdf');
  assert.equal(V.tipoPorAssinatura(png), 'png');
  assert.equal(V.tipoPorAssinatura(zip), 'zip');
  assert.equal(V.tipoPorAssinatura(texto), 'texto');
  assert.equal(V.tipoPorAssinatura(exe), null);
  const ok = V.validarArquivo({ name: 'Proposta Final.PDF', size: 2000 }, pdf);
  assert.ok(ok.ok && ok.ext === 'pdf');
  assert.ok(V.validarArquivo({ name: 'planilha.xlsx', size: 10 }, zip).ok);
  assert.ok(V.validarArquivo({ name: 'dados.csv', size: 10 }, texto).ok);
  const falso = V.validarArquivo({ name: 'foto.png', size: 10 }, exe);
  assert.ok(!falso.ok && /conteúdo/.test(falso.erro), 'executável renomeado para .png é barrado pelo conteúdo');
  assert.ok(!V.validarArquivo({ name: 'relatorio.pdf.exe', size: 10 }, exe).ok, 'extensão dupla perigosa');
  assert.ok(!V.validarArquivo({ name: 'pagina.html', size: 10 }, texto).ok, 'HTML não é aceito');
  assert.ok(!V.validarArquivo({ name: 'imagem.svg', size: 10 }, texto).ok, 'SVG não é aceito (pode conter script)');
  assert.ok(!V.validarArquivo({ name: 'semextensao', size: 10 }, pdf).ok);
  assert.ok(!V.validarArquivo({ name: '../../etc/passwd.pdf', size: 10 }, pdf).ok, 'caminho no nome');
  assert.ok(!V.validarArquivo({ name: 'vazio.pdf', size: 0 }, pdf).ok);
  assert.ok(!V.validarArquivo({ name: 'grande.pdf', size: 60 * 1048576 }, pdf).ok, 'acima do limite');
  assert.ok(!V.validarArquivo({ name: 'x.docx', size: 10 }, pdf).ok, 'docx precisa ser ZIP');
  assert.ok(!V.validarArquivo({ name: 'foto.png', size: 10 }, png, { permitidas: ['pdf'] }).ok, 'respeita a lista de extensões da tela');
});
