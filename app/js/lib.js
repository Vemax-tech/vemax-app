// Regras de negócio puras DO PORTAL (sem DOM nem banco): status calculados, alertas e agregações.
// Datas, dinheiro e normalização de texto são genéricos e moraram aqui até virarem ../../shared/js/formato.js;
// continuam reexportados abaixo para as telas seguirem usando `L.*`.
// Fica separado para ser testado em Node (`npm test`) e reaproveitado por todas as telas.
import { soDigitos } from '../../shared/js/validacao.js';
import { hojeISO, diffDias, diasDesde, soma, normNome, normEmail, semAcento } from '../../shared/js/formato.js';

export * from '../../shared/js/formato.js';
export { soDigitos, emailValido, telefoneValido, contatoValido, cpfValido, cnpjValido, documentoOk, avaliarSenha, limparBusca, escaparLike, tipoPorAssinatura, validarArquivo } from '../../shared/js/validacao.js';

export const STALL_DAYS = 14;          // lead parado: mesma etapa há mais de 14 dias
export const SOON_DAYS = 7;            // "prazo próximo": vence em até 7 dias
export const COST_ALERT = 0.8;         // custo ≥ 80% do valor contratado liga o alerta de margem

/** Fixos: chaves aceitas pelo banco. Os rótulos podem ser trocados em Configurações (tabela opcoes). */
export const CANAIS = { formulario: 'Formulário do site', email: 'E-mail', telefone: 'Telefone', whatsapp: 'WhatsApp', outro: 'Outro' };
export const METODOS = { pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro' };
export const COBRANCA_STATUS = { prevista: 'Prevista', pendente: 'Pendente', paga: 'Paga', atrasada: 'Atrasada', cancelada: 'Cancelada' };
export const PROPOSTA_STATUS = { rascunho: 'Rascunho', enviada: 'Enviada', aceita: 'Aprovada', recusada: 'Recusada', vencida: 'Vencida' };
export const TIPOS_INTERACAO = { nota: 'Nota interna', decisao: 'Decisão', contato: 'Contato realizado', mensagem: 'Mensagem enviada ao cliente', solucao: 'Solução', sistema: 'Registro do sistema' };
export const DECISAO = { pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' };
/** Etapas finais (não contam como "em aberto"). */
export const FIM_LEAD = ['concluido', 'descartado'];
export const FIM_PROJETO = ['concluido', 'cancelado'];
export const FIM_CHAMADO = ['resolvido', 'fechado'];

// ---------- status calculados ----------
/** Cobrança "atrasada" não depende de rotina agendada: vale a data de hoje. */
export function statusCobranca(c, hoje = hojeISO()) {
  if (c.status === 'paga' || c.status === 'cancelada') return c.status;
  return c.vencimento < hoje ? 'atrasada' : (c.status === 'atrasada' ? 'pendente' : c.status);
}
/** Proposta enviada com validade vencida aparece como "vencida" mesmo antes de o banco atualizar. */
export function statusProposta(p, hoje = hojeISO()) {
  return p.status === 'enviada' && p.validade && p.validade < hoje ? 'vencida' : p.status;
}
export const aberta = (status, fim) => !fim.includes(status);

/** Lead: sinais de atenção para destacar no funil e no painel. */
export function alertasLead(l, hoje = hojeISO(), now = Date.now()) {
  const out = [];
  if (FIM_LEAD.includes(l.status)) return out;
  if (!l.responsavel_id) out.push('sem_responsavel');
  if (l.status === 'novo' && !l.primeiro_contato_em) out.push('sem_primeiro_contato');
  if (!l.proximo_contato) out.push('sem_proxima_acao');
  else if (l.proximo_contato < hoje) out.push('contato_atrasado');
  if (l.etapa_desde && diasDesde(l.etapa_desde, now) >= STALL_DAYS) out.push('parado');
  return out;
}
export const ALERTA_LEAD = {
  sem_responsavel: 'Sem responsável', sem_primeiro_contato: 'Sem primeiro contato', sem_proxima_acao: 'Sem próxima ação',
  contato_atrasado: 'Contato atrasado', parado: `Parado há mais de ${STALL_DAYS} dias`,
};

export const prazoInfo = (prazo, hoje = hojeISO()) => {
  if (!prazo) return null;
  const d = diffDias(prazo, hoje);
  return { atrasado: d < 0, proximo: d >= 0 && d <= SOON_DAYS, dias: d };
};

/** Chamado: fora do prazo combinado? */
export const chamadoAtrasado = (c, hoje = hojeISO()) => !FIM_CHAMADO.includes(c.status) && Boolean(c.prazo) && c.prazo < hoje;

/** Projeto consumindo mais do que o previsto: horas além da estimativa ou custos perto/acima do valor contratado. */
export function consumo(projeto, tarefas = [], despesas = []) {
  const horas = tarefas.reduce((t, x) => t + Number(x.horas_gastas || 0), 0);
  const custo = soma(despesas, 'valor');
  const est = projeto.esforco_horas != null ? Number(projeto.esforco_horas) : null;
  const vc = projeto.valor_contratado != null ? Number(projeto.valor_contratado) : null;
  return {
    horas, custo, estimativa: est, contratado: vc,
    horasAcima: est != null && est > 0 && horas > est,
    custoAlto: vc != null && vc > 0 && custo >= vc * COST_ALERT,
    margem: vc != null ? vc - custo : null,
  };
}

// ---------- cadastro sem duplicar ----------
/** Clientes que provavelmente são a mesma empresa/pessoa que `alvo` (nome, CPF/CNPJ ou e-mail iguais). */
export function possiveisDuplicados(alvo, clientes, contatos = []) {
  const n = normNome(alvo.nome), doc = soDigitos(alvo.documento), em = normEmail(alvo.email);
  return clientes.filter((c) => c.id !== alvo.id && (
    (n && normNome(c.nome) === n)
    || (doc && soDigitos(c.documento) === doc)
    || (em && (normEmail(c.email) === em || contatos.some((p) => p.cliente_id === c.id && normEmail(p.email) === em)))));
}

// ---------- modelos de projeto (texto simples, uma linha por item) ----------
const PRIO_ALIAS = { baixa: 'baixa', media: 'media', alta: 'alta', urgente: 'urgente' };
/**
 * Lê "Título | prioridade | dias" (tarefas) ou "Título | dias" (entregas). Linhas em branco são ignoradas.
 * Devolve {itens} ou {erro: 'Linha 3: ...'}.
 */
export function lerLinhasModelo(texto, tipo) {
  const itens = [];
  const linhas = String(texto || '').split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const bruto = linhas[i].trim();
    if (!bruto) continue;
    const partes = bruto.split('|').map((x) => x.trim());
    const titulo = partes[0];
    if (!titulo) return { erro: `Linha ${i + 1}: falta o título.` };
    if (titulo.length > 160) return { erro: `Linha ${i + 1}: título com mais de 160 caracteres.` };
    let prioridade = 'media', diasTxt;
    if (tipo === 'tarefa') {
      if (partes.length > 3) return { erro: `Linha ${i + 1}: use “Título | prioridade | dias”.` };
      if (partes[1]) { prioridade = PRIO_ALIAS[semAcento(partes[1])]; if (!prioridade) return { erro: `Linha ${i + 1}: prioridade “${partes[1]}” inválida. Use baixa, média, alta ou urgente.` }; }
      diasTxt = partes[2];
    } else {
      if (partes.length > 2) return { erro: `Linha ${i + 1}: use “Título | dias”.` };
      diasTxt = partes[1];
    }
    let dias = 0;
    if (diasTxt) { dias = Number(diasTxt); if (!Number.isInteger(dias) || dias < 0 || dias > 1000) return { erro: `Linha ${i + 1}: os dias devem ser um número inteiro de 0 a 1000.` }; }
    itens.push(tipo === 'tarefa' ? { titulo, prioridade, dias } : { titulo, dias });
  }
  if (itens.length > (tipo === 'tarefa' ? 40 : 20)) return { erro: `Muitos itens: o limite é ${tipo === 'tarefa' ? 40 : 20}.` };
  return { itens };
}
const NOME_PRIO = { baixa: 'baixa', media: 'média', alta: 'alta', urgente: 'urgente' };
export const formatarLinhasModelo = (itens, tipo) => (itens || []).map((i) => (tipo === 'tarefa' ? `${i.titulo} | ${NOME_PRIO[i.prioridade] || 'média'} | ${i.dias ?? 0}` : `${i.titulo} | ${i.dias ?? 0}`)).join('\n');

// ---------- contratos recorrentes ----------
export const CONTRATO_TIPOS = { suporte: 'Suporte', hospedagem: 'Hospedagem', manutencao: 'Manutenção', licenca: 'Licença / ferramenta', outro: 'Outro' };
export const PERIODICIDADES = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
export const CONTRATO_STATUS = { ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Encerrado' };
const MESES = { mensal: 1, trimestral: 3, anual: 12 };
/** Quanto o contrato rende por mês (trimestral ÷ 3, anual ÷ 12). */
export const valorMensal = (c) => Math.round((Number(c.valor) / (MESES[c.periodicidade] || 1)) * 100) / 100;
/** Receita recorrente mensal: soma só dos contratos ativos. */
export const receitaMensal = (contratos) => Math.round(contratos.filter((c) => c.status === 'ativo').reduce((t, c) => t + valorMensal(c) * 100, 0)) / 100;
