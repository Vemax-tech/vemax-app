// VemaxCALL — filas de trabalho por papel (item 6.5). Cada equipe vê só o que é dela,
// na ordem em que o trabalho aparece no fluxograma.
import * as F from '../fluxo.js';
import { listar, pacientePor, prontuarioPor } from '../dados.js';
import { start, h, run, pageHead, empty, badge, icon, desde, corEtapa, horasNa } from '../ui.js';
import { PAPEIS } from '../permissoes.js';

const ROOT = new URL('../../', import.meta.url).href;

/**
 * Definição das filas por papel. Cada fila é { titulo, dica, filtro(dados) }.
 * Os nomes são os do item 6.5 do pedido, não inventados aqui.
 */
function filasDoPapel(papel, D) {
  const ab = D.sols.filter(F.aberta);
  const etapa = (...e) => ab.filter((s) => e.includes(s.etapa));
  const movs = (s) => D.movimentos.filter((m) => m.solicitacao_id === s.id).map((m) => m.tipo);
  const docEmitido = (s) => D.documentos.some((x) => x.solicitacao_id === s.id && x.estado === 'emitido');
  const entrega = (s) => D.entregas.find((e) => e.solicitacao_id === s.id);

  const porPapel = {
    callcenter: [
      ['Novas solicitações', 'Registradas e ainda sem pedido de prontuário', etapa('aberta', 'em_triagem')],
      ['Casos em andamento', 'Já com a equipe, aguardando outra etapa', etapa('aguardando_prontuario', 'prontuario_em_transito', 'prontuario_na_recepcao', 'aguardando_medico')],
      ['Respostas recebidas a conferir', 'Retorno do médico publicado no grupo', etapa('aguardando_contato_paciente').filter((s) => !D.comunicacoes.some((c) => c.solicitacao_id === s.id && c.tipo === 'conferencia'))],
      ['Pacientes a contatar', 'Precisam ser avisados do retorno ou da receita', etapa('aguardando_contato_paciente')],
      ['Entregas a confirmar', 'Envio tentado ou retirada orientada, sem confirmação', etapa('aguardando_entrega').filter((s) => { const e = entrega(s); return e && !F.ENTREGA_TERMINAL.includes(e.estado); })],
      ['Esclarecimentos pedidos pelo médico', 'O médico precisa de mais informação', etapa('aguardando_esclarecimento')],
    ],
    arquivo: [
      ['Prontuários para localizar', 'Pedido publicado, ainda não encontrado', etapa('aguardando_prontuario').filter((s) => !movs(s).includes('localizado'))],
      ['Prontuários a separar', 'Localizados, falta retirar', etapa('aguardando_prontuario').filter((s) => movs(s).includes('localizado') && !movs(s).includes('retirado'))],
      ['Entregas pendentes à Recepção', 'Retirados, falta levar', etapa('aguardando_prontuario').filter((s) => movs(s).includes('retirado') && !movs(s).includes('entregue'))],
      ['Prontuários a receber de volta', 'A Recepção já devolveu, falta confirmar', D.pronts.filter((p) => p.local === 'em_transito_para_arquivo')],
      ['Arquivamentos pendentes', 'Devolução recebida, falta arquivar', D.pronts.filter((p) => p.local === 'arquivo' && p.solicitacao_id)],
      ['Não localizados', 'Precisam de tratativa com o Call Center', D.pronts.filter((p) => p.local === 'nao_localizado')],
    ],
    recepcao: [
      ['Prontuários a confirmar', 'O arquivo entregou, falta você confirmar o recebimento', etapa('prontuario_em_transito')],
      ['Conferir e encaminhar ao médico', 'Prontuário em mãos', etapa('prontuario_na_recepcao')],
      ['Respostas e receitas a receber', 'O médico registrou; avise o grupo', etapa('retorno_disponivel')],
      ['Devoluções pendentes', 'Prontuário com você ou com o médico', D.pronts.filter((p) => ['recepcao', 'com_medico'].includes(p.local))],
      ['Retiradas físicas a confirmar', 'Paciente orientado a retirar na clínica', etapa('aguardando_entrega').filter((s) => { const e = entrega(s); return e?.modo === 'fisica' && e.estado !== 'retirada_confirmada'; })],
    ],
    medico: [
      ['Casos encaminhados para avaliação', 'Aguardando a sua análise', etapa('aguardando_medico')],
      ['Casos que precisam de esclarecimento', 'Você pediu informação e ainda não voltou', etapa('aguardando_esclarecimento')],
      ['Receitas emitidas aguardando a Recepção', 'Já decididas, seguindo o fluxo', etapa('retorno_disponivel').filter(docEmitido)],
    ],
    admin_empresa: [
      ['Tudo em aberto', 'Visão de coordenação', ab],
      ['Prontuários fora do arquivo', 'Pendência administrativa', D.pronts.filter((p) => p.local !== 'arquivo')],
      ['Entregas sem confirmação', 'Risco de caso parado', D.entregas.filter((e) => !F.ENTREGA_TERMINAL.includes(e.estado) && e.estado !== 'nao_aplicavel')],
    ],
    admin_tecnico: [['Nada operacional', 'O suporte técnico não participa do fluxo de atendimento', []]],
  };
  return (porPapel[papel] || []).map(([titulo, dica, itens]) => ({ titulo, dica, itens }));
}

export const init = () => start('filas/', 'Minha fila', async (ctx, view) => {
  const [sols, pronts, movimentos, documentos, comunicacoes, entregas, tarefas] = await Promise.all([
    run(listar('solicitacoes')), run(listar('prontuarios')), run(listar('movimentos')),
    run(listar('documentos')), run(listar('comunicacoes')), run(listar('entregas')), run(listar('tarefas')),
  ]);
  const D = { sols, pronts, movimentos, documentos, comunicacoes, entregas, tarefas };
  const papel = ctx.papeis[0];
  const filas = filasDoPapel(papel, D);

  /** Um item pode ser uma solicitação ou um prontuário: o cartão se adapta. */
  const cartao = (it) => {
    if (it.protocolo) {
      const pac = pacientePor(it.paciente_id);
      const verPac = ctx.podeCompleto('paciente_identificacao') || ctx.pode('paciente_identificacao');
      return h('li', { class: 'row between' },
        h('span', {},
          h('a', { class: 't', href: ROOT + `solicitacoes/detalhe.html?id=${it.id}` }, `#${it.protocolo}`),
          ' ', h('span', { class: 'small' }, F.TIPO_CURTO[it.tipo]),
          h('div', { class: 'small muted' }, (verPac && pac ? pac.nome + ' · ' : '') + F.proximaAcao(it).texto)),
        h('span', { class: 'row', style: 'gap:6px' },
          it.prioridade === 'alta' && badge('Alta', 'warn'),
          badge(F.ETAPAS[it.etapa], corEtapa(it.etapa)),
          h('span', { class: 'small muted', style: horasNa(it.etapa_desde) > 24 ? 'color:#ff9b8a' : null }, desde(it.etapa_desde))));
    }
    const pac = pacientePor(it.paciente_id);
    const sol = it.solicitacao_id ? sols.find((s) => s.id === it.solicitacao_id) : null;
    return h('li', { class: 'row between' },
      h('span', {}, h('b', { style: 'color:var(--text)' }, it.codigo),
        h('div', { class: 'small muted' }, `${pac ? pac.nome + ' · ' : ''}estante ${it.local_arquivo}${sol ? ` · protocolo #${sol.protocolo}` : ''}`)),
      h('span', { class: 'row', style: 'gap:6px' },
        badge(F.LOCAIS[it.local], it.local === 'arquivo' ? 'ok' : 'warn'),
        sol && h('a', { class: 'btn sm', href: ROOT + `solicitacoes/detalhe.html?id=${sol.id}` }, 'Abrir')));
  };

  const total = filas.reduce((n, f) => n + f.itens.length, 0);
  view.append(
    pageHead('Minha fila', PAPEIS[papel], total
      ? `${total} ${total === 1 ? 'item esperando por você' : 'itens esperando por você'}, na ordem do fluxo.`
      : 'Nada pendente para o seu papel agora.'),
    total === 0 ? empty('Sua fila está vazia. Troque de papel no menu lateral para ver as outras filas.') : null,
    h('div', { class: 'grid g2' }, filas.filter((f) => f.itens.length).map((f) => h('section', { class: 'card' },
      h('div', { class: 'row between', style: 'margin-bottom:4px' }, h('h2', {}, f.titulo), badge(String(f.itens.length), f.itens.length > 3 ? 'warn' : 'dim')),
      h('p', { class: 'small muted', style: 'margin-bottom:10px' }, f.dica),
      h('ul', { class: 'ul-list' }, f.itens.slice(0, 8).map(cartao),
        f.itens.length > 8 && h('li', { class: 'small muted' }, `e mais ${f.itens.length - 8}…`))))),
    filas.some((f) => !f.itens.length) ? h('p', { class: 'small muted', style: 'margin-top:20px' }, icon('check'), ' Filas vazias agora: ',
      filas.filter((f) => !f.itens.length).map((f) => f.titulo).join(' · ')) : null,
  );
});
