// VemaxCALL — matriz papel × recurso × ação. Puro, testável.
// Referência: docs/vemaxcall/06-papeis-permissoes.md (seção 6.3).
//
// ATENÇÃO — VERSÃO DA DEMONSTRAÇÃO.
// Em produção esta matriz é DADO no Postgres (call_papeis_permissoes) e a verificação é a função
// can_call(), chamada DENTRO de cada função de transição, que lança 42501. O navegador nunca decide
// permissão (RNF-01). Aqui o objetivo é mostrar o comportamento: cada papel vê e faz só o que é dele.

export const PAPEIS = {
  callcenter: 'Call Center',
  arquivo: 'Arquivo',
  recepcao: 'Recepção',
  medico: 'Médico',
  admin_empresa: 'Administrador da clínica',
  admin_tecnico: 'Suporte técnico VEMAX',
};

/** 'E' = editar/registrar · 'V' = ver · 'Vm' = ver mínimo (só os campos necessários à função) · ausente = sem acesso */
const M = {
  paciente_identificacao: { callcenter: 'E', arquivo: 'Vm', recepcao: 'V', medico: 'V', admin_empresa: 'Vm' },
  paciente_historico: { callcenter: 'V', arquivo: 'Vm', recepcao: 'V', medico: 'V', admin_empresa: 'Vm' },
  solicitacao_abrir: { callcenter: 'E' },
  solicitacao_ver: { callcenter: 'V', arquivo: 'Vm', recepcao: 'V', medico: 'V', admin_empresa: 'V', admin_tecnico: 'Vm' },
  solicitacao_editar: { callcenter: 'E', admin_empresa: 'E' },
  prontuario_movimentar: { arquivo: 'E' },
  prontuario_confirmar: { recepcao: 'E' },
  prontuario_conferir: { recepcao: 'E' },
  prontuario_devolver: { recepcao: 'E' },
  prontuario_arquivar: { arquivo: 'E' },
  prontuario_ver: { callcenter: 'V', arquivo: 'V', recepcao: 'V', medico: 'V', admin_empresa: 'V', admin_tecnico: 'Vm' },
  // Decisão clínica: registrar é exclusivo do médico (RN-11).
  avaliacao_registrar: { medico: 'E' },
  // Conteúdo clínico: o Call Center e os administradores NÃO leem (item 10 do pedido, RN-18).
  avaliacao_conteudo: { recepcao: 'Vm', medico: 'V' },
  // Que EXISTE um retorno, todos que precisam acompanhar podem ver.
  avaliacao_existencia: { callcenter: 'V', recepcao: 'V', medico: 'V', admin_empresa: 'V', admin_tecnico: 'V' },
  documento_emitir: { medico: 'E' },
  documento_abrir: { recepcao: 'V', medico: 'V' },
  documento_metadados: { callcenter: 'V', recepcao: 'V', medico: 'V', admin_empresa: 'V', admin_tecnico: 'V' },
  comunicacao_registrar: { callcenter: 'E', arquivo: 'E', recepcao: 'E', medico: 'E', admin_empresa: 'E' },
  comunicacao_ver: { callcenter: 'V', arquivo: 'V', recepcao: 'V', medico: 'V', admin_empresa: 'V', admin_tecnico: 'Vm' },
  entrega_registrar: { callcenter: 'E', recepcao: 'E' },
  entrega_confirmar_fisica: { recepcao: 'E' },
  tarefa_ver: { callcenter: 'V', arquivo: 'V', recepcao: 'V', medico: 'V', admin_empresa: 'V' },
  tarefa_atribuir: { callcenter: 'E', recepcao: 'E', admin_empresa: 'E' },
  dashboard: { callcenter: 'V', arquivo: 'Vm', recepcao: 'V', medico: 'Vm', admin_empresa: 'V', admin_tecnico: 'Vm' },
  relatorios: { callcenter: 'V', recepcao: 'V', medico: 'V', admin_empresa: 'V', admin_tecnico: 'V' },
  usuarios: { admin_empresa: 'E' },
  configuracoes: { admin_empresa: 'E' },
  auditoria: { admin_empresa: 'V', admin_tecnico: 'V' },
};

const ORDEM = { Vm: 1, V: 2, E: 3 };

/** Nível de acesso de um conjunto de papéis a um recurso: 'E' | 'V' | 'Vm' | null (união dos papéis). */
export function nivel(papeis, recurso) {
  const linha = M[recurso];
  if (!linha) return null;
  let melhor = null;
  for (const p of papeis) {
    const n = linha[p];
    if (n && (!melhor || ORDEM[n] > ORDEM[melhor])) melhor = n;
  }
  return melhor;
}

/** Espelho de can_call(recurso, acao) do banco. acao: 'ver' | 'editar'. */
export function pode(papeis, recurso, acao = 'ver') {
  const n = nivel(papeis, recurso);
  if (!n) return false;
  return acao === 'editar' ? n === 'E' : true;
}

/** Vê o conteúdo completo (não só o mínimo)? Usado para esconder o texto clínico. */
export const podeCompleto = (papeis, recurso) => ['V', 'E'].includes(nivel(papeis, recurso));

/** A matriz inteira, para a tela que mostra as permissões na apresentação. */
export const matriz = () => ({ recursos: Object.keys(M), papeis: Object.keys(PAPEIS), celula: (r, p) => M[r]?.[p] || null });

export const RECURSO_ROTULO = {
  paciente_identificacao: 'Paciente — identificação',
  paciente_historico: 'Paciente — histórico',
  solicitacao_abrir: 'Solicitação — abrir',
  solicitacao_ver: 'Solicitação — ver',
  solicitacao_editar: 'Solicitação — editar',
  prontuario_movimentar: 'Prontuário — localizar, retirar, entregar',
  prontuario_confirmar: 'Prontuário — confirmar recebimento',
  prontuario_conferir: 'Prontuário — conferir',
  prontuario_devolver: 'Prontuário — devolver',
  prontuario_arquivar: 'Prontuário — receber devolução e arquivar',
  prontuario_ver: 'Prontuário — ver custódia e histórico',
  avaliacao_registrar: 'Avaliação médica — registrar',
  avaliacao_conteudo: 'Avaliação médica — ler o conteúdo clínico',
  avaliacao_existencia: 'Avaliação médica — saber que existe retorno',
  documento_emitir: 'Documento — emitir / versionar',
  documento_abrir: 'Documento — abrir o conteúdo',
  documento_metadados: 'Documento — ver metadados',
  comunicacao_registrar: 'Comunicação — registrar',
  comunicacao_ver: 'Comunicação — ver',
  entrega_registrar: 'Entrega — orientar / registrar envio',
  entrega_confirmar_fisica: 'Entrega — confirmar retirada física',
  tarefa_ver: 'Tarefa — ver a própria fila',
  tarefa_atribuir: 'Tarefa — atribuir a outra pessoa',
  dashboard: 'Dashboard operacional',
  relatorios: 'Relatórios',
  usuarios: 'Usuários e papéis',
  configuracoes: 'Configurações da clínica',
  auditoria: 'Log de auditoria',
};
