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

  // Mostrar/ocultar senha
  document.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
    const inp = document.getElementById(b.dataset.eye), on = inp.type === 'password';
    inp.type = on ? 'text' : 'password'; b.textContent = on ? 'Ocultar' : 'Mostrar';
    b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Ocultar senha' : 'Mostrar senha');
  }));

  // Força da senha (só orientação; a regra real é o mínimo de 10 caracteres)
  const strength = (p) => {
    let s = 0;
    if (p.length >= 10) s++;
    if (p.length >= 14) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 4);
  };
  $('#sp').addEventListener('input', (e) => {
    const v = e.target.value, s = strength(v), bar = $('#spBar');
    bar.style.width = (v ? Math.max(s, 1) * 25 : 0) + '%'; bar.dataset.s = s;
    $('#spHint').textContent = !v ? 'Use 10+ caracteres, misturando letras, números e símbolos.'
      : v.length < 10 ? `Faltam ${10 - v.length} caractere(s).` : s >= 3 ? 'Senha forte.' : s === 2 ? 'Senha boa.' : 'Senha razoável.';
  });

  // Cadastro de funcionário: entra como "pendente" até o admin aprovar (trigger no banco).
  const swap = (signup) => {
    $('#fLogin').hidden = signup; $('#fSignup').hidden = !signup; $('#done').hidden = true;
    $('#sub').textContent = signup ? 'Preencha seus dados. O acesso só é liberado após aprovação do administrador.' : 'Acesso restrito a membros autorizados.';
  };
  $('#toSignup').addEventListener('click', () => swap(true));
  $('#toLogin').addEventListener('click', () => swap(false));
  $('#fSignup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err3 = $('#err3'); show(err3, '');
    const nome = $('#sn').value.trim(), cargo = $('#sc').value.trim(), email = $('#se').value.trim(), password = $('#sp').value;
    if (!nome || !email) return show(err3, 'Informe nome e e-mail.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show(err3, 'Informe um e-mail válido.');
    if (password.length < 10) return show(err3, 'Use pelo menos 10 caracteres na senha.');
    if (password !== $('#sp2').value) return show(err3, 'As senhas não coincidem.');
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.signUp({ email, password, options: { data: { nome, cargo }, emailRedirectTo: LOGIN } });
    btn.disabled = false;
    if (error) return show(err3, 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
    await sb.auth.signOut();
    $('#fSignup').reset(); $('#spBar').style.width = '0';
    $('#fSignup').hidden = true; $('#done').hidden = false;
    $('#sub').textContent = 'Obrigado! Falta só a aprovação do administrador.';
  });
  $('#doneBack').addEventListener('click', () => swap(false));

  $('#fNew').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#np').value;
    if (pw.length < 10) return show($('#err2'), 'Use pelo menos 10 caracteres.');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return show($('#err2'), 'Não foi possível salvar a senha. Tente novamente.');
    location.replace(HOME);
  });
}
