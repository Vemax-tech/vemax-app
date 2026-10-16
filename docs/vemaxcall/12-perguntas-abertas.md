# 12. Ambiguidades e perguntas pendentes

Nada nesta lista foi decidido. Onde o pedido não diz, **não presumi** — registrei aqui.

**Bloqueantes** (12.1 a 12.7) travam a Fase A. Os demais travam fases específicas, indicadas na coluna "Trava".

---

## Bloqueantes

### 12.1 Quem é a empresa, e quem é controlador dos dados?
Nome e CNPJ da clínica; confirmação de que **ela é a controladora** e a **VEMAX é operadora** (LGPD). Existe contrato/aditivo de operador (DPA) assinado ou a assinar?
**Trava:** Fase A · **Por quê:** define responsabilidades, subcontratados e o que pode ser feito com o dado. Sem isso não se cria a base.

### 12.2 O atendimento pode ser encerrado com o prontuário ainda não arquivado?
O texto diz que *"o atendimento não deve ficar indefinidamente sem conclusão apenas porque existe uma etapa administrativa pendente"*, **e** que a política *"será confirmada com a empresa"*.
**Opções:** (a) encerra e a pendência fica visível; (b) encerra só com o arquivamento; (c) encerra, mas depois de N dias a pendência escala para o gestor.
**Trava:** Fase B (B-10) · **Proposta:** (a) com trava configurável.

### 12.3 Por quanto tempo os registros ficam guardados?
Nenhum prazo foi informado. Fato: a Resolução CFM 1.821/2007 estabelece guarda mínima de **20 anos** para o prontuário — mas o VemaxCALL guarda registros de atendimento e movimentação, não o prontuário em si. Qual o prazo para solicitações, comunicações, documentos e auditoria? Quem decide isso juridicamente?
**Trava:** Fase A (modelagem) · **Por enquanto:** nenhum descarte automático.

### 12.4 O Call Center precisa **ler** a resposta do médico?
A matriz 6.3 propõe que **não** — ele vê *que* há retorno e precisa comunicá-lo. Mas na etapa 13 dos dois fluxos ele *comunica a resposta ao paciente por telefone*. Se precisar ler, a saída é um campo **"resumo para o paciente"** escrito pelo médico, separado do conteúdo clínico completo.
**Trava:** Fase A (matriz) e B-09 · **Esta é a pergunta mais importante da lista** — define quem toca dado sensível.

### 12.5 O médico usa o sistema diretamente?
No fluxograma a Recepção *vai até o médico e apresenta o caso*. O médico registra a decisão dele mesmo (papel `medico` com conta), ou a Recepção registra em nome dele?
**Impacto:** se a Recepção registra, a regra 11 ("emissão depende de profissional habilitado") precisa de outra forma de atestar autoria — e aí **quem** responde pelo registro?
**Trava:** Fase B (B-07).

### 12.6 Como a receita existe, fisicamente e juridicamente?
A receita digital é assinada digitalmente? Com qual meio (ICP-Brasil, provedor de receita digital)? O arquivo é guardado no VemaxCALL ou só referenciado? A receita física é digitalizada?
**Impacto:** define `call_documentos`, o Storage e se a Fase E precisa de integração de assinatura.
**Trava:** Fase C (C-03, C-05).

### 12.7 Quem é o provedor de WhatsApp, e o grupo pode ser automatizado?
O grupo operacional é canal real nos dois fluxos. **Fato apurado nesta auditoria:** o suporte a grupos na API oficial é incerto — respostas antigas do fórum da Meta dizem que não existe; um guia de fornecedor (ago/2026) diz que existe, com limite de **8 participantes** e exigência de *Official Business Account*. Nada confirmado na documentação oficial.
**Pergunta:** quantas pessoas estão no grupo hoje? A clínica aceita trocar o grupo por outro mecanismo se a automação não for possível?
**Trava:** Fase E (E-02). **Não trava** A–D, que usam registro manual.

---

## Não bloqueantes

### 12.8 A clínica tem prontuário eletrônico?
Se tem, qual, e há API? O pedido diz *"Não é necessário armazenar todo o conteúdo clínico no módulo se ele já existir em outro sistema"* — mas o fluxograma todo gira em torno de **prontuário físico em papel**. Os dois coexistem?
**Trava:** Fase E (E-04).

### 12.9 "Silvio" é papel ou pessoa?
Modelei como papel `arquivo`, com mais de um usuário possível. Se o processo depende de uma única pessoa, isso é um risco operacional (férias, ausência) que o sistema expõe mas não resolve.
**Trava:** nenhuma; confirmar o nome do papel na interface.

### 12.10 Existe etapa de triagem?
`em_triagem` está na lista de estados conceituais do pedido, mas **não aparece em nenhum dos dois fluxogramas**. É etapa real ou foi sugestão genérica? Deixei como opcional (T02).
**Trava:** Fase A (tabela de transições).

### 12.11 Quais são as metas de prazo por etapa?
Sem elas, "solicitação atrasada" não tem definição, e o indicador do item 6.1 não pode existir. Quanto tempo é aceitável em cada etapa? Há diferença por prioridade?
**Trava:** Fase D (D-02, D-06). **Até lá** o dashboard mostra "mais antigas na etapa" em vez de "atrasadas".

### 12.12 Qual a janela de duplicidade?
Duas solicitações do mesmo paciente e mesmo tipo em quantas horas são suspeitas? (Proposta: 24 h, aviso não bloqueante.)
**Trava:** Fase B (B-02).

### 12.13 Que dados do paciente são realmente necessários?
Proposta minimizada: nome, documento, nascimento, telefone, e-mail. Precisa de endereço? Convênio? Número de cadastro interno da clínica? **Cada campo a mais é dado pessoal a mais para proteger.**
**Trava:** Fase B (B-01).

### 12.14 A retirada física da receita é registrada por quem?
O texto diz *"caso faça parte do escopo operacional confirmado"*. Se é a Recepção que registra, ela precisa de acesso no balcão — tem computador ou tablet lá?
**Trava:** Fase C (C-08).

### 12.15 Quantas pessoas, em quantos papéis, em quais dispositivos?
Número de usuários por papel; volume de solicitações por dia; quem usa celular e quem usa computador. Calibra RNF-03 e RNF-05.
**Trava:** Fase D (D-10).

### 12.16 Há prioridade entre solicitações?
O item 6.2 pede a coluna "Prioridade, se definida pela empresa". A empresa define? Com quais níveis e critérios?
**Trava:** Fase B (B-13).

### 12.17 O que acontece quando o prontuário não é encontrado?
Modelei `nao_localizado` com pendência e aviso ao Call Center (C10), mas o fluxograma não cobre esse caso. Qual é o procedimento real hoje?
**Trava:** Fase B (B-04).

### 12.18 Quem é o administrador da empresa, e ele é também profissional de saúde?
Se for, recebe dois papéis (`admin_empresa` + `medico` com registro). Se não, **não tem acesso clínico** — e precisa saber disso antes do go-live.
**Trava:** Fase A (A14).

### 12.19 Suporte técnico da VEMAX: como funciona o acesso de emergência?
Propus concessão temporária, nominal, com prazo, motivo e registro, concedida pelo `admin_empresa`. A clínica aceita esse desenho? Qual prazo máximo?
**Trava:** Fase A (A3).

### 12.20 A VEMAX cobra pelo VemaxCALL, e isso muda a arquitetura?
Se for produto para várias clínicas, o `empresa_id` dentro do projeto passa a ser o eixo de isolamento e o ADR-001 precisa de revisão explícita. Se for uma clínica só, o desenho proposto basta.
**Trava:** nenhuma agora; **muda o ADR-001** se a resposta mudar depois.

---

## Como responder

Sugestão: copiar a numeração e responder item por item, mesmo que a resposta seja "não sei ainda" ou "decidir depois". Saber que está em aberto já evita que o sistema seja construído sobre uma suposição.

As respostas aos itens 12.1 a 12.7 devem voltar para dentro destes documentos (não ficar só no histórico de conversa), transformando **[PENDENTE]** em **[FATO]** ou **[RECOMENDAÇÃO]** aprovada.
