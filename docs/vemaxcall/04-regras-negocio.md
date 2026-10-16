# 4. Catálogo de regras de negócio

As 20 regras do item 9 do pedido, cada uma traduzida em **onde é imposta** e **como é testada**. A coluna "Onde" é o que importa: regra que só existe no JavaScript não é regra (`RNF-01`).

| # | Regra | Onde é imposta | Teste |
|---|---|---|---|
| RN-01 | Toda solicitação possui identificador único | `uuid primary key` + `protocolo` com `unique` por empresa | insere duas, confere protocolos distintos |
| RN-02 | Toda solicitação pertence à organização correta | ADR-001 (projeto Supabase próprio) + coluna `empresa_id` com RLS | tentativa de acesso cruzado devolve 0 linhas |
| RN-03 | Toda solicitação tem um tipo definido | `CHECK (tipo in ('duvida_correcao','pedido_receita'))`, `not null` | insert sem tipo falha |
| RN-04 | As transições devem ser válidas para o estado atual | tabela `transicoes_validas` + função `mover_solicitacao()` que a consulta antes de aplicar | tenta `aberta → concluida` direto: recusa |
| RN-05 | Cada ação exige a permissão correspondente | `can_call(recurso, acao)` chamada **dentro** de cada função de transição, com `errcode 42501` | cada transição executada por cada papel; só o autorizado passa |
| RN-06 | O sistema não pode concluir um caso com requisitos obrigatórios pendentes | função `pode_concluir(solicitacao)` consultada por `mover_solicitacao()`; lista de requisitos **por tipo** | tenta concluir F2 sem entrega registrada: recusa |
| RN-07 | A custódia do prontuário deve ser rastreável | `prontuario_movimentos` append-only (sem UPDATE/DELETE na RLS) + `prontuarios.local` derivado | histórico completo após 9 movimentos |
| RN-08 | Um prontuário não pode ser movimentado simultaneamente de maneira incompatível | `select ... for update` na linha de `prontuarios` dentro da função de movimento + `CHECK` de transição válida | duas transações concorrentes: uma ganha, a outra recebe erro claro |
| RN-09 | A Recepção precisa conseguir confirmar o recebimento | T05/C04 autorizadas **só** para o papel `recepcao`; quem entregou não confirma | Arquivo tenta confirmar o próprio recebimento: recusa |
| RN-10 | O retorno do médico precisa estar associado à solicitação correta | `avaliacoes_medicas.solicitacao_id` `not null` + FK + a função só aceita solicitação **encaminhada àquele médico** | registro em solicitação não encaminhada: recusa |
| RN-11 | A emissão ou correção de receita depende de um profissional habilitado | `can_call('avaliacao_medica','registrar')` só para papel `medico`; `profiles_call.registro_profissional` obrigatório para esse papel | Recepção tenta registrar avaliação: recusa |
| RN-12 | A comunicação com o paciente deve ter seu resultado registrado | `comunicacoes.resultado` `not null`; `CHECK` proibindo `registrada` quando `tipo = contato_paciente` | insert sem resultado falha |
| RN-13 | Envio, entrega e leitura de mensagens são estados diferentes | `entregas.estado` com os três valores separados; `pode_concluir()` **não** aceita `envio_tentado` como terminal | tenta concluir com `envio_tentado`: recusa |
| RN-14 | A entrega física e a digital devem possuir registros distintos | `entregas.modo` + `CHECK` cruzado: estado `retirada_confirmada` só com `modo = fisica`; `enviado` só com `modo = digital` | combinações inválidas falham |
| RN-15 | Reabertura, cancelamento e correções devem preservar o histórico | nenhum DELETE na RLS das tabelas de histórico; correção cria **nova versão** (`documentos.versao`), nunca `UPDATE` do conteúdo | após reabrir, todos os eventos anteriores continuam legíveis |
| RN-16 | Falhas de integração não podem causar perda silenciosa de informações | toda comunicação é um **registro próprio** criado antes da tentativa; falha grava `resultado = falhou` e mantém a tarefa pendente | simula falha de envio: tarefa continua na fila |
| RN-17 | Repetições de requisições não podem criar movimentações ou entregas duplicadas | chave de idempotência: `unique (solicitacao_id, tipo_movimento, sequencia)` + `on conflict do nothing` nas funções | chama a mesma transição 3× : um efeito só |
| RN-18 | O acesso a pacientes e documentos deve ser limitado à finalidade e à permissão | RLS por papel **e** por coluna (views com projeção mínima por papel); documento só por URL assinada emitida após checagem | Call Center lê documento clínico: recusa |
| RN-19 | Dados de organizações diferentes nunca podem ser expostos entre si | ADR-001: base separada. Dentro dela, `empresa_id` + RLS | consulta cruzada: 0 linhas |
| RN-20 | O encerramento administrativo do caso não deve apagar ou alterar o histórico | encerramento só escreve `etapa`, `desfecho`, `concluida_em`; histórico é append-only | compara histórico antes e depois do encerramento: idêntico |

## 4.1 Regras derivadas (não estão na lista do item 9, mas vêm dos fluxogramas)

| # | Regra | Origem |
|---|---|---|
| RN-21 | A entrega de prontuário **não** é concluída porque o Arquivo iniciou a movimentação. Ela fica `em_transito` até a confirmação de quem recebe | F1 etapa 6, texto explícito |
| RN-22 | Uma solicitação do Fluxo 1 **não pode** ter `entregas` de receita; uma do Fluxo 2 não pode ser concluída sem passar pela decisão médica | F1 vs F2; `CHECK` por tipo |
| RN-23 | Pedido de receita pode terminar **sem** receita. `nao_aprovado` é desfecho legítimo, com pendência de comunicar o paciente | F2 etapa 9, texto explícito |
| RN-24 | A resposta ao paciente que exige nova ação **não encerra** a solicitação | F1 etapa 14, texto explícito |
| RN-25 | A comunicação no grupo que anuncia o retorno precisa referenciar o **protocolo**, para o Call Center identificar a solicitação | F2 etapa 11, texto explícito |
| RN-26 | Divergência de identificação na conferência da Recepção **interrompe** o avanço e encaminha para correção | F2 etapa 7, texto explícito |
| RN-27 | Nenhuma mensagem é enviada pelo sistema na fase inicial. Toda comunicação é **registro do que foi feito fora** | item 6.8 e regras de execução |

## 4.2 Definições de contagem para o dashboard

Indicadores do item 6.1 precisam de critério escrito, senão o número não significa nada.

| Indicador | Definição exata |
|---|---|
| Solicitações abertas | `etapa` não em (`concluida`, `cancelada`) |
| Em atendimento | abertas com ao menos uma tarefa `em_andamento` |
| Aguardando prontuário | `etapa` em (`aguardando_prontuario`, `prontuario_em_transito`) |
| Aguardando Recepção | `etapa = prontuario_na_recepcao` **ou** `retorno_disponivel` sem recebimento pela Recepção |
| Aguardando médico | `etapa` em (`aguardando_medico`, `aguardando_esclarecimento`) |
| Receitas prontas aguardando comunicação | `etapa = retorno_disponivel` com documento `emitido` |
| Aguardando contato com paciente | `etapa = aguardando_contato_paciente` |
| Prontuários pendentes de devolução/arquivamento | prontuários com `local <> 'arquivo'` **e** nenhuma movimentação `arquivado` posterior à última retirada — **independente** da etapa da solicitação |
| Solicitações atrasadas | tempo na etapa atual **maior que a meta da etapa**. **[PENDENTE]** as metas não foram informadas (item 12.11). Até lá o indicador não é publicado |
| Volume por tipo | contagem por `tipo` no período |
| Distribuição por responsável | contagem de tarefas `pendente` + `em_andamento` por responsável |
| Tempo de espera | `now() - etapa_desde` da etapa atual |
| Tempo de conclusão | `concluida_em - criado_em`, só de solicitações concluídas |

> **[RECOMENDAÇÃO]** Enquanto as metas de prazo não existirem, o dashboard mostra o indicador "mais antigas na etapa" (ordenado por tempo), que é informação real, em vez de "atrasadas", que exigiria um prazo inventado.
