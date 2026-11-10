# Como contribuir

Este guia vale para quem trabalha no repositório da VEMAX. O projeto é estático (sem build) e usa o Supabase como backend.

## Antes de começar

Sempre atualize a `main` antes de abrir uma branch nova:

```bash
git switch main
git pull
```

Isso evita conflitos com o que a outra pessoa da equipe já mandou.

## Onde fica cada coisa

- `public/`: tudo o que vai ao ar (site, portal em `public/app/`, CSS e JS compartilhados em `public/shared/`). Não coloque nada que não seja do site aqui: o `npm run check` reprova `.md`, `.sql` e afins dentro de `public/`.
- `supabase/`: migrations e Edge Function.
- `tests/` e `scripts/`: testes e verificação estática.
- `docs/`: documentação. A arquitetura está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Fluxo de trabalho

1. Crie uma branch a partir da `main`:
   - `feature/nome-curto` para algo novo, por exemplo `feature/filtro-de-contatos`.
   - `fix/nome-curto` para correção, por exemplo `fix/erro-no-login`.
2. Faça mudanças pequenas e testadas.
3. Rode localmente com `npm run dev` e abra `http://localhost:3000/` (site) e `http://localhost:3000/app/` (portal). Antes de abrir o Pull Request, rode `npm run check` e `npm test` (Node 22+, sem instalar dependências). Se mexeu no banco ou nas telas do portal, rode também `npm run test:integration` (veja [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md#rodar-localmente)).
4. Faça commits no padrão Conventional Commits (abaixo).
5. Envie a branch e abra um Pull Request para a `main`. O template do PR já traz o que preencher, e o CI precisa ficar verde.
6. Peça a revisão da outra pessoa da equipe antes de juntar.

## Commits (Conventional Commits)

Formato: `tipo(escopo opcional): descrição curta`.

| Tipo | Quando usar |
|---|---|
| `feat` | funcionalidade nova |
| `fix` | correção de bug |
| `docs` | documentação |
| `chore` | tarefas de manutenção |
| `style` | formatação e estilo, sem mudar o comportamento |
| `refactor` | reorganização de código sem mudar o comportamento |
| `test` | testes |
| `ci` | automação (GitHub Actions) |
| `security` | correção ou endurecimento de segurança |

Exemplos do histórico (escreva em português):

```text
feat: contratos recorrentes com cobrança gerada automaticamente
feat: busca global (Ctrl+K) e Minhas pendências
security: CSP e cabeçalhos de segurança, sem scripts embutidos
refactor: extrai para shared/js o que não é só do portal
```

## Banco de dados

- Mudança no banco entra como uma **nova migration** numerada em `supabase/migrations/` (a próxima é a `015_...sql`).
- Nunca edite uma migration que já foi executada.
- Toda tabela nova precisa de RLS ligada e de políticas. Veja `012_area_interna.sql` como modelo.
- O `npm run test:integration` aplica todas as migrations num Postgres em memória: rode antes de abrir o PR.

## Segurança no código

- Nunca commite chaves. No front-end só entra a chave pública `anon`. A `service_role`, a chave do Resend e o `WEBHOOK_SECRET` ficam nos secrets do Supabase. O workflow de segredos procura chaves em todo o histórico.
- Para reportar uma vulnerabilidade, veja o [SECURITY.md](SECURITY.md).

## Antes de pedir revisão

- [ ] Testei localmente e `npm run check` e `npm test` passam.
- [ ] Não há chaves, senhas nem dados pessoais no código.
- [ ] Atualizei o README ou o `docs/` se mudei algo que eles descrevem (funcionalidades, estrutura, como rodar).
