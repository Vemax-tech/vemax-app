// VemaxCALL — relatórios do item 6.9. Agregados, sem conteúdo clínico e sem dado pessoal:
// a exportação sai com protocolo, não com nome de paciente.
import * as F from '../fluxo.js';
import { listar } from '../dados.js';
import { start, h, run, pageHead, badge, sec, baixarCsv, icon } from '../ui.js';
import { PAPEIS } from '../permissoes.js';

const media = (ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null);
const horas = (n) => (n == null ? '—' : n < 24 ? `${Math.round(n)} h` : `${(n / 24).toFixed(1)} d`);
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);

export const init = () => start('relatorios/', 'Relatórios', async (ctx, view) => {
  const [sols, eventos, tarefas, pronts, movimentos, entregas, coms] = await Promise.all([
    run(listar('solicitacoes')), run(listar('eventos')), run(listar('tarefas')),
    run(listar('prontuarios')), run(listar('movimentos')), run(listar('entregas')), run(listar('comunicacoes')),
  ]);
  const abertas = sols.filter(F.aberta);

  // ---------- tempo por etapa: diferença entre eventos consecutivos da mesma solicitação
  const porEtapa = {};
  for (const s of sols) {
    const evs = eventos.filter((e) => e.solicitacao_id === s.id).sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    for (let i = 0; i < evs.length; i++) {
      const fim = evs[i + 1] ? new Date(evs[i + 1].criado_em) : (F.aberta(s) ? new Date() : null);
      if (!fim) continue;
      const et = evs[i].para_etapa;
      const hs = (fim - new Date(evs[i].criado_em)) / 3600e3;
      (porEtapa[et] ||= []).push(hs);
    }
  }
  const linhasEtapa = Object.keys(F.ETAPAS).filter((e) => porEtapa[e]?.length).map((e) => ({
    etapa: e, rotulo: F.ETAPAS[e], n: porEtapa[e].length,
    medio: media(porEtapa[e]), max: Math.max(...porEtapa[e]),
  }));
  const maiorMedio = Math.max(...linhasEtapa.map((l) => l.medio), 1);

  const barra = (v, max, cor) => h('div', { style: 'height:8px;border-radius:999px;background:rgba(91,157,255,.1);overflow:hidden' },
    h('div', { style: `height:100%;width:${Math.max(2, pct(v, max))}%;background:${cor || 'var(--grad)'}` }));

  const tabelaEtapas = h('div', { class: 'tw' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Etapa'), h('th', {}, 'Passagens'), h('th', {}, 'Tempo médio'), h('th', {}, 'Maior tempo'), h('th', {}, ''))),
    h('tbody', {}, linhasEtapa.map((l) => h('tr', {},
      h('td', {}, l.rotulo), h('td', {}, String(l.n)), h('td', {}, horas(l.medio)), h('td', {}, horas(l.max)),
      h('td', { style: 'min-width:140px' }, barra(l.medio, maiorMedio)))))));

  // ---------- tempo até a resposta médica e até o primeiro atendimento
  const ate = (s, etapaAlvo) => {
    const e = eventos.find((x) => x.solicitacao_id === s.id && x.para_etapa === etapaAlvo);
    return e ? (new Date(e.criado_em) - new Date(s.criado_em)) / 3600e3 : null;
  };
  const tPrimeiro = media(sols.map((s) => ate(s, 'aguardando_prontuario')).filter((x) => x != null));
  const tMedico = media(sols.map((s) => ate(s, 'retorno_disponivel')).filter((x) => x != null));
  const tConclusao = media(sols.filter((s) => s.concluida_em).map((s) => (new Date(s.concluida_em) - new Date(s.criado_em)) / 3600e3));
  const reabertas = sols.filter((s) => s.reaberturas > 0);

  // ---------- entregas
  const entTotal = entregas.length;
  const entConf = entregas.filter((e) => F.ENTREGA_TERMINAL.includes(e.estado)).length;

  // ---------- movimentações de prontuário
  const movPorTipo = Object.keys(F.MOVIMENTOS).map((t) => ({ t, n: movimentos.filter((m) => m.tipo === t).length })).filter((x) => x.n);
  const foraDoArquivo = pronts.filter((p) => p.local !== 'arquivo');

  // ---------- exportação: protocolo, nunca nome de paciente
  const exportar = () => baixarCsv('vemaxcall-solicitacoes.csv', [
    { label: 'Protocolo', val: (s) => s.protocolo },
    { label: 'Tipo', val: (s) => F.TIPOS[s.tipo] },
    { label: 'Etapa', val: (s) => F.ETAPAS[s.etapa] },
    { label: 'Prioridade', val: (s) => s.prioridade },
    { label: 'Aberta em', val: (s) => new Date(s.criado_em).toLocaleString('pt-BR') },
    { label: 'Concluida em', val: (s) => (s.concluida_em ? new Date(s.concluida_em).toLocaleString('pt-BR') : '') },
    { label: 'Horas ate concluir', val: (s) => (s.concluida_em ? Math.round((new Date(s.concluida_em) - new Date(s.criado_em)) / 3600e3) : '') },
    { label: 'Desfecho', val: (s) => (s.desfecho ? F.DESFECHOS[s.desfecho] : '') },
    { label: 'Reaberturas', val: (s) => s.reaberturas },
  ], sols);

  view.append(
    pageHead('Análise', 'Relatórios', 'Agregados por etapa, equipe e entrega. Sem conteúdo clínico e sem dado pessoal — a exportação identifica por protocolo.',
      h('button', { class: 'btn', onclick: exportar }, icon('chart'), 'Exportar CSV')),

    h('div', { class: 'grid g4', style: 'margin-bottom:20px' },
      h('div', { class: 'card kpi' }, h('span', { class: 'small' }, 'Tempo até pedir o prontuário'), h('b', {}, horas(tPrimeiro)), h('small', {}, 'da abertura ao pedido no grupo')),
      h('div', { class: 'card kpi' }, h('span', { class: 'small' }, 'Tempo até a resposta médica'), h('b', {}, horas(tMedico)), h('small', {}, 'da abertura ao retorno disponível')),
      h('div', { class: 'card kpi' }, h('span', { class: 'small' }, 'Tempo até concluir'), h('b', {}, horas(tConclusao)), h('small', {}, `${sols.filter((s) => s.concluida_em).length} concluídas`)),
      h('div', { class: 'card kpi' + (reabertas.length ? ' warn' : '') }, h('span', { class: 'small' }, 'Retrabalho'), h('b', {}, String(reabertas.length)), h('small', {}, 'solicitações reabertas'))),

    sec('Tempo por etapa', h('section', { class: 'card' },
      h('p', { class: 'small muted', style: 'margin-bottom:12px' }, 'Calculado pela diferença entre eventos consecutivos da linha do tempo. Etapas em aberto contam até agora.'),
      tabelaEtapas)),

    sec('Pendências por equipe', h('div', { class: 'grid g2' },
      h('section', { class: 'card' },
        h('h3', { style: 'margin-bottom:12px' }, 'Tarefas pendentes'),
        h('ul', { class: 'ul-list' }, ['callcenter', 'arquivo', 'recepcao', 'medico'].map((p) => {
          const n = tarefas.filter((t) => t.papel_responsavel === p && t.estado === 'pendente').length;
          const tot = tarefas.filter((t) => t.papel_responsavel === p).length;
          return h('li', {}, h('div', { class: 'row between' }, h('span', {}, PAPEIS[p]), h('b', {}, `${n} de ${tot}`)), barra(n, Math.max(tot, 1)));
        }))),
      h('section', { class: 'card' },
        h('h3', { style: 'margin-bottom:12px' }, 'Onde o trabalho está parado'),
        h('ul', { class: 'ul-list' }, Object.entries(F.ETAPAS).map(([e, rot]) => {
          const n = abertas.filter((s) => s.etapa === e).length;
          return n ? h('li', { class: 'row between' }, h('span', {}, rot), badge(String(n), n > 2 ? 'warn' : 'dim')) : null;
        }).filter(Boolean))))),

    sec('Situação das entregas', h('div', { class: 'grid g2' },
      h('section', { class: 'card' },
        h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h3', {}, 'Confirmadas'), h('b', {}, `${entConf} de ${entTotal}`)),
        barra(entConf, Math.max(entTotal, 1), 'var(--ok)'),
        h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Só contam estados terminais reais: enviado (com confirmação) e retirada confirmada. Envio tentado não entra.')),
      h('section', { class: 'card' },
        h('h3', { style: 'margin-bottom:12px' }, 'Por estado'),
        h('ul', { class: 'ul-list' }, Object.entries(F.ENTREGA_ESTADOS).map(([k, rot]) => {
          const n = entregas.filter((e) => e.estado === k).length;
          return n ? h('li', { class: 'row between' }, h('span', {}, rot), badge(String(n), F.ENTREGA_TERMINAL.includes(k) ? 'ok' : 'warn')) : null;
        }).filter(Boolean))))),

    sec('Movimentações de prontuário', h('div', { class: 'grid g2' },
      h('section', { class: 'card' },
        h('h3', { style: 'margin-bottom:12px' }, 'Por tipo de movimento'),
        h('ul', { class: 'ul-list' }, movPorTipo.map((m) => h('li', { class: 'row between' }, h('span', {}, F.MOVIMENTOS[m.t]), h('b', {}, String(m.n)))))),
      h('section', { class: 'card' + (foraDoArquivo.length ? ' warn' : '') },
        h('h3', { style: 'margin-bottom:12px' }, 'Fora do arquivo agora'),
        foraDoArquivo.length
          ? h('ul', { class: 'ul-list' }, foraDoArquivo.map((p) => h('li', { class: 'row between' }, h('span', {}, p.codigo), badge(F.LOCAIS[p.local], 'warn'))))
          : h('p', { class: 'small muted' }, 'Todos arquivados.'),
        h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Pendência administrativa, independente do atendimento (RF-17).')))),

    h('p', { class: 'small muted', style: 'margin-top:24px' }, 'Faltam os indicadores que dependem de meta de prazo — "solicitações atrasadas" e cumprimento de SLA. As metas por etapa não foram definidas (pergunta 12.11); sem elas, qualquer número de atraso seria inventado.'),
  );
});
