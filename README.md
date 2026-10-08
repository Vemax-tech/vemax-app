# Vemax

Site institucional (one-page) + portal interno da equipe.

```
index.html              site institucional
assets/                 CSS e JS do site
shared/tokens.css       design tokens (cores, fontes) usados pelo site e pelo portal
app/                    portal interno (login, painel, Inteligência de Mercado…)
supabase/migrations/    esquema do banco, RLS e storage
docs/                   prompts e decisões
research/               pesquisa de mercado (relatório, planilha, dados)
```

## Rodar localmente

Não há build. Sirva a pasta com qualquer servidor estático (módulos ES não funcionam via `file://`):

```
npx serve .
```

Site: `http://localhost:3000/` · Portal: `http://localhost:3000/app/`

## Configurar o portal (Supabase)

1. Crie um projeto em supabase.com.
2. **Authentication → Providers → Email**: desative *Allow new users to sign up* (não há cadastro público).
3. **SQL Editor**: execute, em ordem, `supabase/migrations/001_init.sql` até `004_portal_fases.sql`.
4. **Project Settings → API**: copie a *Project URL* e a chave *anon/publishable* para `app/js/config.js`.
   Nunca use a `service_role` no front-end.
5. **Authentication → Users → Add user**: crie o seu usuário. **O primeiro usuário criado vira administrador**; os demais entram como *Membro*.
6. Entre em `/app/`, vá em **Equipe** para ajustar cargos e permissões dos funcionários.
7. Opcional: para gravar os contatos do site no portal, preencha `supabaseUrl` e `supabaseAnonKey` em `assets/js/script.js` (`CONFIG`).
   A política do banco só permite *inserir* contatos com status `novo`; a leitura exige login.

## Dados de contato do site

Em `assets/js/script.js` (`CONFIG`): número de WhatsApp e e-mail. No `index.html`: footer, redes sociais e cidade.

## Segurança

- RLS ativa em todas as tabelas; padrão é negar. As permissões por módulo ficam na tabela `permissoes`.
- Bucket `entregaveis` privado; downloads por URL assinada de 2 minutos.
- A checagem de permissão no JavaScript é só conveniência de interface; a barreira real é a RLS.
