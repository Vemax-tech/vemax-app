// VemaxCALL — detalhe da solicitação (item 6.4). A tela mais importante: mostra em que ponto o caso está,
// QUAL É A PRÓXIMA AÇÃO e de quem ela é, e só oferece o que o papel atual pode fazer.
// A trilha do prontuário aparece ao lado, em paralelo, porque é controlada de forma independente (RF-17).
import * as F from '../fluxo.js';
import {
  dossie, moverSolicitacao, moverProntuario, registrarComunicacao, registrarAvaliacao,
  registrarEntrega, concluirTarefa, auditarLeitura, nomeDe,
} from '../dados.js';
import {
  start, h, run, pageHead, badge, icon, modal, formModal, confirmDlg, toast,
  fmtDate, qs, desde, corEtapa,
} from '../ui.js';
import { PAPEIS } from '../permissoes.js';

const ROOT = new URL('../../', import.meta.url).href;
const PRIO = { alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
const quando = (iso) => new Date(iso).toLocaleString('pt-BR');
/** Etapas que a trilha desenha, na ordem, por tipo de fluxo. */
const TRILHA = {
  duvida_correcao: ['aberta', 'aguardando_prontuario', 'prontuario_em_transito', 'prontuario_na_recepcao', 'aguardando_medico', 'retorno_disponivel', 'aguardando_contato_paciente', 'concluida'],
  pedido_receita: ['aberta', 'aguardando_prontuario', 'prontuario_em_transito', 'prontuario_na_recepcao', 'aguardando_medico', 'retorno_disponivel', 'aguardando_contato_paciente', 'aguardando_entrega', 'concluida'],
};

export const initFicha = () => start('solicitacoes/', 'Solicitação', async (ctx, view) => {
  const id = qs('id');
  let d = null;

  async function recarregar() {
    d = await run(dossie(id));
    if (!d) { view.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Solicitação não encontrada.'), h('a', { class: 'btn', href: ROOT + 'solicitacoes/' }, 'Voltar'))); return false; }
    return true;
  }
  if (!(await recarregar())) return;

  const pintar = () => { view.replaceChildren(montar()); };
  const agir = async (p, msg) => { const r = await run(p, msg); if (r) { await recarregar(); pintar(); } return r; };

  // ---------------------------------------------------------------- ações do eixo 1
  function acoesSolicitacao() {
    const trans = F.transicoesDe(d.sol, ctx.papeis);
    if (!trans.length) {
      return h('p', { class: 'small muted' }, F.aberta(d.sol)
        ? `Nenhuma ação sua nesta etapa. A próxima é do papel ${F.proximaAcao(d.sol).papel || '—'}.`
        : 'Caso encerrado.');
    }
    return h('div', { class: 'row' }, trans.map((t) => h('button', {
      class: 'btn sm' + (t.id === 'T15' ? ' danger' : t.para === 'concluida' ? ' primary' : ''),
      onclick: () => executar(t),
    }, t.rotulo)));
  }

  async function executar(t) {
    // T03: pedir o prontuário é, no processo real, publicar no grupo. Registramos a comunicação junto.
    if (t.exigeComunicacao) {
      const texto = `Protocolo ${d.sol.protocolo} — localizar o prontuário ${d.prontuario?.codigo || ''} (${d.paciente.nome}).`;
      const v = await pedir({
        title: 'Pedir o prontuário ao arquivo',
        submitLabel: 'Registrar o pedido',
        fields: [
          { name: 'canal', label: 'Canal usado', type: 'select', value: 'whatsapp_grupo', options: Object.entries(F.CANAIS) },
          { name: 'texto', label: 'Mensagem publicada', type: 'textarea', value: texto, maxlength: 1000, hint: 'O sistema NÃO envia a mensagem. Você publica no grupo e registra aqui o que foi feito.' },
        ],
      });
      if (!v) return;
      const c = await run(registrarComunicacao({ solicitacao_id: id, tipo: 'pedido_prontuario', destinatario: 'Grupo operacional', resultado: 'registrada', ...v, papeis: ctx.papeis, ator: ctx.ator }));
      if (!c) return;
      return agir(moverSolicitacao({ id, transicao: t.id, papeis: ctx.papeis, ator: ctx.ator }), 'Pedido registrado. O arquivo já vê na fila dele.');
    }
    // T07: o retorno do médico é a decisão clínica. Formulário próprio.
    if (t.id === 'T07') return registrarRetorno();
    // T12: paciente avisado -> escolher como a receita chega.
    if (t.id === 'T12') {
      const v = await pedir({
        title: 'Como a receita vai chegar ao paciente?',
        submitLabel: 'Registrar',
        fields: [
          { name: 'resultado', label: 'Resultado do contato com o paciente', type: 'select', value: 'falou', options: Object.entries(F.RESULTADOS).filter(([k]) => ['falou', 'nao_atendeu', 'recado', 'numero_invalido'].includes(k)), hint: 'Tentativa sem sucesso não conclui o caso (RN-12).' },
          { name: 'modo', label: 'Forma de entrega', type: 'select', value: 'fisica', options: Object.entries(F.ENTREGA_MODOS) },
        ],
      });
      if (!v) return;
      const c = await run(registrarComunicacao({ solicitacao_id: id, canal: 'telefone', tipo: 'contato_paciente', destinatario: d.paciente.nome, resultado: v.resultado, texto: 'Paciente avisado de que a receita está pronta.', papeis: ctx.papeis, ator: ctx.ator }));
      if (!c) return;
      const e = await run(registrarEntrega({ solicitacao_id: id, modo: v.modo, estado: v.modo === 'fisica' ? 'orientada' : 'anunciada', nota: v.modo === 'fisica' ? 'Paciente orientado a retirar na clínica.' : 'Informado que será enviada digitalmente.', papeis: ctx.papeis, ator: ctx.ator }));
      if (!e) return;
      return agir(moverSolicitacao({ id, transicao: t.id, papeis: ctx.papeis, ator: ctx.ator }), 'Registrado.');
    }
    // T11 / T13: conclusão. Se faltar requisito, o servidor recusa — mostramos o porquê antes.
    if (t.para === 'concluida' && t.desfecho === 'resolvida') {
      const faltas = F.pendenciasParaConcluir(d.sol, d);
      if (faltas.length) {
        modal('Ainda não é possível concluir', h('div', {},
          h('p', {}, 'Faltam requisitos obrigatórios deste tipo de solicitação:'),
          h('ul', { class: 'ul-list', style: 'margin:12px 0' }, faltas.map((x) => h('li', {}, x))),
          h('p', { class: 'small muted' }, 'Regra RN-06: o sistema não conclui um caso com requisito obrigatório pendente. Em produção quem recusa é o banco, não a tela.')),
        (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Entendi')));
        return;
      }
      if (F.prontuarioPendente(d.prontuario)) {
        const segue = await confirmDlg(`O prontuário ainda está em "${F.LOCAIS[d.prontuario.local]}". A devolução é controlada separadamente e a pendência continuará visível na fila do arquivo. Concluir o atendimento?`);
        if (!segue) return;
      }
    }
    if (t.exigeMotivo) {
      const v = await pedir({ title: t.rotulo, submitLabel: t.rotulo, fields: [{ name: 'motivo', label: 'Motivo', type: 'textarea', required: true, maxlength: 500, hint: 'Fica no histórico. Nada é apagado (RN-15).' }] });
      if (!v) return;
      return agir(moverSolicitacao({ id, transicao: t.id, papeis: ctx.papeis, ator: ctx.ator, motivo: v.motivo }), 'Registrado.');
    }
    return agir(moverSolicitacao({ id, transicao: t.id, papeis: ctx.papeis, ator: ctx.ator }), 'Etapa atualizada.');
  }

  const pedir = (cfg) => new Promise((res) => {
    let enviado = false;
    formModal({ ...cfg, onSubmit: async (v) => { enviado = true; res(v); }, onClose: () => { if (!enviado) res(null); } });
  });

  // ---------------------------------------------------------------- avaliação médica
  function registrarRetorno() {
    const receita = d.sol.tipo === 'pedido_receita';
    const opcoes = receita
      ? [['receita_emitida', 'Receita emitida'], ['nao_aprovado', 'Pedido não aprovado'], ['precisa_esclarecimento', 'Preciso de mais informação']]
      : [['respondido', 'Respondido (sem alterar a receita)'], ['corrigido', 'Receita corrigida (gera nova versão)'], ['precisa_esclarecimento', 'Preciso de mais informação']];
    formModal({
      title: 'Registrar a decisão clínica',
      submitLabel: 'Registrar',
      fields: [
        { name: 'desfecho', label: 'Decisão', type: 'select', value: opcoes[0][0], options: opcoes },
        { name: 'conteudo_clinico', label: 'Conteúdo clínico', type: 'textarea', required: true, maxlength: 4000, hint: 'Visível só para quem tem permissão clínica. Não aparece para o Call Center nem para a administração.' },
        { name: 'resumo_para_paciente', label: 'Resumo para repassar ao paciente', type: 'textarea', maxlength: 600, hint: 'Opcional. Serve para o Call Center comunicar sem acessar o conteúdo clínico (pergunta aberta 12.4).' },
      ],
      onSubmit: async (v) => {
        if (v.desfecho === 'precisa_esclarecimento') {
          const a = await run(registrarAvaliacao({ solicitacao_id: id, ...v, papeis: ctx.papeis, ator: ctx.ator }));
          if (!a) return false;
          await agir(moverSolicitacao({ id, transicao: 'T08', papeis: ctx.papeis, ator: ctx.ator, nota: 'Médico pediu esclarecimento.' }), 'Pedido de esclarecimento registrado.');
          return;
        }
        const a = await run(registrarAvaliacao({ solicitacao_id: id, ...v, papeis: ctx.papeis, ator: ctx.ator }));
        if (!a) return false;
        const trans = v.desfecho === 'nao_aprovado' ? 'T14' : 'T07';
        await agir(moverSolicitacao({ id, transicao: trans, papeis: ctx.papeis, ator: ctx.ator, nota: v.desfecho === 'nao_aprovado' ? 'Pedido não aprovado.' : 'Retorno registrado.' }), 'Decisão registrada.');
      },
    });
  }

  // ---------------------------------------------------------------- blocos da tela
  function blocoProxima() {
    const p = F.proximaAcao(d.sol);
    const meu = p.papel && (p.papel.includes(PAPEIS[ctx.papeis[0]]) || PAPEIS[ctx.papeis[0]] === p.papel);
    const pend = F.aberta(d.sol) ? [] : F.pendenciasParaConcluir(d.sol, d);
    return h('div', { class: 'proxima' + (!F.aberta(d.sol) ? ' pronto' : '') },
      icon(F.aberta(d.sol) ? 'clock' : 'check'),
      h('div', {},
        h('h2', {}, 'Próxima ação'),
        h('p', {}, p.texto),
        p.papel && h('p', { class: 'small' }, 'Responsável: ', h('span', { class: 'dono' }, p.papel), meu ? ' — é você' : ''),
        !F.aberta(d.sol) && F.prontuarioPendente(d.prontuario) && h('p', { class: 'small', style: 'color:#fbd34d;margin-top:6px' }, 'Atendimento encerrado, mas o prontuário ainda não voltou ao arquivo. A pendência segue na fila do arquivo.')));
  }

  function blocoTrilha() {
    const ordem = TRILHA[d.sol.tipo];
    const atual = ordem.indexOf(d.sol.etapa);
    const feitas = new Set(d.eventos.map((e) => e.para_etapa));
    return h('div', { class: 'trilha', 'aria-label': 'Etapas do fluxo' }, ordem.map((e, i) => h('span', {
      class: e === d.sol.etapa ? 'atual' : (feitas.has(e) || (atual > -1 && i < atual)) ? 'feita' : '',
    }, F.ETAPAS[e])));
  }

  function blocoResumo() {
    const verPac = ctx.podeCompleto('paciente_identificacao') || ctx.pode('paciente_identificacao');
    return h('section', { class: 'card' },
      h('dl', { class: 'dl' },
        h('dt', {}, 'Tipo'), h('dd', {}, F.TIPOS[d.sol.tipo]),
        h('dt', {}, 'Paciente'), h('dd', {}, verPac ? h('span', {}, d.paciente.nome, h('div', { class: 'small muted' }, `nasc. ${fmtDate(d.paciente.nascimento)} · ${d.paciente.telefone}`)) : h('span', { class: 'small muted' }, 'reduzido para o seu papel')),
        h('dt', {}, 'Prontuário'), h('dd', {}, d.prontuario ? h('span', {}, d.prontuario.codigo, h('div', { class: 'small muted' }, `estante ${d.prontuario.local_arquivo}`)) : '—'),
        h('dt', {}, 'Etapa'), h('dd', {}, badge(F.ETAPAS[d.sol.etapa], corEtapa(d.sol.etapa)), ' ', h('span', { class: 'small muted' }, desde(d.sol.etapa_desde))),
        h('dt', {}, 'Prioridade'), h('dd', {}, PRIO[d.sol.prioridade]),
        h('dt', {}, 'Aberta por'), h('dd', {}, nomeDe(d.sol.aberta_por), h('div', { class: 'small muted' }, quando(d.sol.criado_em))),
        d.sol.medico_id && [h('dt', {}, 'Médico'), h('dd', {}, nomeDe(d.sol.medico_id))],
        d.sol.desfecho && [h('dt', {}, 'Desfecho'), h('dd', {}, F.DESFECHOS[d.sol.desfecho], d.sol.reaberturas ? h('div', { class: 'small muted' }, `${d.sol.reaberturas} reabertura(s)`) : null)],
        d.sol.motivo && [h('dt', {}, 'Motivo'), h('dd', {}, d.sol.motivo)]),
      h('p', { style: 'margin-top:14px;white-space:pre-wrap' }, h('b', {}, 'Relato: '), d.sol.relato),
      h('div', { style: 'margin-top:16px' }, acoesSolicitacao()));
  }

  // ---------------------------------------------------------------- prontuário (eixo paralelo)
  function blocoProntuario() {
    if (!d.prontuario || !ctx.pode('prontuario_ver')) return null;
    const feitos = d.movimentos.map((m) => m.tipo);
    const possiveis = F.movimentosDe(d.prontuario, ctx.papeis, feitos);
    return h('section', { class: 'card' },
      h('div', { class: 'row between', style: 'margin-bottom:10px' },
        h('h2', {}, 'Prontuário · trilha paralela'),
        badge(F.LOCAIS[d.prontuario.local], d.prontuario.local === 'arquivo' ? 'ok' : 'warn')),
      h('p', { class: 'small muted', style: 'margin-bottom:12px' }, 'Controlada de forma independente do contato com o paciente: a devolução e o arquivamento podem acontecer antes ou depois de o caso ser concluído (RF-17).'),
      h('dl', { class: 'dl' },
        h('dt', {}, 'Com quem está'), h('dd', {}, nomeDe(d.prontuario.custodia_usuario_id)),
        h('dt', {}, 'Local no arquivo'), h('dd', {}, 'estante ' + d.prontuario.local_arquivo)),
      possiveis.length
        ? h('div', { class: 'row', style: 'margin:14px 0' }, possiveis.map((m) => h('button', {
          class: 'btn sm' + (m.mov === 'nao_localizado' ? ' danger' : ''),
          onclick: () => registrarMov(m),
        }, m.rotulo)))
        : h('p', { class: 'small muted', style: 'margin:14px 0' }, `Nenhum registro de prontuário é do seu papel agora. O próximo é do ${proximoDonoProntuario()}.`),
      d.movimentos.length ? h('ul', { class: 'tl' }, [...d.movimentos].reverse().map((m) => h('li', {},
        h('div', { class: 'row between' }, h('b', { style: 'color:var(--text)' }, F.MOVIMENTOS[m.tipo]), h('span', { class: 'small muted' }, quando(m.criado_em))),
        h('p', { class: 'small muted' }, nomeDe(m.ator_id), m.nota ? ' · ' + m.nota : '')))) : h('p', { class: 'small muted' }, 'Nenhuma movimentação ainda.'));
  }

  function proximoDonoProntuario() {
    const todos = F.MOV_VALIDOS.filter((m) => m.de.includes(d.prontuario.local));
    const papel = todos[0]?.papeis[0];
    return PAPEIS[papel] || 'responsável';
  }

  async function registrarMov(m) {
    let nota = '';
    if (['localizado', 'arquivado', 'nao_localizado'].includes(m.mov)) {
      const v = await pedir({
        title: m.rotulo,
        submitLabel: 'Registrar',
        fields: [{ name: 'nota', label: m.mov === 'nao_localizado' ? 'O que aconteceu?' : 'Observação (onde está / para onde foi)', type: 'textarea', maxlength: 300, required: m.mov === 'nao_localizado', value: m.mov === 'arquivado' ? `Devolvido à estante ${d.prontuario.local_arquivo}.` : '' }],
      });
      if (!v) return;
      nota = v.nota;
    }
    const r = await agir(moverProntuario({ prontuario_id: d.prontuario.id, mov: m.mov, papeis: ctx.papeis, ator: ctx.ator, solicitacao_id: id, nota }), 'Movimentação registrada.');
    // T04/T05: a entrega e a confirmação também movem a etapa da solicitação.
    if (r && m.mov === 'entregue') await agir(moverSolicitacao({ id, transicao: 'T04', papeis: ctx.papeis, ator: ctx.ator, nota: 'Prontuário entregue à Recepção. Aguarda confirmação.' }));
    if (r && m.mov === 'recebido') await agir(moverSolicitacao({ id, transicao: 'T05', papeis: ctx.papeis, ator: ctx.ator, nota: 'Recepção confirmou o recebimento.' }));
  }

  // ---------------------------------------------------------------- avaliação, documentos, entrega
  function blocoClinico() {
    if (!d.avaliacoes.length) {
      return ctx.pode('avaliacao_existencia')
        ? h('section', { class: 'card' }, h('h2', {}, 'Retorno do médico'), h('p', { class: 'small muted', style: 'margin-top:8px' }, 'Ainda não há retorno registrado.'))
        : null;
    }
    const completo = ctx.podeCompleto('avaliacao_conteudo');
    const minimo = ctx.pode('avaliacao_conteudo');
    if (completo || minimo) auditarLeitura(ctx.papeis, 'avaliacao_medica', id, ctx.ator);
    return h('section', { class: 'card' },
      h('h2', { style: 'margin-bottom:10px' }, 'Retorno do médico'),
      d.avaliacoes.map((a) => h('div', { style: 'margin-bottom:14px' },
        h('div', { class: 'row between' },
          badge({ respondido: 'Respondido', corrigido: 'Receita corrigida', receita_emitida: 'Receita emitida', nao_aprovado: 'Não aprovado', precisa_esclarecimento: 'Precisa de esclarecimento' }[a.desfecho] || a.desfecho, a.desfecho === 'nao_aprovado' ? 'warn' : 'ok'),
          h('span', { class: 'small muted' }, quando(a.criado_em))),
        h('p', { class: 'small muted', style: 'margin:6px 0' }, nomeDe(a.medico_id), ' · ', a.registro_profissional),
        completo
          ? h('p', { style: 'white-space:pre-wrap' }, a.conteudo_clinico)
          : minimo
            ? h('div', {}, a.resumo_para_paciente ? h('p', { style: 'white-space:pre-wrap' }, a.resumo_para_paciente) : null,
              h('p', { class: 'sem-clinico', style: 'margin-top:8px' }, 'O conteúdo clínico completo não é visível para o seu papel. Você vê o resumo autorizado.'))
            : h('p', { class: 'sem-clinico' }, 'O conteúdo clínico não é visível para o Call Center (RN-18). ',
              h('b', {}, 'Decisão pendente (12.4): '), 'se o atendente precisar repassar a resposta por telefone, a saída é o médico escrever um “resumo para o paciente”, separado do conteúdo clínico.'))));
  }

  function blocoDocumentos() {
    if (!d.documentos.length || !ctx.pode('documento_metadados')) return null;
    const podeAbrir = ctx.pode('documento_abrir');
    return h('section', { class: 'card' },
      h('h2', { style: 'margin-bottom:10px' }, 'Documentos'),
      h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Correção nunca sobrescreve: cada versão coexiste e a anterior fica marcada como substituída (RN-15).'),
      h('ul', { class: 'ul-list' }, d.documentos.map((doc) => h('li', { class: 'row between' },
        h('span', {}, doc.nome, h('div', { class: 'small muted' }, `versão ${doc.versao} · emitida por ${nomeDe(doc.emitido_por)} · ${quando(doc.criado_em)}`)),
        h('span', { class: 'row', style: 'gap:8px' },
          badge(F.DOC_ESTADOS[doc.estado], doc.estado === 'emitido' ? 'ok' : 'dim'),
          podeAbrir
            ? h('button', { class: 'btn sm', onclick: () => abrirDoc(doc) }, 'Abrir')
            : h('span', { class: 'small muted' }, 'sem permissão'))))));
  }

  function abrirDoc(doc) {
    auditarLeitura(ctx.papeis, 'documento', id, ctx.ator);
    modal(doc.nome, h('div', {},
      h('p', {}, 'Na demonstração não há arquivo real — nenhum documento clínico de verdade existe aqui.'),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Em produção: o arquivo fica em bucket ', h('b', {}, 'privado'), ' e a abertura passa por uma função do banco que (1) confere a permissão, (2) emite uma URL assinada de curta duração e (3) grava a leitura na auditoria. A URL nunca vai para log nem para o histórico do navegador (ADR-005).'),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Esta abertura acabou de ser registrada na auditoria, com o seu papel e o horário.')),
    (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
  }

  function blocoEntrega() {
    if (d.sol.tipo !== 'pedido_receita') return null;
    const e = d.entrega;
    const podeReg = ctx.pode('entrega_registrar', 'editar') || ctx.pode('entrega_confirmar_fisica', 'editar');
    const opcoes = () => {
      if (!e) return [];
      if (e.modo === 'fisica') return [['retirada_confirmada', 'Confirmar a retirada física']].filter(() => ctx.pode('entrega_confirmar_fisica', 'editar'));
      return [['envio_tentado', 'Registrar tentativa de envio'], ['enviado', 'Confirmar que foi recebido'], ['falha', 'Registrar falha no envio']];
    };
    return h('section', { class: 'card' },
      h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h2', {}, 'Entrega da receita'),
        e ? badge(F.ENTREGA_ESTADOS[e.estado], F.ENTREGA_TERMINAL.includes(e.estado) ? 'ok' : 'warn') : badge('não registrada', 'dim')),
      h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Envio, entrega e leitura são estados diferentes. Tentativa de envio não conclui o caso (RN-13).'),
      e ? h('div', {},
        h('p', { class: 'small' }, 'Forma: ', h('b', {}, F.ENTREGA_MODOS[e.modo])),
        h('ul', { class: 'tl', style: 'margin-top:12px' }, [...e.historico].reverse().map((x) => h('li', {},
          h('div', { class: 'row between' }, h('b', { style: 'color:var(--text)' }, F.ENTREGA_ESTADOS[x.estado]), h('span', { class: 'small muted' }, quando(x.quando))),
          h('p', { class: 'small muted' }, nomeDe(x.ator_id), x.nota ? ' · ' + x.nota : ''))))) : null,
      podeReg && opcoes().length ? h('div', { class: 'row', style: 'margin-top:12px' }, opcoes().map(([estado, rot]) => h('button', {
        class: 'btn sm', onclick: async () => {
          const v = await pedir({ title: rot, submitLabel: 'Registrar', fields: [{ name: 'nota', label: 'Observação', type: 'textarea', maxlength: 300, hint: estado === 'envio_tentado' ? 'Tentativa registrada. Sem confirmação, o caso NÃO pode ser concluído.' : null }] });
          if (!v) return;
          await agir(registrarEntrega({ solicitacao_id: id, modo: e.modo, estado, nota: v.nota, papeis: ctx.papeis, ator: ctx.ator }), 'Entrega atualizada.');
        },
      }, rot))) : null);
  }

  // ---------------------------------------------------------------- comunicações e tarefas
  function blocoComunicacoes() {
    if (!ctx.pode('comunicacao_ver')) return null;
    const podeReg = ctx.pode('comunicacao_registrar', 'editar');
    return h('section', { class: 'card' },
      h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h2', {}, 'Comunicações'),
        podeReg && h('button', { class: 'btn sm', onclick: novaComunicacao }, 'Registrar'),
      ),
      h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'O sistema não envia nada. Cada linha é o registro do que foi feito fora dele, com o resultado conhecido (ADR-006).'),
      d.comunicacoes.length ? h('ul', { class: 'tl' }, [...d.comunicacoes].reverse().map((c) => h('li', { class: c.tipo === 'contato_paciente' ? 'marco' : '' },
        h('div', { class: 'row between' },
          h('span', { class: 'row', style: 'gap:8px' }, h('b', { style: 'color:var(--text)' }, F.COM_TIPOS[c.tipo]), badge(F.RESULTADOS[c.resultado], F.CONTATO_EFETIVO.includes(c.resultado) ? 'ok' : c.resultado === 'registrada' ? 'dim' : 'warn')),
          h('span', { class: 'small muted' }, quando(c.criado_em))),
        h('p', { class: 'small muted' }, F.CANAIS[c.canal], ' · ', nomeDe(c.ator_id), c.destinatario ? ` → ${c.destinatario}` : ''),
        c.texto && h('p', { style: 'white-space:pre-wrap;margin-top:4px' }, c.texto)))) : h('p', { class: 'small muted' }, 'Nenhuma comunicação registrada.'));
  }

  function novaComunicacao() {
    formModal({
      title: 'Registrar comunicação',
      submitLabel: 'Registrar',
      fields: [
        { name: 'tipo', label: 'Tipo', type: 'select', value: 'contato_paciente', options: Object.entries(F.COM_TIPOS) },
        { name: 'canal', label: 'Canal', type: 'select', value: 'telefone', options: Object.entries(F.CANAIS) },
        { name: 'resultado', label: 'Resultado', type: 'select', value: 'falou', options: Object.entries(F.RESULTADOS), hint: 'Obrigatório no contato com o paciente: tentativa não é confirmação (RN-12).' },
        { name: 'texto', label: 'O que foi dito ou publicado', type: 'textarea', maxlength: 1000 },
      ],
      onSubmit: async (v) => {
        const r = await agir(registrarComunicacao({ solicitacao_id: id, destinatario: v.tipo === 'contato_paciente' ? d.paciente.nome : 'Grupo operacional', ...v, papeis: ctx.papeis, ator: ctx.ator }), 'Comunicação registrada.');
        return r ? undefined : false;
      },
    });
  }

  function blocoTarefas() {
    if (!ctx.pode('tarefa_ver')) return null;
    const pend = d.tarefas.filter((t) => t.estado === 'pendente');
    const feitas = d.tarefas.filter((t) => t.estado === 'concluida');
    const linha = (t, fim) => h('li', { class: 'row between' },
      h('span', {}, fim ? h('span', { class: 'small muted' }, t.titulo) : t.titulo,
        h('div', { class: 'small muted' }, PAPEIS[t.papel_responsavel] + (t.responsavel_id ? ' · ' + nomeDe(t.responsavel_id) : ''))),
      fim ? badge('concluída', 'dim')
        : h('button', { class: 'btn sm', onclick: () => agir(concluirTarefa({ id: t.id, ator: ctx.ator }), 'Tarefa concluída.') }, 'Concluir'));
    return h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:10px' }, 'Tarefas'),
      pend.length || feitas.length
        ? h('ul', { class: 'ul-list' }, pend.map((t) => linha(t, false)), feitas.map((t) => linha(t, true)))
        : h('p', { class: 'small muted' }, 'Nenhuma tarefa.'));
  }

  function blocoHistorico() {
    return h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:10px' }, 'Linha do tempo'),
      h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Append-only: reabertura e cancelamento não apagam nada (RN-15, RN-20).'),
      h('ul', { class: 'tl' }, [...d.eventos].reverse().map((e) => h('li', { class: F.ETAPAS_FIM.includes(e.para_etapa) ? 'marco' : '' },
        h('div', { class: 'row between' },
          h('b', { style: 'color:var(--text)' }, e.de_etapa ? `${F.ETAPAS[e.de_etapa]} → ${F.ETAPAS[e.para_etapa]}` : F.ETAPAS[e.para_etapa]),
          h('span', { class: 'small muted' }, quando(e.criado_em))),
        h('p', { class: 'small muted' }, nomeDe(e.ator_id), e.nota ? ' · ' + e.nota : '')))));
  }

  function montar() {
    return h('div', {},
      pageHead('Solicitação', `#${d.sol.protocolo}`, F.TIPOS[d.sol.tipo],
        h('a', { class: 'btn', href: ROOT + 'solicitacoes/' }, 'Voltar à lista')),
      blocoTrilha(),
      blocoProxima(),
      h('div', { class: 'paralelo' }, blocoResumo(), blocoProntuario()),
      h('div', { class: 'paralelo', style: 'margin-top:18px' }, blocoClinico(), blocoDocumentos()),
      h('div', { class: 'paralelo', style: 'margin-top:18px' }, blocoEntrega(), blocoTarefas()),
      h('div', { class: 'paralelo', style: 'margin-top:18px' }, blocoComunicacoes(), blocoHistorico()));
  }

  pintar();
});
