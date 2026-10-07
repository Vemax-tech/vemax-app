import { sb, configured } from './supabase.js';

const $ = (s) => document.querySelector(s);
const HOME = new URL('../', import.meta.url).href;
const LOGIN = new URL('../login/', import.meta.url).href;
const show = (el, msg) => { el.textContent = msg; el.hidden = !msg; };
const err = $('#err');

if (!configured) {
  show(err, 'Configuração pendente: preencha app/js/config.js (veja o README).');
  $('#fLogin button[type=submit]').disabled = true;
} else {
  if (new URLSearchParams(location.search).get('erro') === 'inativo') show(err, 'Conta desativada. Fale com o administrador.');

  // Fluxo de redefinição de senha (link recebido por e-mail)
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { $('#fLogin').hidden = true; $('#fNew').hidden = false; $('#sub').textContent = 'Defina uma nova senha.'; }
  });
  sb.auth.getSession().then(({ data }) => { if (data.session && !location.hash.includes('type=recovery')) location.replace(HOME); });

  $('#fLogin').addEventListener('submit', async (e) => {
    e.preventDefault(); show(err, '');
    const email = $('#email').value.trim(), password = $('#pass').value;
    if (!email || !password) return show(err, 'Informe e-mail e senha.');
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) return show(err, 'E-mail ou senha incorretos.');   // mensagem genérica de propósito
    location.replace(HOME);
  });

  $('#forgot').addEventListener('click', async () => {
    const email = $('#email').value.trim();
    if (!email) return show(err, 'Digite seu e-mail acima para receber o link.');
    await sb.auth.resetPasswordForEmail(email, { redirectTo: LOGIN });
    show(err, ''); $('#sub').textContent = 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';
  });

  $('#fNew').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#np').value;
    if (pw.length < 10) return show($('#err2'), 'Use pelo menos 10 caracteres.');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return show($('#err2'), 'Não foi possível salvar a senha. Tente novamente.');
    location.replace(HOME);
  });
}
