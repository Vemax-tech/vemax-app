// Teste de fumaça do VemaxCALL: renderiza cada tela com cada papel e exercita os dois fluxos
// de ponta a ponta, verificando as regras que o pedido chama de obrigatórias.
// Roda em jsdom, sobre a camada de dados em memória (call/js/dados.js) — nenhuma rede, nenhum banco.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const falhas = [], erros = [];
const check = (c, m) => { if (!c) { falhas.push(m); console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const origErr = console.error;
console.error = (...a) => { erros.push(a.map(String).join(' ')); origErr('  [console.error]', ...a.map((x) => (x?.message ? x.message : String(x)).slice(0, 200))); };
process.on('unhandledRejection', (e) => { erros.push('unhandled: ' + (e?.stack || e)); origErr('UNHANDLED', e?.stack || e); });

// ---------------------------------------------------------------- ambiente
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) erros.push('jsdom: ' + e.message); });
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://exemplo.test/call/', virtualConsole: vc, pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'location', 'Element', 'Node', 'HTMLElement', 'Event', 'CustomEvent', 'getComputedStyle', 'URLSearchParams', 'Blob', 'URL']) {
  if (!(k in globalThis) || k === 'location' || k === 'document' || k === 'window' || k === 'navigator') {
    Object.defineProperty(globalThis, k, { value: dom.window[k], writable: true, configurable: true });
  }
}
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.localStorage = dom.window.localStorage;
dom.window.URL.createObjectURL = () => 'blob:fake';
dom.window.URL.revokeObjectURL = () => {};

const mod = (f) => import(pathToFileURL(path.join(REPO, 'call/js', f)).href);
const F = await mod('fluxo.js');
const P = await mod('permissoes.js');
const D = await mod('dados.js');
const papelMod = await mod('papel.js');

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const body = () => dom.window.document.getElementById('app').textContent;
const trocarPapel = (p) => { papelMod.definirPapel(p); };
const abrirTela = async (arquivo, fn = 'init', query = '') => {
  dom.window.document.getElementById('app').replaceChildren();
  dom.window.history.replaceState({}, '', '/call/' + query);
  const m = await import(pathToFileURL(path.join(REPO, 'call/js/modules', arquivo)).href + '?t=' + Math.random());
  await m[fn]();
  await wait(60);
};

// ================================================================ 1. telas por papel
console.log('\n## Telas renderizam para cada papel');
const TELAS = [['painel.js', 'init'], ['filas.js', 'init'], ['solicitacoes.js', 'init'], ['prontuarios.js', 'init'], ['registros.js', 'init'], ['relatorios.js', 'init'], ['permissoes.js', 'init']];
for (const papel of Object.keys(P.PAPEIS)) {
  trocarPapel(papel);
  for (const [arq, fn] of TELAS) {
    await abrirTela(arq, fn);
    const t = body();
    check(t.length > 100, `${P.PAPEIS[papel]} · ${arq.replace('.js', '')} renderizou (${t.length} caracteres)`);
  }
}

// ================================================================ 2. seed consistente
console.log('\n## Dados de exemplo');
const { data: sols } = await D.listar('solicitacoes');
check(sols.length >= 15, `${sols.length} solicitações semeadas`);
const etapasUsadas = new Set(sols.map((s) => s.etapa));
check(etapasUsadas.size >= 7, `cobrem ${etapasUsadas.size} etapas diferentes`);
check(sols.some((s) => s.tipo === 'duvida_correcao') && sols.some((s) => s.tipo === 'pedido_receita'), 'os dois fluxos estão representados');
const { data: pronts } = await D.listar('prontuarios');
check(pronts.some((p) => p.local !== 'arquivo'), 'há prontuário fora do arquivo (pendência paralela visível)');
const { data: docs } = await D.listar('documentos');
check(docs.some((d) => d.versao === 2 && d.substitui_id), 'há receita corrigida em 2ª versão, com a 1ª preservada');
check(docs.filter((d) => d.estado === 'substituido').length >= 1, 'a versão anterior ficou marcada como substituída');

// ================================================================ 3. permissões (RN-05, RN-11, RN-18)
console.log('\n## Permissões: cada papel só faz o que é dele');
const alvo = sols.find((s) => s.etapa === 'aguardando_medico');
check(Boolean(alvo), 'existe um caso aguardando médico para testar');
let r = await D.registrarAvaliacao({ solicitacao_id: alvo.id, desfecho: 'respondido', conteudo_clinico: 'x', papeis: ['recepcao'], ator: 'u-re1' });
check(r.error?.code === '42501', 'Recepção NÃO registra decisão clínica (RN-11)');
r = await D.registrarAvaliacao({ solicitacao_id: alvo.id, desfecho: 'respondido', conteudo_clinico: 'x', papeis: ['callcenter'], ator: 'u-cc1' });
check(r.error?.code === '42501', 'Call Center NÃO registra decisão clínica (RN-11)');
const outroMedico = alvo.medico_id === 'u-me1' ? 'u-me2' : 'u-me1';
r = await D.registrarAvaliacao({ solicitacao_id: alvo.id, desfecho: 'respondido', conteudo_clinico: 'x', papeis: ['medico'], ator: outroMedico });
check(r.error?.code === '42501', 'médico diferente do encaminhado é recusado (RN-10)');
check(!P.pode(['callcenter'], 'avaliacao_conteudo'), 'Call Center não lê conteúdo clínico (RN-18)');
check(!P.pode(['admin_empresa'], 'avaliacao_conteudo'), 'administrador da clínica não lê conteúdo clínico por ser admin');
check(!P.pode(['admin_tecnico'], 'avaliacao_conteudo'), 'suporte técnico da VEMAX não lê conteúdo clínico por padrão');
check(P.pode(['medico'], 'avaliacao_conteudo'), 'médico lê o conteúdo clínico');
check(!P.pode(['arquivo'], 'documento_abrir'), 'arquivo não abre documento clínico');

// ================================================================ 4. custódia do prontuário
console.log('\n## Prontuário: custódia e confirmação de recebimento');
const emTransito = sols.find((s) => s.etapa === 'prontuario_em_transito');
if (emTransito) {
  r = await D.moverProntuario({ prontuario_id: emTransito.prontuario_id, mov: 'recebido', papeis: ['arquivo'], ator: 'u-ar1', solicitacao_id: emTransito.id });
  check(r.error?.code === '42501', 'o Arquivo NÃO confirma o próprio recebimento (RN-09)');
  r = await D.moverProntuario({ prontuario_id: emTransito.prontuario_id, mov: 'recebido', papeis: ['recepcao'], ator: 'u-re1', solicitacao_id: emTransito.id });
  check(!r.error, 'a Recepção confirma o recebimento');
  const antes = (await D.listar('movimentos', { prontuario_id: emTransito.prontuario_id })).data.length;
  await D.moverProntuario({ prontuario_id: emTransito.prontuario_id, mov: 'recebido', papeis: ['recepcao'], ator: 'u-re1', solicitacao_id: emTransito.id });
  const depois = (await D.listar('movimentos', { prontuario_id: emTransito.prontuario_id })).data.length;
  check(antes === depois, 'repetir a mesma movimentação não duplica o registro (RN-17)');
}
const aguardando = sols.find((s) => s.etapa === 'aguardando_prontuario');
if (aguardando) {
  r = await D.moverProntuario({ prontuario_id: aguardando.prontuario_id, mov: 'entregue', papeis: ['arquivo'], ator: 'u-ar1', solicitacao_id: aguardando.id });
  check(Boolean(r.error), 'não dá para entregar o prontuário sem registrar localizar e retirar antes');
}

// ================================================================ 5. conclusão (RN-06, RN-13)
console.log('\n## Conclusão: requisitos obrigatórios');
const comContato = sols.find((s) => s.etapa === 'aguardando_contato_paciente' && s.tipo === 'duvida_correcao');
check(Boolean(comContato), 'o seed tem um Fluxo 1 aguardando contato com o paciente');
r = await D.moverSolicitacao({ id: comContato.id, transicao: 'T11', papeis: ['callcenter'], ator: 'u-cc1' });
check(Boolean(r.error) && /contato/i.test(r.error.message), 'NÃO conclui sem contato efetivo com o paciente (RN-06)');
await D.registrarComunicacao({ solicitacao_id: comContato.id, canal: 'telefone', tipo: 'contato_paciente', resultado: 'nao_atendeu', papeis: ['callcenter'], ator: 'u-cc1' });
r = await D.moverSolicitacao({ id: comContato.id, transicao: 'T11', papeis: ['callcenter'], ator: 'u-cc1' });
check(Boolean(r.error), 'tentativa frustrada (não atendeu) também não conclui');
await D.registrarComunicacao({ solicitacao_id: comContato.id, canal: 'telefone', tipo: 'contato_paciente', resultado: 'falou', papeis: ['callcenter'], ator: 'u-cc1' });
r = await D.moverSolicitacao({ id: comContato.id, transicao: 'T11', papeis: ['callcenter'], ator: 'u-cc1' });
check(!r.error && r.data.etapa === 'concluida', 'com contato efetivo, o Fluxo 1 conclui');
const tentado = sols.find((s) => { const e = D.db.entregas.find((x) => x.solicitacao_id === s.id); return e?.estado === 'envio_tentado'; });
if (tentado) {
  r = await D.moverSolicitacao({ id: tentado.id, transicao: 'T13', papeis: ['callcenter'], ator: 'u-cc1' });
  check(Boolean(r.error) && /tentad|confirma/i.test(r.error.message), 'NÃO conclui com envio apenas tentado: tentativa não é entrega (RN-13)');
  r = await D.registrarEntrega({ solicitacao_id: tentado.id, modo: 'digital', estado: 'retirada_confirmada', papeis: ['recepcao'], ator: 'u-re1' });
  check(Boolean(r.error), 'retirada confirmada não existe em entrega digital (RN-14)');
  r = await D.registrarEntrega({ solicitacao_id: tentado.id, modo: 'digital', estado: 'enviado', nota: 'confirmado', papeis: ['callcenter'], ator: 'u-cc1' });
  check(!r.error, 'registrar a confirmação do envio funciona');
  r = await D.moverSolicitacao({ id: tentado.id, transicao: 'T13', papeis: ['callcenter'], ator: 'u-cc1' });
  check(!r.error, 'com a entrega confirmada, conclui');
}

// ================================================================ 6. fluxo completo do zero
console.log('\n## Fluxo 2 de ponta a ponta, do registro à entrega');
await D.reiniciar();
const { data: pacs } = await D.listar('pacientes');
r = await D.abrirSolicitacao({ tipo: 'pedido_receita', paciente_id: pacs[0].id, relato: 'Teste ponta a ponta', papeis: ['callcenter'], ator: 'u-cc1' });
check(!r.error && r.data.protocolo > 0, 'Call Center abre a solicitação e recebe protocolo');
const nova = r.data;
check(D.possivelDuplicidade({ tipo: 'pedido_receita', paciente_id: pacs[0].id }).length === 1, 'duplicidade provável é detectada (e só avisa)');
r = await D.abrirSolicitacao({ tipo: 'pedido_receita', paciente_id: pacs[0].id, relato: 'Outro pedido legítimo', papeis: ['callcenter'], ator: 'u-cc1' });
check(!r.error, 'mesmo assim, uma segunda solicitação legítima do mesmo paciente é aceita (RF-04)');

const passo = async (desc, p) => { const x = await p; check(!x.error, desc + (x.error ? ' — ' + x.error.message : '')); return x; };
await passo('arquivo é avisado e a etapa vira aguardando prontuário', (async () => {
  await D.registrarComunicacao({ solicitacao_id: nova.id, canal: 'whatsapp_grupo', tipo: 'pedido_prontuario', resultado: 'registrada', texto: 'localizar', papeis: ['callcenter'], ator: 'u-cc1' });
  return D.moverSolicitacao({ id: nova.id, transicao: 'T03', papeis: ['callcenter'], ator: 'u-cc1' });
})());
await passo('arquivo localiza', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'localizado', papeis: ['arquivo'], ator: 'u-ar1', solicitacao_id: nova.id }));
await passo('arquivo retira', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'retirado', papeis: ['arquivo'], ator: 'u-ar1', solicitacao_id: nova.id }));
await passo('arquivo entrega', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'entregue', papeis: ['arquivo'], ator: 'u-ar1', solicitacao_id: nova.id }));
await passo('solicitação vai para em trânsito', D.moverSolicitacao({ id: nova.id, transicao: 'T04', papeis: ['arquivo'], ator: 'u-ar1' }));
const st1 = (await D.obter('solicitacoes', nova.id)).data;
check(st1.etapa === 'prontuario_em_transito', 'entrega iniciada NÃO conta como concluída (RN-21)');
await passo('recepção confirma o recebimento', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'recebido', papeis: ['recepcao'], ator: 'u-re1', solicitacao_id: nova.id }));
await passo('etapa vira prontuário na recepção', D.moverSolicitacao({ id: nova.id, transicao: 'T05', papeis: ['recepcao'], ator: 'u-re1' }));
r = await D.moverSolicitacao({ id: nova.id, transicao: 'T06', papeis: ['recepcao'], ator: 'u-re1' });
check(Boolean(r.error), 'não encaminha ao médico sem registrar a conferência');
await passo('recepção confere', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'conferido', papeis: ['recepcao'], ator: 'u-re1', solicitacao_id: nova.id }));
await passo('recepção encaminha ao médico', D.moverSolicitacao({ id: nova.id, transicao: 'T06', papeis: ['recepcao'], ator: 'u-re1' }));
await passo('médico emite a receita', D.registrarAvaliacao({ solicitacao_id: nova.id, desfecho: 'receita_emitida', conteudo_clinico: 'conteúdo fictício', resumo_para_paciente: 'resumo', papeis: ['medico'], ator: 'u-me1' }));
await passo('etapa vira retorno disponível', D.moverSolicitacao({ id: nova.id, transicao: 'T07', papeis: ['medico'], ator: 'u-me1' }));
const dossie1 = (await D.dossie(nova.id)).data;
check(dossie1.documentos.length === 1 && dossie1.documentos[0].estado === 'emitido', 'documento foi criado e está emitido');
await passo('recepção avisa no grupo', (async () => {
  await D.registrarComunicacao({ solicitacao_id: nova.id, canal: 'whatsapp_grupo', tipo: 'aviso_receita', resultado: 'registrada', texto: `protocolo ${nova.protocolo}`, papeis: ['recepcao'], ator: 'u-re1' });
  return D.moverSolicitacao({ id: nova.id, transicao: 'T10', papeis: ['recepcao'], ator: 'u-re1' });
})());
r = await D.registrarComunicacao({ solicitacao_id: nova.id, canal: 'telefone', tipo: 'contato_paciente', resultado: 'registrada', papeis: ['callcenter'], ator: 'u-cc1' });
check(Boolean(r.error), 'contato com o paciente sem resultado é recusado (RN-12)');
await passo('call center avisa o paciente', D.registrarComunicacao({ solicitacao_id: nova.id, canal: 'telefone', tipo: 'contato_paciente', resultado: 'falou', papeis: ['callcenter'], ator: 'u-cc1' }));
await passo('entrega física é orientada', D.registrarEntrega({ solicitacao_id: nova.id, modo: 'fisica', estado: 'orientada', papeis: ['callcenter'], ator: 'u-cc1' }));
await passo('etapa vira aguardando entrega', D.moverSolicitacao({ id: nova.id, transicao: 'T12', papeis: ['callcenter'], ator: 'u-cc1' }));
r = await D.moverSolicitacao({ id: nova.id, transicao: 'T13', papeis: ['callcenter'], ator: 'u-cc1' });
check(Boolean(r.error), 'não conclui com a retirada apenas orientada');
r = await D.registrarEntrega({ solicitacao_id: nova.id, modo: 'fisica', estado: 'retirada_confirmada', papeis: ['callcenter'], ator: 'u-cc1' });
check(r.error?.code === '42501', 'a confirmação da retirada física é da Recepção');
await passo('recepção confirma a retirada', D.registrarEntrega({ solicitacao_id: nova.id, modo: 'fisica', estado: 'retirada_confirmada', papeis: ['recepcao'], ator: 'u-re1' }));
await passo('agora conclui', D.moverSolicitacao({ id: nova.id, transicao: 'T13', papeis: ['callcenter'], ator: 'u-cc1' }));
const fim = (await D.obter('solicitacoes', nova.id)).data;
check(fim.etapa === 'concluida' && fim.desfecho === 'resolvida', 'caso concluído com desfecho resolvida');

// ---------------------------------------------------------------- trilha paralela depois de concluir
console.log('\n## Trilha paralela: devolução funciona com o caso JÁ concluído (RF-17)');
const pr = (await D.obter('prontuarios', nova.prontuario_id)).data;
check(pr.local !== 'arquivo', 'o prontuário ainda está fora do arquivo com o caso concluído');
await passo('recepção devolve', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'devolvido_medico', papeis: ['recepcao'], ator: 'u-re1', solicitacao_id: nova.id }).then((x) => (x.error ? D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'devolvido', papeis: ['recepcao'], ator: 'u-re1', solicitacao_id: nova.id }) : D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'devolvido', papeis: ['recepcao'], ator: 'u-re1', solicitacao_id: nova.id }))));
await passo('arquivo recebe a devolução', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'recebido_devolucao', papeis: ['arquivo'], ator: 'u-ar1', solicitacao_id: nova.id }));
await passo('arquivo arquiva', D.moverProntuario({ prontuario_id: nova.prontuario_id, mov: 'arquivado', papeis: ['arquivo'], ator: 'u-ar1', solicitacao_id: nova.id, nota: 'estante A-10' }));
const prFim = (await D.obter('prontuarios', nova.prontuario_id)).data;
check(prFim.local === 'arquivo', 'prontuário arquivado depois do atendimento encerrado');

// ---------------------------------------------------------------- reabertura preserva histórico
console.log('\n## Reabertura e cancelamento preservam o histórico (RN-15, RN-20)');
const evAntes = (await D.listar('eventos', { solicitacao_id: nova.id })).data.length;
r = await D.moverSolicitacao({ id: nova.id, transicao: 'T16', papeis: ['callcenter'], ator: 'u-cc1', motivo: 'Paciente retornou com a mesma dúvida' });
check(!r.error && r.data.etapa === 'aberta' && r.data.reaberturas === 1, 'reabre e conta o retrabalho');
const evDepois = (await D.listar('eventos', { solicitacao_id: nova.id })).data.length;
check(evDepois === evAntes + 1, `histórico cresceu e nada foi apagado (${evAntes} → ${evDepois})`);
r = await D.moverSolicitacao({ id: nova.id, transicao: 'T15', papeis: ['callcenter'], ator: 'u-cc1' });
check(Boolean(r.error), 'cancelar sem motivo é recusado');

// ---------------------------------------------------------------- auditoria de leitura
console.log('\n## Auditoria registra LEITURA de dado clínico');
const audAntes = (await D.listar('auditoria')).data.length;
D.auditarLeitura(['medico'], 'avaliacao_medica', nova.id, 'u-me1');
const audDepois = (await D.listar('auditoria')).data;
check(audDepois.length === audAntes + 1 && audDepois.at(-1).acao === 'leitura', 'leitura de avaliação entra na auditoria');

// ---------------------------------------------------------------- telas depois de mexer nos dados
console.log('\n## Telas continuam íntegras depois de exercitar o fluxo');
trocarPapel('callcenter');
await abrirTela('painel.js');
check(body().includes('Visão de'), 'painel reabre');
await abrirTela('solicitacao.js', 'initFicha', `solicitacoes/detalhe.html?id=${nova.id}`);
check(body().includes('Próxima ação'), 'detalhe reabre e mostra a próxima ação');

// ================================================================ resultado
console.log('');
if (erros.length) console.log(`console.error inesperado: ${erros.length}`);
if (falhas.length || erros.length) {
  console.log(`✗ ${falhas.length} falha(s); console.error: ${erros.length}`);
  falhas.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log(`✓ tudo passou; console.error: 0`);
