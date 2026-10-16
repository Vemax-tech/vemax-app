// VemaxCALL — central de solicitações: listagem com as colunas do item 6.2, busca, filtros,
// ordenação e paginação. É a tela onde a operação enxerga tudo de uma vez.
import * as F from '../fluxo.js';
import { listar, abrirSolicitacao, possivelDuplicidade, nomeDe, pacientePor, prontuarioPor } from '../dados.js';
import { start, h, run, pageHead, empty, badge, dataTable, filtros, contem, formModal, modal, fmtDate, qs, icon, desde, corEtapa, horasNa } from '../ui.js';

const ROOT = new URL('../../', import.meta.url).href;
const PRIO = { alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };

export const init = () => start('solicitacoes/', 'Solicitações', async (ctx, view) => {
  const canAbrir = ctx.pode('solicitacao_abrir', 'editar');
  const verPaciente = ctx.podeCompleto('paciente_identificacao');
  const [sols, pacientes, pronts, tarefas, coms, entregas, docs] = await Promise.all([
    run(listar('solicitacoes')), run(listar('pacientes')), run(listar('prontuarios')),
    run(listar('tarefas')), run(listar('comunicacoes')), run(listar('entregas')), run(listar('documentos')),
  ]);
  const lista = [...sols].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

  const f = { q: '', tipo: '', etapa: qs('etapa') || '', prio: '', papel: '', abertas: qs('etapa') ? '' : '1' };
  const st = { sort: 'etapa_desde', dir: 1, page: 0 };
  const body = h('div');

  const nomePac = (s) => pacientePor(s.paciente_id)?.nome || '—';
  const pacCell = (s) => (verPaciente ? nomePac(s) : h('span', { class: 'small muted' }, 'Paciente ' + (pacientePor(s.paciente_id)?.id || '').replace('pac-', '#')));
  const tarefasDe = (s) => tarefas.filter((t) => t.solicitacao_id === s.id && t.estado === 'pendente');
  const prontDe = (s) => prontuarioPor(s.prontuario_id);
  const ultimaCom = (s) => coms.filter((c) => c.solicitacao_id === s.id).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0];
  const entregaDe = (s) => entregas.find((e) => e.solicitacao_id === s.id);

  // ---------------------------------------------------------------- nova solicitação
  const campos = (tipo) => [
    { name: 'paciente_id', label: 'Paciente', type: 'select', required: true, options: [['', '— selecione —'], ...pacientes.map((p) => [p.id, `${p.nome} · nasc. ${fmtDate(p.nascimento)}`])] },
    { name: 'tipo', label: 'Tipo de solicitação', type: 'select', value: tipo, options: Object.entries(F.TIPOS), hint: 'Os dois fluxos são diferentes e não se transformam um no outro.' },
    { name: 'relato', label: 'Relato do paciente', type: 'textarea', required: true, maxlength: 2000, hint: 'O que o paciente disse. Só o necessário para a equipe resolver.' },
    { name: 'prioridade', label: 'Prioridade', type: 'select', value: 'normal', options: Object.entries(PRIO) },
  ];
  const nova = (tipo = 'duvida_correcao') => formModal({
    title: 'Registrar solicitação', submitLabel: 'Registrar', fields: campos(tipo),
    onSubmit: async (v) => {
      const dups = possivelDuplicidade(v);
      if (dups.length && !(await confirmaDuplicidade(dups))) return false;
      const r = await run(abrirSolicitacao({ ...v, papeis: ctx.papeis, ator: ctx.ator }), 'Solicitação registrada.');
      if (!r) return false;
      location.href = ROOT + `solicitacoes/detalhe.html?id=${r.id}`;
    },
  });
  /** RF-04: duplicidade provável avisa, mas não bloqueia solicitação legítima do mesmo paciente. */
  const confirmaDuplicidade = (dups) => new Promise((res) => {
    modal('Possível duplicidade', h('div', {},
      h('p', {}, 'Este paciente já tem solicitação aberta do mesmo tipo nas últimas 24 horas:'),
      h('ul', { class: 'ul-list', style: 'margin:12px 0' }, dups.map((d) => h('li', {},
        h('a', { class: 't', href: ROOT + `solicitacoes/detalhe.html?id=${d.id}` }, `#${d.protocolo}`), ' · ', F.ETAPAS[d.etapa], ' · aberta ', desde(d.criado_em)))),
      h('p', { class: 'small muted' }, 'Pode ser um pedido legítimo diferente. A decisão é sua — o sistema só avisa.')),
    (close) => h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { res(false); close(); } }, 'Ver a existente'),
      h('button', { class: 'btn primary', onclick: () => { res(true); close(); } }, 'Registrar mesmo assim')), () => res(false));
  });

  // ---------------------------------------------------------------- colunas (item 6.2)
  const cols = [
    { key: 'protocolo', label: 'Protocolo', sort: (s) => s.protocolo, render: (s) => h('span', {},
      h('a', { class: 't', href: ROOT + `solicitacoes/detalhe.html?id=${s.id}` }, '#' + s.protocolo),
      h('div', { class: 'small muted' }, F.TIPO_CURTO[s.tipo])) },
    { key: 'paciente', label: 'Paciente', sort: (s) => nomePac(s).toLowerCase(), render: pacCell },
    { key: 'etapa', label: 'Etapa atual', sort: (s) => Object.keys(F.ETAPAS).indexOf(s.etapa), render: (s) => badge(F.ETAPAS[s.etapa], corEtapa(s.etapa)) },
    { key: 'etapa_desde', label: 'Tempo na etapa', sort: (s) => -horasNa(s.etapa_desde), render: (s) => (F.aberta(s)
      ? h('span', { style: horasNa(s.etapa_desde) > 24 ? 'color:#ff9b8a' : null }, desde(s.etapa_desde))
      : h('span', { class: 'small muted' }, '—')) },
    { key: 'prox', label: 'Próxima ação de', sort: (s) => F.proximaAcao(s).papel || 'zz', render: (s) => {
      const p = F.proximaAcao(s);
      return p.papel ? badge(p.papel, 'dim') : h('span', { class: 'small muted' }, '—');
    } },
    { key: 'pend', label: 'Pendências', sort: (s) => -tarefasDe(s).length, render: (s) => {
      const n = tarefasDe(s).length, pr = prontDe(s);
      return h('span', { class: 'chips' },
        n ? badge(`${n} tarefa${n > 1 ? 's' : ''}`, 'warn') : null,
        F.prontuarioPendente(pr) ? badge('prontuário fora do arquivo', 'warn') : null,
        !n && !F.prontuarioPendente(pr) ? h('span', { class: 'small muted' }, '—') : null);
    } },
    { key: 'pront', label: 'Prontuário', sort: (s) => prontDe(s)?.local || '', render: (s) => {
      const pr = prontDe(s);
      return pr ? h('span', { class: 'small' }, F.LOCAIS[pr.local]) : h('span', { class: 'small muted' }, '—');
    } },
    { key: 'com', label: 'Comunicação', render: (s) => {
      const c = ultimaCom(s);
      if (!c) return h('span', { class: 'small muted' }, 'nenhuma');
      return h('span', { class: 'small' }, F.COM_TIPOS[c.tipo], h('div', { class: 'small muted' }, F.RESULTADOS[c.resultado]));
    } },
    { key: 'entrega', label: 'Entrega', render: (s) => {
      if (s.tipo !== 'pedido_receita') return h('span', { class: 'small muted' }, 'não se aplica');
      const e = entregaDe(s);
      if (!e) return h('span', { class: 'small muted' }, '—');
      const falta = !F.ENTREGA_TERMINAL.includes(e.estado);
      return h('span', { class: 'small', style: falta ? 'color:#ff9b8a' : null }, F.ENTREGA_ESTADOS[e.estado], h('div', { class: 'small muted' }, F.ENTREGA_MODOS[e.modo]));
    } },
    { key: 'prio', label: 'Prioridade', sort: (s) => ['alta', 'normal', 'baixa'].indexOf(s.prioridade), render: (s) => (s.prioridade === 'normal' ? h('span', { class: 'small muted' }, '—') : badge(PRIO[s.prioridade], s.prioridade === 'alta' ? 'warn' : 'dim')) },
    { key: 'criado', label: 'Aberta em', sort: (s) => s.criado_em, render: (s) => h('span', { class: 'small' }, fmtDate(s.criado_em), h('div', { class: 'small muted' }, nomeDe(s.aberta_por))) },
    { key: 'acao', label: '', render: (s) => h('a', { class: 'btn sm', href: ROOT + `solicitacoes/detalhe.html?id=${s.id}` }, 'Abrir') },
  ];

  function draw() {
    const shown = lista.filter((s) => (!f.abertas || F.aberta(s))
      && (!f.tipo || s.tipo === f.tipo)
      && (!f.etapa || s.etapa === f.etapa)
      && (!f.prio || s.prioridade === f.prio)
      && (!f.papel || F.proximaAcao(s).papel === f.papel)
      && contem([String(s.protocolo), s.relato, verPaciente ? nomePac(s) : '', F.TIPOS[s.tipo]], f.q));
    if (!shown.length) { body.replaceChildren(empty('Nenhuma solicitação com esses filtros.')); return; }
    body.replaceChildren(
      h('p', { class: 'small muted', style: 'margin-bottom:8px' }, `${shown.length} de ${lista.length} solicitações`),
      dataTable({ cols, rows: shown, state: st, size: 12, onState: draw, vazio: empty('Nada aqui'), rowClass: (s) => (F.aberta(s) && horasNa(s.etapa_desde) > 48 ? 'late' : null) }));
  }

  view.append(
    pageHead('Operação', 'Solicitações', 'Dúvida ou correção na receita e pedido de nova receita. Os dois fluxos convivem aqui, sem se misturar.',
      canAbrir && h('button', { class: 'btn', onclick: () => nova('duvida_correcao') }, icon('check'), 'Dúvida ou correção'),
      canAbrir && h('button', { class: 'btn primary', onclick: () => nova('pedido_receita') }, icon('file'), 'Pedido de receita')),
    !verPaciente && h('p', { class: 'sem-clinico', style: 'margin-bottom:14px' }, 'O seu papel vê o paciente de forma reduzida: o nome aparece só onde é necessário para a sua função.'),
    filtros([
      { tipo: 'busca', chave: 'q', placeholder: 'Buscar por protocolo, paciente ou relato…' },
      { tipo: 'select', chave: 'tipo', rotulo: 'Todos os tipos', opcoes: Object.entries(F.TIPOS) },
      { tipo: 'select', chave: 'etapa', rotulo: 'Todas as etapas', opcoes: Object.entries(F.ETAPAS) },
      { tipo: 'select', chave: 'papel', rotulo: 'Próxima ação de qualquer um', opcoes: [['Call Center', 'Call Center'], ['Arquivo', 'Arquivo'], ['Recepção', 'Recepção'], ['Médico', 'Médico']] },
      { tipo: 'select', chave: 'prio', rotulo: 'Todas as prioridades', opcoes: Object.entries(PRIO) },
      { tipo: 'select', chave: 'abertas', rotulo: 'Abertas e encerradas', opcoes: [['1', 'Só em aberto']] },
    ], f, draw),
    body);
  draw();
});
