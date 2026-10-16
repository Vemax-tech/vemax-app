# 2. Requisitos e glossário do domínio

## 2.1 Glossário do domínio

Vocabulário fixado aqui para que código, banco e conversa usem as mesmas palavras. Nome técnico à direita; é ele que vai para tabelas e colunas.

| Termo | Significado acordado | Nome técnico |
|---|---|---|
| **Solicitação** | Um pedido do paciente que entra pelo Call Center e percorre o fluxo até um desfecho. Unidade central do sistema | `solicitacoes` |
| **Tipo de solicitação** | `duvida_correcao` (Fluxo 1) ou `pedido_receita` (Fluxo 2). Não são a mesma coisa e não se transformam um no outro | `solicitacoes.tipo` |
| **Protocolo** | Número curto e legível da solicitação, dito ao paciente no telefone. Diferente do id interno | `solicitacoes.protocolo` |
| **Etapa** | Em que ponto do fluxo a solicitação está. Só **um** valor por vez | `solicitacoes.etapa` |
| **Tarefa** | Uma ação concreta que alguém precisa executar. Uma solicitação tem várias; podem ser paralelas | `solicitacao_tarefas` |
| **Paciente** | Pessoa atendida pela clínica. **Não tem conta no sistema** | `pacientes` |
| **Prontuário** | O documento físico (papel) do paciente, guardado no arquivo. O VemaxCALL controla **onde ele está e quem está com ele**, não o conteúdo clínico | `prontuarios` |
| **Custódia** | Quem está fisicamente com o prontuário agora. Muda por movimentação registrada | `prontuarios.custodia_*` |
| **Movimentação** | Um evento de custódia: localizado, retirado, entregue, recebido, devolvido, arquivado | `prontuario_movimentos` |
| **Entrega (de prontuário)** | Passar o prontuário de uma pessoa para outra. **Só está concluída quando quem recebe confirma** | movimento `entregue` + `recebido` |
| **Arquivamento** | Prontuário de volta no lugar certo no arquivo. Fim da trilha física | movimento `arquivado` |
| **Retorno médico** | O que o médico decidiu ou respondeu. Registrado por quem tem permissão clínica | `avaliacoes_medicas` |
| **Receita** | Documento emitido pelo médico. Pode ser física ou digital | `documentos` com `tipo = 'receita'` |
| **Documento corrigido** | Nova versão de uma receita após correção. **Não substitui** a anterior: coexistem com versão | `documentos.versao` |
| **Comunicação** | Registro de uma tentativa de falar com alguém (paciente, grupo do WhatsApp, equipe), com canal, horário, responsável e **resultado** | `comunicacoes` |
| **Grupo operacional** | O grupo de WhatsApp onde Call Center, Arquivo e Recepção se coordenam hoje. Canal real do fluxograma | `comunicacoes.canal = 'whatsapp_grupo'` |
| **Entrega (de receita)** | Como a receita chega ao paciente: retirada física ou envio digital. Estados distintos | `entregas` |
| **Desfecho** | Como a solicitação terminou: resolvida, cancelada, não aprovada, sem contato | `solicitacoes.desfecho` |
| **Pendência** | Algo que ainda falta e está visível, mesmo que não trave o atendimento (ex.: prontuário não devolvido) | derivada, ver `04-regras-negocio.md` |
| **Fila de trabalho** | Lista filtrada do que **aquele papel** precisa fazer agora | visões por papel |

Termos **deliberadamente não usados**, para evitar confusão com o portal da VEMAX: *chamado* (é suporte de TI), *lead*, *proposta*, *projeto*, *cliente*.

> **[PENDENTE]** "Silvio" é tratado aqui como **papel** (`arquivo`), não como pessoa. Se o processo depende de uma única pessoa, isso é um risco operacional a confirmar — e o sistema deve permitir mais de um usuário no papel.

## 2.2 Requisitos funcionais

Identificadores `RF-nn` são usados nos casos de uso, nos testes e no backlog.

### Cadastro e identificação

| ID | Requisito | Origem |
|---|---|---|
| RF-01 | O Call Center registra uma solicitação de **dúvida ou correção** com relato, tipo de problema e identificação do paciente | Fluxo 1, etapas 1–3 |
| RF-02 | O Call Center registra uma solicitação de **nova receita** com os dados do pedido | Fluxo 2, etapas 1–3 |
| RF-03 | Toda solicitação recebe **identificador único** e protocolo legível, e grava quem abriu e quando | item 9.1 do pedido |
| RF-04 | O sistema aponta **possíveis duplicidades** (mesmo paciente, mesmo tipo, aberta nas últimas N horas) e **avisa sem bloquear** | item 6.3 |
| RF-05 | Cadastro de paciente com o **mínimo necessário** para identificar e retornar o contato | item 6.3, LGPD |
| RF-06 | Busca de paciente por nome, documento ou telefone, com os resultados limitados pela permissão de quem busca | item 6.2 |

### Prontuário

| ID | Requisito | Origem |
|---|---|---|
| RF-10 | O Arquivo registra que **localizou** o prontuário de uma solicitação | F1 e F2, etapa 5 |
| RF-11 | O Arquivo registra a **retirada**, com responsável e horário | F1/F2 etapa 5 |
| RF-12 | O Arquivo registra a **entrega** à Recepção | F1 etapa 6, F2 etapa 6 |
| RF-13 | A Recepção **confirma o recebimento**. Sem essa confirmação a entrega fica como *em trânsito* | F1 etapa 7, F2 etapa 7, regra 9 |
| RF-14 | A Recepção registra a **conferência** e pode abrir uma pendência de divergência | F1 etapa 7, F2 etapa 7 |
| RF-15 | A Recepção registra a **devolução** ao Arquivo; o Arquivo registra o **recebimento** e o **arquivamento** | devolução, F1 e F2 |
| RF-16 | A custódia atual e o histórico completo de movimentações ficam visíveis | item 6.6 |
| RF-17 | A devolução e o arquivamento são controlados **em paralelo**, independentes do contato com o paciente | item 8, regra explícita |

### Fluxo médico

| ID | Requisito | Origem |
|---|---|---|
| RF-20 | A Recepção registra o **encaminhamento ao médico** | F1 etapa 8, F2 etapa 8 |
| RF-21 | O médico (ou quem tem permissão clínica) registra o **resultado da análise**: resposta, correção, receita emitida, pedido de esclarecimento ou não aprovação | F1 etapa 9, F2 etapa 9, regra 11 |
| RF-22 | O retorno fica **associado à solicitação correta**; o sistema não aceita registro solto | regra 10 |
| RF-23 | Na correção de receita, a nova versão **preserva** a anterior | item 6.7, regra 15 |
| RF-24 | Um pedido de receita pode terminar **sem receita** (não aprovado ou precisa de informação), com a decisão registrada e a pendência encaminhada | F2 etapa 9 |
| RF-25 | A Recepção registra que o **retorno/receita está disponível** | F1 etapa 10, F2 etapa 10 |

### Comunicação e entrega

| ID | Requisito | Origem |
|---|---|---|
| RF-30 | Qualquer papel registra uma comunicação com canal, horário, responsável, destinatário e **resultado** | item 6.8 |
| RF-31 | A comunicação no **grupo operacional** é registrada manualmente na fase inicial; o sistema **não envia nada sozinho** | item 6.8, regra de execução |
| RF-32 | O Call Center registra a **conferência** do retorno publicado no grupo | F1 etapa 12, F2 etapa 12 |
| RF-33 | O Call Center registra o **contato com o paciente** e o resultado (falou, não atendeu, número errado, recado) | F1 etapa 13, F2 etapa 13, regra 12 |
| RF-34 | **Receita física:** registrar a orientação de retirada e, separadamente, a **retirada efetiva** | F2 etapa 13 opção A, regra 14 |
| RF-35 | **Receita digital:** registrar a tentativa de envio e o resultado; **tentativa ≠ entrega ≠ leitura** | F2 opção B, regras 13 e 14 |
| RF-36 | O encerramento da solicitação exige que os requisitos obrigatórios do tipo estejam cumpridos | regra 6 |
| RF-37 | Reabertura e cancelamento preservam todo o histórico | regra 15, 20 |

### Operação

| ID | Requisito | Origem |
|---|---|---|
| RF-40 | Dashboard com os indicadores do item 6.1, todos calculados sobre o banco, com critério de contagem documentado | item 6.1 |
| RF-41 | Central de solicitações com as colunas do item 6.2, mais busca, filtros, ordenação e paginação **no servidor** | item 6.2 |
| RF-42 | Detalhe da solicitação com linha do tempo, tarefas, movimentações, comunicações, documentos, entrega e **a próxima ação em destaque** | item 6.4 |
| RF-43 | Filas de trabalho por papel, conforme o item 6.5 | item 6.5 |
| RF-44 | Relatórios do item 6.9, respeitando permissão e minimizando dado pessoal | item 6.9 |
| RF-45 | Trilha de auditoria de toda alteração e de todo acesso relevante a dado clínico | item 9.20, 11 |
| RF-46 | O administrador da empresa gerencia usuários e papéis dentro da própria empresa | item 10 |

## 2.3 Requisitos não funcionais

| ID | Requisito | Alvo | Como será verificado |
|---|---|---|---|
| RNF-01 | **Autorização sempre no servidor.** Nenhuma regra de acesso depende do JavaScript | 100% das ações | teste PGlite executando como cada papel |
| RNF-02 | **Isolamento entre empresas.** Dado de uma empresa nunca visível a outra | absoluto | ver ADR-001; teste de tentativa de acesso cruzado |
| RNF-03 | Tempo de resposta das telas de fila e central | p95 < 1,5 s com 10 mil solicitações | medição com base semeada |
| RNF-04 | Paginação e filtros no servidor (não trazer a base para o navegador) | sempre | revisão de código; o portal atual **não** faz isso (achado A4) |
| RNF-05 | Operação em celular (o Arquivo e a Recepção circulam pelo prédio) | telas principais usáveis em 360 px | teste manual + jsdom |
| RNF-06 | Acessibilidade: navegação por teclado, foco visível, rótulos, `aria-live` em mudanças de estado | WCAG 2.1 AA nas telas principais | checklist + revisão |
| RNF-07 | 2FA **obrigatório** para todos os papéis do VemaxCALL (não só admin) | 100% | configuração + teste |
| RNF-08 | Sessão: inatividade de 15 min e duração máxima de 8 h (mais restritas que o portal, por causa do dado de saúde) | — | `config_seguranca` próprio |
| RNF-09 | Nenhum dado clínico em log, mensagem de erro, URL ou nome de arquivo | 100% | revisão + teste de mensagens |
| RNF-10 | Toda transição de estado é atômica e idempotente sob requisição repetida | 100% | teste de requisição duplicada |
| RNF-11 | Atualização concorrente do mesmo prontuário não produz estado inconsistente | 100% | teste com `select ... for update` |
| RNF-12 | Backup diário com restauração **testada** antes do go-live | — | ensaio de restauração documentado |
| RNF-13 | Retenção e descarte definidos por tipo de dado | — | **[PENDENTE]** depende do item 12.3 de `12-perguntas-abertas.md` |
| RNF-14 | Sem build e sem framework novo: mesmo padrão do portal (ES modules) | — | `npm run check` estendido |
| RNF-15 | Documentos (receitas) em armazenamento **privado**, acesso só por URL assinada de curta duração emitida após checagem de permissão | 100% | teste de acesso direto ao bucket |

## 2.4 Fora de escopo nesta primeira execução

Declarado para não gerar expectativa:

- Interface para o paciente. O paciente é o **solicitante** dos fluxogramas e não tem conta (item 13 do pedido).
- Envio automático de WhatsApp. Só registro manual (item 6.8). Ver ADR-006.
- Emissão automática de receita ou qualquer apoio clínico por IA. **Explicitamente proibido** no pedido.
- Integração com sistema de prontuário eletrônico da clínica. **[PENDENTE]** — não se sabe se existe.
- Assinatura digital de receita (ICP-Brasil / provedor de receita digital). **[PENDENTE]** item 12.6.
- Faturamento, agenda e qualquer função clínica além do registro do retorno.
