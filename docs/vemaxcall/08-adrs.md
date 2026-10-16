# 8. ADRs — decisões de arquitetura

Formato: contexto → opções → decisão → consequências → quando revisitar.
Status `proposto` = **aguarda aprovação**. Nenhuma foi implementada.

---

## ADR-001 — Onde ficam os dados do VemaxCALL

**Status:** proposto · **Impacto:** alto · **Decisor:** quem responde por custo e contrato com a clínica

### Contexto

**[FATO]** O banco atual não tem nenhum conceito de organização (`01-auditoria.md`, achado A1), e `is_admin()` dá acesso a tudo. O VemaxCALL é para **outra empresa**, e trata **dado pessoal sensível de saúde** (LGPD art. 5º, II e art. 11). O pedido exige: *"Dados de organizações diferentes nunca podem ser expostos entre si"* (RN-19) e *"A administração técnica da VEMAX não deve receber acesso irrestrito aos dados clínicos por padrão"*.

### Opções

**A) Projeto Supabase separado para o VemaxCALL** *(recomendada)*
- Isolamento por infraestrutura: bases, Auth e Storage distintos. Não existe consulta possível entre as duas.
- `is_admin()` da VEMAX não alcança o dado da clínica — nem por engano, nem por política mal escrita.
- Auth separada: a equipe da clínica não ganha conta no portal da VEMAX, e vice-versa.
- Nenhuma alteração nas 14 migrations existentes nem nas políticas RLS em produção.
- Custo: um segundo projeto Supabase. Operação: duas bases para monitorar e dois conjuntos de backup.

**B) Mesma base, com `empresa_id` em todas as tabelas novas**
- Custo zero de infraestrutura; uma base para operar.
- Exige **reescrever** `is_admin()` e `can()`, de que dependem **todas** as 40 tabelas e dezenas de políticas em produção. É exatamente o risco que o pedido manda evitar ("não prejudique as páginas existentes").
- O isolamento passa a depender de cada política RLS estar correta. Uma política esquecida expõe dado de saúde.
- Auth compartilhada: um usuário da clínica existiria no mesmo `auth.users` da equipe VEMAX.

**C) Mesma base, schema Postgres separado (`call.`)**
- Meio-caminho: separa namespace, mas Auth, `is_admin()` e Storage continuam compartilhados. Não resolve o problema central.

### Decisão

**Opção A.** O fator decisivo não é técnico, é de responsabilidade: com dado de saúde de pacientes de um terceiro, o isolamento tem de ser uma propriedade da infraestrutura, não uma consequência de 30 políticas RLS estarem todas certas. Opção B troca risco de vazamento de dado sensível por economia de um projeto Supabase — troca ruim.

### Consequências

- `call_empresas` existe desde o início, com uma linha, e as tabelas carregam `empresa_id`. Custa pouco agora e evita remodelagem se aparecer uma segunda clínica.
- Dois `config.js`, dois conjuntos de chave anon, dois destinos na CSP de `_headers`.
- `tests/integration/banco.mjs` precisa aceitar a pasta de migrations como parâmetro.
- A VEMAX é **operadora**; a clínica é **controladora**. Isso tem de estar no contrato (ver `09`).

### Revisitar quando

O VemaxCALL virar produto multi-clínica: aí o `empresa_id` dentro do projeto do VemaxCALL passa a ser o eixo de isolamento, e a decisão A continua valendo (um projeto por produto, não por cliente).

---

## ADR-002 — Linguagem: JavaScript, não TypeScript

**Status:** proposto · **Impacto:** médio

**Contexto.** **[FATO]** O projeto **não usa TypeScript** e **não tem build** (`package.json` sem dependências de runtime; ES modules carregados direto pelo navegador). O pedido diz: *"Prefira TypeScript se já for utilizado ou se a adoção for tecnicamente justificada"* e *"Não introduza tecnologias sem justificativa"*.

**Opções.** (A) JS puro, como o resto do projeto. (B) TypeScript só no VemaxCALL → exige bundler/`tsc`, cria dois regimes no mesmo repo, e o `shared/js/` compartilhado teria de servir aos dois. (C) Migrar o projeto inteiro para TS → reescrita de 4.100 linhas sem pedido do negócio.

**Decisão.** **(A) JavaScript**, com JSDoc nas funções de domínio (o projeto já faz isso bem — ver `lib.js` e `core.js`) e verificação estática via `scripts/verificar.mjs` estendido.

**Consequências.** Sem tipos no editor; compensado por (1) as validações reais estarem no banco, (2) `lib.js`/`validacao.js` serem puras e testadas, (3) os testes PGlite cobrirem as regras.

**Revisitar quando** o projeto adotar build por outro motivo. Aí TS entra para o repositório todo de uma vez, não só no VemaxCALL.

---

## ADR-003 — Permissão por papel × recurso × ação, no servidor

**Status:** proposto · **Impacto:** alto

**Contexto.** **[FATO]** `permissoes` tem chave primária só em `modulo`: é um perfil único para todos os membros. `papel` só aceita `admin`/`membro`. Os quatro papéis do fluxograma não cabem (achado A2).

**Decisão.** Tabelas `call_usuario_papeis` (N:N) + `call_papeis_permissoes` (papel × recurso × ação) + função `can_call()` com o **mesmo desenho** de `can()`: `security definer`, confere sessão e 2FA. Esboço em `06-papeis-permissoes.md`, 6.5.

**Consequências.** Mais uma consulta por verificação (função `stable`, cacheada na transação). A matriz clínica só muda por migration — a interface do admin da empresa **não** a expõe, para que uma configuração errada não abra dado de saúde. Projeção mínima por coluna sai por **views**, porque RLS filtra linhas, não colunas.

**Não fazer:** reaproveitar `permissoes` do portal. Acoplaria duas autorizações diferentes e, sob a opção A do ADR-001, ela nem está na mesma base.

---

## ADR-004 — Seis eixos de estado, não um campo de status

**Status:** proposto · **Impacto:** alto

**Contexto.** O pedido é explícito: *"Não use um único campo de status para representar todo o processo"*, e a devolução do prontuário é **paralela** à comunicação com o paciente.

**Decisão.** Eixos separados: solicitação, tarefa, custódia do prontuário, documento, comunicação, entrega (`03-fluxos.md`, 3.4). A devolução/arquivamento vive **só** no eixo de custódia e nunca é etapa principal.

**Consequências.** Mais tabelas e mais consultas para montar uma tela. Em troca: a trilha física funciona com a solicitação aberta **ou** concluída (RF-17); "receita enviada" não se confunde com "receita entregue" (RN-13); e o pedido "não confunda conclusão do atendimento com arquivamento do prontuário" é satisfeito por construção, não por disciplina.

**Transições válidas em tabela** (`call_transicoes_validas`), não em `if` espalhado: a função `mover_solicitacao()` consulta antes de aplicar. Permite testar a máquina de estados como dado.

---

## ADR-005 — Documentos em Storage privado com URL assinada de curta duração

**Status:** proposto · **Impacto:** alto

**Contexto.** Receitas são documentos clínicos. **[FATO]** O projeto já usa bucket privado com RLS em `storage.objects` (`001_init.sql`, bucket `entregaveis`) e restringe `allowed_mime_types` sem HTML/SVG/executável (`014`).

**Opções.** (A) Bucket privado + URL assinada emitida por RPC que checa `can_call('documento','ver')` e grava a leitura em `call_auditoria`. (B) Servir por Worker intermediário (BFF). (C) Guardar só a referência, documento fica em outro sistema.

**Decisão.** **(A)**, com TTL curto (**[PENDENTE]** sugestão: 60 s, confirmar com a operação) e registro de **toda** emissão de URL. Mantém o padrão do projeto e não exige servidor novo.

**Consequências.** Quem tem a URL durante o TTL acessa — por isso o TTL é curto, a URL não vai para log nem para histórico do navegador (abre em nova aba via `window.open`, não navegação), e a emissão é auditada. Correção de receita **nunca** sobrescreve: nova linha com `versao` e `substitui_id` (RN-15). `hash` do conteúdo guardado para detectar alteração.

**Revisitar quando** houver acesso do paciente a documento, ou se uma auditoria exigir sessão em cookie `HttpOnly` (ADR-007).

---

## ADR-006 — WhatsApp: registro manual na fase inicial

**Status:** proposto · **Impacto:** médio

**Contexto.** O grupo operacional do WhatsApp é canal real nos dois fluxogramas (etapas 4, 11 e 12). O pedido manda: *"Não presuma que a mensagem será enviada automaticamente"* e *"Não trate as mensagens do WhatsApp como automaticamente enviadas"*.

**[RECOMENDAÇÃO] Fato técnico que precisa de verificação antes de qualquer promessa:** o envio automático **para grupos** é duvidoso. Fontes consultadas divergem — respostas antigas do fórum de desenvolvedores da Meta afirmam que a Cloud API só aceita destinatário individual; um guia de fornecedor (agosto/2026) afirma que existe uma Groups API, mas com limites severos: conta precisa ser *Official Business Account* e **cada grupo é limitado a 8 participantes**. Nenhuma das duas foi confirmada na documentação oficial nesta auditoria. **Conclusão prática: não prometer automação do grupo operacional sem confirmar com o provedor escolhido.**

Fontes: [thread no fórum de desenvolvedores da Meta](https://developers.secure.facebook.com/community/threads/978648829868466/) · [guia de fornecedor sobre Groups API](https://www.unipile.com/whatsapp-group-api/)

**Decisão.** Fase inicial: **só registro manual**. Cada comunicação é uma linha em `call_comunicacoes` com canal, horário, responsável, destinatário e resultado. O sistema ajuda com texto pronto para copiar (incluindo o protocolo, RN-25) e com `wa.me` para conversa individual — o padrão que o portal já usa em `contactHref()`.

**Consequências.** Depende de disciplina da equipe; mitigado porque a tarefa fica pendente na fila até ser registrada. A integração oficial entra na Fase E, **depois** de provedor definido e das regras escritas (item 12.7).

---

## ADR-007 — Manter o modelo "front-end estático + Supabase direto" (com sessão mais estrita)

**Status:** proposto · **Impacto:** alto

**Contexto.** **[FATO]** O token do Supabase fica em `localStorage` — risco já reconhecido em `docs/SEGURANCA.md`, com a evolução sugerida de "proxy/Worker que guarde a sessão em cookie `HttpOnly`". Com dado de saúde, o patamar sobe. Por outro lado, o projeto **já é servido por Cloudflare Workers**, então um BFF não é tecnologia estranha ao ambiente.

**Opções.** (A) Manter o modelo atual, endurecendo sessão e 2FA. (B) Introduzir um Worker BFF com cookie `HttpOnly` e todas as chamadas por ele.

**Decisão.** **(A) na Fase A–D**, com estes endurecimentos obrigatórios em relação ao portal:
- 2FA obrigatório para **todos** os papéis, não só admin (`RNF-07`).
- Inatividade de **15 min** (portal: 30) e duração máxima de **8 h** (portal: 12).
- CSP estendida com o host do novo projeto Supabase, mantendo `script-src` sem `unsafe-inline`.
- Projeção mínima por papel (views), para que um token roubado alcance o mínimo possível.
- Auditoria de **leitura** de conteúdo clínico, não só de escrita.

**(B) fica planejada**, com gatilhos explícitos para virar obrigatória: (1) acesso de paciente ou de terceiro ao sistema; (2) exigência contratual ou de auditoria da clínica por sessão em cookie `HttpOnly`; (3) necessidade de integração que exija segredo de servidor (WhatsApp oficial, assinatura digital) — nesse caso o segredo vai para Edge Function ou Worker, **nunca** para o navegador.

**Consequências de (A).** O risco residual do `localStorage` permanece e **tem de constar no relatório de risco entregue à clínica** — não é algo a omitir. É mitigado, não eliminado.

---

## ADR-008 — Rota `/call/` no mesmo repositório e mesmo deploy

**Status:** proposto · **Impacto:** baixo

**Contexto.** **[FATO]** `wrangler.jsonc` serve a raiz do repositório como assets. Site, portal e páginas de link privado saem do mesmo deploy.

**Decisão.** `call/` na raiz, irmão de `app/`. `_headers` ganha um bloco `/call/*` com `no-store` e `noindex, nofollow` (mais estrito que o `no-cache` do portal, por causa do dado de saúde). `robots.txt` bloqueia `/call/`.

**Consequências.** Um deploy, um domínio, zero infraestrutura nova. Login separado em `/call/login/` — a equipe da clínica **não** passa pelo login do portal da VEMAX.

**Alternativa rejeitada:** submódulo de `/app/`. Faria o VemaxCALL herdar `NAV`, `auth.js` e `requireSession()` do portal, acoplando duas autorizações e duas bases diferentes.
