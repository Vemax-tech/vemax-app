# Configuração e deploy

Como rodar o projeto na sua máquina, montar o Supabase, configurar o aviso por e-mail e publicar.

## Rodar localmente

**Pré-requisitos:** Node.js 22 ou mais novo. Uma conta no [Supabase](https://supabase.com) só é necessária para o portal; o site abre sem ela.

Não há build. Módulos ES não funcionam via `file://`, então a pasta `public/` precisa ser servida por um servidor estático:

```bash
npm run dev
```

Site em `http://localhost:3000/` e portal em `http://localhost:3000/app/`. Se a porta 3000 estiver ocupada, o `serve` escolhe outra e mostra no terminal.

**Testes** (os dois primeiros não instalam nada):

```bash
npm run check               # verificação estática: sintaxe, imports, CSP, referências, migrations
npm test                    # testes unitários
npm ci --prefix tests/integration && npm run test:integration   # banco real em memória e telas simuladas
```

## Configurar o portal (Supabase)

1. Crie um projeto no Supabase.
2. Em **Authentication → Providers → Email**, mantenha *Confirm email* ligado. Decida se *Allow new users to sign up* fica ligado (cadastro com aprovação) ou desligado (contas por convite); veja [SEGURANCA.md](SEGURANCA.md#5-decisão-da-equipe-cadastro-de-funcionário-pela-tela-de-login).
3. No **SQL Editor**, execute em ordem `supabase/migrations/001_init.sql` até `014_seguranca.sql`. Faça um backup antes de aplicar em um projeto que já tem dados.
4. Em **Project Settings → API**, copie a *Project URL* e a chave *anon/publishable* para `public/app/js/config.js`.
5. Em **Authentication → Users → Add user**, crie o seu usuário. **O primeiro usuário vira administrador.**
6. Entre em `/app/`, ajuste cargos e permissões em **Equipe** e ative o 2FA em **Configurações → Segurança**.
7. Preencha `supabaseUrl` e `supabaseAnonKey` em `public/assets/js/config.js` para o site gravar os contatos e ler o portfólio publicado.
8. Se o projeto Supabase for outro, troque o host do Supabase na CSP de `public/_headers` (`img-src` e `connect-src`).

Os itens que só podem ser feitos no painel (limites de requisição, URLs de redirecionamento, SMTP, captcha) estão em [SEGURANCA.md](SEGURANCA.md#4-itens-que-dependem-do-painel-do-supabase-e-do-cloudflare-não-dá-para-fazer-pelo-código) e na lista de [PENDENCIAS.md](PENDENCIAS.md).

## Chaves e onde ficam

Não há `.env`. A configuração pública fica em dois arquivos JavaScript, e os segredos ficam só nos secrets da Edge Function.

| Onde | Chave | Obrigatória | Descrição | Exemplo seguro |
|---|---|:--:|---|---|
| `public/app/js/config.js` | `SUPABASE_URL` | Para o portal | URL do projeto Supabase | `https://SEU-PROJETO.supabase.co` |
| `public/app/js/config.js` | `SUPABASE_ANON_KEY` | Para o portal | Chave pública anon/publishable | `<chave-anon-do-seu-projeto>` |
| `public/assets/js/config.js` | `whatsapp` | Recomendada | DDI + DDD + número, só dígitos | `55119XXXXXXXX` |
| `public/assets/js/config.js` | `email` | Recomendada | E-mail do formulário de contato | `contato@seudominio.com.br` |
| `public/assets/js/config.js` | `supabaseUrl` / `supabaseAnonKey` | Opcional | Gravar contatos e ler o portfólio publicado | mesmos valores do portal |
| Secrets da função | `RESEND_API_KEY` | Para o e-mail | Chave da API do Resend | `<segredo>` |
| Secrets da função | `NOTIFY_TO` | Para o e-mail | Destinatários, separados por vírgula | `equipe@seudominio.com.br` |
| Secrets da função | `NOTIFY_FROM` | Para o e-mail | Remetente do aviso | `Vemax <avisos@seudominio.com.br>` |
| Secrets da função | `WEBHOOK_SECRET` | Para o e-mail | Segredo comparado com o header `x-webhook-secret` | `<segredo-longo-e-aleatorio>` |
| Secrets da função | `SITE_URL` | Opcional | Endereço do site, para o link do portal no e-mail | `https://seudominio.com.br` |

> [!WARNING]
> Os dois `config.js` contêm só valores **públicos**. Nunca coloque neles a `service_role`, a chave do Resend ou o `WEBHOOK_SECRET`. O `npm run check` reprova qualquer menção a `service_role` em código do navegador.

## Edge Function `notificar-email`

Envia por e-mail tudo o que aparece no sino do portal: lead novo, proposta aceita ou recusada, avaliação recebida, cadastro pendente e alerta de segurança.

1. Aplique as migrations até a `011_notificacoes_cliente.sql` (cria a tabela `notificacoes`).
2. Defina os secrets da tabela acima (`RESEND_API_KEY`, `NOTIFY_TO`, `NOTIFY_FROM`, `WEBHOOK_SECRET` e, se quiser, `SITE_URL`).
3. Publique sem verificação de JWT, porque quem chama é o webhook:

   ```bash
   supabase functions deploy notificar-email --no-verify-jwt
   ```

4. Em **Database → Webhooks**, crie um webhook na tabela `notificacoes`, evento `INSERT`, método `POST`, com a URL da função e o header `x-webhook-secret: <WEBHOOK_SECRET>`.
5. Se existir um webhook antigo na tabela `contatos_site`, apague-o para não receber o aviso de lead em dobro.

Enquanto o domínio não estiver verificado no Resend, ele só entrega para o e-mail da sua própria conta. Para testar, use `NOTIFY_FROM="Vemax <onboarding@resend.dev>"` e `NOTIFY_TO` com esse e-mail.

## Deploy (Cloudflare Workers)

O site e o portal estão em [vemax-app.kraazynino.workers.dev](https://vemax-app.kraazynino.workers.dev). O `wrangler.jsonc` publica **só a pasta `public/`** como assets estáticos, então documentação, banco, testes e scripts nunca vão ao ar.

- Com o Worker conectado ao GitHub (Workers Builds), cada push na `main` publica sozinho, e cada branch gera um preview.
- Para publicar à mão: `npx wrangler@latest deploy` na raiz do repositório.
- O `public/_headers` é lido pelo Cloudflare e aplica a CSP e os demais cabeçalhos de segurança. Depois de publicar, confira em **Configurações → Segurança → Verificação das proteções** no portal.

O banco, o login e os arquivos ficam no projeto Supabase. A Edge Function é publicada à parte, como na seção anterior.

## Pesquisa de mercado

Os entregáveis já estão em `research/output/`. Para regenerá-los depois de editar `research/scripts/data.js` (precisa de Microsoft Edge ou Chrome instalado):

```bash
cd research/scripts
npm install
node build.js
```

Detalhes em [research/README.md](../research/README.md).
