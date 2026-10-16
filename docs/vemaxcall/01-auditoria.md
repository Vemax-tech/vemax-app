# 1. Auditoria técnica do VEMAX e arquitetura encontrada

> **Convenção deste conjunto de documentos**
> **[FATO]** — verificado nos arquivos do repositório ou no painel do Supabase, com o caminho indicado.
> **[RECOMENDAÇÃO]** — proposta técnica desta auditoria, ainda não implementada.
> **[PENDENTE]** — depende de resposta do responsável pelo negócio; **não** foi decidido.

Data da auditoria: **16/10/2026** · Branch: `feat/seguranca` · Último commit: `019a8f9`

---

## 1.1 O que existe hoje

**[FATO]** O repositório tem **duas** aplicações, exatamente como descrito no pedido:

| Aplicação | Onde | O que é |
|---|---|---|
| **Página externa** (site institucional) | `index.html`, `assets/`, `portfolio/caso.html`, `privacidade.html` | Site one-page: triagem do problema por palavras-chave, portfólio dinâmico, formulário de contato com anti-spam |
| **Página interna** (portal da equipe) | `app/` (21 páginas HTML, 36 módulos JS) | Leads, propostas, clientes, projetos, tarefas, suporte, financeiro, mercado, conhecimento, portfólio, equipe, configurações |
| Páginas de link privado | `proposta.html`, `acompanhar.html`, `avaliar.html` | Acesso do cliente por token na URL, sem login |

**[FATO]** Não há terceira área. O menu do portal é a constante `NAV` em `app/js/ui.js` — uma lista de 14 itens `[pasta, rótulo, ícone, permissão, grupo]`. Acrescentar um módulo é acrescentar uma linha nessa lista.

## 1.2 Stack real (não presumida)

**[FATO]** Levantada em `package.json`, `wrangler.jsonc`, `app/js/supabase.js` e `supabase/migrations/`:

| Camada | Tecnologia | Evidência |
|---|---|---|
| Build | **nenhum** | `package.json` declara apenas `test` e `check`; sem bundler, sem transpilador |
| Linguagem | **JavaScript ES2022, ES modules nativos** | `app/js/*.js` carregados por `<script type="module">`; **não há TypeScript no projeto** |
| Front-end | HTML + CSS + JS puro, sem framework | nenhuma dependência de runtime em `package.json` |
| Cliente do banco | `@supabase/supabase-js@2.117.3` via jsDelivr, **versão exata** | `app/js/supabase.js:1`; `scripts/verificar.mjs` falha se a versão não for exata |
| Backend | **Supabase gerenciado** (Postgres 17.11, Auth, Storage, PostgREST) | projeto `vuysavflfjyjlzrukfuo`, região `sa-east-1` |
| Funções de servidor | 2 Edge Functions em Deno/TypeScript | `supabase/functions/notificar-contato/`, `notificar-email/` |
| Hospedagem | **Cloudflare Workers (static assets)** | `wrangler.jsonc` com `assets.directory: "."`; cabeçalhos em `_headers` |
| Testes | `node --test` (unitários) + PGlite (Postgres em memória) + jsdom (telas) | `tests/`, `tests/integration/` |
| Verificação estática | script próprio, substitui o lint | `scripts/verificar.mjs` (6 classes de verificação) |
| Tipografia e tokens | Sora (Google Fonts) + `shared/tokens.css` | 22 linhas de variáveis CSS compartilhadas entre site e portal |

**Decisão arquitetural central do projeto** (documentada em `README.md`, seção Arquitetura):

> *front-end estático que fala direto com o Supabase. Não há servidor próprio. (...) Como o navegador chama o banco, **a segurança fica na RLS** do Postgres. As checagens em JavaScript existem só para a interface.*

Essa frase é a restrição mais importante para o VemaxCALL: **toda regra de negócio e toda autorização têm de viver no Postgres** (RLS, CHECK, triggers, funções `security definer`). O JavaScript é camada de conveniência.

## 1.3 Autenticação e autorização — como funcionam de verdade

**[FATO]** `app/js/auth.js` → `requireSession()` faz, em ordem:

1. `sb.auth.getSession()` — sem sessão, redireciona para `/app/login/`.
2. RPC `sessao_valida()` — o **servidor** diz se a sessão ainda existe em `auth.sessions` e se não passou do limite de horas (`config_seguranca.sessao_max_horas`, hoje 12). Resolve o problema clássico de "JWT continua válido depois do logout".
3. `mfa.getAuthenticatorAssuranceLevel()` — quem tem 2FA cadastrado precisa ter passado por ele (`aal2`).
4. Carrega `profiles` + `permissoes` e monta `can(modulo, acao)`.

**[FATO]** O modelo de permissão atual é mais simples do que parece:

```sql
-- supabase/migrations/001_init.sql
create table public.permissoes (
  modulo text not null, pode_ver boolean, pode_editar boolean,
  primary key (modulo)            -- <<< a chave é SÓ o módulo
);
```

Consequências verificadas:

- `profiles.papel` aceita **apenas** `'admin'` ou `'membro'` (CHECK em `001_init.sql`).
- A tabela `permissoes` **não tem coluna de usuário**. Ela é o perfil único do papel "membro": se Membro pode ver Financeiro, **todos** os membros podem.
- `is_admin()` dá acesso irrestrito: `can()` devolve `true` para qualquer módulo quando `papel = 'admin'` e o 2FA está em ordem (`014_seguranca.sql`).
- **Não existe nenhum conceito de organização, empresa ou tenant** em nenhuma das 40 tabelas. O sistema é mono-inquilino: a organização é a própria VEMAX.

**[FATO]** `can_tabela(tabela, acao)` (`012_area_interna.sql`) mapeia tabela → módulo e é usada em quase todas as políticas RLS. Tabela sem módulo mapeado → só administrador.

## 1.4 Banco de dados

**[FATO]** 14 migrations, `001` a `014`, 1.841 linhas de SQL. **Todas estão aplicadas no projeto de produção** — verificado via API do Supabase: as 40 tabelas de `public` existem, incluindo `config_seguranca`, `seguranca_sal`, `eventos_seguranca` (da `014`) e `contratos` (da `013`), e **todas as 40 têm RLS habilitada**.

> ⚠️ **Correção de documentação:** `to-do/PENDENCIAS.md` lista as migrations `006`–`014` como pendentes de aplicação. **Isso está desatualizado** — elas já foram aplicadas. O arquivo precisa ser revisado para não induzir alguém a reaplicá-las.

Padrões de modelagem consistentes e reutilizáveis pelo VemaxCALL:

| Padrão | Como é feito | Exemplo |
|---|---|---|
| Chaves | `uuid primary key default gen_random_uuid()` | todas as tabelas de negócio |
| Número legível | `numero bigint generated always as identity` **ao lado** do uuid | `chamados.numero` |
| Validação no banco | `CHECK (char_length(x) between a and b)`, regex, funções `email_ok()` / `telefone_ok()` / `documento_valido()` | `012`, `014` |
| Exclusão recuperável | `deleted_at` + `deleted_by`, preenchidos por trigger `marcar_exclusao()` (o navegador não falsifica) | 8 tabelas |
| Índices parciais | `create index ... where deleted_at is null` | `tarefas`, `chamados`, `cobrancas` |
| Auditoria de campos | trigger `log_mudancas('campo1','campo2')` grava `de → para` em `atividades` | 14 triggers |
| Linha do tempo | tabela única `interacoes (entidade, entidade_id, tipo, texto)` com trigger que preenche `cliente_id` | `012` |
| Transação de fluxo | função `security definer` que faz tudo ou nada e checa permissão com `raise ... errcode = '42501'` | `projeto_de_proposta()`, `aplicar_modelo_projeto()` |
| Rótulos configuráveis | tabela `opcoes (grupo, chave, nome, ordem, ativo)` — **chaves fixas no banco, nomes editáveis pelo admin** | `012` |
| Idempotência | `gerar_cobrancas_recorrentes()` cria o período sem duplicar | `013` |

## 1.5 Segurança já implementada

**[FATO]** Levantado em `_headers`, `014_seguranca.sql`, `app/js/sessao.js`, `app/js/validacao.js`, `docs/SEGURANCA.md`:

- CSP estrita sem `unsafe-inline` **em scripts** (só em `style-src`); `frame-ancestors 'none'`, `object-src 'none'`, HSTS, `nosniff`, Permissions-Policy.
- Zero script embutido nas páginas: `app/js/boot.js` lê `data-modulo`/`data-fn` e só aceita `/^[a-z]+$/` + `init|initFicha`. `scripts/verificar.mjs` reprova qualquer página que viole isso.
- DOM construído por `h()` (`app/js/ui.js`) — texto sempre via `createTextNode`, nunca `innerHTML` com dado de usuário.
- Sessão: 30 min de inatividade com aviso de 2 min, sincronizada entre abas por `localStorage`, conferência no servidor a cada 5 min, limite duro de 12 h e revogação efetiva.
- 2FA (TOTP) com degradação de poderes: admin sem 2FA perde os poderes de admin quando `exigir_mfa_admin = 1`.
- `eventos_seguranca`: e-mail e IP guardados **apenas como `sha256(valor + sal)`**; sal em tabela com RLS e sem política (só funções acessam). Retenção de 180 dias. Alerta de força bruta (5 falhas / 15 min).
- Upload: `validarArquivo()` confere nome, extensão dupla (`x.pdf.exe`), tamanho **e a assinatura dos primeiros bytes**; buckets com `allowed_mime_types` sem HTML/SVG/executável.
- `mensagemErro()` traduz códigos do Postgres para frases seguras — nunca mostra texto cru do banco.
- `limparBusca()` e `escaparLike()` para o que entra em filtros do PostgREST.

**[FATO]** O *Security Advisor* do Supabase, rodado nesta auditoria, aponta:

| Nível | Achado | Avaliação |
|---|---|---|
| WARN | **Leaked password protection desligada** (HaveIBeenPwned) | **ação real pendente** — ligar no painel, custo zero |
| INFO | `seguranca_sal` com RLS e sem política | **intencional e correto** (há comentário explicando na `014`) |
| WARN | 6 funções `security definer` executáveis por `anon` | **intencional**: são as RPC de link público (`proposta_publica`, `responder_proposta`, `avaliacao_publica`, `responder_avaliacao`, `projeto_publico`, `registrar_login_falho`), todas com `grant` explícito no SQL |
| WARN | 20 funções `security definer` executáveis por `authenticated` | **intencional**: `can`, `is_admin`, `sessao_valida` etc. precisam ser chamáveis; cada uma valida permissão internamente |

## 1.6 Testes e qualidade

**[FATO]** Três camadas, todas reaproveitáveis pelo VemaxCALL:

1. **Unitários** — `tests/*.test.js` (`node --test`), sobre as funções puras de `app/js/lib.js` e `validacao.js`.
2. **Banco real em memória** — `tests/integration/banco.mjs` sobe **PGlite** (Postgres de verdade), simula `auth.users` / `auth.sessions` / `auth.mfa_factors` / `auth.uid()` / `auth.jwt()` / `storage`, aplica **as migrations do repositório em ordem** e oferece `as({uid, sid, aal, ip}, sql)` para executar como qualquer papel. `sql-seguranca.mjs` (187 linhas) testa revogação de sessão, limite de horas, 2FA, injeção e permissões; `sql-funcional.mjs` (251 linhas) testa os fluxos.
3. **Telas simuladas** — `tests/integration/telas.mjs` (715 linhas) renderiza cada módulo em **jsdom** com um Supabase falso (`fake-supabase.mjs`), via um *loader hook* que troca `./supabase.js` pelo dublê.

**[RECOMENDAÇÃO]** Essa infraestrutura é o ativo mais valioso para o VemaxCALL: as regras de autorização do novo módulo podem ser testadas contra Postgres real, sem tocar em produção. É o que torna TDD viável nas regras de acesso.

**[FATO]** CI: `.github/workflows/qualidade.yml` (links dos `.md`, SVGs) e `testes.yml`. O de qualidade roda só quando `.md` muda — economia deliberada de minutos de Actions em repo privado.

## 1.7 Pontos de atenção encontrados na base atual

Nenhum destes bloqueia o VemaxCALL, mas todos o afetam:

| # | Achado | Impacto no VemaxCALL |
|---|---|---|
| A1 | **Não há multi-inquilino.** Nenhuma tabela tem organização; `is_admin()` vê tudo | O VemaxCALL é para **outra empresa**. Precisa de isolamento que o modelo atual não tem. Ver ADR-001 |
| A2 | `permissoes` é global por módulo, não por usuário nem por papel operacional | Os 4 papéis do fluxograma (Call Center, Arquivo, Recepção, Médico) **não são expressáveis** hoje. Ver ADR-003 |
| A3 | Token do Supabase em `localStorage` (risco já documentado em `docs/SEGURANCA.md`) | Aceitável para dado comercial; **sobe de patamar** com dado de saúde. Ver ADR-007 |
| A4 | Listas filtradas no navegador, limite de 1.000 linhas por consulta do PostgREST | Operação de call center gera volume; paginação precisa ir para o servidor desde o início |
| A5 | `to-do/PENDENCIAS.md` desatualizado (migrations já aplicadas) | Risco de alguém reaplicar migration. Corrigir |
| A6 | Leaked password protection desligada no Supabase Auth | Ligar antes de criar contas de uma empresa cliente |
| A7 | Sem TypeScript; sem build | Introduzir TS só no VemaxCALL criaria duas culturas no mesmo repo. Ver ADR-002 |

## 1.8 Skills encontradas

**[FATO]** Procurei em `.claude/` do projeto, `~/.claude/skills/`, `~/.claude/plugins/` e por `CLAUDE.md` no repositório:

- **O repositório NÃO tem pasta de skills, nem `.claude/`, nem `CLAUDE.md`.** Não existe skill específica da VEMAX — nem de segurança, nem de engenharia. O que cumpre esse papel hoje são `CONTRIBUTING.md`, `SECURITY.md`, `docs/SEGURANCA.md` e o `scripts/verificar.mjs`.
- As skills disponíveis na máquina são as **nativas do Claude Code** (`/security-review`, `/code-review`, `/simplify`, `/init`, `/run`, `/update-config`) e as sincronizadas da Anthropic (`docs`, `docx`, `pdf`, `pptx`, `xlsx`, `skill-creator`, `deep-research`).
- **Biblioteca do Matt Pocock:** avaliada. O repositório `mattpocock/skills` contém as 8 skills citadas no pedido — `grill-with-docs`, `domain-modeling`, `codebase-design`, `to-spec`, `to-tickets`, `tdd`, `implement`, `code-review` — além de `research`, `diagnosing-bugs`, `pr`, `retro`, `prototype`, `wayfinder` e outras. O plugin **`mattpocock-skills` está no catálogo oficial** já em cache nesta máquina, mas **não está instalado**.

**[RECOMENDAÇÃO]** Não instalei nada (o pedido é explícito: verificar a necessidade antes). O que faz sentido instalar, e por quê:

| Skill | Por que serve aqui |
|---|---|
| `domain-modeling` | mantém glossário e ADRs vivos — este projeto introduz vocabulário clínico/operacional novo (prontuário, custódia, receita) |
| `tdd` | as regras de acesso e a máquina de estados são exatamente o tipo de código que precisa de teste primeiro; a infra PGlite já existe |
| `codebase-design` | decidir a fronteira entre VemaxCALL e portal sem acoplar |
| `to-spec` / `to-tickets` | transformar esta descoberta em backlog rastreável |
| `code-review` | revisão contra a spec, não só contra o diff |

Instalação, se aprovada: `claude plugin install mattpocock-skills@claude-plugins-official`, depois `/setup-matt-pocock-skills` uma vez no repo.

Duas ressalvas:
- `/setup-matt-pocock-skills` configura *issue tracker* e layout de documentação — **pode conflitar** com a organização atual de `docs/`. Rodar com revisão do diff.
- Existe um `/code-review` **nativo** e um `code-review` do Matt Pocock. Instalar os dois cria ambiguidade de nome.

## 1.9 O que NÃO foi auditado

Para não declarar auditoria completa onde não houve exame:

- **Os dois fluxogramas não estão no repositório.** Procurei por `*flux*`, `*fluxo*`, `*call*` e em `docs/assets/` — não há arquivo deles. Toda a especificação dos fluxos neste conjunto de documentos foi derivada **do texto do pedido**, etapa por etapa. **A fidelidade aos fluxogramas originais não pôde ser verificada** e precisa de conferência com os arquivos em mão. Ver `03-fluxos.md`, seção "Fidelidade".
- Não executei `npm test` nem `npm run check` nesta sessão (auditoria de leitura). Os testes de integração exigem `npm install` em `tests/integration/`.
- Não li `research/` (pesquisa de mercado) além do `README` — não tem relação com o VemaxCALL.
- Não inspecionei dados de produção além da contagem de linhas por tabela e dos alertas do *advisor*. **Nenhum dado pessoal foi lido.**
- Não examinei as configurações do painel do Supabase (rate limits, SMTP, redirect URLs) — não são legíveis pela API usada.
