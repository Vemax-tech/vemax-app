# 5. Casos de uso e critérios de aceite

Formato de cada caso: **pré-condições → passos → resultado esperado → exceções → critério de aceite**. Os 24 casos pedidos no item 14, na ordem do pedido. O critério de aceite é o que o teste automatizado verifica.

---

### CU-01 Abrir uma solicitação de dúvida ou correção

- **Pré:** usuário com papel `callcenter` autenticado e com 2FA; paciente existe ou será cadastrado.
- **Passos:** identificar paciente → escolher tipo `duvida_correcao` → preencher relato, tipo de problema e informações disponíveis → salvar.
- **Resultado:** solicitação em `aberta`, protocolo gerado, autor e horário gravados, tarefa inicial criada, evento em `solicitacao_eventos`.
- **Exceções:** paciente não identificado → não salva; campos obrigatórios vazios → mensagem por campo; duplicidade provável → aviso com link para a existente, **sem bloquear**.
- **Aceite:** `RN-01`, `RN-03` verificadas; protocolo único; a solicitação aparece na fila "Novas solicitações" do Call Center.

### CU-02 Abrir uma solicitação de nova receita

- Igual a CU-01 com `tipo = pedido_receita`.
- **Aceite:** o tipo não pode ser alterado depois (`RN-22`); a solicitação não aceita `entregas` antes da decisão médica.

### CU-03 Consultar uma solicitação existente

- **Pré:** usuário autenticado com permissão de ver solicitações.
- **Passos:** buscar por protocolo, nome do paciente ou documento → abrir o detalhe.
- **Resultado:** detalhe com etapa atual, **próxima ação em destaque**, responsável, linha do tempo, tarefas, movimentações, comunicações, documentos e entrega — **cada bloco filtrado pela permissão do papel**.
- **Exceções:** sem permissão → "Sem acesso", sem revelar que o registro existe.
- **Aceite:** o Call Center **não** vê conteúdo clínico (`RN-18`); o Arquivo vê só o necessário para localizar.

### CU-04 Identificar uma possível duplicidade

- **Pré:** solicitação do mesmo paciente e mesmo tipo aberta nas últimas N horas (**[PENDENTE]** N, item 12.12).
- **Resultado:** aviso não bloqueante, com link.
- **Aceite:** `RF-04` — duas solicitações legítimas do mesmo paciente podem coexistir.

### CU-05 Localizar um prontuário

- **Pré:** solicitação em `aguardando_prontuario`; usuário papel `arquivo`.
- **Passos:** abrir a fila "Prontuários para localizar" → registrar `localizado`.
- **Exceções:** não encontrado → `nao_localizado`, abre pendência e notifica o Call Center (C10).
- **Aceite:** movimento gravado com ator e horário; a etapa da solicitação **não** muda ainda.

### CU-06 Retirar e entregar um prontuário

- **Pré:** `localizado` registrado.
- **Passos:** `retirado` → `entregue` com destino Recepção.
- **Resultado:** solicitação vai para `prontuario_em_transito`; custódia `em_transito_para_recepcao`; tarefa de confirmação criada para a Recepção.
- **Aceite:** **`RN-21`** — a entrega **não** aparece como concluída. O estado é "em trânsito".

### CU-07 Confirmar o recebimento na Recepção

- **Pré:** existe entrega em aberto; usuário papel `recepcao`.
- **Passos:** abrir "Prontuários recebidos" → confirmar.
- **Resultado:** custódia `recepcao`; solicitação `prontuario_na_recepcao`.
- **Exceções:** usuário papel `arquivo` tenta confirmar → recusa `42501`.
- **Aceite:** **`RN-09`** — somente a Recepção confirma.

### CU-08 Encaminhar o caso ao médico

- **Pré:** `conferido` registrado, sem divergência aberta.
- **Resultado:** `aguardando_medico`; custódia `com_medico`; tarefa `avaliar` na fila do médico escolhido.
- **Exceções:** divergência aberta → recusa com motivo (`RN-26`).
- **Aceite:** o médico vê o caso; outro médico não vê na fila pessoal dele.

### CU-09 Registrar a decisão médica

- **Pré:** solicitação encaminhada **àquele** médico; papel `medico` com `registro_profissional` preenchido.
- **Passos:** abrir o caso → registrar desfecho (`respondido`, `corrigido`, `receita_emitida`, `precisa_esclarecimento`, `nao_aprovado`) → anexar/referenciar documento quando houver.
- **Resultado:** `avaliacoes_medicas` criada; F2 com receita cria `documentos` e `entregas`; etapa vai a `retorno_disponivel`; tarefa para a Recepção.
- **Exceções:** Recepção ou Call Center tentam registrar → recusa (`RN-11`); solicitação não encaminhada a ele → recusa (`RN-10`).
- **Aceite:** `RN-10`, `RN-11`, `RN-23` verificadas. **Nenhuma emissão automática e nenhum apoio de IA.**

### CU-10 Registrar uma resposta (Fluxo 1)

- Caso particular de CU-09 com desfecho `respondido` ou `corrigido`; correção cria **nova versão** do documento preservando a anterior (`RN-15`, `RF-23`).
- **Aceite:** as duas versões coexistem e são distinguíveis; a antiga não é sobrescrita.

### CU-11 Comunicar o paciente

- **Pré:** `aguardando_contato_paciente`; papel `callcenter`.
- **Passos:** registrar canal, destinatário autorizado e **resultado**.
- **Exceções:** resultado vazio → recusa (`RN-12`).
- **Aceite:** tentativa sem sucesso **não** encerra a solicitação; a tarefa continua na fila.

### CU-12 Registrar envio digital

- **Pré:** F2, documento `emitido`, `entregas.modo = digital`.
- **Passos:** `anunciada` → `tentativa_envio` (canal + destinatário validado) → `enviado` ou `falhou`.
- **Aceite:** **`RN-13`** — com `envio_tentado` a solicitação **não** pode ser concluída; `falhou` mantém a pendência (`RN-16`).

### CU-13 Registrar orientação e confirmação de retirada física

- **Pré:** F2, `entregas.modo = fisica`.
- **Passos:** `orientada` (Call Center) → `retirada_confirmada` (quem entrega).
- **Aceite:** **`RN-14`** — `retirada_confirmada` só com `modo = fisica`; não dá para marcar entregue sem a confirmação.

### CU-14 Devolver e arquivar o prontuário

- **Pré:** custódia `recepcao`.
- **Passos:** Recepção `devolvido` → Arquivo `recebido_devolucao` → Arquivo `arquivado` com local.
- **Resultado:** custódia `arquivo`; pendência encerrada.
- **Aceite:** **`RN-07`, `RF-17`** — toda a trilha roda **sem** depender da etapa da solicitação; funciona com a solicitação já concluída e com ela ainda aberta.

### CU-15 Encerrar uma solicitação

- **Pré:** requisitos obrigatórios do tipo cumpridos.
- **Exceções:** F2 sem entrega terminal → recusa; F1 sem contato efetivo → recusa.
- **Aceite:** **`RN-06`**; a pendência de arquivamento **continua visível** depois do encerramento; histórico intacto (`RN-20`).

### CU-16 Reabrir ou cancelar uma solicitação

- **Pré:** motivo obrigatório.
- **Aceite:** **`RN-15`** — todo o histórico anterior continua legível; reabertura incrementa o contador de retrabalho; cancelamento com prontuário fora do arquivo abre pendência de devolução.

### CU-17 Gerenciar usuários e permissões

- **Pré:** papel `admin_empresa`.
- **Passos:** convidar usuário → atribuir papel → ativar/desativar.
- **Exceções:** `admin_empresa` **não** ganha acesso a conteúdo clínico por ser admin (item 10 do pedido); admin técnico da VEMAX não aparece com acesso clínico.
- **Aceite:** mudança de papel gera evento de segurança; o próprio admin não pode se dar papel clínico sem registro profissional.

### CU-18 Tentar acessar dados de outra organização

- **Passos:** usuário autenticado da empresa A consulta id de registro da empresa B.
- **Aceite:** **`RN-02`, `RN-19`** — 0 linhas, não "sem permissão" (não confirma a existência). Evento `acesso_negado` registrado.

### CU-19 Tentar executar uma ação sem permissão

- **Passos:** para **cada** transição, executar como **cada** papel.
- **Aceite:** **`RN-05`** — matriz completa de `06-papeis-permissoes.md` reproduzida pelo teste; apenas os papéis marcados conseguem.

### CU-20 Simular falhas de comunicação

- **Passos:** registrar tentativa de envio digital que falha; perder conexão no meio de uma transição.
- **Aceite:** **`RN-16`** — nada é perdido silenciosamente; a transação reverte inteira; a tarefa permanece pendente; a falha é visível na fila.

### CU-21 Simular requisições duplicadas

- **Passos:** chamar a mesma transição 3× (clique duplo, retry de rede).
- **Aceite:** **`RN-17`** — um efeito só; nenhuma movimentação nem entrega duplicada.

### CU-22 Simular atualizações simultâneas de um prontuário

- **Passos:** duas transações concorrentes movimentando o mesmo prontuário.
- **Aceite:** **`RN-08`, `RNF-11`** — uma aplica, a outra recebe erro claro; o estado final é consistente; nunca duas custódias.

### CU-23 Verificar tentativas de SQL injection e entradas maliciosas

- **Passos:** `'; drop table solicitacoes; --`, `<script>`, `%`/`_` em busca, texto gigante, unicode de controle, nome de arquivo `x.pdf.exe`.
- **Aceite:** consultas parametrizadas (PostgREST + `$1`); `limparBusca()`/`escaparLike()`; `h()` nunca interpreta HTML; `validarArquivo()` rejeita por assinatura de bytes; `CHECK` de tamanho rejeita texto gigante.

### CU-24 Verificar tentativas repetidas de autenticação

- **Passos:** 6 logins falhos na mesma conta em 15 min.
- **Aceite:** `registrar_login_falho()` grava só hashes; alerta de força bruta dispara uma vez por hora; mensagem genérica "E-mail ou senha incorretos" (sem enumeração de contas); espera progressiva na tela.

---

## 5.1 Critérios de aceite da fase de descoberta (item 16/20)

A descoberta está aceita quando:

1. Os dois fluxogramas originais foram conferidos contra `03-fluxos.md` e as divergências corrigidas.
2. As perguntas **bloqueantes** de `12-perguntas-abertas.md` (12.1 a 12.7) foram respondidas pelo responsável do negócio.
3. A escolha do ADR-001 (base separada × base compartilhada) foi confirmada por quem decide custo e contrato.
4. A matriz de `06-papeis-permissoes.md` foi validada pelos próprios papéis — em especial a linha do Call Center sobre conteúdo clínico.
5. O papel de controlador/operador da LGPD está definido por escrito entre VEMAX e a clínica.
