// Configurações > Segurança: senha, verificação em duas etapas (2FA), sessões e, para administradores, política e eventos.
import { sb, clienteTemporario } from '../supabase.js';
import { badge, quiet } from '../core.js';
import { evento } from '../auth.js';
import { avaliarSenha } from '../validacao.js';
import { h, run, empty, confirmDlg, toast } from '../ui.js';

export const TIPOS_EVENTO = {
  login_ok: 'Login', login_falha: 'Falha de login', logout: 'Saída', sessao_expirada: 'Sessão expirada', inatividade: 'Saída por inatividade',
  mfa_ativado: '2FA ativado', mfa_removido: '2FA removido', mfa_falha: 'Código 2FA incorreto', senha_alterada: 'Senha alterada', sessoes_encerradas: 'Outras sessões encerradas',
  acesso_negado: 'Acesso negado', permissao_alterada: 'Permissão alterada', papel_alterado: 'Papel alterado', usuario_desativado: 'Usuário desativado',
  cadastro_solicitado: 'Cadastro solicitado', alerta_forca_bruta: 'Alerta: muitas falhas de login',
};
const ALERTAS = new Set(['alerta_forca_bruta', 'mfa_falha', 'acesso_negado', 'papel_alterado', 'usuario_desativado']);

const secao = (titulo, ...kids) => h('section', { class: 'card', style: 'margin-bottom:16px' }, h('h2', { style: 'margin-bottom:8px' }, titulo), ...kids);

export async function secSeguranca(ctx) {
  const admin = ctx.isAdmin;
  const out = [];

  // ---------------------------------------------------------------- senha
  const fSenha = h('form', { novalidate: true, autocomplete: 'off' });
  const atual = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 128, 'aria-label': 'Senha atual' });
  const nova = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 128, 'aria-label': 'Nova senha' });
  const conf = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 128, 'aria-label': 'Confirmar a nova senha' });
  const erroS = h('p', { class: 'err', role: 'alert', hidden: true });
  const dicaS = h('p', { class: 'small muted' }, 'Use 10 ou mais caracteres. Evite senhas comuns, sequências e o seu e-mail.');
  nova.addEventListener('input', () => { const a = avaliarSenha(nova.value, ctx.user.email); dicaS.textContent = !nova.value ? 'Use 10 ou mais caracteres. Evite senhas comuns, sequências e o seu e-mail.' : a.ok ? 'Senha aceita.' : a.motivos[0]; });
  const mostra = (m) => { erroS.textContent = m; erroS.hidden = !m; };
  fSenha.append(h('label', {}, 'Senha atual'), atual, h('label', {}, 'Nova senha'), nova, dicaS, h('label', {}, 'Confirmar nova senha'), conf, erroS, h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn primary', type: 'submit' }, 'Trocar senha')));
  fSenha.addEventListener('submit', async (e) => {
    e.preventDefault(); mostra('');
    const av = avaliarSenha(nova.value, ctx.user.email);
    if (!atual.value) return mostra('Informe a senha atual.');
    if (!av.ok) return mostra(av.motivos[0]);
    if (nova.value !== conf.value) return mostra('A confirmação não confere com a nova senha.');
    if (nova.value === atual.value) return mostra('A nova senha precisa ser diferente da atual.');
    const btn = e.submitter; btn.disabled = true;
    try {
      // confere a senha atual num cliente descartável, sem derrubar a sessão em uso (que pode estar com 2FA)
      const { error: erroAtual } = await clienteTemporario().auth.signInWithPassword({ email: ctx.user.email, password: atual.value });
      if (erroAtual) { await evento('acesso_negado', 'senha atual incorreta ao trocar senha'); return mostra('A senha atual está incorreta.'); }
      const { error } = await sb.auth.updateUser({ password: nova.value });
      if (error) return mostra(error.code === 'insufficient_aal' ? 'Confirme o código do 2FA (saia e entre de novo) e tente outra vez.' : error.code === 'same_password' ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível trocar a senha. Tente novamente.');
      await sb.auth.signOut({ scope: 'others' });                // quem tinha a senha antiga em outro lugar perde a sessão
      await evento('senha_alterada', 'troca em Configurações');
      fSenha.reset(); dicaS.textContent = ''; toast('Senha trocada. As outras sessões foram encerradas.');
    } finally { btn.disabled = false; }
  });
  out.push(secao('Trocar senha', fSenha));

  // ---------------------------------------------------------------- 2FA
  const caixa2fa = h('div', {});
  const pinta2fa = async () => {
    caixa2fa.replaceChildren(h('p', { class: 'small muted' }, 'Carregando…'));
    let fatores = [];
    try { const { data } = await sb.auth.mfa.listFactors(); fatores = data?.totp || []; } catch { /* sem suporte */ }
    const tem = fatores.length > 0, nivel2 = ctx.mfa?.aal === 'aal2';
    if (tem) {
      caixa2fa.replaceChildren(
        h('p', {}, badge('Ativada', 'ok'), ' ', 'Para entrar, além da senha, é preciso o código do aplicativo autenticador.'),
        admin && h('p', { class: 'small muted' }, 'Como administrador, sem esta verificação você age apenas como membro.'),
        h('button', { class: 'btn sm danger', style: 'margin-top:10px', onclick: async () => {
          if (!nivel2) { toast('Para desativar, saia e entre de novo informando o código do 2FA.', true); return; }
          if (!(await confirmDlg('Desativar a verificação em duas etapas? A conta fica protegida só pela senha.'))) return;
          const { error } = await sb.auth.mfa.unenroll({ factorId: fatores[0].id });
          if (error) { toast('Não foi possível desativar agora.', true); return; }
          await evento('mfa_removido'); toast('2FA desativado.'); setTimeout(() => location.reload(), 600);
        } }, 'Desativar'));
      return;
    }
    caixa2fa.replaceChildren(
      h('p', {}, badge('Desativada', 'dim'), ' ', 'Adicione um segundo passo ao entrar: um código de 6 números que muda a cada 30 segundos.'),
      h('div', { class: 'pending-note', style: 'margin:10px 0' }, 'Guarde bem o seu celular ou o código secreto. Se perder o acesso ao aplicativo, outro administrador do projeto precisa remover o 2FA no painel do Supabase (Authentication › Users).'),
      h('button', { class: 'btn primary', onclick: async (e) => {
        e.target.disabled = true;
        try {
          const { data: todos } = await sb.auth.mfa.listFactors();
          for (const f of todos?.all || []) if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });   // limpa tentativas antigas
          const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Vemax ' + new Date().toISOString().slice(0, 10) });
          if (error || !data) { toast('Não foi possível iniciar a ativação agora.', true); e.target.disabled = false; return; }
          const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, 'aria-label': 'Código de 6 números' });
          const erro = h('p', { class: 'err', role: 'alert', hidden: true });
          caixa2fa.replaceChildren(
            h('ol', { class: 'small', style: 'margin:0 0 10px 18px;display:grid;gap:6px' }, h('li', {}, 'Abra um aplicativo autenticador (Google Authenticator, Authy, 1Password…).'), h('li', {}, 'Leia o QR code abaixo ou digite o código secreto.'), h('li', {}, 'Digite aqui o código de 6 números que o aplicativo mostrar.')),
            h('img', { src: data.totp.qr_code, alt: 'QR code para o aplicativo autenticador', width: 180, height: 180, style: 'background:#fff;padding:8px;border-radius:12px' }),
            h('p', { class: 'small' }, 'Código secreto: ', h('code', { style: 'user-select:all' }, data.totp.secret)),
            h('label', {}, 'Código de verificação'), code, erro,
            h('div', { class: 'row', style: 'margin-top:12px' },
              h('button', { class: 'btn', onclick: async () => { await sb.auth.mfa.unenroll({ factorId: data.id }); pinta2fa(); } }, 'Cancelar'),
              h('button', { class: 'btn primary', onclick: async (ev) => {
                erro.hidden = true; const c = code.value.replace(/\s/g, '');
                if (!/^\d{6}$/.test(c)) { erro.textContent = 'Digite os 6 números.'; erro.hidden = false; return; }
                ev.target.disabled = true;
                const { error: ve } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: c });
                ev.target.disabled = false;
                if (ve) { erro.textContent = 'Código incorreto ou vencido. Tente o código novo do aplicativo.'; erro.hidden = false; return; }
                await evento('mfa_ativado'); toast('Verificação em duas etapas ativada.'); setTimeout(() => location.reload(), 600);
              } }, 'Ativar')));
        } catch { toast('Não foi possível iniciar a ativação agora.', true); e.target.disabled = false; }
      } }, 'Ativar verificação em duas etapas'));
  };
  out.push(secao('Verificação em duas etapas (2FA)', caixa2fa));
  pinta2fa();

  // ---------------------------------------------------------------- sessões
  out.push(secao('Sessões', h('p', { class: 'small muted' }, 'Por segurança, o portal desconecta depois de 30 minutos sem uso e a sessão tem duração máxima definida pelo administrador. Se desconfiar que alguém usou sua conta, encerre as outras sessões.'),
    h('button', { class: 'btn', style: 'margin-top:10px', onclick: async () => {
      if (!(await confirmDlg('Encerrar todas as suas sessões em outros aparelhos e navegadores? Esta continua ativa.'))) return;
      const { error } = await sb.auth.signOut({ scope: 'others' });
      if (error) { toast('Não foi possível encerrar agora.', true); return; }
      await evento('sessoes_encerradas'); toast('Outras sessões encerradas.');
    } }, 'Encerrar minhas outras sessões')));

  if (!admin) return h('div', {}, ...out);

  // ---------------------------------------------------------------- política (admin)
  const cfg = (await quiet(sb.from('config_seguranca').select('*'))), val = (k, p) => cfg.find((c) => c.chave === k)?.valor ?? p;
  const migrado = cfg.length > 0;
  const selSessao = h('select', { 'aria-label': 'Duração máxima da sessão', disabled: !migrado }, [[4, '4 horas'], [8, '8 horas'], [12, '12 horas (recomendado)'], [24, '24 horas'], [72, '3 dias'], [0, 'Sem limite (não recomendado)']].map(([v, l]) => h('option', { value: v, selected: v === val('sessao_max_horas', 12) }, l)));
  const selMfa = h('select', { 'aria-label': 'Exigir 2FA de administradores', disabled: !migrado }, [[0, 'Não exigir (quem ativar o 2FA passa a usá-lo)'], [1, 'Exigir de todos os administradores']].map(([v, l]) => h('option', { value: v, selected: v === val('exigir_mfa_admin', 0) }, l)));
  const salvar = async (chave, el) => { const r = await run(sb.from('config_seguranca').update({ valor: Number(el.value) }).eq('chave', chave).select(), 'Política salva.'); if (!r) el.value = String(val(chave, 0)); else { const c = cfg.find((x) => x.chave === chave); if (c) c.valor = Number(el.value); } };
  selSessao.addEventListener('change', () => salvar('sessao_max_horas', selSessao));
  selMfa.addEventListener('change', async () => { if (selMfa.value === '1' && !(await confirmDlg('Exigir 2FA: administradores que ainda não ativaram perdem os poderes de administrador até ativar. Todos já ativaram?'))) { selMfa.value = '0'; return; } salvar('exigir_mfa_admin', selMfa); });
  out.push(secao('Política de segurança', !migrado && h('p', { class: 'pending-note' }, 'Aplique a migration 014 no Supabase para ligar a duração máxima da sessão, o 2FA obrigatório e o log de eventos.'),
    h('label', {}, 'Duração máxima de uma sessão'), selSessao, h('label', {}, 'Verificação em duas etapas para administradores'), selMfa));

  // ---------------------------------------------------------------- verificação do sistema (admin)
  const checagens = h('ul', { class: 'ul-list' });
  const linha = (rot, okk, ajuda) => h('li', { class: 'row between' }, h('span', {}, rot, ajuda && h('div', { class: 'small muted' }, ajuda)), badge(okk ? 'OK' : 'Atenção', okk ? 'ok' : 'warn'));
  (async () => {
    const { data: sv, error: e1 } = await sb.rpc('sessao_valida');
    let csp = false, nosniff = false;
    try { const r = await fetch(location.href, { method: 'HEAD', cache: 'no-store' }); csp = /default-src/.test(r.headers.get('content-security-policy') || ''); nosniff = r.headers.get('x-content-type-options') === 'nosniff'; } catch { /* sem rede */ }
    checagens.replaceChildren(
      linha('Migration 014 aplicada (sessão, 2FA e eventos)', !e1 && sv !== null, 'Sem ela, a duração máxima da sessão e o log de eventos não funcionam.'),
      linha('Sessão atual válida no servidor', sv === true),
      linha('Esta sessão passou pelo 2FA', ctx.mfa?.aal === 'aal2', 'Ative o 2FA acima e entre de novo.'),
      linha('Política de conteúdo (CSP) ativa neste site', csp, 'Vem do arquivo _headers; confirme o deploy no Cloudflare.'),
      linha('Proteção contra MIME sniffing ativa', nosniff),
      linha('Conexão segura (HTTPS)', location.protocol === 'https:'));
  })();
  out.push(secao('Verificação das proteções', checagens, h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Itens que dependem do painel do Supabase (limite de tentativas, URLs permitidas de redirecionamento, captcha, cadastro público) estão listados em docs/SEGURANCA.md.')));

  // ---------------------------------------------------------------- eventos (admin)
  const caixaEv = h('div', {});
  const pintaEventos = async (filtro = '') => {
    caixaEv.replaceChildren(h('p', { class: 'small muted' }, 'Carregando…'));
    let q = sb.from('eventos_seguranca').select('*').order('quando', { ascending: false }).limit(150);
    if (filtro === 'alertas') q = q.in('tipo', [...ALERTAS]); else if (filtro) q = q.eq('tipo', filtro);
    const { data, error } = await q;
    if (error) { caixaEv.replaceChildren(empty('O registro de eventos ainda não está disponível. Aplique a migration 014.')); return; }
    const nomes = await quiet(sb.from('profiles').select('id,nome'));
    const nome = (id) => nomes.find((n) => n.id === id)?.nome || '';
    const contas = new Map();
    for (const e of (data || []).filter((x) => x.tipo === 'alerta_forca_bruta' && x.email_hash)) {
      if (!contas.has(e.email_hash)) { const { data: c } = await sb.rpc('conta_do_hash', { p_hash: e.email_hash }); contas.set(e.email_hash, c?.[0] ? `${c[0].nome} (${c[0].email})` : 'e-mail que não é da equipe'); }
    }
    const falhas24 = (data || []).filter((x) => x.tipo === 'login_falha' && Date.now() - new Date(x.quando).getTime() < 864e5).length;
    caixaEv.replaceChildren(
      h('p', { class: 'small muted', style: 'margin-bottom:8px' }, `${falhas24} falha(s) de login nas últimas 24 h (entre os 150 eventos mais recentes). O log guarda só hashes de e-mail e de IP, nunca senhas, tokens ou endereços.`),
      (data || []).length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Quando', 'Evento', 'Quem', 'Detalhe'].map((t) => h('th', {}, t)))),
        h('tbody', {}, data.map((e) => h('tr', { class: ALERTAS.has(e.tipo) ? 'late' : null },
          h('td', {}, new Date(e.quando).toLocaleString('pt-BR')), h('td', {}, TIPOS_EVENTO[e.tipo] || e.tipo),
          h('td', {}, nome(e.usuario_id) || (e.email_hash ? 'visitante' : '—')),
          h('td', { class: 'small' }, [e.detalhe, e.tipo === 'alerta_forca_bruta' && contas.get(e.email_hash) ? 'conta: ' + contas.get(e.email_hash) : ''].filter(Boolean).join(' · ') || '—')))))) : empty('Nenhum evento neste filtro.'));
  };
  const filtroSel = h('select', { 'aria-label': 'Filtrar eventos', style: 'width:auto', onchange: (e) => pintaEventos(e.target.value) }, h('option', { value: '' }, 'Todos os eventos'), h('option', { value: 'alertas' }, 'Só os que merecem atenção'), Object.entries(TIPOS_EVENTO).map(([k, l]) => h('option', { value: k }, l)));
  out.push(secao('Eventos de segurança', h('div', { class: 'row', style: 'margin-bottom:10px' }, filtroSel, h('button', { class: 'btn sm', onclick: () => pintaEventos(filtroSel.value) }, 'Atualizar')), caixaEv));
  pintaEventos();

  return h('div', {}, ...out);
}
