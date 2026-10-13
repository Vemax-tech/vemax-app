import { sb, configured } from './supabase.js';
import { avaliarSenha, emailValido, esperaLogin } from './validacao.js';
import { evento } from './auth.js';

const $ = (s) => document.querySelector(s);
const HOME = new URL('../', import.meta.url).href;
const LOGIN = new URL('../login/', import.meta.url).href;
const show = (el, msg) => { el.textContent = msg; el.hidden = !msg; };
const err = $('#err');
const FORMS = ['#fLogin', '#fSignup', '#fMfa', '#fNew', '#done'];
const so = (qual) => { FORMS.forEach((f) => { $(f).hidden = f !== qual; }); };

const MENSAGENS = {
  inativo: 'Conta desativada. Fale com o administrador.',
  pendente: 'Seu cadastro ainda aguarda aprovação do administrador.',
  recusado: 'Seu cadastro não foi aprovado. Fale com o administrador.',
  expirada: 'Sua sessão expirou. Entre novamente.',
  inatividade: 'Você ficou um tempo sem usar o portal e foi desconectado por segurança. Entre novamente.',
};

if (!configured) {
  show(err, 'Configuração pendente: preencha app/js/config.js (veja o README).');
  $('#fLogin button[type=submit]').disabled = true;
} else {
  show(err, MENSAGENS[new URLSearchParams(location.search).get('erro')] || '');

  // ---- espera depois de erros seguidos (só desestímulo na tela; o bloqueio real é do Supabase Auth) ----
  const ler = (k) => { try { return Number(sessionStorage.getItem(k)) || 0; } catch { return 0; } };
  const gravar = (k, v) => { try { sessionStorage.setItem(k, String(v)); } catch { /* sem storage */ } };
  const botao = $('#fLogin button[type=submit]');
  let timerEspera;
  const esperar = () => {
    clearInterval(timerEspera);
    const tick = () => {
      const falta = Math.ceil((ler('vx_bloqueio') - Date.now()) / 1000);
      if (falta > 0) { botao.disabled = true; botao.textContent = `Aguarde ${falta} s`; }
      else { botao.disabled = false; botao.textContent = 'Entrar'; clearInterval(timerEspera); }
    };
    tick(); timerEspera = setInterval(tick, 500);
  };
  esperar();

  // ---- depois da senha: 2FA (se a pessoa tiver) ou entrada ----
  const precisaMfa = async () => {
    try { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return Boolean(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'); } catch { return false; }
  };
  const entrar = async (registrar) => { if (registrar) await evento('login_ok'); gravar('vx_falhas', 0); location.replace(HOME); };
  const verificarNivel = async (registrar) => { if (await precisaMfa()) { so('#fMfa'); $('#sub').textContent = 'Verificação em duas etapas.'; $('#mfaCode').focus(); } else await entrar(registrar); };

  // Fluxo de redefinição de senha (link recebido por e-mail)
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { so('#fNew'); $('#sub').textContent = 'Defina uma nova senha.'; }
  });
  sb.auth.getSession().then(({ data }) => { if (data.session && !location.hash.includes('type=recovery')) verificarNivel(false); });

  $('#fLogin').addEventListener('submit', async (e) => {
    e.preventDefault(); show(err, '');
    if (ler('vx_bloqueio') > Date.now()) return;
    const email = $('#email').value.trim(), password = $('#pass').value;
    if (!email || !password) return show(err, 'Informe e-mail e senha.');
    botao.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.status === 429 || error.code === 'over_request_rate_limit') { show(err, 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.'); botao.disabled = false; return; }
      sb.rpc('registrar_login_falho', { p_email: email }).then(() => {}, () => {});      // alimenta o alerta de força bruta (só guarda hash)
      const n = ler('vx_falhas') + 1; gravar('vx_falhas', n);
      const espera = esperaLogin(n); if (espera) gravar('vx_bloqueio', Date.now() + espera * 1000);
      show(err, error.code === 'email_not_confirmed' ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.' : 'E-mail ou senha incorretos.');   // mensagem genérica de propósito
      esperar(); return;
    }
    $('#pass').value = '';
    await verificarNivel(true);
  });

  // ---- segundo fator ----
  let falhasMfa = 0, voltarParaSenha = false;
  $('#fMfa').addEventListener('submit', async (e) => {
    e.preventDefault(); const errM = $('#errMfa'); show(errM, '');
    const code = $('#mfaCode').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return show(errM, 'Digite os 6 números do aplicativo.');
    const btn = e.submitter; btn.disabled = true;
    try {
      const { data: f } = await sb.auth.mfa.listFactors();
      const fator = f?.totp?.[0];
      if (!fator) throw new Error('sem fator');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fator.id, code });
      if (error) throw error;
      if (voltarParaSenha) { voltarParaSenha = false; so('#fNew'); $('#sub').textContent = 'Defina uma nova senha.'; return; }
      await entrar(true);
    } catch {
      btn.disabled = false; $('#mfaCode').value = ''; falhasMfa++;
      await evento('mfa_falha');
      if (falhasMfa >= 5) { await sb.auth.signOut({ scope: 'local' }); so('#fLogin'); $('#sub').textContent = 'Acesso restrito a membros autorizados.'; show(err, 'Muitos códigos incorretos. Entre novamente.'); falhasMfa = 0; return; }
      show(errM, 'Código incorreto ou vencido. Confira o horário do celular e tente o código novo.');
    }
  });
  $('#mfaCancel').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); so('#fLogin'); $('#sub').textContent = 'Acesso restrito a membros autorizados.'; });

  $('#forgot').addEventListener('click', async () => {
    const email = $('#email').value.trim();
    if (!email) return show(err, 'Digite seu e-mail acima para receber o link.');
    try { await sb.auth.resetPasswordForEmail(email, { redirectTo: LOGIN }); } catch { /* resposta igual de propósito */ }
    show(err, ''); $('#sub').textContent = 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';
  });

  // Mostrar/ocultar senha
  document.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
    const inp = document.getElementById(b.dataset.eye), on = inp.type === 'password';
    inp.type = on ? 'text' : 'password'; b.textContent = on ? 'Ocultar' : 'Mostrar';
    b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Ocultar senha' : 'Mostrar senha');
  }));

  // Força da senha (orientação; a regra mínima é a de avaliarSenha, a mesma usada no envio)
  const strength = (p) => {
    let s = 0;
    if (p.length >= 10) s++;
    if (p.length >= 14) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 4);
  };
  $('#sp').addEventListener('input', (e) => {
    const v = e.target.value, s = strength(v), bar = $('#spBar'), av = avaliarSenha(v, $('#se').value);
    bar.style.width = (v ? Math.max(s, 1) * 25 : 0) + '%'; bar.dataset.s = s;
    $('#spHint').textContent = !v ? 'Use 10+ caracteres, misturando letras, números e símbolos.' : !av.ok ? av.motivos[0] : s >= 3 ? 'Senha forte.' : s === 2 ? 'Senha boa.' : 'Senha razoável.';
  });

  // Cadastro de funcionário: entra como "pendente" até o admin aprovar (trigger no banco).
  const swap = (signup) => {
    so(signup ? '#fSignup' : '#fLogin');
    $('#sub').textContent = signup ? 'Preencha seus dados. O acesso só é liberado após aprovação do administrador.' : 'Acesso restrito a membros autorizados.';
  };
  $('#toSignup').addEventListener('click', () => swap(true));
  $('#toLogin').addEventListener('click', () => swap(false));
  $('#fSignup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err3 = $('#err3'); show(err3, '');
    const nome = $('#sn').value.trim(), cargo = $('#sc').value.trim(), email = $('#se').value.trim(), password = $('#sp').value;
    if (!nome || !email) return show(err3, 'Informe nome e e-mail.');
    if (!emailValido(email)) return show(err3, 'Informe um e-mail válido.');
    const av = avaliarSenha(password, email);
    if (!av.ok) return show(err3, av.motivos[0]);
    if (password !== $('#sp2').value) return show(err3, 'As senhas não coincidem.');
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.signUp({ email, password, options: { data: { nome, cargo }, emailRedirectTo: LOGIN } });
    btn.disabled = false;
    if (error) {
      console.warn('signUp:', error.code || error.status);   // diagnóstico no console (sem dados pessoais); a tela segue neutra
      if (error.code === 'signup_disabled') return show(err3, 'Cadastros estão desativados no momento. Fale com o administrador.');
      if (error.code === 'over_email_send_rate_limit' || error.status === 429) return show(err3, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      return show(err3, 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
    }
    await sb.auth.signOut({ scope: 'local' });
    $('#fSignup').reset(); $('#spBar').style.width = '0';
    so('#done');
    $('#sub').textContent = 'Obrigado! Falta só a aprovação do administrador.';
  });
  $('#doneBack').addEventListener('click', () => swap(false));

  $('#fNew').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#np').value, av = avaliarSenha(pw);
    if (!av.ok) return show($('#err2'), av.motivos[0]);
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error && error.code === 'insufficient_aal') { voltarParaSenha = true; so('#fMfa'); $('#sub').textContent = 'Confirme sua identidade para trocar a senha.'; $('#mfaCode').focus(); return; }   // quem tem 2FA precisa confirmá-lo antes
    if (error) return show($('#err2'), 'Não foi possível salvar a senha. Tente novamente.');
    await sb.auth.signOut({ scope: 'others' });          // quem tinha a senha antiga em outro lugar perde a sessão
    await evento('senha_alterada', 'redefinição por e-mail');
    location.replace(HOME);
  });
}
