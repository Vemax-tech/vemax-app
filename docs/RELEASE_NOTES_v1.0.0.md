# VEMAX v1.0.0

**Primeira versão: site institucional, portal interno e README.**

Site no ar em https://vemax-app.kraazynino.workers.dev (Cloudflare Workers). O portal fica em `/app/`.

## Site institucional

- Página única (`index.html`) com hero, soluções, processo, portfólio e contato.
- Triagem do problema: a pessoa descreve o que acontece e recebe uma solução sugerida, por regras de palavras-chave no navegador (`RULES` em `assets/js/script.js`). Não usa IA.
- Formulário de contato que grava o lead em `contatos_site` e abre o WhatsApp ou o e-mail. Se a gravação falhar, o envio não é bloqueado.
- Página de [política de privacidade](../privacidade.html), em formato de modelo (campos `[entre colchetes]` ainda a preencher).
- `robots.txt` liberando o site e bloqueando `/app/`.

## Portfólio dinâmico

- Cases lidos da tabela `portfolio_cases` (só os publicados), na home e em `portfolio/caso.html?c=<slug>`.
- Cada case tem imagem, antes/depois, etapas com duração e depoimento.
- Sem nenhum case publicado, o site mostra 3 exemplos ilustrativos, com selo.
- Gestão no portal, em **Portfólio do site**. Imagens no bucket público `portfolio` (até 5 MB; PNG, JPEG ou WebP).

## Portal interno (`/app/`)

- Login com e-mail e senha, recuperação de senha por e-mail, mostrar/ocultar senha e indicador de força (mínimo de 10 caracteres). A mensagem de erro é genérica de propósito.
- Cadastro com aprovação: o funcionário se cadastra e fica pendente até o administrador aprovar em **Equipe**. O primeiro usuário vira administrador.
- Papéis admin e membro, com permissões por módulo (tabela `permissoes`, função `can()`).
- Módulos: **Painel**, **Inteligência de Mercado** (pesquisas, nichos e comparador com pesos), **Projetos**, **Contatos do site**, **Base de conhecimento**, **Portfólio do site** e **Equipe**.
- Log de atividades gravado por triggers na tabela `atividades`.
- Arquivos em buckets do Supabase: `entregaveis` e `projetos` (privados, com URL assinada) e `portfolio` (público).

## Anti-spam do formulário

- No navegador: campo isca, tempo mínimo de 3 s e intervalo de 60 s entre envios.
- No banco (`007_contato_antispam.sql`): no máximo 3 mensagens por contato e 60 no total, por hora.

## Práticas ágeis em Projetos (`008_agil.sql`)

- Quadro com limite de itens em andamento por coluna (WIP). O limite é um aviso visual, não bloqueia.
- Bloqueio de projeto com motivo.
- Métricas dos últimos 30 dias: em andamento, bloqueados, entregues, lead time médio e entregas por semana.
- Ciclos de 2 semanas com retrospectiva.

## Banco de dados

Migrations `001` a `008` em `supabase/migrations/`, com RLS ligada em todas as tabelas. Execute em ordem no SQL Editor do Supabase.

## Pesquisa de mercado

Pasta `research/` com relatório (PDF e HTML), planilha com pesos editáveis e modelo de dados para Power BI. O arquivo `.pbix` não foi gerado.

## Documentação e automação

- README com banner, diagramas, tabela de funcionalidades, guia de execução e de configuração.
- `CONTRIBUTING.md`, `SECURITY.md`, templates de issue e de Pull Request e `CODEOWNERS`.
- Workflow `Qualidade` (GitHub Actions) que verifica links dos `.md` e valida os SVGs.

## Limitações conhecidas

- Não há testes automatizados.
- A Edge Function `notificar-contato` (aviso por e-mail via Resend) existe no código e precisa ser implantada no Supabase.
- A política de privacidade ainda tem campos a preencher e precisa de revisão jurídica antes de valer.
- A configuração do Cloudflare Workers não está versionada no repositório.

## Como atualizar

```bash
git pull
```

Se houver migrations novas, execute-as em ordem no SQL Editor do Supabase.
