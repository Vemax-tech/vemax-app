// Expiração por inatividade e conferência periódica da sessão. Recebe as dependências por parâmetro (sem import circular).
// O limite duro de duração e a revogação são do servidor (função sessao_valida, migration 014); aqui é a parte de uso:
// avisar antes de deslogar, valer para todas as abas abertas e sair quando a sessão cai.

export const LIMITE_INATIVIDADE_MS = 30 * 60 * 1000;     // 30 min sem mexer em nada
export const AVISO_ANTES_MS = 2 * 60 * 1000;             // avisa 2 min antes
export const CHECAGEM_SERVIDOR_MS = 5 * 60 * 1000;       // pergunta ao servidor se a sessão ainda vale
const CHAVE = 'vx_atividade';

/** Pura (testada): em que ponto da inatividade estamos? */
export function estadoInatividade(agora, ultima, { limiteMs = LIMITE_INATIVIDADE_MS, avisoMs = AVISO_ANTES_MS } = {}) {
  const ocioso = Math.max(0, agora - ultima);
  if (ocioso >= limiteMs) return { estado: 'expirou', restanteMs: 0 };
  if (ocioso >= limiteMs - avisoMs) return { estado: 'aviso', restanteMs: limiteMs - ocioso };
  return { estado: 'ativo', restanteMs: limiteMs - ocioso };
}

const lerAtividade = (chave) => { try { return Number(localStorage.getItem(chave)) || 0; } catch { return 0; } };
const gravarAtividade = (chave, t) => { try { localStorage.setItem(chave, String(t)); } catch { /* sem storage: vale só esta aba */ } };

/**
 * Liga o controle. `sair(motivo)` encerra a sessão e leva ao login; `irParaLogin()` só leva ao login (sessão já encerrada em outra aba). `sb` é o cliente do Supabase.
 * `limiteMs` e `avisoMs` são opcionais: cada área pode ser mais restrita que o padrão (o portal usa o padrão).
 * Devolve uma função que desliga tudo (usada em testes).
 */
export function iniciarSessao({ sb, h, modal, sair, irParaLogin, agora = () => Date.now(), tick = 15000,
  limiteMs = LIMITE_INATIVIDADE_MS, avisoMs = AVISO_ANTES_MS, chave = CHAVE }) {
  let ultima = Math.max(agora(), lerAtividade(chave)), aviso = null, avisoTimer = null, ultimaGravacao = 0, saindo = false;

  const atividade = () => {
    ultima = agora();
    if (ultima - ultimaGravacao > 10000) { gravarAtividade(chave, ultima); ultimaGravacao = ultima; }   // compartilha com as outras abas
    if (aviso) fecharAviso();
  };
  const fecharAviso = () => { clearInterval(avisoTimer); aviso?.(); aviso = null; };
  const expirar = (motivo) => { if (saindo) return; saindo = true; fecharAviso(); sair(motivo); };

  const checar = () => {
    ultima = Math.max(ultima, lerAtividade(chave));                 // atividade em outra aba conta
    const { estado } = estadoInatividade(agora(), ultima, { limiteMs, avisoMs });
    if (estado === 'expirou') return expirar('inatividade');
    if (estado === 'aviso' && !aviso) {
      const txt = h('b', {}, '');
      const atualiza = () => { const s = Math.max(0, Math.ceil((limiteMs - (agora() - ultima)) / 1000)); txt.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s <= 0) expirar('inatividade'); };
      atualiza(); avisoTimer = setInterval(atualiza, 1000);
      aviso = modal('Você ainda está aí?', h('p', {}, 'Por segurança, sua sessão será encerrada por inatividade em ', txt, '.'),
        (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { close(); sair('manual'); } }, 'Sair agora'), h('button', { class: 'btn primary', onclick: () => { atividade(); close(); } }, 'Continuar conectado')),
        () => { clearInterval(avisoTimer); aviso = null; });
    }
  };

  const servidor = async () => {
    if (saindo) return;
    try { const { data, error } = await sb.rpc('sessao_valida'); if (!error && data === false) expirar('expirada'); } catch { /* sem rede: tenta de novo depois */ }
  };

  const eventos = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
  eventos.forEach((e) => document.addEventListener(e, atividade, { passive: true, capture: true }));
  const aoVoltar = () => { if (!document.hidden) { checar(); servidor(); } };
  document.addEventListener('visibilitychange', aoVoltar);
  const t1 = setInterval(checar, tick), t2 = setInterval(servidor, CHECAGEM_SERVIDOR_MS);
  const { data: sub } = sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && !saindo) { saindo = true; fecharAviso(); irParaLogin(); } });   // saiu em outra aba: sai aqui também
  gravarAtividade(chave, ultima);
  return () => { clearInterval(t1); clearInterval(t2); fecharAviso(); eventos.forEach((e) => document.removeEventListener(e, atividade, { capture: true })); document.removeEventListener('visibilitychange', aoVoltar); sub?.subscription?.unsubscribe(); };
}
