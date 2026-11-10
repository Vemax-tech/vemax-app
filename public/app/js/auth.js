// Sessão, perfil e guarda de rota. A segurança real é a RLS do banco; aqui é só experiência de uso.
// O servidor (migration 014) recusa dados de sessão revogada, vencida ou sem 2FA; esta guarda leva a pessoa à tela certa.
import { sb, configured } from './supabase.js';

const LOGIN = new URL('../login/', import.meta.url).href;

/** Chama uma função do banco que pode não existir ainda (migration 014 não aplicada): erro vira "valor padrão", sem travar o portal. */
const rpcOu = async (nome, padrao) => { try { const { data, error } = await sb.rpc(nome); return error ? padrao : data; } catch { return padrao; } };
/** Registra um evento no log de segurança (melhor esforço: nunca atrapalha o uso). */
export const evento = (tipo, detalhe = '') => sb.rpc('registrar_evento', { p_tipo: tipo, p_detalhe: detalhe }).then(() => {}, () => {});

export async function requireSession() {
  if (!configured) return { setup: true };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace(LOGIN); return { redirect: true }; }

  // 1) A sessão ainda vale no servidor? (logout em outro lugar, "encerrar sessões" ou duração máxima vencida)
  if ((await rpcOu('sessao_valida', true)) === false) {
    await evento('sessao_expirada', 'duração máxima ou sessão revogada');
    await sb.auth.signOut({ scope: 'local' });
    location.replace(LOGIN + '?erro=expirada'); return { redirect: true };
  }
  // 2) Quem tem 2FA precisa ter passado por ele nesta sessão.
  let aal = null;
  try { aal = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data; } catch { /* sem 2FA configurado no projeto */ }
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { location.replace(LOGIN + '?mfa=1'); return { redirect: true }; }

  const [{ data: profile }, { data: perms }, mfaOk] = await Promise.all([
    sb.from('profiles').select('*').eq('id', session.user.id).single(),
    sb.from('permissoes').select('*'),
    rpcOu('mfa_ok', true),
  ]);
  if (!profile || !profile.ativo) {
    await sb.auth.signOut({ scope: 'local' });
    const motivo = profile?.status === 'pendente' ? 'pendente' : profile?.status === 'recusado' ? 'recusado' : 'inativo';
    location.replace(LOGIN + '?erro=' + motivo); return { redirect: true };
  }
  // Administrador só tem poderes de admin quando o servidor também os reconhece (2FA em dia).
  const isAdmin = profile.papel === 'admin' && mfaOk !== false;
  const can = (modulo, acao = 'ver') => isAdmin || Boolean(perms?.find((p) => p.modulo === modulo)?.[acao === 'ver' ? 'pode_ver' : 'pode_editar']);
  const mfa = { ativo: Boolean(aal && (aal.currentLevel === 'aal2' || aal.nextLevel === 'aal2')), aal: aal?.currentLevel || 'aal1' };
  return { user: session.user, profile, perms: perms || [], isAdmin, can, mfa, adminSemPoderes: profile.papel === 'admin' && mfaOk === false };
}

/** Sai desta máquina (as outras sessões da pessoa continuam). */
export async function logout(motivo = '') {
  await evento('logout');
  await sb.auth.signOut({ scope: 'local' });
  location.replace(LOGIN + (motivo ? '?erro=' + motivo : ''));
}
