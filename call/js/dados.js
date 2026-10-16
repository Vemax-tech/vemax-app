// VemaxCALL — camada de dados DA DEMONSTRAÇÃO.
//
// =====================================================================================
//  ESTE É O ÚNICO ARQUIVO QUE A TROCA PARA O BANCO REAL SUBSTITUI.
//
//  Guarda tudo em memória e devolve { data, error } como o supabase-js, de propósito:
//  as telas usam o mesmo run() do portal e NÃO precisam mudar quando a origem virar
//  o Postgres. As funções de fluxo abaixo (moverSolicitacao, moverProntuario…) são o
//  espelho das RPC que vão existir no banco (mover_solicitacao, mover_prontuario),
//  com as mesmas validações de estado e de papel.
//
//  Em produção a validação aqui é redundante — vale a do servidor (RNF-01).
//  Aqui ela existe para a demonstração se comportar como o sistema real.
//
//  NENHUM DADO REAL DE PACIENTE. Tudo sintético, inventado para a apresentação.
// =====================================================================================
import * as F from './fluxo.js';
import { pode } from './permissoes.js';

const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 10);
const agora = () => new Date().toISOString();
const horasAtras = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const ok = (data) => ({ data, error: null });
const erro = (message, code = 'P0001') => ({ data: null, error: { code, message } });
/** Mesmo código que o Postgres usa para recusa por RLS: o mensagemErro() do portal já o traduz. */
const negado = (o) => erro(o || 'Sem permissão para esta ação.', '42501');

export const db = {
  empresa: { id: 'emp-1', nome: 'Clínica (demonstração)' },
  usuarios: [], pacientes: [], prontuarios: [], movimentos: [],
  solicitacoes: [], tarefas: [], eventos: [],
  avaliacoes: [], documentos: [], comunicacoes: [], entregas: [], auditoria: [],
};

// ---------------------------------------------------------------- equipe da demonstração
const EQUIPE = [
  { id: 'u-cc1', nome: 'Aline Barros', papeis: ['callcenter'], cargo: 'Atendente' },
  { id: 'u-cc2', nome: 'Rafael Nunes', papeis: ['callcenter'], cargo: 'Atendente' },
  { id: 'u-ar1', nome: 'Silvio Prado', papeis: ['arquivo'], cargo: 'Responsável pelo arquivo' },
  { id: 'u-re1', nome: 'Carla Menezes', papeis: ['recepcao'], cargo: 'Recepção' },
  { id: 'u-me1', nome: 'Dra. Helena Fontes', papeis: ['medico'], cargo: 'Clínica geral', registro_profissional: 'CRM/SP 000000 (fictício)' },
  { id: 'u-me2', nome: 'Dr. Paulo Aragão', papeis: ['medico'], cargo: 'Cardiologia', registro_profissional: 'CRM/SP 000001 (fictício)' },
  { id: 'u-ad1', nome: 'Beatriz Lima', papeis: ['admin_empresa'], cargo: 'Coordenação' },
];
export const usuarioPor = (id) => db.usuarios.find((u) => u.id === id);
export const nomeDe = (id) => usuarioPor(id)?.nome || '—';
export const equipeDoPapel = (papel) => db.usuarios.filter((u) => u.papeis.includes(papel));

// ---------------------------------------------------------------- pacientes sintéticos
const PACIENTES = [
  ['Antônio Carlos Ferreira', '1952-03-14', '(11) 98100-0001'],
  ['Maria Aparecida Souza', '1961-07-02', '(11) 98100-0002'],
  ['José Roberto Lima', '1948-11-25', '(11) 98100-0003'],
  ['Terezinha Gomes', '1955-01-09', '(11) 98100-0004'],
  ['Sebastião Alves', '1943-06-30', '(11) 98100-0005'],
  ['Conceição Batista', '1967-09-18', '(11) 98100-0006'],
  ['Geraldo Martins', '1950-04-21', '(11) 98100-0007'],
  ['Ivone Rodrigues', '1972-12-05', '(11) 98100-0008'],
  ['Benedito Castro', '1939-08-11', '(11) 98100-0009'],
  ['Neusa Pereira', '1958-02-27', '(11) 98100-0010'],
  ['Osvaldo Siqueira', '1946-10-03', '(11) 98100-0011'],
  ['Lourdes Cardoso', '1963-05-16', '(11) 98100-0012'],
  ['Djalma Teixeira', '1951-12-22', '(11) 98100-0013'],
  ['Marlene Figueiredo', '1969-03-08', '(11) 98100-0014'],
  ['Waldemar Pinto', '1942-07-19', '(11) 98100-0015'],
  ['Zilda Monteiro', '1957-11-30', '(11) 98100-0016'],
  ['Hermínio Dantas', '1944-09-05', '(11) 98100-0017'],
];
// Um paciente tem UM prontuário. Dois atendimentos abertos do mesmo paciente disputariam a mesma
// custódia, o que a própria regra RN-08 proíbe — então só reaproveitamos um paciente quando o
// atendimento anterior dele não tirou o prontuário do arquivo.

// ---------------------------------------------------------------- roteiro dos dois fluxos
// Marcos em ordem. O semeador "reproduz" o fluxo até o marco pedido, então os dados de exemplo
// são necessariamente consistentes com a máquina de estados — não há estado impossível na demo.
const MARCOS = [
  'aberta', 'pedido_arquivo', 'localizado', 'retirado', 'entregue', 'recebido', 'conferido',
  'ao_medico', 'avaliado', 'avisado_grupo', 'conferido_cc', 'contato_paciente', 'entrega', 'concluida',
];

function semearSolicitacao(spec) {
  const pac = db.pacientes[spec.pac];
  const pront = db.prontuarios.find((p) => p.paciente_id === pac.id);
  const ate = MARCOS.indexOf(spec.ate);
  const cc = spec.cc || 'u-cc1';
  let t = spec.horas;                                   // horas atrás em que o caso começou
  const passo = (h = 1) => { t = Math.max(0.2, t - h); return horasAtras(t); };

  const sol = {
    id: uid('sol'), empresa_id: db.empresa.id, protocolo: 1000 + db.solicitacoes.length + 1,
    tipo: spec.tipo, etapa: 'aberta', etapa_desde: horasAtras(t), desfecho: null,
    prioridade: spec.prioridade || 'normal', paciente_id: pac.id, prontuario_id: pront.id,
    relato: spec.relato, aberta_por: cc, responsavel_id: cc,
    criado_em: horasAtras(t), concluida_em: null, reaberturas: 0, motivo: null,
  };
  db.solicitacoes.push(sol);
  ev(sol, null, 'aberta', cc, 'Solicitação registrada pelo Call Center.');

  const ir = (etapa, ator, nota) => { const de = sol.etapa; sol.etapa = etapa; sol.etapa_desde = passo(); ev(sol, de, etapa, ator, nota); };
  const mov = (tipo, ator, nota) => {
    db.movimentos.push({ id: uid('mov'), prontuario_id: pront.id, solicitacao_id: sol.id, tipo, ator_id: ator, nota: nota || '', criado_em: passo(0.5) });
    const regra = F.MOV_VALIDOS.find((m) => m.mov === tipo);
    if (regra) { pront.local = regra.para; pront.custodia_usuario_id = ator; }
  };
  const com = (canal, tipo, ator, resultado, texto) => {
    db.comunicacoes.push({ id: uid('com'), solicitacao_id: sol.id, canal, tipo, destinatario: tipo === 'contato_paciente' ? pac.nome : 'Grupo operacional', ator_id: ator, resultado, texto, criado_em: passo(0.4) });
  };

  if (ate >= MARCOS.indexOf('pedido_arquivo')) {
    com('whatsapp_grupo', 'pedido_prontuario', cc, 'registrada', `Protocolo ${sol.protocolo} — localizar o prontuário ${pront.codigo} (${pac.nome}).`);
    ir('aguardando_prontuario', cc, 'Pedido publicado no grupo operacional.');
    tarefa(sol, 'arquivo', 'Localizar e separar o prontuário', ate >= MARCOS.indexOf('entregue') ? 'concluida' : 'pendente');
  }
  if (ate >= MARCOS.indexOf('localizado')) mov('localizado', 'u-ar1', `Encontrado na estante ${pront.local_arquivo}.`);
  if (ate >= MARCOS.indexOf('retirado')) mov('retirado', 'u-ar1');
  if (ate >= MARCOS.indexOf('entregue')) {
    mov('entregue', 'u-ar1', 'Levado à Recepção com o papel do pedido.');
    ir('prontuario_em_transito', 'u-ar1', 'Entrega iniciada. Aguarda confirmação de quem recebe.');
    tarefa(sol, 'recepcao', 'Confirmar o recebimento do prontuário', ate >= MARCOS.indexOf('recebido') ? 'concluida' : 'pendente');
  }
  if (ate >= MARCOS.indexOf('recebido')) { mov('recebido', 'u-re1'); ir('prontuario_na_recepcao', 'u-re1', 'Recepção confirmou o recebimento.'); }
  if (ate >= MARCOS.indexOf('conferido')) mov('conferido', 'u-re1', 'Identificação conferida, sem divergência.');
  if (ate >= MARCOS.indexOf('ao_medico')) {
    mov('encaminhado_medico', 'u-re1');
    ir('aguardando_medico', 'u-re1', `Caso apresentado a ${nomeDe(spec.medico || 'u-me1')}.`);
    sol.medico_id = spec.medico || 'u-me1';
    tarefa(sol, 'medico', spec.tipo === 'pedido_receita' ? 'Analisar o pedido de receita' : 'Analisar a dúvida ou correção', ate >= MARCOS.indexOf('avaliado') ? 'concluida' : 'pendente', sol.medico_id);
  }
  if (ate >= MARCOS.indexOf('avaliado')) {
    const med = sol.medico_id;
    const desfecho = spec.desfecho || (spec.tipo === 'pedido_receita' ? 'receita_emitida' : 'respondido');
    db.avaliacoes.push({
      id: uid('ava'), solicitacao_id: sol.id, medico_id: med, desfecho,
      registro_profissional: usuarioPor(med).registro_profissional,
      conteudo_clinico: spec.conteudo || 'Conteúdo clínico de exemplo, registrado pelo profissional. (dado fictício)',
      resumo_para_paciente: spec.resumo || 'Resumo autorizado para repassar ao paciente. (dado fictício)',
      criado_em: passo(1.5),
    });
    if (desfecho === 'receita_emitida' || desfecho === 'corrigido') {
      const anterior = desfecho === 'corrigido';
      if (anterior) {
        db.documentos.push({ id: uid('doc'), solicitacao_id: sol.id, tipo: 'receita', versao: 1, substitui_id: null, estado: 'substituido', emitido_por: med, nome: `Receita — protocolo ${sol.protocolo} (v1)`, criado_em: passo(0.2) });
      }
      const v1 = db.documentos.filter((d) => d.solicitacao_id === sol.id)[0];
      db.documentos.push({ id: uid('doc'), solicitacao_id: sol.id, tipo: 'receita', versao: anterior ? 2 : 1, substitui_id: v1?.id || null, estado: 'emitido', emitido_por: med, nome: `Receita — protocolo ${sol.protocolo}${anterior ? ' (v2, corrigida)' : ''}`, criado_em: passo(0.2) });
    }
    mov('devolvido_medico', 'u-re1');
    if (desfecho === 'nao_aprovado') {
      ir('concluida', med, 'Pedido não aprovado pelo médico. Pendência: comunicar o paciente.');
      sol.desfecho = 'nao_aprovada'; sol.concluida_em = sol.etapa_desde;
      tarefa(sol, 'callcenter', 'Comunicar ao paciente que o pedido não foi aprovado', 'pendente', cc);
    } else {
      ir('retorno_disponivel', med, 'Retorno registrado pelo médico.');
      tarefa(sol, 'recepcao', 'Receber o retorno e avisar no grupo', ate >= MARCOS.indexOf('avisado_grupo') ? 'concluida' : 'pendente');
    }
  }
  if (ate >= MARCOS.indexOf('avisado_grupo') && sol.etapa === 'retorno_disponivel') {
    const tipo = spec.tipo === 'pedido_receita' ? 'aviso_receita' : 'aviso_retorno';
    com('whatsapp_grupo', tipo, 'u-re1', 'registrada', `Protocolo ${sol.protocolo} — ${spec.tipo === 'pedido_receita' ? 'receita pronta' : 'retorno do médico disponível'}.`);
    ir('aguardando_contato_paciente', 'u-re1', 'Aviso publicado no grupo, com o protocolo.');
    tarefa(sol, 'callcenter', spec.tipo === 'pedido_receita' ? 'Avisar o paciente que a receita está pronta' : 'Comunicar a resposta ao paciente', ate >= MARCOS.indexOf('contato_paciente') ? 'concluida' : 'pendente', cc);
  }
  if (ate >= MARCOS.indexOf('conferido_cc')) com('whatsapp_grupo', 'conferencia', cc, 'registrada', 'Aviso conferido no grupo.');
  if (ate >= MARCOS.indexOf('contato_paciente')) {
    const res = spec.resultadoContato || 'falou';
    com(spec.canalContato || 'telefone', 'contato_paciente', cc, res, res === 'falou' ? 'Paciente informado e ciente.' : res === 'nao_atendeu' ? 'Ligação não atendida. Tentar novamente.' : 'Recado deixado com familiar.');
  }
  if (ate >= MARCOS.indexOf('entrega') && spec.tipo === 'pedido_receita' && sol.etapa === 'aguardando_contato_paciente') {
    ir('aguardando_entrega', cc, 'Paciente avisado. Entrega a registrar.');
    const modo = spec.modo || 'fisica';
    const ent = { id: uid('ent'), solicitacao_id: sol.id, modo, estado: modo === 'fisica' ? 'orientada' : 'anunciada', historico: [], criado_em: passo(0.3) };
    db.entregas.push(ent);
    const anda = (estado, nota) => { ent.historico.push({ estado, quando: passo(0.3), ator_id: cc, nota }); ent.estado = estado; };
    anda(ent.estado, modo === 'fisica' ? 'Paciente orientado a retirar na clínica.' : 'Informado que será enviada digitalmente.');
    if (spec.entrega === 'tentado') anda('envio_tentado', 'Enviado ao destinatário autorizado. Sem confirmação de recebimento.');
    if (spec.entrega === 'enviado') { anda('envio_tentado', 'Enviado ao destinatário autorizado.'); anda('enviado', 'Recebimento confirmado pelo paciente.'); }
    if (spec.entrega === 'retirada') anda('retirada_confirmada', 'Retirada na recepção, conferida com documento.');
    if (spec.entrega === 'falha') anda('falha', 'Número inválido. Pendência mantida para nova tentativa.');
    tarefa(sol, modo === 'fisica' ? 'recepcao' : 'callcenter', modo === 'fisica' ? 'Confirmar a retirada física da receita' : 'Confirmar o envio digital',
      F.ENTREGA_TERMINAL.includes(ent.estado) ? 'concluida' : 'pendente', cc);
  }
  if (ate >= MARCOS.indexOf('concluida') && F.aberta(sol)) {
    ir('concluida', cc, 'Caso concluído: requisitos cumpridos.');
    sol.desfecho = 'resolvida'; sol.concluida_em = sol.etapa_desde;
  }

  // Trilha PARALELA do prontuário: independente da etapa da solicitação (RF-17).
  if (spec.devolucao && pront.local !== 'arquivo') {
    const etapas = { devolvido: ['devolvido'], recebido: ['devolvido', 'recebido_devolucao'], arquivado: ['devolvido', 'recebido_devolucao', 'arquivado'] };
    for (const m of etapas[spec.devolucao] || []) mov(m, m === 'devolvido' ? 'u-re1' : 'u-ar1', m === 'arquivado' ? `Devolvido à estante ${pront.local_arquivo}.` : '');
  }
  if (pront.local !== 'arquivo') { pront.solicitacao_id = sol.id; }
  return sol;
}

function ev(sol, de, para, ator, nota) {
  db.eventos.push({ id: uid('ev'), solicitacao_id: sol.id, de_etapa: de, para_etapa: para, ator_id: ator, nota, criado_em: sol.etapa_desde });
}
function tarefa(sol, papel, titulo, estado, responsavel = null) {
  db.tarefas.push({ id: uid('tar'), solicitacao_id: sol.id, papel_responsavel: papel, titulo, estado, responsavel_id: responsavel, criado_em: sol.etapa_desde, concluida_em: estado === 'concluida' ? agora() : null });
}

// ---------------------------------------------------------------- o conjunto da apresentação
// Cobre todas as etapas, os dois fluxos, as duas formas de entrega, o caso não aprovado,
// a correção com versão, a tentativa de envio sem confirmação e as pendências de arquivamento.
const ROTEIRO = [
  { tipo: 'duvida_correcao', ate: 'aberta', pac: 0, horas: 3, relato: 'Paciente diz que a posologia na receita está ilegível e quer confirmar a dose.' },
  { tipo: 'pedido_receita', ate: 'aberta', pac: 1, horas: 2, relato: 'Pede renovação da receita de uso contínuo.' },
  { tipo: 'pedido_receita', ate: 'pedido_arquivo', pac: 2, horas: 26, relato: 'Pede nova receita; acabou a medicação nesta semana.', prioridade: 'alta' },
  { tipo: 'duvida_correcao', ate: 'localizado', pac: 3, horas: 30, relato: 'Nome do medicamento parece trocado em relação ao que toma há dois anos.' },
  { tipo: 'pedido_receita', ate: 'entregue', pac: 4, horas: 10, relato: 'Pede receita para continuar o tratamento.' },
  { tipo: 'duvida_correcao', ate: 'recebido', pac: 5, horas: 8, relato: 'Quer saber se pode tomar os dois remédios no mesmo horário.' },
  { tipo: 'pedido_receita', ate: 'ao_medico', pac: 6, horas: 20, relato: 'Receita vencida; pede emissão de nova via.', medico: 'u-me2' },
  { tipo: 'duvida_correcao', ate: 'ao_medico', pac: 7, horas: 48, relato: 'Receita sem a quantidade de dias de uso.', prioridade: 'alta' },
  { tipo: 'duvida_correcao', ate: 'avaliado', pac: 8, horas: 14, relato: 'Dosagem divergente da que foi dita na consulta.', desfecho: 'corrigido', devolucao: 'devolvido' },
  { tipo: 'pedido_receita', ate: 'avisado_grupo', pac: 9, horas: 12, relato: 'Pede receita de uso contínuo para três meses.', devolucao: 'recebido' },
  // Reaproveitam pacientes cujo atendimento em aberto NÃO tirou o prontuário do arquivo (pac 0 e 1):
  // dá histórico ao paciente sem criar disputa de custódia.
  { tipo: 'pedido_receita', ate: 'contato_paciente', pac: 0, horas: 36, relato: 'Segunda via da receita, perdeu a anterior.', resultadoContato: 'nao_atendeu', devolucao: 'arquivado' },
  { tipo: 'duvida_correcao', ate: 'concluida', pac: 1, horas: 60, relato: 'Dúvida sobre jejum antes de tomar o medicamento.', devolucao: 'arquivado', cc: 'u-cc2' },
  // Daqui para baixo, um paciente por atendimento.
  { tipo: 'pedido_receita', ate: 'entrega', pac: 10, horas: 50, relato: 'Receita de uso contínuo; prefere retirar na clínica.', modo: 'fisica', entrega: 'orientada', devolucao: 'arquivado' },
  { tipo: 'pedido_receita', ate: 'entrega', pac: 11, horas: 44, relato: 'Pede receita e aceita receber por mensagem.', modo: 'digital', entrega: 'tentado', devolucao: 'recebido', cc: 'u-cc2' },
  { tipo: 'pedido_receita', ate: 'concluida', pac: 12, horas: 90, relato: 'Renovação de receita, enviada digitalmente.', modo: 'digital', entrega: 'enviado', devolucao: 'arquivado' },
  { tipo: 'pedido_receita', ate: 'concluida', pac: 13, horas: 110, relato: 'Receita retirada presencialmente pelo filho, autorizado.', modo: 'fisica', entrega: 'retirada', devolucao: 'arquivado', cc: 'u-cc2' },
  { tipo: 'pedido_receita', ate: 'avaliado', pac: 14, horas: 18, relato: 'Pede medicação que não consta no histórico.', desfecho: 'nao_aprovado', devolucao: 'arquivado' },
  { tipo: 'duvida_correcao', ate: 'ao_medico', pac: 15, horas: 72, relato: 'Pergunta se pode substituir por genérico.', prioridade: 'alta', medico: 'u-me2' },
  // Fluxo 1 esperando o Call Center retornar ao paciente: é o caso em que a conclusão depende
  // de contato efetivo, e nenhuma tentativa frustrada basta (RN-06 + RN-12).
  { tipo: 'duvida_correcao', ate: 'avisado_grupo', pac: 16, horas: 28, relato: 'Quer confirmar se a dose da manhã mudou depois da última consulta.', devolucao: 'recebido' },
];

export function semear() {
  db.usuarios = EQUIPE.map((u) => ({ ...u, ativo: true }));
  db.pacientes = PACIENTES.map(([nome, nasc, tel], i) => ({
    id: 'pac-' + (i + 1), empresa_id: db.empresa.id, nome, nascimento: nasc, telefone: tel,
    documento: '', observacao: 'Paciente fictício, criado para a demonstração.',
  }));
  db.prontuarios = db.pacientes.map((p, i) => ({
    id: 'pro-' + (i + 1), empresa_id: db.empresa.id, codigo: 'PR-' + String(2000 + i + 1),
    paciente_id: p.id, local: 'arquivo', custodia_usuario_id: 'u-ar1',
    local_arquivo: String.fromCharCode(65 + (i % 4)) + '-' + (10 + i), solicitacao_id: null,
  }));
  db.movimentos = []; db.solicitacoes = []; db.tarefas = []; db.eventos = [];
  db.avaliacoes = []; db.documentos = []; db.comunicacoes = []; db.entregas = []; db.auditoria = [];
  ROTEIRO.forEach(semearSolicitacao);
  return db;
}
semear();

// ---------------------------------------------------------------- leitura
const TABELAS = { solicitacoes: 'solicitacoes', pacientes: 'pacientes', prontuarios: 'prontuarios', movimentos: 'movimentos', tarefas: 'tarefas', eventos: 'eventos', avaliacoes: 'avaliacoes', documentos: 'documentos', comunicacoes: 'comunicacoes', entregas: 'entregas', usuarios: 'usuarios', auditoria: 'auditoria' };

/** Espelha `sb.from(tabela).select().match(filtro)`. */
export async function listar(tabela, filtro = {}) {
  const arr = db[TABELAS[tabela]];
  if (!arr) return erro(`Tabela desconhecida: ${tabela}`);
  const rows = arr.filter((r) => Object.entries(filtro).every(([k, v]) => r[k] === v));
  return ok(rows.map((r) => ({ ...r })));
}
export async function obter(tabela, id) {
  const r = db[TABELAS[tabela]]?.find((x) => x.id === id);
  return r ? ok({ ...r }) : erro('Registro não encontrado.', 'PGRST116');
}
export const pacientePor = (id) => db.pacientes.find((p) => p.id === id);
export const prontuarioPor = (id) => db.prontuarios.find((p) => p.id === id);

/** Tudo o que a tela de detalhe precisa, numa chamada. Vira uma view/RPC no banco. */
export async function dossie(id) {
  const sol = db.solicitacoes.find((s) => s.id === id);
  if (!sol) return erro('Solicitação não encontrada.', 'PGRST116');
  const pront = prontuarioPor(sol.prontuario_id);
  return ok({
    sol: { ...sol },
    paciente: { ...pacientePor(sol.paciente_id) },
    prontuario: pront ? { ...pront } : null,
    movimentos: db.movimentos.filter((m) => m.solicitacao_id === id),
    tarefas: db.tarefas.filter((t) => t.solicitacao_id === id),
    eventos: db.eventos.filter((e) => e.solicitacao_id === id),
    avaliacoes: db.avaliacoes.filter((a) => a.solicitacao_id === id),
    documentos: db.documentos.filter((d) => d.solicitacao_id === id),
    comunicacoes: db.comunicacoes.filter((c) => c.solicitacao_id === id),
    entrega: db.entregas.find((e) => e.solicitacao_id === id) || null,
  });
}

/** RN-18 / item 11: a LEITURA de conteúdo clínico também é auditada, não só a alteração. */
export function auditarLeitura(papeis, recurso, solicitacaoId, atorId) {
  db.auditoria.push({ id: uid('aud'), acao: 'leitura', recurso, solicitacao_id: solicitacaoId, ator_id: atorId, papeis: [...papeis], quando: agora() });
}
const auditarEscrita = (acao, recurso, solicitacaoId, atorId, detalhe) => {
  db.auditoria.push({ id: uid('aud'), acao, recurso, solicitacao_id: solicitacaoId, ator_id: atorId, detalhe, quando: agora() });
};

// ---------------------------------------------------------------- escrita (espelho das RPC)
/** Espelho de uma futura RPC abrir_solicitacao(). */
export async function abrirSolicitacao({ tipo, paciente_id, relato, prioridade = 'normal', papeis, ator }) {
  if (!pode(papeis, 'solicitacao_abrir', 'editar')) return negado('Só o Call Center abre solicitação.');
  if (!F.TIPOS[tipo]) return erro('Tipo de solicitação inválido.');
  const pac = pacientePor(paciente_id);
  if (!pac) return erro('Selecione um paciente.');
  const pront = db.prontuarios.find((p) => p.paciente_id === paciente_id);
  const sol = {
    id: uid('sol'), empresa_id: db.empresa.id, protocolo: 1000 + db.solicitacoes.length + 1,
    tipo, etapa: 'aberta', etapa_desde: agora(), desfecho: null, prioridade,
    paciente_id, prontuario_id: pront?.id || null, relato, aberta_por: ator, responsavel_id: ator,
    criado_em: agora(), concluida_em: null, reaberturas: 0, motivo: null,
  };
  db.solicitacoes.push(sol);
  ev(sol, null, 'aberta', ator, 'Solicitação registrada pelo Call Center.');
  tarefa(sol, 'callcenter', 'Pedir o prontuário ao arquivo', 'pendente', ator);
  auditarEscrita('criacao', 'solicitacao', sol.id, ator, `protocolo ${sol.protocolo}`);
  return ok({ ...sol });
}

/** RF-04 / CU-04: duplicidade provável — avisa, NÃO bloqueia. */
export function possivelDuplicidade({ tipo, paciente_id }, janelaHoras = 24) {
  const limite = Date.now() - janelaHoras * 3600e3;
  return db.solicitacoes.filter((s) => s.paciente_id === paciente_id && s.tipo === tipo
    && F.aberta(s) && new Date(s.criado_em).getTime() >= limite).map((s) => ({ ...s }));
}

/** Espelho de mover_solicitacao(): valida transição, papel, condições e grava o evento. Tudo ou nada. */
export async function moverSolicitacao({ id, transicao, papeis, ator, motivo, nota }) {
  const sol = db.solicitacoes.find((s) => s.id === id);
  if (!sol) return erro('Solicitação não encontrada.', 'PGRST116');
  const t = F.transicoesDe(sol, papeis).find((x) => x.id === transicao && x.de === sol.etapa);
  if (!t) return negado('Essa ação não é permitida para o seu papel nesta etapa.');
  if (t.exigeMotivo && !String(motivo || '').trim()) return erro('Informe o motivo.');
  if (t.exigeConferencia && !db.movimentos.some((m) => m.solicitacao_id === id && m.tipo === 'conferido')) {
    return erro('Registre a conferência do prontuário antes de encaminhar ao médico.');
  }
  // RN-06: conclusão só com os requisitos do tipo cumpridos.
  if (t.para === 'concluida' && t.desfecho === 'resolvida') {
    const { data: d } = await dossie(id);
    const faltas = F.pendenciasParaConcluir(sol, d);
    if (faltas.length) return erro('Não é possível concluir: ' + faltas[0]);
  }
  const de = sol.etapa;
  sol.etapa = t.para; sol.etapa_desde = agora();
  if (t.desfecho) { sol.desfecho = t.desfecho; sol.concluida_em = agora(); }
  if (t.id === 'T16') { sol.desfecho = null; sol.concluida_em = null; sol.reaberturas += 1; }   // RN-15: histórico preservado
  if (motivo) sol.motivo = motivo;
  ev(sol, de, t.para, ator, nota || t.rotulo + (motivo ? ` — ${motivo}` : ''));
  db.tarefas.filter((x) => x.solicitacao_id === id && x.estado === 'pendente').forEach((x) => {
    if (F.ETAPAS_FIM.includes(t.para) && t.desfecho !== 'nao_aprovada') { x.estado = 'concluida'; x.concluida_em = agora(); }
  });
  proximaTarefa(sol);
  auditarEscrita('transicao', 'solicitacao', id, ator, `${de} → ${t.para}`);
  return ok({ ...sol });
}

function proximaTarefa(sol) {
  const prox = F.proximaAcao(sol);
  if (!prox.papel) return;
  const papel = { 'Call Center': 'callcenter', Arquivo: 'arquivo', 'Recepção': 'recepcao', 'Médico': 'medico' }[prox.papel]
    || (prox.papel.includes('Call Center') ? 'callcenter' : 'recepcao');
  const jaTem = db.tarefas.some((t) => t.solicitacao_id === sol.id && t.estado === 'pendente' && t.papel_responsavel === papel);
  if (!jaTem) tarefa(sol, papel, prox.texto, 'pendente', papel === 'medico' ? sol.medico_id : null);
}

/** Espelho de mover_prontuario(): custódia única, transição válida, papel certo. RN-07, RN-08, RN-09. */
export async function moverProntuario({ prontuario_id, mov, papeis, ator, solicitacao_id, nota }) {
  const pront = prontuarioPor(prontuario_id);
  if (!pront) return erro('Prontuário não encontrado.', 'PGRST116');
  const feitos = db.movimentos.filter((m) => m.solicitacao_id === solicitacao_id).map((m) => m.tipo);
  const regra = F.movimentosDe(pront, papeis, feitos).find((m) => m.mov === mov);
  if (!regra) {
    const existe = F.MOV_VALIDOS.find((m) => m.mov === mov);
    if (existe && !existe.papeis.some((p) => papeis.includes(p))) {
      return negado(`Este registro é do papel ${existe.papeis.map((p) => ({ arquivo: 'Arquivo', recepcao: 'Recepção' }[p] || p)).join(' ou ')}.`);
    }
    return erro('Esse movimento não é possível com o prontuário onde ele está agora.');
  }
  if (regra.exigeAntes && !feitos.includes(regra.exigeAntes)) return erro(`Registre "${F.MOVIMENTOS[regra.exigeAntes]}" antes.`);
  // RN-17: repetir a mesma requisição não cria movimentação duplicada.
  if (feitos.includes(mov) && mov !== 'localizado') return ok({ ...pront, repetido: true });
  db.movimentos.push({ id: uid('mov'), prontuario_id, solicitacao_id: solicitacao_id || null, tipo: mov, ator_id: ator, nota: nota || '', criado_em: agora() });
  pront.local = regra.para; pront.custodia_usuario_id = ator;
  if (mov === 'arquivado') pront.solicitacao_id = null;
  auditarEscrita('movimento', 'prontuario', solicitacao_id, ator, `${F.MOVIMENTOS[mov]} → ${F.LOCAIS[regra.para]}`);
  return ok({ ...pront });
}

export async function registrarComunicacao({ solicitacao_id, canal, tipo, destinatario, resultado, texto, papeis, ator }) {
  if (!pode(papeis, 'comunicacao_registrar', 'editar')) return negado();
  if (!F.CANAIS[canal] || !F.COM_TIPOS[tipo]) return erro('Canal ou tipo inválido.');
  // RN-12: comunicação com o paciente sem resultado não existe.
  if (tipo === 'contato_paciente' && (!resultado || resultado === 'registrada')) return erro('Informe o resultado do contato com o paciente.');
  const c = { id: uid('com'), solicitacao_id, canal, tipo, destinatario: destinatario || '', ator_id: ator, resultado: resultado || 'registrada', texto: texto || '', criado_em: agora() };
  db.comunicacoes.push(c);
  auditarEscrita('comunicacao', 'comunicacao', solicitacao_id, ator, `${F.COM_TIPOS[tipo]} — ${F.RESULTADOS[c.resultado]}`);
  return ok({ ...c });
}

/** RN-10 e RN-11: só o médico a quem o caso foi encaminhado, e com registro profissional. */
export async function registrarAvaliacao({ solicitacao_id, desfecho, conteudo_clinico, resumo_para_paciente, papeis, ator }) {
  if (!pode(papeis, 'avaliacao_registrar', 'editar')) return negado('Só um profissional habilitado registra a decisão clínica.');
  const u = usuarioPor(ator);
  if (!u?.registro_profissional) return negado('O papel de médico exige registro profissional cadastrado.');
  const sol = db.solicitacoes.find((s) => s.id === solicitacao_id);
  if (!sol) return erro('Solicitação não encontrada.', 'PGRST116');
  if (sol.etapa !== 'aguardando_medico') return erro('A solicitação não está aguardando avaliação médica.');
  if (sol.medico_id && sol.medico_id !== ator) return negado('Este caso foi encaminhado a outro profissional.');
  const a = { id: uid('ava'), solicitacao_id, medico_id: ator, desfecho, registro_profissional: u.registro_profissional, conteudo_clinico: conteudo_clinico || '', resumo_para_paciente: resumo_para_paciente || '', criado_em: agora() };
  db.avaliacoes.push(a);
  if (desfecho === 'receita_emitida' || desfecho === 'corrigido') {
    // RN-15 / RF-23: correção cria NOVA VERSÃO; a anterior continua existindo.
    const anteriores = db.documentos.filter((d) => d.solicitacao_id === solicitacao_id);
    anteriores.forEach((d) => { if (d.estado === 'emitido') d.estado = 'substituido'; });
    const ultima = anteriores[anteriores.length - 1];
    db.documentos.push({ id: uid('doc'), solicitacao_id, tipo: 'receita', versao: (ultima?.versao || 0) + 1, substitui_id: ultima?.id || null, estado: 'emitido', emitido_por: ator, nome: `Receita — protocolo ${sol.protocolo}${ultima ? ` (v${(ultima.versao || 0) + 1}, corrigida)` : ''}`, criado_em: agora() });
  }
  auditarEscrita('avaliacao', 'avaliacao_medica', solicitacao_id, ator, desfecho);
  return ok({ ...a });
}

/** RN-13 e RN-14: estados distintos, e combinação modo × estado validada. */
export async function registrarEntrega({ solicitacao_id, modo, estado, nota, papeis, ator }) {
  if (!pode(papeis, 'entrega_registrar', 'editar') && !pode(papeis, 'entrega_confirmar_fisica', 'editar')) return negado();
  const sol = db.solicitacoes.find((s) => s.id === solicitacao_id);
  if (!sol) return erro('Solicitação não encontrada.', 'PGRST116');
  if (sol.tipo !== 'pedido_receita') return erro('Só um pedido de receita tem entrega de documento.');   // RN-22
  if (estado === 'retirada_confirmada' && modo !== 'fisica') return erro('Retirada confirmada só existe na entrega física.');
  if (['anunciada', 'envio_tentado', 'enviado'].includes(estado) && modo !== 'digital') return erro('Esse estado só existe na entrega digital.');
  if (estado === 'retirada_confirmada' && !pode(papeis, 'entrega_confirmar_fisica', 'editar')) return negado('A confirmação da retirada é registrada pela Recepção.');
  let ent = db.entregas.find((e) => e.solicitacao_id === solicitacao_id);
  if (!ent) { ent = { id: uid('ent'), solicitacao_id, modo, estado: 'nao_aplicavel', historico: [], criado_em: agora() }; db.entregas.push(ent); }
  if (ent.modo !== modo && ent.historico.length) return erro('A entrega já foi registrada no outro modo. Cancele e registre de novo.');
  ent.modo = modo; ent.estado = estado;
  ent.historico.push({ estado, quando: agora(), ator_id: ator, nota: nota || '' });
  auditarEscrita('entrega', 'entrega', solicitacao_id, ator, `${F.ENTREGA_MODOS[modo]} — ${F.ENTREGA_ESTADOS[estado]}`);
  return ok({ ...ent });
}

export async function concluirTarefa({ id, ator }) {
  const t = db.tarefas.find((x) => x.id === id);
  if (!t) return erro('Tarefa não encontrada.', 'PGRST116');
  t.estado = 'concluida'; t.concluida_em = agora();
  return ok({ ...t });
}

/** Volta tudo ao estado inicial — útil para reapresentar sem resíduo da demonstração anterior. */
export async function reiniciar() { semear(); return ok(true); }
