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
  const erro = new URLSearchParams(location.search).get('erro');
  if (erro === 'inativo') show(err, 'Conta desativada. Fale com o administrador.');
  if (erro === 'pendente') show(err, 'Seu cadastro ainda aguarda aprovação do administrador.');
  if (erro === 'recusado') show(err, 'Seu cadastro não foi aprovado. Fale com o administrador.');

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

  // Cadastro de funcionário: entra como "pendente" até o admin aprovar (trigger no banco).
  const swap = (signup) => {
    $('#fLogin').hidden = signup; $('#fSignup').hidden = !signup;
    $('#sub').textContent = signup ? 'Preencha seus dados. O acesso só é liberado após aprovação do administrador.' : 'Acesso restrito a membros autorizados.';
  };
  $('#toSignup').addEventListener('click', () => swap(true));
  $('#toLogin').addEventListener('click', () => swap(false));
  $('#fSignup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err3 = $('#err3'); show(err3, '');
    const nome = $('#sn').value.trim(), cargo = $('#sc').value.trim(), email = $('#se').value.trim(), password = $('#sp').value;
    if (!nome || !email) return show(err3, 'Informe nome e e-mail.');
    if (password.length < 10) return show(err3, 'Use pelo menos 10 caracteres na senha.');
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.signUp({ email, password, options: { data: { nome, cargo }, emailRedirectTo: LOGIN } });
    btn.disabled = false;
    if (error) return show(err3, 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
    await sb.auth.signOut();
    $('#fSignup').reset(); swap(false);
    $('#sub').textContent = 'Cadastro enviado! Confirme seu e-mail (se receber a mensagem) e aguarde a aprovação do administrador.';
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
