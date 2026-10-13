# Como contribuir

Este guia vale para quem trabalha no repositório da VEMAX. O projeto é estático (sem build) e usa o Supabase como backend.

## Antes de começar

Sempre atualize a `main` antes de abrir uma branch nova:

```bash
git switch main
git pull
```

Isso evita conflitos com o que a outra pessoa da equipe já mandou.

## Fluxo de trabalho

1. Crie uma branch a partir da `main`:
   - `feature/nome-curto` para algo novo, por exemplo `feature/filtro-de-contatos`.
   - `fix/nome-curto` para correção, por exemplo `fix/erro-no-login`.
2. Faça mudanças pequenas e testadas.
3. Rode localmente com `npx serve .` e abra `http://localhost:3000/` (site) e `http://localhost:3000/app/` (portal). Módulos ES não funcionam via `file://`. Antes de abrir o Pull Request, rode `npm test` e `npm run check` (Node 20+, sem instalar dependências).
4. Faça commits no padrão Conventional Commits (abaixo).
5. Envie a branch e abra um Pull Request para a `main`. O template do PR já traz o que preencher.
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

Exemplos reais do histórico:

```text
feat(portfolio): implement portfolio management module with CRUD functionality
feat: enhance signup error handling with detailed messages and console diagnostics
feat: update theme colors and design tokens for improved UI consistency
docs: reformula README com identidade visual VEMAX, diagramas e guia completo
```

## Banco de dados

- Mudança no banco entra como uma **nova migration** numerada em `supabase/migrations/` (a próxima é a `009_...sql`).
- Nunca edite uma migration que já foi executada.
- Toda tabela nova precisa de RLS ligada e de políticas. Veja `001_init.sql` e `008_agil.sql` como modelo.

## Segurança no código

- Nunca commite chaves. No front-end só entra a chave pública `anon`. A `service_role`, a chave do Resend e o `WEBHOOK_SECRET` ficam nos secrets do Supabase.
- Para reportar uma vulnerabilidade, veja o [SECURITY.md](SECURITY.md).

## Antes de pedir revisão

- [ ] Testei localmente.
- [ ] Não há chaves, senhas nem dados pessoais no código.
- [ ] Atualizei o README se mudei algo que ele descreve (funcionalidades, estrutura, como rodar).
