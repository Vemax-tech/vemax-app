import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from '../shared/js/validacao.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

test('validação do formulário do site (assets/js/valida.js) dá o mesmo resultado que shared/js/validacao.js', () => {
  const ctx = { window: {} };
  vm.runInNewContext(ler('assets/js/valida.js'), ctx);
  const amostras = ['ana@exemplo.com', 'a.b+c@sub.dominio.com.br', 'a@b', 'a@b.c', '', '   ', '(11) 99999-8888', '+55 11 3333-4444', '11999998888', '12345', 'abc',
    'Maria whatsapp 11 9999', '<script>alert(1)</script>', 'a b@c.com', 'x'.repeat(300) + '@a.com', "'; drop table x; --", '1'.repeat(16), '11 3333.4444'];
  for (const a of amostras) assert.equal(ctx.window.VEMAX_VALIDA.contatoValido(a), V.contatoValido(a), `divergiu em: ${JSON.stringify(a)}`);
});

test('o formulário do site usa a validação e limita os tamanhos', () => {
  const html = ler('index.html'), js = ler('assets/js/script.js');
  assert.match(html, /assets\/js\/valida\.js/, 'index.html carrega valida.js');
  assert.match(js, /window\.VEMAX_VALIDA[\s\S]*contatoValido\(/, 'script.js valida o contato');
  assert.match(html, /id="cName"[^>]*maxlength="120"/);
  assert.match(html, /id="cContact"[^>]*maxlength="160"/);
  assert.match(html, /<textarea id="cMsg"[^>]*maxlength="2000"/);
});

test('cabeçalhos de segurança: CSP sem script inline e páginas com token sem Referer nem cache', () => {
  const h = ler('_headers');
  const csp = /Content-Security-Policy:\s*(.+)/.exec(h)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net(;|$)/);
  assert.doesNotMatch(csp.split(';').find((d) => d.trim().startsWith('script-src')), /unsafe-/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  for (const p of ['/proposta.html', '/acompanhar.html', '/avaliar.html']) {
    const bloco = h.split(/\n(?=\S)/).find((b) => b.startsWith(p));
    assert.ok(bloco && /Referrer-Policy: no-referrer/.test(bloco) && /Cache-Control: no-store/.test(bloco), `${p} sem no-referrer/no-store`);
  }
});

test('Edge Functions comparam o segredo em tempo constante e não confiam em campos sem tratar', () => {
  for (const f of ['notificar-email', 'notificar-contato']) {
    const src = ler(`supabase/functions/${f}/index.ts`);
    assert.match(src, /timingSafeEqual|iguaisSeguro/, `${f}: comparação de segredo em tempo constante`);
    assert.doesNotMatch(src, /get\('x-webhook-secret'\)\s*[!=]==/, `${f}: nada de comparação direta com !== ou ===`);
    assert.doesNotMatch(src, /NOTIFY_TO'\)!/, `${f}: sem non-null assertion em variável de ambiente`);
  }
});
