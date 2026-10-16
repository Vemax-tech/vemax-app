# VemaxCALL — fase de descoberta

Levantamento, auditoria e especificação do VemaxCALL: plataforma operacional para registrar e acompanhar solicitações de pacientes (dúvida/correção de receita e pedido de nova receita), prontuários, tarefas, documentos, comunicações e entregas.

**Estado: descoberta. Nada foi implementado.** Nenhuma linha de código de aplicação, nenhuma migration, nenhuma alteração no site ou no portal. Esta pasta é só documentação.

Data: **16/10/2026** · Auditoria sobre o commit `019a8f9` (branch `feat/seguranca`)

---

## Leia nesta ordem

| # | Documento | Para quê |
|---|---|---|
| 1 | [`01-auditoria.md`](01-auditoria.md) | **Comece aqui.** O que o projeto é hoje, a stack real, o que já está pronto de segurança, os 7 achados que afetam o VemaxCALL e as skills encontradas |
| 2 | [`02-requisitos-glossario.md`](02-requisitos-glossario.md) | Glossário do domínio, 30 requisitos funcionais, 15 não funcionais e o que está fora de escopo |
| 3 | [`03-fluxos.md`](03-fluxos.md) | **Os dois fluxos, etapa por etapa, por raia** + a máquina de estados de seis eixos e a tabela de transições |
| 4 | [`04-regras-negocio.md`](04-regras-negocio.md) | As 20 regras do pedido + 7 derivadas dos fluxogramas, cada uma com onde é imposta e como é testada. Inclui as definições de contagem do dashboard |
| 5 | [`05-casos-de-uso.md`](05-casos-de-uso.md) | 24 casos de uso com pré-condições, passos, exceções e critério de aceite |
| 6 | [`06-papeis-permissoes.md`](06-papeis-permissoes.md) | Matriz papel × recurso × ação, e as 4 decisões de acesso que ela toma |
| 7 | [`07-modelo-dados.md`](07-modelo-dados.md) | Diagrama de arquitetura, modelo de domínio, tabelas, índices, restrições e plano de reversão |
| 8 | [`08-adrs.md`](08-adrs.md) | 8 decisões de arquitetura com opções consideradas e quando revisitar |
| 9 | [`09-seguranca-privacidade.md`](09-seguranca-privacidade.md) | O que se reaproveita, os 7 controles novos exigidos por dado de saúde, e a LGPD |
| 10 | [`10-plano-testes.md`](10-plano-testes.md) | Suíte em 4 níveis sobre a infraestrutura de teste que já existe, e a homologação |
| 11 | [`11-backlog.md`](11-backlog.md) | Bloqueios, backlog por fase com dependências, critérios de saída e de homologação |
| 12 | [`12-perguntas-abertas.md`](12-perguntas-abertas.md) | **20 perguntas para o responsável pelo negócio.** 7 delas travam o início |

## Convenção usada em todos os documentos

| Marca | Significado |
|---|---|
| **[FATO]** | Verificado no repositório ou no painel do Supabase, com o caminho indicado |
| **[RECOMENDAÇÃO]** | Proposta técnica desta auditoria. Não implementada, não aprovada |
| **[PENDENTE]** | Depende de resposta do negócio. **Não** foi decidido nem presumido |

## Os 20 entregáveis do pedido, e onde estão

| # | Entregável | Onde |
|---:|---|---|
| 1 | Auditoria técnica da aplicação | `01` |
| 2 | Descrição da arquitetura encontrada | `01` (1.2–1.6) |
| 3 | Requisitos funcionais | `02` (2.2) |
| 4 | Requisitos não funcionais | `02` (2.3) |
| 5 | Glossário do domínio | `02` (2.1) |
| 6 | Descrição detalhada dos dois fluxos | `03` (3.2, 3.3) |
| 7 | Máquina de estados proposta | `03` (3.4) |
| 8 | Catálogo de regras de negócio | `04` |
| 9 | Casos de uso | `05` |
| 10 | Matriz de papéis e permissões | `06` |
| 11 | Modelo de domínio e proposta de dados | `07` (7.2) |
| 12 | Diagrama de arquitetura | `07` (7.1) |
| 13 | ADRs | `08` |
| 14 | Plano de segurança e privacidade | `09` |
| 15 | Plano de testes | `10` |
| 16 | Critérios de aceite | `05` (por caso de uso) e `05` 5.1 (da descoberta) |
| 17 | Backlog priorizado por dependências | `11` (11.2–11.6) |
| 18 | Lista de ambiguidades e perguntas pendentes | `12` |
| 19 | Plano de implementação por etapas | `11` (11.1–11.7) |
| 20 | Critérios de homologação | `11` (11.8) e `10` (10.5) |

## Resumo das decisões propostas

| ADR | Decisão | Por quê, em uma linha |
|---|---|---|
| 001 | **Projeto Supabase separado** para o VemaxCALL | Com dado de saúde de terceiros, o isolamento tem de ser da infraestrutura, não de 30 políticas RLS estarem todas certas |
| 002 | **JavaScript**, não TypeScript | O projeto não usa TS nem build; criar dois regimes no mesmo repo custa mais do que ganha |
| 003 | Permissão **papel × recurso × ação** no servidor | O modelo atual tem 2 papéis e um perfil global; os 4 papéis do fluxograma não cabem |
| 004 | **Seis eixos de estado**, não um campo de status | É o que faz a devolução do prontuário ser paralela, como no fluxograma |
| 005 | Documentos em **Storage privado + URL assinada curta**, com auditoria de leitura | Mantém o padrão do projeto sem exigir servidor novo |
| 006 | WhatsApp: **registro manual** na fase inicial | Automação de grupo é tecnicamente duvidosa e não foi confirmada |
| 007 | Manter **front-end estático + Supabase direto**, com sessão mais estrita | Consistência com o projeto; BFF fica planejado com gatilhos explícitos |
| 008 | Rota **`/call/`** no mesmo repositório e deploy | Zero infraestrutura nova; login separado do portal |

## O que esta descoberta NÃO fez

- **Não implementou nada.** Nenhuma migration, nenhuma tela, nenhuma dependência instalada.
- **Não alterou o site nem o portal**, com uma exceção já executada: a extração de `shared/js/` (itens A1 e A7 do backlog), na branch `refactor/shared-js`, commit `76329a7`. Ela não muda nenhuma regra e não depende de nenhuma resposta pendente; serve ao portal tanto quanto ao VemaxCALL. Detalhes em `07-modelo-dados.md`, 7.1.
- **Não verificou a fidelidade aos fluxogramas originais** — eles não estão no repositório. Ver `03-fluxos.md`, seção 3.0. **Este é o primeiro item a resolver.**
- **Não decidiu nada que dependa do negócio.** As 20 perguntas de `12` estão abertas.
- **Não leu dado pessoal de produção.** A inspeção do Supabase se limitou a nomes de tabela, contagem de linhas e alertas de segurança.

## Próximo passo

Reunião de uma hora com os quatro papéis operacionais e os **dois fluxogramas projetados**, para conferir `03-fluxos.md` etapa por etapa e validar a matriz de `06`. É o maior ganho de redução de risco por tempo investido em todo o projeto.

Em paralelo, respostas às perguntas **12.1 a 12.7**, que travam a Fase A.
