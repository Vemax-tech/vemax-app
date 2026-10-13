# Segurança do VEMAX: auditoria, correções e o que falta configurar

Este documento registra a auditoria feita no site (`/`) e no portal (`/app/`), o que foi corrigido, como foi testado e o que ainda depende de configuração no Supabase ou no Cloudflare. Para reportar uma vulnerabilidade, veja o [SECURITY.md](../SECURITY.md).

> **Sobre a "pasta de skills de segurança".** O pedido mencionava uma pasta de skills de segurança do projeto. Ela não existe no repositório nem na máquina (só há skills genéricas do Claude). A referência usada foi o `SECURITY.md` do projeto e a auditoria própria abaixo. Se existir material em outro lugar, vale comparar com este relatório.

## 1. Como o sistema funciona (e o que isso muda na segurança)

| Peça | Tecnologia | Consequência |
|---|---|---|
| Site e portal | HTML e JavaScript estáticos no Cloudflare Workers | **Não existe servidor próprio.** Não há sessão de servidor, cookie de login, CSRF clássico nem SQL escrito à mão. |
| Login | Supabase Auth (e-mail e senha, JWT) | Senhas ficam com o Supabase (bcrypt). O navegador guarda o token no `localStorage`. |
| Dados e permissões | Postgres do Supabase com **RLS** | **A segurança de verdade está no banco.** O JavaScript só orienta a interface. |
| Acesso público | `contatos_site` (inserir), portfólio publicado e 6 funções públicas | É a superfície que qualquer visitante alcança. |

Por isso, vários itens do pedido têm resposta diferente da de um sistema com servidor próprio. Está explicado em cada seção.

## 2. Resultado da auditoria

Gravidade: **Alta** = permite dano real ou facilita muito um ataque. **Média** = enfraquece uma defesa. **Baixa** = endurecimento.

| # | Achado (antes) | Gravidade | Situação |
|---|---|---|---|
| 1 | Nenhum cabeçalho de segurança nem CSP: o site podia ser colocado em iframe e qualquer XSS roubaria o token do `localStorage` | Alta | **Corrigido** (seção 3.1) |
| 2 | JWT continuava valendo depois do logout, e não havia duração máxima de sessão nem saída por inatividade | Alta | **Corrigido** (3.2) |
| 3 | Sem verificação em duas etapas; senha de administrador era a única barreira | Alta | **Corrigido** (3.3). Falta cada admin ativar. |
| 4 | Falhas de login não eram registradas nem geravam alerta | Média | **Corrigido** (3.4) |
| 5 | Anti-spam do formulário público contornável (variando o contato) e com risco de um atacante travar o formulário para todos | Média | **Corrigido** (3.5) |
| 6 | Formato de e-mail, telefone e CPF/CNPJ não era validado no banco | Média | **Corrigido** (3.6) |
| 7 | Erros crus do banco apareciam na tela (nome de tabela e de restrição) | Média | **Corrigido** (3.7) |
| 8 | Anexos sem lista de tipos permitidos nem conferência do conteúdo | Média | **Corrigido** (3.8) |
| 9 | Edge Functions comparavam o segredo do webhook de forma comum e confiavam em campos sem tratar | Média | **Corrigido** (3.9) |
| 10 | Qualquer usuário logado, até pendente, lia a matriz de permissões | Baixa | **Corrigido** (3.10) |
| 11 | `supabase-js` carregado como `@2` (versão móvel) de um CDN | Baixa | **Corrigido**: versão fixa `2.117.3` |
| 12 | O site publicava a pasta inteira do repositório (docs, pesquisa, SQL, testes, pendências) | Baixa | **Corrigido**: `.assetsignore` |
| 13 | Troca de senha por e-mail não encerrava outras sessões e não havia "trocar senha" com confirmação da atual | Média | **Corrigido** (3.2) |
| 14 | Logout apagava todas as sessões (padrão do Supabase), sem opção de sair só desta máquina | Baixa | **Corrigido** |
| 15 | `touch()` executável por visitante (inofensiva, mas desnecessária) | Baixa | **Corrigido** |
| 16 | `exceljs` (só da pesquisa de mercado, não vai ao site) depende de `uuid` com falha moderada | Baixa | **Aberto**, sem impacto no site; Dependabot acompanha |
| 17 | Cadastro de funcionário pela tela de login continua aberto (cria conta pendente, sem acesso) | Média | **Decisão da equipe** (seção 5) |

**O que já estava bem:** RLS ligada em todas as tabelas e nenhuma tabela sem política; só duas políticas valem para visitante; todas as funções `SECURITY DEFINER` têm `search_path` fixo; só 6 funções públicas; nenhum segredo no código nem no histórico do Git; texto de usuário sempre entra no DOM como texto; chave `anon` é pública por projeto.

## 3. O que foi implementado

### 3.1 Cabeçalhos e CSP (site e `/app/`): arquivo `_headers`

- `Content-Security-Policy`: só o próprio site, o Supabase do projeto (API e imagens), o `supabase-js` no jsDelivr e as fontes do Google. **Scripts embutidos não são permitidos** (nem `unsafe-inline` nem `unsafe-eval` em `script-src`). Para isso, todo script embutido saiu das páginas: o portal usa `app/js/boot.js` e o site, dois arquivos pequenos.
- `frame-ancestors 'none'` e `X-Frame-Options: DENY` (anti-clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`.
- Páginas com token na URL (`proposta`, `acompanhar`, `avaliar`): `Referrer-Policy: no-referrer`, `Cache-Control: no-store` e `X-Robots-Tag: noindex`.
- `/app/*`: `Cache-Control: no-cache` e `noindex`.
- `style-src` mantém `'unsafe-inline'` porque o portal monta estilos em linha. Estilo é risco bem menor que script; fica registrado como limitação.
- **Testado em Chrome real** (CSP aplicada por um servidor local que lê o `_headers`): site, login, as 3 páginas de link privado, privacidade e portfólio, e as 12 telas do portal já logadas (com um Supabase simulado) carregam sem nenhuma violação. Uma página de teste com script embutido e script externo foi corretamente bloqueada.

### 3.2 Sessão, logout e senha

**Por que não há cookie `HttpOnly`.** O token fica no `localStorage` (padrão do `supabase-js` em site estático). Cookie `HttpOnly` exigiria um servidor ou proxy próprio entre o navegador e o Supabase, o que mudaria a arquitetura. A mitigação principal é a **CSP acima**: sem script injetado, o token não é lido. Fica como evolução possível (seção 6).

| Controle | Onde é aplicado | Como |
|---|---|---|
| Saída por **inatividade** (30 min, com aviso 2 min antes) | Navegador, vale para todas as abas abertas | `app/js/sessao.js` |
| **Duração máxima** da sessão (12 h, configurável) | **Servidor (RLS)** | função `sessao_valida()` compara com `auth.sessions`; passou do limite, o banco recusa os dados mesmo com token ainda válido |
| **Revogação imediata** no logout | **Servidor (RLS)** | logout, "encerrar outras sessões" ou sessão apagada: o mesmo token deixa de dar acesso aos dados na hora |
| Conferência periódica | Navegador | a cada 5 min e ao voltar para a aba, pergunta `sessao_valida()`; se falso, sai |
| Logout em outra aba | Navegador | o evento `SIGNED_OUT` leva esta aba ao login |
| Logout só desta máquina | Navegador | `signOut({ scope: 'local' })` |
| Trocar senha | Navegador | exige a senha atual (conferida num cliente descartável, sem derrubar a sessão em uso), regra de senha, e **encerra as outras sessões** |
| Redefinir senha por e-mail | Navegador | mesma regra de senha; encerra as outras sessões; se a conta tem 2FA, pede o código antes |
| Fixação e sequestro de sessão | Supabase Auth | tokens novos a cada login e rotação do refresh token (confira o painel, seção 4) |
| Rotas e operações sensíveis | **Servidor (RLS)** | toda leitura e escrita passa por `can()`/`is_admin()`; esconder botão não é proteção |

A regra de senha (`avaliarSenha`) exige 10 ou mais caracteres e rejeita senhas comuns, repetidas, sequências simples e senhas que contenham o e-mail.

### 3.3 Verificação em duas etapas (2FA)

- TOTP (Google Authenticator, Authy, 1Password…), em **Configurações > Segurança**. Login com senha seguida do código; 5 códigos errados derrubam a sessão parcial.
- **Aplicado no servidor:** quem tem 2FA e entrou só com senha (nível `aal1`) **não age como administrador** (cai para as permissões de membro). O portal ainda o leva ao passo do código.
- Opção `exigir_mfa_admin`: com ela ligada, administrador **sem** 2FA também vira membro até ativar (ele ainda consegue entrar para ativar). Só ligue depois que todos os administradores ativarem.
- **Recuperação:** o Supabase não gera códigos de reserva. Se um administrador perder o celular, outro administrador do projeto remove o 2FA dele no painel (Authentication › Users). Isso está avisado na tela de ativação.

### 3.4 Eventos de segurança e alerta de tentativas de login

- Tabela `eventos_seguranca` (só administradores leem; ninguém grava ou apaga pelo navegador): login, falha de login, logout, sessão expirada, inatividade, 2FA ativado/removido/falhou, senha alterada, outras sessões encerradas, acesso negado, permissão e papel alterados, usuário desativado, cadastro solicitado e alerta de força bruta.
- **Privacidade:** e-mail e IP são guardados só como **hash com sal** (nunca em texto). Nunca entram senha, token, cookie ou segredo. Retenção de 180 dias.
- **Alerta:** 5 falhas de login na mesma conta em 15 minutos geram um evento e uma notificação para os administradores (uma por hora por conta). Quem registra a falha é a própria tela de login, por uma função com limite por IP e global, para ninguém conseguir encher o log.
- A mudança de permissão, papel e ativação também grava no log de segurança, além do log de atividades já existente.
- Aviso honesto: o log **detecta e alerta, mas não bloqueia** tentativas. O bloqueio de força bruta de verdade é do Supabase Auth (seção 4).

### 3.5 Limites contra abuso

| Alvo | Limite | Onde |
|---|---|---|
| Formulário público de contato | 3 por contato/h, **5 por IP/h**, 60 no total/h; exige e-mail ou telefone válido | trigger no banco (`limitar_contatos`, IP via `cf-connecting-ip` e guardado só como hash) |
| Registro de falha de login | 30 por IP a cada 10 min e 600 no total/h | função no banco |
| Eventos da pessoa logada | 60 por hora por pessoa | função no banco |
| Login, cadastro, redefinição de senha, envio de e-mail | limites do Supabase Auth, `429` e `Retry-After` | **painel do Supabase** (seção 4); a tela mostra "Muitas tentativas" |
| Espera visual no login | 5 s, 10 s, 20 s… até 5 min após 3 erros seguidos | `esperaLogin()`: só desestímulo na tela, **não é controle de segurança** |

Não há bloqueio permanente de conta (evita que terceiros negem acesso a alguém): o atraso é progressivo e por IP, e a conta nunca é travada.

### 3.6 Validação de entradas

Regras em um lugar só (`app/js/validacao.js`), espelhadas no banco com `CHECK ... NOT VALID` (valem para tudo o que for gravado daqui para frente, sem reprovar registros antigos):

| Campo | Navegador | Servidor (banco) |
|---|---|---|
| E-mail | formato, 254 caracteres | `email_ok()` |
| Telefone | máscara livre, 8 a 15 dígitos | `telefone_ok()` |
| CPF e CNPJ | dígitos verificadores | `documento_valido()` |
| Contato do formulário do site | e-mail **ou** telefone | trigger de inserção |
| Tamanhos de texto | `maxlength` | `CHECK (char_length ...)` em todas as colunas de texto livre |
| Valores e datas | `number`/`date` com limites | `numeric(12,2)`, `CHECK (valor > 0)`, `CHECK (fim >= inicio)` |
| URLs | `http`/`https` | `CHECK (url ~* '^https?://')` |
| Status, tipos, canais | listas fixas | `CHECK (... in (...))` |
| Arquivos | extensão, tamanho e **assinatura real** do conteúdo (PDF, PNG, ZIP/Office…); bloqueia `.html`, `.svg`, `.exe`, dupla extensão e caminho no nome | lista de tipos permitidos no bucket `projetos` (sem HTML nem SVG) |
| Identificadores | UUID gerado no banco; ID inválido na URL devolve "não encontrado" | tipo `uuid` + RLS |

Foi tomado cuidado para **não gerar falso positivo**: nomes com acento, travessão, `&`, parênteses e ponto continuam aceitos (há teste).

### 3.7 Mensagens de erro

`mensagemErro()` traduz o erro do banco em frase segura. O texto cru (tabela, coluna, restrição, host) nunca vai para a tela, só para o console do navegador de quem está logado.

### 3.8 Anexos

Conteúdo conferido pelos primeiros bytes (um executável renomeado para `.png` é barrado), extensões perigosas e dupla extensão bloqueadas, nome sem caminho, limite de 50 MB (5 MB no portfólio), bucket `projetos` com lista de tipos, download por URL assinada de 2 minutos.

### 3.9 Edge Functions (`notificar-email`, `notificar-contato`)

Comparação do segredo do webhook em **tempo constante**, limite de 20 KB no corpo, `JSON` lido com tratamento de erro, assunto em linha única (sem quebra de linha), HTML escapado e variáveis de ambiente verificadas em vez de `!`. A `notificar-contato` está marcada como legada: use a `notificar-email`.

### 3.10 Outros ajustes

Matriz de permissões visível só a contas ativas; versão exata do `supabase-js`; `.assetsignore` impede publicar `docs/`, `research/`, `*.md`, `supabase/`, `tests/`, `scripts/` e `to-do/` no site; `.github/dependabot.yml`; o `scripts/verificar.mjs` passa a **barrar** script embutido, `eval`, `innerHTML` dinâmico, `service_role` no navegador, CSP ausente e `supabase-js` sem versão fixa.

## 4. Itens que dependem do painel do Supabase e do Cloudflare (não dá para fazer pelo código)

Confira estes pontos e marque no `to-do/PENDENCIAS.md`:

**Supabase › Authentication**
- [ ] **Rate Limits:** mantenha limites baixos para login (os padrões costumam ser 30 requisições a cada 5 min por IP), cadastro e envio de e-mail. Esses limites são o bloqueio real contra força bruta.
- [ ] **URL Configuration:** *Site URL* = o endereço oficial do site; *Redirect URLs* só com `/app/login/` do site oficial (sem curingas). Evita redirecionamento malicioso no link de redefinição de senha.
- [ ] **Sessions / JWT:** validade do access token em até 3600 s; *refresh token rotation* ligada; *reuse interval* curto. Considere as chaves de assinatura assimétricas (JWT Signing Keys) se o projeto oferecer.
- [ ] **Passwords:** mínimo de 10 caracteres e exigir letras e números; ative *Leaked password protection* se o plano permitir.
- [ ] **Multi-Factor Authentication:** TOTP habilitado (necessário para o 2FA deste portal).
- [ ] **Attack Protection > CAPTCHA:** recomendado ligar o Cloudflare Turnstile (login, cadastro, redefinição). Exige criar o widget no Cloudflare e informar as chaves no Supabase. O código do site ainda **não** inclui o widget; quando as chaves existirem, a mudança é pequena (um `script` do Turnstile, ajuste da CSP e o `captchaToken` nas chamadas).
- [ ] **Cadastro público:** decidir entre desligar *Allow new users to sign up* (contas por convite) ou manter com aprovação e captcha (seção 5).
- [ ] **SMTP próprio** (por exemplo Resend): o e-mail padrão do Supabase tem limite baixo e pode atrasar redefinições.
- [ ] **Email confirmations** ligado.

**Supabase › outros:** *Database › Backups* ativos; *Advisors* (Security) sem alertas; chave `service_role` **nunca** no repositório nem no navegador (hoje não está).

**Cloudflare:** confirmar que o deploy publicou o `_headers` (o painel de Configurações > Segurança mostra "CSP ativa"); considerar *WAF rate limiting* para o domínio; HTTPS e HSTS já ativos.

**Antes de ligar:** aplicar a migration `014_seguranca.sql`. Se algo der errado, o cabeçalho do arquivo mostra como desligar a duração máxima da sessão e a exigência de 2FA com uma linha de SQL.

## 5. Decisão da equipe: cadastro de funcionário pela tela de login

O pedido original do portal diz "sem cadastro público", mas o fluxo de cadastro com aprovação já existia e foi mantido. Hoje: qualquer pessoa pode **solicitar** conta; ela nasce **pendente e inativa**, sem acesso a nenhum dado (RLS), e só o administrador aprova. O risco que sobra é **spam de contas** e e-mails de confirmação. Opções:

1. **Desligar o cadastro** no Supabase e criar contas por convite (mais seguro, recomendado se a equipe é pequena e fixa).
2. **Manter** com CAPTCHA (seção 4) e aprovação (como está).

## 6. Riscos que permanecem

| Risco | Por que permanece | Mitigação |
|---|---|---|
| Token no `localStorage` | arquitetura de site estático com Supabase | CSP estrita, sessão com prazo e revogação no servidor, 2FA. Evolução: proxy/Worker que guarde a sessão em cookie `HttpOnly`. |
| `style-src 'unsafe-inline'` | estilos em linha do portal | scripts não têm `unsafe-inline`; risco de estilo é baixo |
| Dependência do jsDelivr para o `supabase-js` | biblioteca carregada de CDN | versão fixa e CDN restrita na CSP. Evolução: copiar a biblioteca para o repositório. |
| Força bruta depende do Supabase | login é feito direto no Supabase | limites do painel + alerta + 2FA + captcha recomendado |
| bcrypt (Supabase) em vez de Argon2id | escolha do provedor | aceitável; não implementar hash próprio |
| Sem códigos de reserva do 2FA | limitação do Supabase | recuperação pelo painel do Supabase |
| Listas filtradas no navegador (limite de 1000 linhas por consulta) | simplicidade | revisar se a base crescer |
| `valor_estimado` e `valor_contratado` visíveis a quem acessa Leads/Projetos | são colunas comerciais, não financeiras | financeiro real exige a permissão Financeiro |

## 7. Testes executados

Todos rodam no CI (`.github/workflows/testes.yml`) e localmente:

| Comando | O que cobre |
|---|---|
| `npm run check` | sintaxe, imports, páginas, **sem script embutido**, CSP presente, `supabase-js` com versão fixa, sem `eval`/`innerHTML` dinâmico, migrations em sequência |
| `npm test` | regras de negócio, **validações** (e-mail, telefone, CPF/CNPJ, senha, arquivos, busca), inatividade, espera do login, mensagens de erro, cabeçalhos e Edge Functions |
| `node tests/integration/sql-seguranca.mjs` | **banco real em memória (PGlite)**: sessão revogada e vencida, 2FA (`aal1`/`aal2`), eventos e alerta de força bruta, privacidade dos hashes, limite por IP, validações de formato, **injeção de SQL**, funções executáveis por visitante, RLS em todas as tabelas, políticas abertas a visitante |
| `node tests/integration/sql-funcional.mjs` | regressão do banco: funil, propostas, projetos, chamados, financeiro, contratos, lixeira e auditoria |
| `node tests/integration/telas.mjs` | telas, **login (senha errada, 429, 2FA, 5 códigos errados, redefinição)**, sessão (aviso e saída por inatividade, queda no servidor, logout em outra aba), aba Segurança, e uma varredura que reprova qualquer tela que mostre `null`, `undefined` ou `[object` |
| Chrome real + servidor com `_headers` | CSP sem violações no site e no portal |

**Teste de injeção de SQL:** payloads clássicos (`' OR '1'='1`, `'; DROP TABLE ...`, `UNION SELECT token ...`) foram enviados às 6 funções públicas e a campos de texto, em banco de teste. Nenhuma devolveu dado, aceitou resposta ou alterou tabela; os payloads foram gravados como texto comum. O único SQL dinâmico do banco (`interacao_preenche`) usa `%I` sobre uma lista fechada por `CHECK`.

**Não testado:** contra o projeto Supabase real (nada foi aplicado em produção), em navegador de celular, nem o comportamento exato de `auth.sessions` e das claims do JWT (`session_id`, `aal`) do seu projeto. Depois de aplicar a migration, abra **Configurações > Segurança > Verificação das proteções** e faça login, logout e 2FA uma vez.
