# Área interna da Vemax (`/app/`)

Painel privado da equipe para controlar oportunidades, clientes, propostas, projetos, tarefas, suporte e o financeiro básico. **Clientes não acessam esta área.** Os únicos pontos públicos são os links privados que já existiam: proposta (`proposta.html`), acompanhamento de projeto (`acompanhar.html`) e avaliação (`avaliar.html`).

Tecnologia (inalterada): HTML + JavaScript com ES modules, sem build, falando direto com o Supabase. A segurança fica na **RLS do Postgres**; as checagens em JavaScript só orientam a interface.

## Como usar o sistema no dia a dia

| Quero… | Vá em… |
|---|---|
| Ver o que precisa de atenção hoje na empresa | **Visão geral** |
| Ver só o que é meu, por data, e assumir o que está sem responsável | **Minhas pendências** |
| Achar qualquer cliente, lead, proposta, projeto, tarefa ou chamado | **Buscar** (botão no menu ou Ctrl+K) |
| Registrar um contato comercial ou acompanhar o funil | **Leads** (quadro ou lista) |
| Enviar uma proposta e registrar a resposta | **Propostas** |
| Ver tudo de uma empresa | **Clientes** → ficha do cliente |
| Acompanhar projetos, entregas e pedidos extras | **Projetos** → abrir o projeto |
| Ver o que cada pessoa precisa fazer | **Tarefas** |
| Registrar e acompanhar pedidos de clientes | **Suporte** |
| Cobrar, registrar pagamento e lançar custos | **Financeiro** |
| Mudar etapas, categorias e modelos de projeto | **Configurações** (administrador) |
| Aprovar cadastros e definir permissões | **Equipe** (administrador) |

**Fluxo recomendado:** o lead chega (site ou cadastro manual) → registra-se o contato e a próxima ação → cria-se a proposta → quando aprovada, **Criar projeto** copia cliente, escopo, valor e responsável e aplica um modelo de tarefas → o financeiro gera as parcelas → pedidos do cliente entram em Suporte.

## O que cada módulo faz

**Visão geral.** Pendências e indicadores reais, com filtro de período e de responsável: leads novos sem responsável ou sem primeiro contato, retornos atrasados, propostas aguardando resposta e vencidas, tarefas atrasadas/bloqueadas/sem responsável, prazos dos próximos 7 dias, projetos por etapa (em andamento, aguardando cliente, em revisão, parados) e os que consomem mais horas ou custo que o previsto, chamados abertos/sem responsável/fora do prazo, valores a receber, vencidos e recebidos no período, e atividade recente. Sem dados, mostra orientação de por onde começar. Cada bloco só aparece para quem tem permissão no módulo.

**Minhas pendências.** Uma lista única, por data (atrasado, hoje, próximos 7 dias, mais adiante, sem data), com as tarefas, os retornos de lead, os chamados, as propostas aguardando resposta e os projetos atrasados ou bloqueados em que você é o responsável. Tarefas podem ser concluídas ali mesmo, e o que está sem responsável pode ser assumido com um clique.

**Busca global.** Procura ao mesmo tempo em clientes, leads, propostas, projetos, tarefas e chamados (só nos módulos a que a pessoa tem acesso) e abre o registro direto. A busca é por parte do texto, sem ignorar acentos (“pão” não acha “pao”).

**Leads.** Cadastro com empresa, pessoa de contato, e-mail, telefone, necessidade, serviço de interesse, origem, responsável, valor estimado, próximo contato e observações. Funil **Novo → Primeiro contato → Reunião ou levantamento → Proposta enviada → Negociação → Ganho / Perdido** em quadro (arrastar ou “Mover para”) e lista com busca, filtros, ordenação e paginação. Destaca *sem responsável*, *sem primeiro contato*, *sem próxima ação*, *contato atrasado* e *parado há 14+ dias*. Ao marcar como perdido pede o **motivo**. Há uma análise de **origem × conversão** e de **motivos de perda**. Cada lead tem histórico (contatos, notas, decisões) e pode ser convertido em cliente sem perder o histórico.

**Clientes.** Um cadastro por empresa, com contatos, links importantes e linha do tempo. A ficha reúne oportunidades, propostas, projetos, tarefas em aberto, chamados e cobranças (cada bloco respeitando as permissões). O cadastro **avisa e impede duplicados** (mesmo nome, CPF/CNPJ ou e-mail) e o banco garante que nome e documento não se repetam. Converter um lead em cliente leva junto as propostas e projetos que ele já tinha.

**Propostas.** Rascunho → Enviada → Aprovada / Recusada / Vencida. Registra serviços e entregas, escopo, valor, condições de pagamento, prazo, validade, responsável e histórico de alterações (valor, validade, prazo…). O cliente responde pelo link privado; a equipe também pode **registrar aprovação ou recusa** combinadas por outro canal. Proposta vencida pode ser prorrogada. Em proposta aprovada, **Criar projeto** reaproveita cliente, escopo, valor e responsável e sugere o prazo a partir do texto (“6 semanas”). Gera PDF para impressão.

**Projetos.** Quadro com Planejamento, Em andamento, Aguardando cliente, Em revisão, Parado, Concluído e Cancelado; limite de itens por coluna (WIP), ciclos com retrospectiva e métricas de fluxo (já existentes). Cada projeto tem cliente, proposta de origem, categoria, prioridade, responsável e integrantes, datas, **valor contratado**, **esforço estimado**, links (repositório, ambiente, documentação), escopo, **entregas e marcos**, tarefas, **registro de alterações de escopo** (quem pediu, impacto em prazo e valor, decisão — a aprovação pode aplicar o impacto ao projeto), financeiro do projeto e histórico de decisões. O acompanhamento pelo cliente (link sem login) e a avaliação pós-entrega continuam disponíveis dentro do projeto.

**Tarefas.** Quadro (A fazer, Em andamento, Bloqueada, Em revisão, Concluída) e lista com agrupamento por **projeto, responsável ou prazo**. Destaca bloqueadas (com o motivo), atrasadas e sem responsável. Registra horas estimadas e gastas.

**Suporte.** Chamados com cliente, projeto, assunto, descrição, canal (formulário, e-mail, telefone, WhatsApp, outro), prioridade, responsável, status, prazo combinado e solução. Quadro e lista com filtros e alertas de *sem responsável*, *fora do prazo* e *prazo em até 2 dias*. **Notas internas** e **mensagens enviadas ao cliente** ficam em tipos separados na linha do tempo do chamado.

**Financeiro.** Contas a receber por cliente e projeto, em parcelas, com situação (prevista, pendente, paga, atrasada — calculada pela data —, cancelada), pagamento registrado à mão (data, valor e forma), despesas gerais ou de projeto, resumo de previsto × recebido × vencido, **custo e margem por projeto** e exportação CSV. **Contratos recorrentes** (suporte, hospedagem, manutenção, licenças): valor fixo mensal, trimestral ou anual, com receita recorrente por mês, reajuste, pausa/reativação, término e as cobranças geradas automaticamente alguns dias antes de cada vencimento. Controle operacional: não substitui contabilidade, não emite nota e não guarda dados de cartão ou de conta.

**Equipe.** Aprovação de cadastros, papéis (Administrador / Membro), ativação e **permissões por módulo** (ver/editar): Leads e propostas, Clientes, Projetos e tarefas, Suporte, Financeiro, Mercado, Conhecimento, Portfólio.

**Configurações.** Todos: preferências de notificação do sino e lista de integrações. Administradores: **categorias de serviço**, **nome, ordem e disponibilidade das etapas** dos quadros e das prioridades, **origens de lead**, **motivos de perda**, **categorias de despesa**, **modelos de projeto** (tarefas e entregas iniciais em texto simples) e **lixeira**.

## Como executar

```powershell
cd vemax-app
npx serve .                 # portal em http://localhost:3000/app/
npm test                    # testes unitários das regras de negócio (Node, sem dependências)
npm run check               # verificação estática: sintaxe, imports, páginas, menu, migrations
```

Banco: no **SQL Editor** do Supabase, aplique em ordem `supabase/migrations/001` … `013`. A `012_area_interna.sql` **só adiciona** tabelas, colunas e regras; não apaga dados nem tabelas. Ela depende da `008`, `010` e `011`. A `013_contratos_recorrentes.sql` (contratos) depende da `012`. Depois de aplicá-la, abra **Equipe → Permissões do papel Membro** e decida quem vê/edita Clientes, Suporte e Financeiro (padrão: Clientes só leitura, Suporte editável, Financeiro fechado).

## Segurança e privacidade (decisões)

- **Servidor manda.** Todas as tabelas novas têm RLS; ver/editar vem de `can_tabela()` (permissão do módulo). Esconder botão não é a proteção.
- **Exclusão recuperável.** Clientes, leads, propostas, projetos, tarefas, chamados, cobranças e despesas vão para a **lixeira** (`deleted_at`); quem apagou e quando é preenchido pelo banco (não dá para forjar). Exclusão definitiva só por administrador, em Configurações → Lixeira. Cliente com cobranças não pode ser apagado de vez.
- **Auditoria.** Triggers registram criação, lixeira, restauração e a mudança **de → para** de status, valores, vencimentos, pagamentos, prazos, papéis, permissões e configurações em `atividades`. Cada pessoa só lê o log dos módulos a que tem acesso (o log financeiro não aparece para quem não vê o Financeiro).
- **Notas e mensagens nunca são públicas.** As páginas públicas continuam usando funções que devolvem só campos seguros; `interacoes` (notas, decisões, mensagens ao cliente) só é lida pela equipe, módulo a módulo.
- **Formulário público fechado.** O visitante só consegue criar um lead “limpo” (sem responsável, valor, cliente, observações internas). O teto anti-spam da `007` segue valendo.
- **Entradas validadas** no navegador e no banco (tamanhos, formatos, valores positivos, URLs só `http/https`, método de pagamento restrito a uma lista — nunca dados de cartão).
- **Sem segredos no código.** Só a chave pública `anon` está em `app/js/config.js`, como antes.
- **Texto de usuário** é sempre inserido como texto, nunca como HTML.

### Limitações e decisões que ficam com a equipe

1. **Cadastro de funcionário pela tela de login (migration 005).** Já existia e foi mantido: cria conta *pendente e inativa*, sem acesso a nada até o administrador aprovar. Se a diretriz é “sem cadastro público”, desligue *Allow new users to sign up* no Supabase (Authentication → Providers → Email) e crie as contas por convite; o painel de Equipe continua funcionando. Se mantiver, considere ativar captcha no Supabase para evitar contas-spam.
2. **Valores comerciais não são colunas protegidas.** *Valor estimado* (lead) e *valor contratado* (projeto) ficam visíveis a quem acessa Leads/Projetos. O que é financeiro de verdade (cobranças, pagamentos, despesas, custo e margem) exige a permissão **Financeiro**.
3. **Chamados exigem ver Clientes.** Para abrir um chamado a pessoa precisa conseguir listar clientes.
4. **Membros sem “editar Projetos” não movem tarefas.** Tarefas seguem a permissão de Projetos. Se quiser que cada pessoa atualize as próprias tarefas, é preciso uma regra nova (não incluída).
5. **Listas grandes.** Filtros e paginação rodam no navegador sobre os registros carregados (limite padrão do Supabase de 1000 linhas por consulta). Para uma equipe pequena é suficiente; se a base crescer, a paginação deve passar para o servidor.
6. **Arquivos do cliente.** A ficha guarda *links* importantes; anexos de arquivo existem por projeto (bucket privado, URL assinada de 2 minutos).
7. **Contratos recorrentes não têm agendador.** As cobranças são geradas quando alguém com permissão de editar o Financeiro abre a tela (ou cria/edita um contrato). A função `gerar_cobrancas_recorrentes()` é segura para repetir (não duplica) e pode ser agendada com `pg_cron` no Supabase se for preciso gerar sem ninguém abrir o sistema.
8. **Proposta aprovada pela equipe** registra nome e data, não é assinatura eletrônica nem contrato.

## Integrações

| Integração | Situação |
|---|---|
| Formulário do site → Leads | **Ativa** |
| Links públicos de proposta, acompanhamento e avaliação | **Ativos** |
| Aviso por e-mail da equipe (`notificar-email`) | **Não configurada** — código pronto, falta publicar a função e as chaves |
| WhatsApp, e-mail recebido como chamado, calendário | **Não configuradas** — registro manual |
| Bancos, boletos, notas fiscais | **Não configuradas** — financeiro manual |

## Etapa posterior (não incluído nesta versão)

Integração oficial com WhatsApp, e-mail e calendário · portal separado para o cliente · aprovação de entregas pelo cliente · assinatura eletrônica · integrações bancárias/contábeis e nota fiscal · apontamento detalhado de horas e margem por tarefa · planejamento de capacidade da equipe · relatórios avançados e exportação para BI · automações de cobrança, acompanhamento comercial e abertura de tarefas · gestão de ativos/inventário.

A arquitetura já ajuda nisso: toda tabela de negócio tem `cliente_id`, `deleted_at` e linha do tempo (`interacoes`); `opcoes` e `modelos_projeto` tornam etapas e modelos configuráveis; as regras de cálculo ficam em `app/js/lib.js`, testadas e sem dependência de tela.

## Mapa de arquivos

| Onde | O quê |
|---|---|
| `supabase/migrations/013_contratos_recorrentes.sql` | Contratos recorrentes e a função `gerar_cobrancas_recorrentes()` |
| `supabase/migrations/012_area_interna.sql` | Clientes, funil ampliado, propostas↔clientes, projetos (escopo, entregas, equipe), tarefas, chamados, cobranças, despesas, linha do tempo, configurações, lixeira, auditoria, funções `projeto_de_proposta`, `aplicar_modelo_projeto`, `atualizar_vencimentos` |
| `app/js/lib.js` | Regras puras: datas, dinheiro, parcelas, status calculados, alertas, duplicados, leitura de modelos |
| `app/js/core.js` | Peças compartilhadas: tabela ordenável/paginada, Kanban, linha do tempo, lixeira, filtros, CSV |
| `app/js/busca.js` | Busca global (Ctrl+K) |
| `app/js/modules/` | `painel`, `contatos` (leads), `propostas`, `clientes`, `projetos`, `projeto`, `tarefas`, `suporte`, `financeiro`, `configuracoes`, `equipe`, `acompanhamento` (link do cliente) e os módulos de mercado/conhecimento/portfólio já existentes |
| `tests/lib.test.js` | Testes das regras de negócio |
| `scripts/verificar.mjs` | Verificação estática (`npm run check`) |

## Como foi verificado

- `npm test`: 17 testes unitários das regras de negócio.
- `npm run check`: sintaxe de todos os `.js`, imports, páginas, menu e sequência de migrations.
- Migrations `001`–`012` aplicadas em sequência num Postgres real (PGlite) com stubs do Supabase, e 80 verificações de triggers, RLS (anônimo, membro, administrador), duplicidade, lixeira, auditoria, funções e permissões.
- As telas foram renderizadas e exercitadas (formulários, validações, quadros, filtros, conversões) contra um Supabase simulado em memória.
- **Não testado:** contra o projeto Supabase real (nenhuma migration foi aplicada em produção) e em navegador real/celular. Veja `to-do/PENDENCIAS.md`.
