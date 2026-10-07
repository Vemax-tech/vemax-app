# Prompt — Área Interna (Portal da Equipe) da Vemax

> Cole o bloco abaixo em uma nova sessão do Claude Code, dentro da pasta do projeto.
> Pré-requisito: o site institucional (`index.html` + `assets/`) já existe e não deve ser quebrado.

---

```
Crie a ÁREA INTERNA (portal da equipe) da Vemax, como uma aplicação separada do site institucional, protegida por login. Ela será usada pelo dono da empresa e pelos funcionários para organizar o trabalho e a inteligência de mercado da empresa. O site institucional (index.html, assets/) NÃO deve ser alterado, exceto por um link discreto "Área da equipe" no footer apontando para /app/.

═══════════════════════════════════════
1. OBJETIVO
═══════════════════════════════════════
Um portal enxuto, rápido e bonito onde a equipe faz login e acessa módulos de trabalho. Deve parecer a continuação do site: mesmo dark tech premium "ouro sobre preto", mesmos tokens CSS (reaproveitar assets/css/styles.css via arquivo de tokens compartilhado), glassmorphism, ícones Lucide em SVG, sem emojis. Interface densa e funcional (é ferramenta de trabalho), mas elegante.

═══════════════════════════════════════
2. AUTENTICAÇÃO E PERMISSÕES
═══════════════════════════════════════
- Login por e-mail + senha, usando Supabase Auth (já temos conector Supabase disponível). Sem cadastro público: contas são criadas apenas pelo administrador.
- Dois papéis: ADMIN (dono) e MEMBRO (funcionário). Tabela `profiles` (id = auth.uid, nome, cargo, papel, ativo, criado_em).
- Admin pode: convidar/desativar usuários, alterar papéis, ver todos os módulos e o log de atividades.
- Membro pode: ver e editar apenas o que o admin liberar. Cada módulo tem uma permissão por papel (ver / editar).
- Segurança obrigatória: Row Level Security em TODAS as tabelas; nenhuma chave secreta (service_role) no front-end; apenas a anon/publishable key. Política padrão = negar. Rotas internas redirecionam para /app/login se não houver sessão. Sessão com expiração, botão "Sair", e recuperação de senha por e-mail.
- Proteção básica: limitar tentativas de login (rate limit do Supabase), mensagens de erro genéricas ("e-mail ou senha incorretos"), campos com autocomplete correto, sem logar senhas.
- Registrar em `atividades` (quem, o que, quando) criações/edições/exclusões relevantes.

═══════════════════════════════════════
3. MÓDULOS (CATEGORIAS) DO PORTAL
═══════════════════════════════════════
Navegação lateral (sidebar) com as categorias abaixo. Implemente o esqueleto de todas, mas desenvolva COMPLETAMENTE apenas a 3.1 e a 3.2 nesta fase; as demais ficam como página com estado vazio ("Em breve") e a estrutura de dados pronta.

3.1 Painel (início)
- Saudação, atalhos para os módulos, últimas atividades, itens pendentes do usuário.

3.2 Inteligência de Mercado  ← categoria principal desta fase
- Biblioteca de PESQUISAS estratégicas de mercado. Cada pesquisa tem: título, nicho/segmento, status (planejada, em andamento, concluída, revisão), responsável, data, resumo, tags, nível de confiança, fontes e anexos.
- Cada pesquisa possui ENTREGÁVEIS anexáveis: relatório PDF, planilha Excel (com dashboard), arquivo Power BI (.pbix) e links. Upload via Supabase Storage (bucket privado, URLs assinadas, limite de tamanho, tipos permitidos: pdf, xlsx, pbix, csv, png).
- Comparador de nichos: tabela ordenável/filtrável que compara nichos por critérios com nota de 0–10 e peso configurável: tamanho do mercado, dor/necessidade tecnológica, nível de digitalização atual, intensidade da concorrência, disposição a pagar, facilidade de aquisição, recorrência de receita, aderência ao que a Vemax entrega. Gerar ranking com pontuação ponderada e gráfico (radar + barras). Cada nota deve ter campo "evidência/fonte" obrigatório; sem fonte = nota marcada como "não verificada".
- Ficha de nicho: problemas reais encontrados, necessidades tecnológicas não atendidas, concorrentes (nome, site, o que oferecem, preço se público, pontos fracos), oportunidades, riscos, fontes (URL, data de acesso, confiabilidade).
- Regra de conteúdo: o portal NÃO inventa dados. Campos de dados de mercado são preenchidos pela equipe com fonte; o sistema não gera números sozinho.
- Botão "Exportar": resumo da pesquisa/comparativo em CSV e em página imprimível (print-friendly) para salvar como PDF.
- Escopo: este módulo é SOMENTE pesquisa estratégica. Não inclui prospecção comercial, listas de contatos de empresas nem disparo de mensagens.

3.3 Projetos (estrutura apenas): clientes, projetos, status, responsáveis, prazos.
3.4 Contatos do site (estrutura apenas): mensagens recebidas pelo formulário do site institucional (nome, contato, mensagem, problema descrito, solução sugerida pela simulação, status). Receber via tabela Supabase com INSERT público restrito e validado + leitura apenas para autenticados.
3.5 Base de conhecimento (estrutura apenas): documentos, processos internos, templates e prompts reutilizáveis.
3.6 Equipe (somente admin): usuários, papéis, convites, atividade recente.

═══════════════════════════════════════
4. PROMPT DA PESQUISA DE MERCADO (template salvo dentro do módulo 3.2)
═══════════════════════════════════════
O módulo deve guardar este template para reuso, com campos variáveis [NICHO], [REGIÃO], [PERÍODO], editável pelo admin e copiável com um clique:

"Realize uma investigação profunda sobre o nicho [NICHO] no Brasil [REGIÃO opcional], identificando: (1) problemas operacionais reais; (2) necessidades tecnológicas não atendidas; (3) concorrentes e soluções existentes, com pontos fortes e fracos; (4) tamanho e tendência do mercado; (5) oportunidades e riscos para uma empresa de desenvolvimento de software sob medida.
Regras: use apenas fontes confiáveis e atualizadas (IBGE, SEBRAE, associações setoriais, relatórios de mercado, estudos acadêmicos, sites oficiais, notícias de veículos reconhecidos); cite cada fonte com URL e data de acesso; separe FATO (com fonte) de INFERÊNCIA (sua análise); sinalize lacunas e dados incertos em vez de preenchê-los; não invente números, empresas ou citações; não pule etapas.
Entregáveis: relatório PDF com gráficos; planilha Excel com dashboard e a matriz de comparação de nichos; arquivo Power BI quando possível. Ao final, inclua um ranking dos nichos pesquisados com a pontuação por critério e a justificativa de cada nota.
Fora de escopo: não desenvolver software e não fazer prospecção comercial. O foco é exclusivamente a pesquisa estratégica de mercado."

═══════════════════════════════════════
5. STACK E ESTRUTURA DE PASTAS
═══════════════════════════════════════
Manter simples e sem build pesado: HTML + CSS + JavaScript (ES modules) puros no front, Supabase (Auth, Postgres, Storage) no back. Sem frameworks a menos que justificados.

vemax-app/
├── index.html                 # site institucional (não alterar)
├── assets/                    # site institucional
│   ├── css/styles.css
│   └── js/script.js
├── shared/
│   └── tokens.css             # design tokens comuns (cores, raios, fontes), importado pelo site e pelo portal
├── app/                       # PORTAL INTERNO
│   ├── login/index.html
│   ├── index.html             # painel
│   ├── mercado/               # 3.2 Inteligência de Mercado
│   │   ├── index.html         # lista de pesquisas
│   │   ├── nichos.html        # comparador e ranking
│   │   └── pesquisa.html      # ficha da pesquisa/nicho
│   ├── projetos/ contatos/ conhecimento/ equipe/   # estruturas dos demais módulos
│   ├── css/app.css
│   └── js/
│       ├── supabase.js        # cliente (somente chave pública)
│       ├── auth.js            # login, logout, guard de rota, papéis
│       ├── ui.js              # sidebar, toasts, modais
│       └── modules/           # um arquivo por módulo
├── supabase/
│   ├── migrations/            # SQL versionado: tabelas, RLS, storage policies
│   └── seed.sql               # dados de exemplo (claramente fictícios)
├── docs/                      # prompts, decisões, instruções de deploy
└── README.md                  # como rodar, configurar Supabase, criar o 1º admin

═══════════════════════════════════════
6. REQUISITOS GERAIS
═══════════════════════════════════════
- Mobile first e responsivo (sidebar vira menu inferior/gaveta no mobile); acessível (contraste, foco visível âmbar, labels, teclado); respeitar prefers-reduced-motion.
- Estados de carregamento, vazio e erro em todas as telas. Confirmação antes de excluir. Textos em português do Brasil.
- Sanitizar tudo que for renderizado (nada de innerHTML com dado do usuário).
- Entregar um README com: criação do projeto Supabase, execução das migrations, variáveis públicas necessárias, criação do primeiro admin e deploy (Vercel ou hospedagem estática).
- Antes de codar: apresentar o modelo de dados (tabelas e relações) e as políticas RLS para aprovação; depois implementar por etapas (auth → painel → mercado), validando cada uma.

═══════════════════════════════════════
7. NÃO FAZER NESTA FASE
═══════════════════════════════════════
Financeiro, faturamento, CRM completo, integrações de terceiros, automação de mensagens, prospecção comercial, app mobile nativo. Não alterar o visual nem o conteúdo do site institucional.
```

---

## O que mudou em relação à sua ideia original

- **Pesquisa virou módulo, não só prompt:** "Inteligência de Mercado" guarda as pesquisas, os entregáveis (PDF/Excel/Power BI) e um comparador de nichos com nota ponderada. Assim os resultados ficam comparáveis em um só lugar.
- **Fato × inferência e fonte obrigatória:** o prompt de pesquisa agora exige URL e data de cada fonte e proíbe preencher lacunas com suposições. Isso reduz o risco de o relatório sair com dados inventados.
- **Ranking com critérios:** o pedido de "identificar os mercados mais promissores" ganhou critérios e pesos definidos, para a escolha de nicho não ficar subjetiva.
- **Segurança primeiro:** sem cadastro público, papéis admin/membro, RLS em todas as tabelas e nenhuma chave secreta no front.
- **Fases:** só Painel e Inteligência de Mercado são construídos agora. Os outros módulos entram com a estrutura de dados pronta.
