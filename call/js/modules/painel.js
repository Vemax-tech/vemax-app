// VemaxCALL — visão geral operacional. Todos os números saem dos dados, nenhum é decorativo,
// e cada indicador mostra o critério de contagem (docs/vemaxcall/04-regras-negocio.md, 4.2).
import * as F from '../fluxo.js';
import { listar } from '../dados.js';
import { start, h, run, pageHead, badge, icon, desde, corEtapa, horasNa } from '../ui.js';
import { PAPEIS } from '../permissoes.js';

const ROOT = new URL('../../', import.meta.url).href;
const media = (ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null);
const horas = (n) => (n == null ? '—' : n < 24 ? `${Math.round(n)} h` : `${(n / 24).toFixed(1)} d`);

export const init = () => start('', 'Visão geral', async (ctx, view) => {
  const [sols, tarefas, pronts, docs, entregas] = await Promise.all([
    run(listar('solicitacoes')), run(listar('tarefas')), run(listar('prontuarios')),
    run(listar('documentos')), run(listar('entregas')),
  ]);
  const abertas = sols.filter(F.aberta);
  const emEtapa = (...e) => abertas.filter((s) => e.includes(s.etapa));
  const minimo = !ctx.podeCompleto('dashboard');   // Arquivo e Médico veem a versão reduzida

  // ---------- indicadores do item 6.1, com o critério à vista
  const kpi = (rot, n, criterio, filtro, perigo) => h('a', {
    class: 'card kpi' + (perigo && n ? ' warn' : ''), href: ROOT + 'solicitacoes/' + (filtro ? '?' + filtro : ''),
  }, h('span', { class: 'small' }, rot), h('b', {}, n), h('small', {}, criterio));

  const prontPendentes = pronts.filter((p) => p.local !== 'arquivo');
  const receitasProntas = emEtapa('retorno_disponivel').filter((s) => docs.some((d) => d.solicitacao_id === s.id && d.estado === 'emitido'));

  const principais = minimo
    ? [kpi('Aguardando prontuário', emEtapa('aguardando_prontuario', 'prontuario_em_transito').length, 'etapa aguardando ou em trânsito', 'etapa=aguardando_prontuario', true),
      kpi('Prontuários fora do arquivo', prontPendentes.length, 'custódia diferente de "no arquivo"', '', true),
      kpi('Aguardando médico', emEtapa('aguardando_medico', 'aguardando_esclarecimento').length, 'inclui pedidos de esclarecimento', 'etapa=aguardando_medico', false),
      kpi('Abertas', abertas.length, 'etapa não é concluída nem cancelada', '', false)]
    : [kpi('Solicitações abertas', abertas.length, 'etapa não é concluída nem cancelada', '', false),
      kpi('Em atendimento', abertas.filter((s) => !['aberta', 'em_triagem'].includes(s.etapa)).length, 'abertas que já saíram de "Aberta"', '', false),
      kpi('Aguardando prontuário', emEtapa('aguardando_prontuario', 'prontuario_em_transito').length, 'aguardando ou em trânsito', 'etapa=aguardando_prontuario', true),
      kpi('Aguardando Recepção', emEtapa('prontuario_na_recepcao', 'retorno_disponivel').length, 'conferir ou receber retorno', 'etapa=prontuario_na_recepcao', false),
      kpi('Aguardando médico', emEtapa('aguardando_medico', 'aguardando_esclarecimento').length, 'inclui esclarecimentos', 'etapa=aguardando_medico', true),
      kpi('Receitas prontas a comunicar', receitasProntas.length, 'retorno disponível com documento emitido', 'etapa=retorno_disponivel', false),
      kpi('Aguardando contato', emEtapa('aguardando_contato_paciente').length, 'paciente ainda não foi informado', 'etapa=aguardando_contato_paciente', false),
      kpi('Prontuários a devolver ou arquivar', prontPendentes.length, 'independe da etapa da solicitação', '', true)];

  // ---------- mais antigas na etapa (em vez de "atrasadas": sem meta definida, ver 12.11)
  const antigas = [...abertas].sort((a, b) => horasNa(b.etapa_desde) - horasNa(a.etapa_desde)).slice(0, 6);
  const listaAntigas = h('section', { class: 'card' },
    h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h2', {}, 'Mais tempo parado na etapa'),
      h('a', { class: 'btn sm', href: ROOT + 'solicitacoes/' }, 'Abrir')),
    h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Não existe indicador de "atrasada" ainda: as metas de prazo por etapa não foram definidas (pergunta 12.11). Até lá, mostramos o que é fato — o tempo parado.'),
    antigas.length ? h('ul', { class: 'ul-list' }, antigas.map((s) => h('li', { class: 'row between' },
      h('span', {}, h('a', { class: 't', href: ROOT + `solicitacoes/detalhe.html?id=${s.id}` }, `#${s.protocolo}`), ' ', h('span', { class: 'small muted' }, F.TIPO_CURTO[s.tipo])),
      h('span', { class: 'row', style: 'gap:6px' }, badge(F.ETAPAS[s.etapa], corEtapa(s.etapa)), h('span', { class: 'small muted' }, desde(s.etapa_desde)))))) : h('p', { class: 'small muted' }, 'Nada em aberto.'));

  // ---------- volume por tipo e por etapa
  const porTipo = Object.keys(F.TIPOS).map((t) => ({ t, n: sols.filter((s) => s.tipo === t).length, ab: abertas.filter((s) => s.tipo === t).length }));
  const barra = (n, total) => h('div', { style: 'height:6px;border-radius:999px;background:rgba(91,157,255,.12);overflow:hidden;margin-top:6px' },
    h('div', { style: `height:100%;width:${total ? Math.round((n / total) * 100) : 0}%;background:var(--grad)` }));
  const blocoTipo = h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:12px' }, 'Volume por tipo de solicitação'),
    porTipo.map(({ t, n, ab }) => h('div', { style: 'margin-bottom:14px' },
      h('div', { class: 'row between' }, h('span', {}, F.TIPOS[t]), h('b', {}, String(n))),
      barra(n, sols.length), h('p', { class: 'small muted', style: 'margin-top:4px' }, `${ab} em aberto`))));

  // ---------- pendências por papel (distribuição do trabalho)
  const pend = tarefas.filter((t) => t.estado === 'pendente');
  const blocoPapel = h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:12px' }, 'Pendências por equipe'),
    h('ul', { class: 'ul-list' }, ['callcenter', 'arquivo', 'recepcao', 'medico'].map((p) => {
      const n = pend.filter((t) => t.papel_responsavel === p).length;
      return h('li', { class: 'row between' }, h('span', {}, PAPEIS[p]), h('span', { class: 'row', style: 'gap:8px' }, n ? badge(`${n} pendente${n > 1 ? 's' : ''}`, n > 3 ? 'warn' : '') : badge('em dia', 'ok')));
    })));

  // ---------- tempos
  const concl = sols.filter((s) => s.concluida_em);
  const tConclusao = media(concl.map((s) => (new Date(s.concluida_em) - new Date(s.criado_em)) / 3600e3));
  const tEspera = media(abertas.map((s) => horasNa(s.etapa_desde)));
  const blocoTempo = h('section', { class: 'card' }, h('h2', { style: 'margin-bottom:12px' }, 'Tempos'),
    h('dl', { class: 'dl' },
      h('dt', {}, 'Tempo médio de conclusão'), h('dd', {}, horas(tConclusao), h('div', { class: 'small muted' }, `${concl.length} solicitações concluídas`)),
      h('dt', {}, 'Tempo médio na etapa atual'), h('dd', {}, horas(tEspera), h('div', { class: 'small muted' }, `${abertas.length} em aberto`)),
      h('dt', {}, 'Entregas sem confirmação'), h('dd', {}, String(entregas.filter((e) => !F.ENTREGA_TERMINAL.includes(e.estado) && e.estado !== 'nao_aplicavel').length),
        h('div', { class: 'small muted' }, 'inclui envio tentado: tentativa não é entrega'))));

  view.append(
    pageHead('VemaxCALL', `Olá, ${ctx.nome.split(' ')[0]}`, `Visão de ${PAPEIS[ctx.papeis[0]]}. ${minimo ? 'Indicadores reduzidos ao necessário para a sua função.' : 'Todos os números vêm dos registros, nenhum é ilustrativo.'}`),
    h('div', { class: 'grid g4', style: 'margin-bottom:18px' }, principais),
    h('div', { class: 'grid g2' }, listaAntigas, blocoPapel),
    h('div', { class: 'grid g2', style: 'margin-top:18px' }, blocoTipo, blocoTempo),
    h('p', { class: 'small muted', style: 'margin-top:24px' }, icon('clock'), ' Os critérios de contagem de cada indicador estão escritos em docs/vemaxcall/04-regras-negocio.md, seção 4.2.'),
  );
});
