// Regras de negócio puras (sem DOM nem banco): datas, dinheiro, status calculados e agregações.
// Fica separado para ser testado em Node (`npm test`) e reaproveitado por todas as telas.

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

// ---------- datas (sempre 'YYYY-MM-DD', calculadas em UTC para não variar com o fuso) ----------
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const fromISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
/** Hoje no fuso do navegador (a equipe trabalha no horário local), no formato ISO de data. */
export const hojeISO = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const addDias = (iso, n) => { const d = fromISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
/** Soma meses mantendo o dia; se o mês de destino for mais curto, usa o último dia (31/01 + 1 mês = 28 ou 29/02). */
export const addMeses = (iso, n) => {
  const d = fromISO(iso), dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return toISO(d);
};
export const diffDias = (a, b) => Math.round((fromISO(a) - fromISO(b)) / 864e5);   // a - b, em dias
/** Dias desde um timestamp (ISO completo) até agora. */
export const diasDesde = (ts, now = Date.now()) => Math.floor((now - new Date(ts).getTime()) / 864e5);

/** Entende prazos escritos à mão ("6 semanas", "30 dias", "2 meses") e devolve a data de entrega a partir de hoje; null se não entender. */
export function prazoDeTexto(txt, hoje = hojeISO()) {
  const m = /(\d{1,3})\s*(dias?|semanas?|mes(?:es)?)\b/.exec(String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].startsWith('dia') ? addDias(hoje, n) : m[2].startsWith('sem') ? addDias(hoje, n * 7) : addMeses(hoje, n);
}

/** Intervalos prontos de filtro. Devolve {de, ate} (inclusive) ou {} para "todos". */
export function periodo(chave, hoje = hojeISO()) {
  const [y, m] = hoje.split('-').map(Number);
  const ult = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (chave) {
    case 'mes': return { de: `${y}-${pad(m)}-01`, ate: `${y}-${pad(m)}-${pad(ult(y, m))}` };
    case 'mes_anterior': { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { de: `${yy}-${pad(mm)}-01`, ate: `${yy}-${pad(mm)}-${pad(ult(yy, mm))}` }; }
    case '30d': return { de: addDias(hoje, -29), ate: hoje };
    case '90d': return { de: addDias(hoje, -89), ate: hoje };
    case 'ano': return { de: `${y}-01-01`, ate: `${y}-12-31` };
    default: return {};
  }
}
/** `iso` pode ser data pura ou timestamp; timestamp vira a data local (22h do último dia do mês ainda conta nesse mês). */
export const dentro = (iso, { de, ate } = {}) => {
  if (!iso) return false;
  const dia = String(iso).length > 10 ? hojeISO(new Date(iso)) : String(iso);
  return (!de || dia >= de) && (!ate || dia <= ate);
};

// ---------- dinheiro ----------
export const brl = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const cents = (v) => Math.round(Number(v) * 100);
export const soma = (rows, campo) => rows.reduce((t, r) => t + cents(r[campo] ?? 0), 0) / 100;

/** Divide `valor` em n parcelas mensais. A diferença de centavos vai para a última, então a soma fecha exatamente. */
export function parcelar(valor, n, primeiroVenc) {
  const total = cents(valor);
  if (!Number.isInteger(n) || n < 1 || n > 60 || !(total > 0)) return [];
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    parcela: i + 1, total_parcelas: n,
    valor: (i === n - 1 ? total - base * (n - 1) : base) / 100,
    vencimento: addMeses(primeiroVenc, i),
  }));
}

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
const SUFIXOS = /\b(ltda|me|mei|epp|eireli|sa|s a|cia|company)\b/g;
/** Nome comparável: sem acento, caixa, pontuação nem sufixo societário. "Padaria Pão Doce Ltda." == "padaria pao doce". */
export const normNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(SUFIXOS, ' ').replace(/\s+/g, ' ').trim();
export const soDigitos = (s) => String(s || '').replace(/\D/g, '');
export const normEmail = (s) => String(s || '').trim().toLowerCase();
export const emailValido = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
export const urlValida = (s) => { try { const u = new URL(String(s)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };

/** Clientes que provavelmente são a mesma empresa/pessoa que `alvo` (nome, CPF/CNPJ ou e-mail iguais). */
export function possiveisDuplicados(alvo, clientes, contatos = []) {
  const n = normNome(alvo.nome), doc = soDigitos(alvo.documento), em = normEmail(alvo.email);
  return clientes.filter((c) => c.id !== alvo.id && (
    (n && normNome(c.nome) === n)
    || (doc && soDigitos(c.documento) === doc)
    || (em && (normEmail(c.email) === em || contatos.some((p) => p.cliente_id === c.id && normEmail(p.email) === em)))));
}

/** Valor de um campo do banco para exibir em CSV/planilha sem quebrar (aspas, quebras de linha e fórmulas). */
export const csvCell = (v) => {
  if (typeof v === 'number') return String(v);
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;      // evita injeção de fórmula ao abrir no Excel
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// ---------- modelos de projeto (texto simples, uma linha por item) ----------
const PRIO_ALIAS = { baixa: 'baixa', media: 'media', alta: 'alta', urgente: 'urgente' };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
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

/** Chave técnica estável a partir de um nome ("Redes sociais" -> "redes_sociais"). */
export const slug = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

// ---------- contratos recorrentes ----------
export const CONTRATO_TIPOS = { suporte: 'Suporte', hospedagem: 'Hospedagem', manutencao: 'Manutenção', licenca: 'Licença / ferramenta', outro: 'Outro' };
export const PERIODICIDADES = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
export const CONTRATO_STATUS = { ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Encerrado' };
const MESES = { mensal: 1, trimestral: 3, anual: 12 };
/** Quanto o contrato rende por mês (trimestral ÷ 3, anual ÷ 12). */
export const valorMensal = (c) => Math.round((Number(c.valor) / (MESES[c.periodicidade] || 1)) * 100) / 100;
/** Receita recorrente mensal: soma só dos contratos ativos. */
export const receitaMensal = (contratos) => Math.round(contratos.filter((c) => c.status === 'ativo').reduce((t, c) => t + valorMensal(c) * 100, 0)) / 100;
