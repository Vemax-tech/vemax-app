// VemaxCALL — máquina de estados dos dois fluxos. Puro (sem DOM, sem dados): dá para testar em Node.
// Referência: docs/vemaxcall/03-fluxos.md (seis eixos de estado) e 04-regras-negocio.md.
//
// ATENÇÃO — ESTA É A VERSÃO DA DEMONSTRAÇÃO.
// Em produção estas regras vivem no Postgres (tabela call_transicoes_validas + função mover_solicitacao()),
// porque regra que só existe no navegador não é regra (RNF-01). Este arquivo é o espelho fiel do que vai
// para o SQL: as mesmas transições, os mesmos papéis, as mesmas condições.

export const TIPOS = { duvida_correcao: 'Dúvida ou correção na receita', pedido_receita: 'Solicitação de receita médica' };
export const TIPO_CURTO = { duvida_correcao: 'Dúvida / correção', pedido_receita: 'Pedido de receita' };

// ---------------------------------------------------------------- eixo 1: solicitação
export const ETAPAS = {
  aberta: 'Aberta',
  em_triagem: 'Em triagem',
  aguardando_prontuario: 'Aguardando prontuário',
  prontuario_em_transito: 'Prontuário em trânsito',
  prontuario_na_recepcao: 'Prontuário na Recepção',
  aguardando_medico: 'Aguardando médico',
  aguardando_esclarecimento: 'Aguardando esclarecimento',
  retorno_disponivel: 'Retorno disponível',
  aguardando_contato_paciente: 'Aguardando contato com o paciente',
  aguardando_entrega: 'Aguardando entrega',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
export const ETAPAS_FIM = ['concluida', 'cancelada'];
export const aberta = (s) => !ETAPAS_FIM.includes(s.etapa);
export const DESFECHOS = { resolvida: 'Resolvida', nao_aprovada: 'Não aprovada pelo médico', cancelada: 'Cancelada', sem_contato: 'Sem contato com o paciente' };

// ---------------------------------------------------------------- eixo 3: custódia do prontuário
export const LOCAIS = {
  arquivo: 'No arquivo',
  em_transito_para_recepcao: 'Em trânsito para a Recepção',
  recepcao: 'Na Recepção',
  com_medico: 'Com o médico',
  em_transito_para_arquivo: 'Em trânsito para o arquivo',
  nao_localizado: 'Não localizado',
};
export const MOVIMENTOS = {
  localizado: 'Localizado', retirado: 'Retirado do arquivo', entregue: 'Entregue à Recepção',
  recebido: 'Recebimento confirmado', conferido: 'Conferido', encaminhado_medico: 'Levado ao médico',
  devolvido_medico: 'Devolvido pelo médico', devolvido: 'Devolvido ao arquivo',
  recebido_devolucao: 'Devolução recebida', arquivado: 'Arquivado', nao_localizado: 'Não localizado',
};

// ---------------------------------------------------------------- eixo 4, 5 e 6
export const DOC_ESTADOS = { rascunho: 'Rascunho', emitido: 'Emitido', substituido: 'Substituído por nova versão' };
export const CANAIS = { whatsapp_grupo: 'Grupo do WhatsApp', whatsapp: 'WhatsApp', telefone: 'Telefone', presencial: 'Presencial', email: 'E-mail' };
export const COM_TIPOS = {
  pedido_prontuario: 'Pedido de prontuário ao arquivo', aviso_retorno: 'Aviso de retorno do médico',
  aviso_receita: 'Aviso de receita pronta', conferencia: 'Conferência do aviso',
  contato_paciente: 'Contato com o paciente', envio_documento: 'Envio do documento', outro: 'Outro',
};
export const RESULTADOS = {
  registrada: 'Registrada', falou: 'Falou com o paciente', nao_atendeu: 'Não atendeu',
  numero_invalido: 'Número inválido', recado: 'Recado deixado', sem_resposta: 'Sem resposta', falhou: 'Falhou',
};
/** Resultado que conta como contato efetivo com o paciente (RN-12 / T11). */
export const CONTATO_EFETIVO = ['falou', 'recado'];

export const ENTREGA_MODOS = { fisica: 'Retirada física', digital: 'Envio digital' };
export const ENTREGA_ESTADOS = {
  nao_aplicavel: 'Não se aplica', orientada: 'Retirada orientada', anunciada: 'Envio anunciado',
  envio_tentado: 'Envio tentado', enviado: 'Enviado', retirada_confirmada: 'Retirada confirmada', falha: 'Falha no envio',
};
/** Estados em que a entrega está REALMENTE concluída. `envio_tentado` NÃO entra (RN-13). */
export const ENTREGA_TERMINAL = ['enviado', 'retirada_confirmada'];

// ---------------------------------------------------------------- tabela de transições (eixo 1)
// Espelha docs/vemaxcall/03-fluxos.md. `papeis` = quem pode; `tipos` = para qual fluxo vale (vazio = os dois).
export const TRANSICOES = [
  { id: 'T02', de: 'aberta', para: 'em_triagem', papeis: ['callcenter'], rotulo: 'Classificar (triagem)' },
  { id: 'T03', de: 'aberta', para: 'aguardando_prontuario', papeis: ['callcenter'], rotulo: 'Pedir prontuário ao arquivo', exigeComunicacao: 'pedido_prontuario' },
  { id: 'T03', de: 'em_triagem', para: 'aguardando_prontuario', papeis: ['callcenter'], rotulo: 'Pedir prontuário ao arquivo', exigeComunicacao: 'pedido_prontuario' },
  { id: 'T04', de: 'aguardando_prontuario', para: 'prontuario_em_transito', papeis: ['arquivo'], rotulo: 'Entregar à Recepção', viaProntuario: 'entregue' },
  { id: 'T05', de: 'prontuario_em_transito', para: 'prontuario_na_recepcao', papeis: ['recepcao'], rotulo: 'Confirmar recebimento', viaProntuario: 'recebido' },
  { id: 'T06', de: 'prontuario_na_recepcao', para: 'aguardando_medico', papeis: ['recepcao'], rotulo: 'Encaminhar ao médico', exigeConferencia: true },
  { id: 'T07', de: 'aguardando_medico', para: 'retorno_disponivel', papeis: ['medico'], rotulo: 'Registrar retorno' },
  { id: 'T08', de: 'aguardando_medico', para: 'aguardando_esclarecimento', papeis: ['medico'], rotulo: 'Pedir esclarecimento' },
  { id: 'T09', de: 'aguardando_esclarecimento', para: 'aguardando_medico', papeis: ['callcenter', 'recepcao'], rotulo: 'Prestar o esclarecimento' },
  { id: 'T10', de: 'retorno_disponivel', para: 'aguardando_contato_paciente', papeis: ['recepcao'], rotulo: 'Avisar no grupo' },
  { id: 'T11', de: 'aguardando_contato_paciente', para: 'concluida', papeis: ['callcenter'], tipos: ['duvida_correcao'], rotulo: 'Concluir: dúvida esclarecida', desfecho: 'resolvida' },
  { id: 'T12', de: 'aguardando_contato_paciente', para: 'aguardando_entrega', papeis: ['callcenter'], tipos: ['pedido_receita'], rotulo: 'Paciente avisado: definir entrega' },
  { id: 'T13', de: 'aguardando_entrega', para: 'concluida', papeis: ['callcenter', 'recepcao'], tipos: ['pedido_receita'], rotulo: 'Concluir: entrega registrada', desfecho: 'resolvida' },
  { id: 'T14', de: 'aguardando_medico', para: 'concluida', papeis: ['medico'], tipos: ['pedido_receita'], rotulo: 'Não aprovar o pedido', desfecho: 'nao_aprovada' },
  { id: 'T16', de: 'concluida', para: 'aberta', papeis: ['callcenter', 'admin_empresa'], rotulo: 'Reabrir', exigeMotivo: true },
];
/** T15: cancelar, de qualquer etapa não terminal. */
export const CANCELAR = { id: 'T15', para: 'cancelada', papeis: ['callcenter', 'admin_empresa'], rotulo: 'Cancelar', exigeMotivo: true, desfecho: 'cancelada' };

// ---------------------------------------------------------------- transições do prontuário (eixo 3)
export const MOV_VALIDOS = [
  { id: 'C01', mov: 'localizado', de: ['arquivo', 'nao_localizado'], para: 'arquivo', papeis: ['arquivo'], rotulo: 'Registrar que localizou' },
  { id: 'C02', mov: 'retirado', de: ['arquivo'], para: 'arquivo', papeis: ['arquivo'], rotulo: 'Registrar retirada', exigeAntes: 'localizado' },
  { id: 'C03', mov: 'entregue', de: ['arquivo'], para: 'em_transito_para_recepcao', papeis: ['arquivo'], rotulo: 'Entregar à Recepção', exigeAntes: 'retirado' },
  { id: 'C04', mov: 'recebido', de: ['em_transito_para_recepcao'], para: 'recepcao', papeis: ['recepcao'], rotulo: 'Confirmar recebimento' },
  { id: 'C04b', mov: 'conferido', de: ['recepcao'], para: 'recepcao', papeis: ['recepcao'], rotulo: 'Registrar conferência' },
  { id: 'C05', mov: 'encaminhado_medico', de: ['recepcao'], para: 'com_medico', papeis: ['recepcao'], rotulo: 'Levar ao médico' },
  { id: 'C06', mov: 'devolvido_medico', de: ['com_medico'], para: 'recepcao', papeis: ['recepcao'], rotulo: 'Receber de volta do médico' },
  { id: 'C07', mov: 'devolvido', de: ['recepcao'], para: 'em_transito_para_arquivo', papeis: ['recepcao'], rotulo: 'Devolver ao arquivo' },
  { id: 'C08', mov: 'recebido_devolucao', de: ['em_transito_para_arquivo'], para: 'arquivo', papeis: ['arquivo'], rotulo: 'Confirmar devolução recebida' },
  { id: 'C09', mov: 'arquivado', de: ['arquivo'], para: 'arquivo', papeis: ['arquivo'], rotulo: 'Arquivar', exigeAntes: 'recebido_devolucao' },
  { id: 'C10', mov: 'nao_localizado', de: ['arquivo'], para: 'nao_localizado', papeis: ['arquivo'], rotulo: 'Não encontrei o prontuário' },
];

/** Transições do eixo 1 possíveis a partir do estado atual, já filtradas por papel e por tipo. */
export function transicoesDe(sol, papeis) {
  const lista = TRANSICOES.filter((t) => t.de === sol.etapa
    && (!t.tipos || t.tipos.includes(sol.tipo))
    && t.papeis.some((p) => papeis.includes(p)));
  if (aberta(sol) && CANCELAR.papeis.some((p) => papeis.includes(p))) lista.push({ ...CANCELAR, de: sol.etapa });
  return lista;
}

/** Movimentos de prontuário possíveis agora, filtrados por papel. `feitos` = tipos já registrados nesta volta. */
export function movimentosDe(pront, papeis, feitos = []) {
  return MOV_VALIDOS.filter((m) => m.de.includes(pront.local)
    && m.papeis.some((p) => papeis.includes(p))
    && (!m.exigeAntes || feitos.includes(m.exigeAntes))
    && !(m.mov === 'localizado' && feitos.includes('localizado') && pront.local === 'arquivo' && feitos.includes('retirado')));
}

/**
 * RN-06: o que ainda falta para poder concluir. Lista vazia = pode concluir.
 * `ctx` = { comunicacoes, avaliacoes, entrega, documentos } da solicitação.
 */
export function pendenciasParaConcluir(sol, ctx) {
  const faltas = [];
  const contatos = (ctx.comunicacoes || []).filter((c) => c.tipo === 'contato_paciente');
  if (!contatos.some((c) => CONTATO_EFETIVO.includes(c.resultado))) {
    faltas.push('Nenhum contato efetivo com o paciente (tentativa sem sucesso não conta).');
  }
  if (sol.tipo === 'pedido_receita') {
    if (!(ctx.avaliacoes || []).length) faltas.push('O médico ainda não registrou a decisão.');
    const e = ctx.entrega;
    const decidiu = (ctx.avaliacoes || []).some((a) => a.desfecho === 'nao_aprovado');
    if (!decidiu) {
      if (!e) faltas.push('A entrega da receita ainda não foi registrada.');
      else if (!ENTREGA_TERMINAL.includes(e.estado)) {
        faltas.push(e.estado === 'envio_tentado'
          ? 'O envio foi tentado, mas não há confirmação. Tentativa não é entrega (RN-13).'
          : `A entrega está em "${ENTREGA_ESTADOS[e.estado]}" e ainda não foi confirmada.`);
      }
    }
  }
  return faltas;
}

/** Pendência administrativa paralela: não impede concluir, mas fica visível (RF-17). */
export const prontuarioPendente = (pront) => Boolean(pront) && pront.local !== 'arquivo';

/**
 * A próxima ação necessária, em uma frase, e de quem é. É o que a tela de detalhe destaca (RF-42).
 */
export function proximaAcao(sol) {
  const m = {
    aberta: ['Call Center', 'Registrar o pedido e avisar o arquivo para localizar o prontuário.'],
    em_triagem: ['Call Center', 'Concluir a triagem e pedir o prontuário.'],
    aguardando_prontuario: ['Arquivo', 'Localizar o prontuário, retirar e entregar à Recepção.'],
    prontuario_em_transito: ['Recepção', 'Confirmar o recebimento do prontuário.'],
    prontuario_na_recepcao: ['Recepção', 'Conferir e encaminhar o caso ao médico.'],
    aguardando_medico: ['Médico', 'Analisar e registrar a decisão.'],
    aguardando_esclarecimento: ['Call Center / Recepção', 'Prestar o esclarecimento pedido pelo médico.'],
    retorno_disponivel: ['Recepção', 'Avisar no grupo que o retorno está disponível.'],
    aguardando_contato_paciente: ['Call Center', sol.tipo === 'pedido_receita' ? 'Avisar o paciente que a receita está pronta.' : 'Comunicar a resposta do médico ao paciente.'],
    aguardando_entrega: ['Call Center / Recepção', 'Registrar a entrega conforme o resultado real.'],
    concluida: [null, 'Nada. Caso concluído.'],
    cancelada: [null, 'Nada. Caso cancelado.'],
  };
  const [papel, texto] = m[sol.etapa] || [null, '—'];
  return { papel, texto };
}
