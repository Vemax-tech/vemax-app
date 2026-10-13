# Pendências para fazer em casa

Marque `[x]` conforme for concluindo. Tudo aqui depende de você: são ações no painel do Supabase, no Resend, no domínio ou decisões de conteúdo. O código já está escrito.

> **Estado do código:** as mudanças mais recentes (propostas, acompanhamento, avaliação, notificações, PDF, função de e-mail) podem estar **sem commit**. Veja `git status` antes de começar.

---

## 1. Aplicar as migrations no Supabase (obrigatório, nesta ordem)

Painel do Supabase → **SQL Editor** → cole o conteúdo de cada arquivo de `supabase/migrations/` e execute. A `005` já foi aplicada.

- [ ] `006_portfolio.sql` — tabela de cases do portfólio, bucket público de imagens
- [ ] `007_contato_antispam.sql` — limite de mensagens por hora no formulário
- [ ] `008_agil.sql` — WIP, bloqueio, ciclos, retrospectiva e datas de fluxo em Projetos
- [ ] `009_contato_perfil.sql` — perfil opcional do diagnóstico guiado
- [ ] `010_funil_propostas.sql` — etapa "Proposta enviada" e propostas online
- [ ] `011_notificacoes_cliente.sql` — sino de notificações, acompanhamento do cliente, avaliação pós-entrega
- [ ] `012_area_interna.sql` — clientes, funil ampliado, tarefas, suporte, financeiro, configurações, lixeira e auditoria (a nova área interna; só adiciona, não apaga nada)

- [ ] `014_seguranca.sql` — sessão com prazo máximo, 2FA para administradores, log de eventos de segurança, limite por IP no formulário e validações de formato. **Aplique depois de publicar o código novo** (o portal funciona antes dela, só sem esses recursos). Se algo der errado, o cabeçalho do arquivo mostra como desligar a duração máxima da sessão e a exigência de 2FA.
- [ ] `013_contratos_recorrentes.sql` — contratos recorrentes (suporte, hospedagem…) e geração automática de cobranças. Só depois da `012`.

Depois de cada uma, se aparecer erro, copie a mensagem. Não pule a ordem: a `011` precisa da `008` e da `010`, e a `012` precisa de todas as anteriores e a `013` precisa da `012`. **A nova área interna só funciona depois da `012`.** Faça um backup (Supabase → Database → Backups) antes de aplicar.

## 2. Configurações no painel do Supabase

- [ ] **Authentication → Providers → Email**: "Allow new users to sign up" ligado e "Confirm email" ligado (já funcionando, só confirme)
- [ ] **Equipe → Permissões** no portal: definir o que o papel Membro pode ver e editar nos módulos novos (Leads e propostas, Clientes, Projetos e tarefas, Suporte, Financeiro, Portfólio). Padrão da `012`: Clientes só leitura, Suporte editável, Financeiro fechado. Quem atende chamados precisa também **ver** Clientes; quem move tarefas precisa **editar** Projetos.
- [ ] **Decidir sobre o cadastro de funcionário pela tela de login** (`005`). O prompt da área interna diz “sem cadastro público”. Hoje o pedido cria uma conta pendente e sem acesso até o admin aprovar. Se quiser fechar de vez: desligue *Allow new users to sign up* e crie as contas por convite (Authentication → Users). Se mantiver, ative captcha.
- [ ] **Configurações** (como administrador): revisar os nomes das etapas, as categorias de serviço, as origens de lead, os motivos de perda e os 7 modelos de projeto que já vêm prontos
- [ ] Testar a nova área interna no Supabase real (ela foi testada com banco e API simulados): criar cliente, lead, proposta aprovada → projeto, tarefa, chamado, cobrança com pagamento, lixeira e restaurar

## 2b. Segurança (veja `docs/SEGURANCA.md`, seção 4)

- [ ] **Cada administrador ativa o 2FA** em Configurações > Segurança (guarde o celular; sem códigos de reserva)
- [ ] Supabase › Authentication: conferir *Rate Limits*, *Site URL* e *Redirect URLs*, validade do JWT, regra de senha, MFA habilitado, e-mail de confirmação
- [ ] Decidir: **desligar o cadastro público** (contas por convite) ou manter com CAPTCHA (Cloudflare Turnstile)
- [ ] Configurar SMTP próprio (o e-mail padrão do Supabase tem limite baixo)
- [ ] Depois que todos os admins ativarem o 2FA: ligar `exigir_mfa_admin` em Configurações > Segurança
- [ ] Conferir em Configurações > Segurança > *Verificação das proteções* que o Cloudflare publicou a CSP
- [ ] Rodar o *Security Advisor* do Supabase (Database › Advisors)

## 3. Aviso por e-mail (opcional, mas recomendado)

Detalhes também no `README.md`, seção da Edge Function `notificar-email`.

- [ ] Criar conta no **Resend** (resend.com) e gerar uma API key
- [ ] Definir os segredos da função no Supabase:
  - `RESEND_API_KEY`
  - `NOTIFY_TO` (seus e-mails, separados por vírgula)
  - `NOTIFY_FROM` (para testar sem domínio: `Vemax <onboarding@resend.dev>`; nesse caso o `NOTIFY_TO` precisa ser o e-mail da sua conta no Resend)
  - `WEBHOOK_SECRET` (invente uma senha longa e aleatória)
  - `SITE_URL` (opcional, ex.: `https://seudominio.com.br`)
- [ ] Publicar a função (terminal, com o Supabase CLI logado e o projeto vinculado):
  ```
  supabase functions deploy notificar-email --no-verify-jwt
  ```
- [ ] **Database → Webhooks**: criar webhook na tabela **`notificacoes`**, evento INSERT, método POST, URL da função, header `x-webhook-secret: <o mesmo WEBHOOK_SECRET>`
- [ ] Se existir webhook antigo em `contatos_site`, apagar (senão o aviso de lead chega em dobro)
- [ ] Testar: enviar um contato pelo site e conferir o e-mail e o sino do portal

## 4. Testar de ponta a ponta (rodar `npx serve .` na pasta do projeto)

Site: `http://localhost:3000/` · Portal: `http://localhost:3000/app/`

- [ ] Formulário de contato: abre o WhatsApp com o número certo e o lead aparece no portal (Contatos)
- [ ] Diagnóstico guiado: preencher o perfil opcional e ver as etiquetas no lead
- [ ] Portfólio: criar um case com imagem no portal, publicar, ver na home e na página própria (`portfolio/caso.html?c=...`)
- [ ] Funil: arrastar o lead pelas colunas na visão "Quadro"
- [ ] Proposta: criar, liberar o link, abrir em janela anônima, aceitar e conferir a resposta e o sino
- [ ] PDF da proposta: botão PDF no portal e "Baixar em PDF" na página do cliente
- [ ] Projetos: limite de WIP, bloquear/desbloquear, criar um ciclo e encerrar com retrospectiva
- [ ] Acompanhamento: ativar o link de um projeto, registrar uma atualização pública, abrir em janela anônima
- [ ] Avaliação: pedir avaliação, responder pelo link autorizando o depoimento e usar "Usar no portfólio"
- [ ] Testar tudo no **celular**

## 5. Conteúdo do site

- [ ] Cadastrar **cases reais** no portal (Portfólio do site) e publicar. Sem eles o site mostra 3 exemplos marcados como "Case ilustrativo"
- [ ] Links do **LinkedIn** e do **GitHub** no rodapé (foram removidos por falta do endereço)
- [ ] Imagem de compartilhamento (`og:image`, 1200×630) para a prévia do link no WhatsApp e redes sociais
- [ ] Revisar os textos do site e do diagnóstico guiado

## 6. Privacidade e jurídico

- [ ] Preencher `privacidade.html`: data, razão social, CNPJ e prazo de retenção dos dados (campos `[entre colchetes]`)
- [ ] Peça uma **revisão jurídica** da política antes de divulgar
- [ ] Acrescentar na política o acompanhamento do cliente e a avaliação pós-entrega
- [ ] Lembrar que o aceite de proposta é só um registro de nome e data, não um contrato

## 7. Publicação

- [ ] Escolher a hospedagem (Vercel, por exemplo) e registrar o **domínio**
- [ ] Depois do domínio: `sitemap.xml`, `og:url`, canonical e o `Sitemap:` no `robots.txt`
- [ ] Atualizar `SITE_URL` (segredo da função de e-mail) com o domínio final
- [ ] `git add`, `git commit` e `git push` das mudanças pendentes
- [ ] Rodar o Lighthouse (desempenho e acessibilidade) no site publicado; o hero tem muita animação

## 8. Ideias para depois (não urgentes)

- [ ] Agendamento de conversa (Cal.com ou Calendly embutido)
- [ ] Área do cliente com login (hoje o acompanhamento é por link privado)
- [x] Painel financeiro simples (feito em Financeiro; falta só testar com dados reais)
- [ ] Etapa posterior da área interna: integrações oficiais (WhatsApp, e-mail, calendário), portal do cliente, assinatura eletrônica, bancos e nota fiscal, apontamento de horas, planejamento de capacidade, relatórios para BI, automações de cobrança e contratos recorrentes (lista completa em `docs/AREA_INTERNA.md`)
- [ ] Blog ou newsletter
- [ ] Trocar a "análise" por palavras-chave do diagnóstico por uma IA de verdade (cuidar de custo e abuso)
