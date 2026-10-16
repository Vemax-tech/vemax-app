// VemaxCALL — qual papel está usando o sistema agora.
//
// NA DEMONSTRAÇÃO o papel é escolhido num seletor no topo, para mostrar as quatro visões na hora,
// sem login. EM PRODUÇÃO isto desaparece: o papel vem de call_usuario_papeis, pela sessão autenticada,
// e o navegador não escolhe nada (ver docs/vemaxcall/06-papeis-permissoes.md).
import { PAPEIS } from './permissoes.js';

const CHAVE = 'vxcall_papel';
/** Quem "entra" em cada papel na demonstração (usuários fictícios de call/js/dados.js). */
const USUARIO_DO_PAPEL = {
  callcenter: 'u-cc1', arquivo: 'u-ar1', recepcao: 'u-re1',
  medico: 'u-me1', admin_empresa: 'u-ad1', admin_tecnico: 'u-ad1',
};
export const PAPEL_PADRAO = 'callcenter';

export function papelAtual() {
  try { const p = sessionStorage.getItem(CHAVE); if (p && PAPEIS[p]) return p; } catch { /* sem storage */ }
  return PAPEL_PADRAO;
}
export function definirPapel(p) {
  if (!PAPEIS[p]) return;
  try { sessionStorage.setItem(CHAVE, p); } catch { /* sem storage: vale só esta aba */ }
}
/** Lista de papéis do usuário atual. Em produção pode ter mais de um; na demo, um por vez. */
export const papeisAtuais = () => [papelAtual()];
export const atorAtual = () => USUARIO_DO_PAPEL[papelAtual()];
export { PAPEIS };
