// VemaxCALL — gestão de prontuários (item 6.6): onde cada um está, com quem, por qual solicitação,
// e o histórico completo de movimentações. O conteúdo clínico NÃO vive aqui: o prontuário é físico.
import * as F from '../fluxo.js';
import { listar, pacientePor, nomeDe } from '../dados.js';
import { start, h, run, pageHead, empty, badge, dataTable, filtros, contem, modal, icon, desde } from '../ui.js';

const ROOT = new URL('../../', import.meta.url).href;
const quando = (iso) => new Date(iso).toLocaleString('pt-BR');

export const init = () => start('prontuarios/', 'Prontuários', async (ctx, view) => {
  const [pronts, movimentos, sols] = await Promise.all([
    run(listar('prontuarios')), run(listar('movimentos')), run(listar('solicitacoes')),
  ]);
  const verPac = ctx.podeCompleto('paciente_identificacao') || ctx.pode('paciente_identificacao');
  const f = { q: '', local: '', fora: '' };
  const st = { sort: 'local', dir: 1, page: 0 };
  const body = h('div');

  const histDe = (p) => movimentos.filter((m) => m.prontuario_id === p.id).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  const solDe = (p) => (p.solicitacao_id ? sols.find((s) => s.id === p.solicitacao_id) : null);
  const ultimo = (p) => histDe(p)[0];

  function abrir(p) {
    const pac = pacientePor(p.paciente_id);
    const sol = solDe(p);
    modal(`Prontuário ${p.codigo}`, h('div', {},
      h('dl', { class: 'dl' },
        h('dt', {}, 'Paciente'), h('dd', {}, verPac && pac ? pac.nome : h('span', { class: 'small muted' }, 'reduzido para o seu papel')),
        h('dt', {}, 'Onde está'), h('dd', {}, badge(F.LOCAIS[p.local], p.local === 'arquivo' ? 'ok' : 'warn')),
        h('dt', {}, 'Custódia'), h('dd', {}, nomeDe(p.custodia_usuario_id)),
        h('dt', {}, 'Local no arquivo'), h('dd', {}, 'estante ' + p.local_arquivo),
        h('dt', {}, 'Solicitação associada'), h('dd', {}, sol ? h('a', { class: 't', href: ROOT + `solicitacoes/detalhe.html?id=${sol.id}` }, `#${sol.protocolo} · ${F.ETAPAS[sol.etapa]}`) : 'nenhuma')),
      h('h3', { style: 'margin:16px 0 8px' }, 'Histórico de movimentações'),
      h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Append-only: nada é editado nem apagado (RN-07).'),
      histDe(p).length ? h('ul', { class: 'tl' }, histDe(p).map((m) => h('li', { class: ['arquivado', 'nao_localizado'].includes(m.tipo) ? 'marco' : '' },
        h('div', { class: 'row between' }, h('b', { style: 'color:var(--text)' }, F.MOVIMENTOS[m.tipo]), h('span', { class: 'small muted' }, quando(m.criado_em))),
        h('p', { class: 'small muted' }, nomeDe(m.ator_id), m.nota ? ' · ' + m.nota : '')))) : h('p', { class: 'small muted' }, 'Sem movimentação.')),
    (close) => h('div', { class: 'row' },
      sol && h('a', { class: 'btn primary', href: ROOT + `solicitacoes/detalhe.html?id=${sol.id}` }, 'Abrir a solicitação'),
      h('button', { class: 'btn', onclick: close }, 'Fechar')));
    [...document.querySelectorAll('.ov .modal')].pop()?.classList.add('wide');
  }

  const cols = [
    { key: 'codigo', label: 'Prontuário', sort: (p) => p.codigo, render: (p) => h('span', {},
      h('a', { class: 't', href: '#', onclick: (e) => { e.preventDefault(); abrir(p); } }, p.codigo),
      h('div', { class: 'small muted' }, 'estante ' + p.local_arquivo)) },
    { key: 'paciente', label: 'Paciente', sort: (p) => (pacientePor(p.paciente_id)?.nome || '').toLowerCase(), render: (p) => (verPac ? pacientePor(p.paciente_id)?.nome || '—' : h('span', { class: 'small muted' }, 'reduzido')) },
    { key: 'local', label: 'Onde está', sort: (p) => Object.keys(F.LOCAIS).indexOf(p.local), render: (p) => badge(F.LOCAIS[p.local], p.local === 'arquivo' ? 'ok' : p.local === 'nao_localizado' ? 'warn' : 'warn') },
    { key: 'custodia', label: 'Com quem', sort: (p) => nomeDe(p.custodia_usuario_id), render: (p) => nomeDe(p.custodia_usuario_id) },
    { key: 'sol', label: 'Solicitação', render: (p) => { const s = solDe(p); return s ? h('a', { class: 't', href: ROOT + `solicitacoes/detalhe.html?id=${s.id}` }, '#' + s.protocolo) : h('span', { class: 'small muted' }, '—'); } },
    { key: 'ult', label: 'Última movimentação', sort: (p) => ultimo(p)?.criado_em || '', render: (p) => { const m = ultimo(p); return m ? h('span', { class: 'small' }, F.MOVIMENTOS[m.tipo], h('div', { class: 'small muted' }, desde(m.criado_em))) : h('span', { class: 'small muted' }, '—'); } },
    { key: 'a', label: '', render: (p) => h('button', { class: 'btn sm', onclick: () => abrir(p) }, 'Histórico') },
  ];

  function draw() {
    const shown = pronts.filter((p) => (!f.local || p.local === f.local)
      && (!f.fora || p.local !== 'arquivo')
      && contem([p.codigo, p.local_arquivo, verPac ? pacientePor(p.paciente_id)?.nome || '' : ''], f.q));
    body.replaceChildren(shown.length
      ? dataTable({ cols, rows: shown, state: st, size: 12, onState: draw, vazio: empty('Nada aqui'), rowClass: (p) => (p.local === 'nao_localizado' ? 'late' : null) })
      : empty('Nenhum prontuário com esses filtros.'));
  }

  const fora = pronts.filter((p) => p.local !== 'arquivo').length;
  view.append(
    pageHead('Operação', 'Prontuários', 'O VemaxCALL controla onde o prontuário físico está e quem está com ele. O conteúdo clínico continua no papel — o sistema só o referencia.'),
    h('div', { class: 'grid g4', style: 'margin-bottom:18px' },
      ...Object.keys(F.LOCAIS).filter((l) => l !== 'nao_localizado').map((l) => {
        const n = pronts.filter((p) => p.local === l).length;
        return h('button', { class: 'card kpi' + (l !== 'arquivo' && n ? ' warn' : '') + (f.local === l ? ' on' : ''), onclick: () => { f.local = f.local === l ? '' : l; f.fora = ''; draw(); } },
          h('span', { class: 'small' }, F.LOCAIS[l]), h('b', {}, String(n)));
      })),
    fora ? h('p', { class: 'small', style: 'margin-bottom:14px;color:#fbd34d' }, icon('alert'), ` ${fora} prontuário(s) fora do arquivo. Esta pendência é independente da etapa da solicitação: o atendimento pode estar concluído e o arquivamento ainda pendente (RF-17).`) : null,
    filtros([
      { tipo: 'busca', chave: 'q', placeholder: 'Buscar por código, paciente ou estante…' },
      { tipo: 'select', chave: 'local', rotulo: 'Qualquer lugar', opcoes: Object.entries(F.LOCAIS) },
      { tipo: 'select', chave: 'fora', rotulo: 'Todos', opcoes: [['1', 'Só os que estão fora do arquivo']] },
    ], f, draw),
    body);
  draw();
});
