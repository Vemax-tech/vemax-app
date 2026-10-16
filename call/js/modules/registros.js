// VemaxCALL — documentos, comunicações e entregas vistos de fora de uma solicitação (itens 6.7 e 6.8).
// Serve para a coordenação enxergar padrões: o que ficou sem confirmação, o que falhou, o que foi reenviado.
import * as F from '../fluxo.js';
import { listar, nomeDe, auditarLeitura } from '../dados.js';
import { start, h, run, pageHead, empty, badge, dataTable, filtros, contem, tabs, modal, qs, icon, desde } from '../ui.js';

const ROOT = new URL('../../', import.meta.url).href;
const quando = (iso) => new Date(iso).toLocaleString('pt-BR');

export const init = () => start('registros/', 'Documentos e comunicações', async (ctx, view) => {
  const [sols, docs, coms, entregas] = await Promise.all([
    run(listar('solicitacoes')), run(listar('documentos')), run(listar('comunicacoes')), run(listar('entregas')),
  ]);
  const aba = qs('aba') || 'comunicacoes';
  const solDe = (id) => sols.find((s) => s.id === id);
  const prot = (id) => '#' + (solDe(id)?.protocolo ?? '?');
  const linkSol = (id) => h('a', { class: 't', href: ROOT + `solicitacoes/detalhe.html?id=${id}` }, prot(id));

  const body = h('div');
  const f = { q: '', tipo: '', resultado: '', estado: '', modo: '' };
  const st = { sort: 'quando', dir: -1, page: 0 };

  // ---------------------------------------------------------------- comunicações
  const colsCom = [
    { key: 'sol', label: 'Solicitação', sort: (c) => solDe(c.solicitacao_id)?.protocolo, render: (c) => h('span', {}, linkSol(c.solicitacao_id), h('div', { class: 'small muted' }, F.TIPO_CURTO[solDe(c.solicitacao_id)?.tipo] || '')) },
    { key: 'tipo', label: 'Tipo', sort: (c) => c.tipo, render: (c) => F.COM_TIPOS[c.tipo] },
    { key: 'canal', label: 'Canal', sort: (c) => c.canal, render: (c) => h('span', { class: 'small' }, F.CANAIS[c.canal]) },
    { key: 'dest', label: 'Destinatário', render: (c) => h('span', { class: 'small' }, c.destinatario || '—') },
    { key: 'res', label: 'Resultado', sort: (c) => c.resultado, render: (c) => badge(F.RESULTADOS[c.resultado], F.CONTATO_EFETIVO.includes(c.resultado) ? 'ok' : c.resultado === 'registrada' ? 'dim' : 'warn') },
    { key: 'quem', label: 'Registrado por', sort: (c) => nomeDe(c.ator_id), render: (c) => h('span', { class: 'small' }, nomeDe(c.ator_id)) },
    { key: 'quando', label: 'Quando', sort: (c) => c.criado_em, render: (c) => h('span', { class: 'small' }, quando(c.criado_em), h('div', { class: 'small muted' }, desde(c.criado_em))) },
  ];

  // ---------------------------------------------------------------- documentos
  const podeAbrir = ctx.pode('documento_abrir');
  function abrirDoc(doc) {
    auditarLeitura(ctx.papeis, 'documento', doc.solicitacao_id, ctx.ator);
    modal(doc.nome, h('div', {},
      h('p', {}, 'Na demonstração não existe arquivo: nenhum documento clínico real foi criado aqui.'),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Em produção o arquivo fica em bucket privado e a abertura passa por uma função do banco que confere a permissão, emite URL assinada de curta duração e grava a leitura na auditoria (ADR-005).')),
    (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
  }
  const colsDoc = [
    { key: 'sol', label: 'Solicitação', sort: (x) => solDe(x.solicitacao_id)?.protocolo, render: (x) => linkSol(x.solicitacao_id) },
    { key: 'nome', label: 'Documento', sort: (x) => x.nome, render: (x) => h('span', {}, x.nome, h('div', { class: 'small muted' }, `versão ${x.versao}${x.substitui_id ? ' · substitui a anterior' : ''}`)) },
    { key: 'estado', label: 'Estado', sort: (x) => x.estado, render: (x) => badge(F.DOC_ESTADOS[x.estado], x.estado === 'emitido' ? 'ok' : 'dim') },
    { key: 'quem', label: 'Emitido por', sort: (x) => nomeDe(x.emitido_por), render: (x) => h('span', { class: 'small' }, nomeDe(x.emitido_por)) },
    { key: 'quando', label: 'Quando', sort: (x) => x.criado_em, render: (x) => h('span', { class: 'small' }, quando(x.criado_em)) },
    { key: 'a', label: '', render: (x) => (podeAbrir ? h('button', { class: 'btn sm', onclick: () => abrirDoc(x) }, 'Abrir') : h('span', { class: 'small muted' }, 'sem permissão')) },
  ];

  // ---------------------------------------------------------------- entregas
  const colsEnt = [
    { key: 'sol', label: 'Solicitação', sort: (e) => solDe(e.solicitacao_id)?.protocolo, render: (e) => linkSol(e.solicitacao_id) },
    { key: 'modo', label: 'Forma', sort: (e) => e.modo, render: (e) => F.ENTREGA_MODOS[e.modo] },
    { key: 'estado', label: 'Estado', sort: (e) => e.estado, render: (e) => badge(F.ENTREGA_ESTADOS[e.estado], F.ENTREGA_TERMINAL.includes(e.estado) ? 'ok' : e.estado === 'falha' ? 'warn' : 'warn') },
    { key: 'conf', label: 'Confirmada?', render: (e) => (F.ENTREGA_TERMINAL.includes(e.estado) ? badge('sim', 'ok') : h('span', { class: 'small', style: 'color:#ff9b8a' }, e.estado === 'envio_tentado' ? 'não — só tentativa' : 'não')) },
    { key: 'passos', label: 'Histórico', render: (e) => h('span', { class: 'small muted' }, e.historico.map((x) => F.ENTREGA_ESTADOS[x.estado]).join(' → ')) },
    { key: 'quando', label: 'Último registro', sort: (e) => e.historico[e.historico.length - 1]?.quando || '', render: (e) => { const u = e.historico[e.historico.length - 1]; return u ? h('span', { class: 'small' }, quando(u.quando), h('div', { class: 'small muted' }, nomeDe(u.ator_id))) : '—'; } },
  ];

  function draw() {
    if (aba === 'comunicacoes') {
      const shown = coms.filter((c) => (!f.tipo || c.tipo === f.tipo) && (!f.resultado || c.resultado === f.resultado)
        && contem([String(solDe(c.solicitacao_id)?.protocolo || ''), c.texto, c.destinatario, F.COM_TIPOS[c.tipo]], f.q));
      body.replaceChildren(
        h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Nenhuma destas mensagens foi enviada pelo sistema. Cada linha é o registro do que a equipe fez fora dele, com o resultado conhecido (ADR-006).'),
        filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar…' },
          { tipo: 'select', chave: 'tipo', rotulo: 'Todos os tipos', opcoes: Object.entries(F.COM_TIPOS) },
          { tipo: 'select', chave: 'resultado', rotulo: 'Todos os resultados', opcoes: Object.entries(F.RESULTADOS) }], f, draw),
        shown.length ? dataTable({ cols: colsCom, rows: shown, state: st, size: 14, onState: draw, vazio: empty('Nada') }) : empty('Nenhuma comunicação com esses filtros.'));
      return;
    }
    if (aba === 'documentos') {
      const shown = docs.filter((x) => (!f.estado || x.estado === f.estado) && contem([x.nome, String(solDe(x.solicitacao_id)?.protocolo || '')], f.q));
      body.replaceChildren(
        h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Correção de receita gera nova versão; a anterior fica como substituída e continua existindo (RN-15).'),
        filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar…' },
          { tipo: 'select', chave: 'estado', rotulo: 'Todos os estados', opcoes: Object.entries(F.DOC_ESTADOS) }], f, draw),
        shown.length ? dataTable({ cols: colsDoc, rows: shown, state: st, size: 14, onState: draw, vazio: empty('Nada') }) : empty('Nenhum documento com esses filtros.'));
      return;
    }
    const shown = entregas.filter((e) => (!f.modo || e.modo === f.modo) && (!f.estado || e.estado === f.estado)
      && contem([String(solDe(e.solicitacao_id)?.protocolo || '')], f.q));
    const semConf = entregas.filter((e) => !F.ENTREGA_TERMINAL.includes(e.estado) && e.estado !== 'nao_aplicavel').length;
    body.replaceChildren(
      semConf ? h('p', { class: 'small', style: 'margin-bottom:10px;color:#fbd34d' }, icon('alert'), ` ${semConf} entrega(s) sem confirmação. Envio tentado não é entrega e não permite concluir o caso (RN-13).`) : null,
      filtros([{ tipo: 'busca', chave: 'q', placeholder: 'Buscar por protocolo…' },
        { tipo: 'select', chave: 'modo', rotulo: 'Física e digital', opcoes: Object.entries(F.ENTREGA_MODOS) },
        { tipo: 'select', chave: 'estado', rotulo: 'Todos os estados', opcoes: Object.entries(F.ENTREGA_ESTADOS) }], f, draw),
      shown.length ? dataTable({ cols: colsEnt, rows: shown, state: st, size: 14, onState: draw, vazio: empty('Nada') }) : empty('Nenhuma entrega com esses filtros.'));
  }

  view.append(
    pageHead('Operação', 'Documentos e comunicações', 'Canal, horário, responsável, destinatário e resultado de cada registro.'),
    tabs([['?aba=comunicacoes', `Comunicações (${coms.length})`], ['?aba=documentos', `Documentos (${docs.length})`], ['?aba=entregas', `Entregas (${entregas.length})`]], '?aba=' + aba),
    h('div', { style: 'margin-top:16px' }, body));
  draw();
});
