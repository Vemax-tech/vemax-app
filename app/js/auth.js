// Sessão, perfil e guarda de rota. A segurança real é a RLS do banco; aqui é só experiência de uso.
import { sb, configured } from './supabase.js';

const LOGIN = new URL('../login/', import.meta.url).href;

export async function requireSession() {
  if (!configured) return { setup: true };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace(LOGIN); return { redirect: true }; }
  const [{ data: profile }, { data: perms }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', session.user.id).single(),
    sb.from('permissoes').select('*'),
  ]);
  if (!profile || !profile.ativo) {
    await sb.auth.signOut();
    const motivo = profile?.status === 'pendente' ? 'pendente' : profile?.status === 'recusado' ? 'recusado' : 'inativo';
    location.replace(LOGIN + '?erro=' + motivo); return { redirect: true };
  }
  const isAdmin = profile.papel === 'admin';
  const can = (modulo, acao = 'ver') => isAdmin || Boolean(perms?.find((p) => p.modulo === modulo)?.[acao === 'ver' ? 'pode_ver' : 'pode_editar']);
  return { user: session.user, profile, perms: perms || [], isAdmin, can };
}

export async function logout() { await sb.auth.signOut(); location.replace(LOGIN); }
