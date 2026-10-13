# Política de segurança

## Como reportar uma vulnerabilidade

**Não abra uma issue pública** e não descreva a falha em Pull Request, chat aberto ou commit.

Use um destes caminhos:

1. **Security Advisory privado no GitHub:** na aba *Security* do repositório, clique em *Report a vulnerability*.
2. **Direto com os fundadores:** fale pessoalmente ou por mensagem direta com [@vitin2505](https://github.com/vitin2505) ou [@markiimm](https://github.com/markiimm).

Inclua o que for possível: onde a falha está, como reproduzir, qual o impacto e, se tiver, uma sugestão de correção. Não inclua dados reais de clientes.

O relatório completo da última auditoria, com o que foi corrigido e o que ainda depende de configuração, está em [docs/SEGURANCA.md](docs/SEGURANCA.md).

## O que está no escopo

| Área | Exemplos |
|---|---|
| Portal (`/app/`) | acesso a módulo sem permissão, login contornado, cadastro que pula a aprovação do administrador |
| Supabase e RLS | política de RLS que deixa ler ou alterar dados indevidos, função com `EXECUTE` aberto para `anon`, acesso a arquivo de bucket privado (`entregaveis`, `projetos`) |
| Edge Function | `notificar-contato` aceitando chamada sem o header `x-webhook-secret`, injeção de HTML no e-mail enviado |
| Formulário de contato | contornar o limite anti-spam, injetar conteúdo em `contatos_site`, ler contatos sem login |
| Sessão e autenticação | sessão que continua valendo após logout, contornar o 2FA, aviso de tentativas de login que não aparece, redirecionamento aberto no login |
| Cabeçalhos e CSP | forma de executar script no site ou no portal, página que pode ser colocada em iframe |
| Segredos | chave privada, `service_role`, chave do Resend ou `WEBHOOK_SECRET` exposta no código ou no histórico |

## Fora do escopo

- Ataques de negação de serviço e testes de carga.
- Engenharia social contra a equipe.
- Falhas na infraestrutura de terceiros (Supabase, Cloudflare, Resend). Reporte a eles.
- A chave `anon` do Supabase aparecer em `config.js`: ela é pública por projeto, e a proteção real é a RLS.

## O que esperar

Os fundadores respondem assim que possível, avaliam o impacto e corrigem antes de divulgar qualquer detalhe. Pedimos que você não divulgue a falha até a correção estar no ar.

## Para quem contribui

- Nunca commite chaves, senhas ou tokens.
- Em tabela nova, ligue a RLS e crie as políticas na mesma migration.
- A checagem de permissão no JavaScript é só conveniência. A barreira real é a RLS.
