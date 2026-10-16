# 13. Roteiro de apresentação da demonstração

## Como abrir

**No seu computador:** `npx serve .` na raiz do projeto, depois `http://localhost:3000/call/`.

**Publicado (Cloudflare Workers, onde o site já está):** o `/call/` já é servido pela configuração que existe — `assets.directory` do `wrangler.jsonc` é a raiz do repositório, o `.assetsignore` não exclui `call/` nem `shared/`, e o `_headers` já tem o bloco `/call/*`. Não precisa de projeto novo nem de configuração nova.

| Objetivo | Comando | Resultado |
|---|---|---|
| **Endereço só para a apresentação**, sem tocar no site em produção | `npx wrangler@latest versions upload` | URL de versão (preview) própria, com a demo |
| Publicar junto com o site, depois de aprovar | merge na `main` e `npx wrangler@latest deploy` | `…/call/` no endereço oficial |

A primeira vez pede `npx wrangler@latest login` (abre o navegador).

Se o Worker estiver conectado ao GitHub (Workers Builds), o push da branch `feat/vemaxcall-demo` **já deve ter gerado um preview** — confira em Cloudflare → Workers & Pages → vemax-app → Deployments antes de rodar qualquer comando.

> **Não publique no Vercel.** Não por não funcionar, mas porque o `_headers` é específico do Cloudflare: lá a demo subiria sem nenhum cabeçalho de segurança, e manter dois arquivos de cabeçalho é garantia de um ficar desatualizado. Como o site já está no Cloudflare, é um lugar só.

---

Não precisa de login, de internet nem de banco. Os dados vivem em memória: o botão **Reiniciar dados** na faixa amarela devolve tudo ao estado inicial, então dá para apresentar quantas vezes quiser sem resíduo.

> **Diga isto na abertura, antes de qualquer tela:** os dados são fictícios e nenhum paciente real existe ali. A faixa amarela no topo diz isso o tempo todo, de propósito.

---

## O que mostrar, em 12 minutos

### 1. A troca de papel (30 s) — o truque que sustenta o resto
No menu lateral, **Vendo como**. Troque entre Call Center, Arquivo, Recepção e Médico. O menu muda, a fila muda, os botões mudam.

Fale: *"cada pessoa vê só o que é dela. Na demonstração eu troco no seletor; em produção vem do login, e o servidor é que decide — não a tela."*

### 2. Visão geral (1 min)
Os números saem dos registros. Mostre que **cada indicador diz o critério de contagem embaixo**.

Aponte de propósito o bloco "Mais tempo parado na etapa": *"não existe indicador de 'atrasada' aqui, porque vocês ainda não definiram meta de prazo por etapa. Eu não invento número — mostro o tempo real e espero a meta."* Isso costuma valer mais que um dashboard cheio.

### 3. Fluxo 2 de ponta a ponta (5 min) — o coração da apresentação
Como **Call Center**: Solicitações → *Pedido de receita*. Escolha um paciente, escreva o relato, registre.

- Registre o mesmo paciente e tipo de novo: aparece o **aviso de duplicidade**, que avisa mas **não bloqueia**.
- No detalhe, aponte o cartão **Próxima ação**: diz o que falta e **de quem é**.
- *Pedir prontuário ao arquivo*: abre o registro da comunicação. Diga: *"o sistema não manda a mensagem no grupo. Você manda e registra aqui o que foi feito — e o aviso traz o protocolo, para o Call Center saber a qual caso pertence."*

Troque para **Arquivo**: a fila dele já tem o pedido. Localizar → retirar → entregar.

- **Pare aqui.** A solicitação ficou em *Prontuário em trânsito*, não em "entregue". Diga: *"a entrega não está concluída porque o Silvio começou a andar. Só quem recebe confirma."*

Troque para **Recepção**: confirme o recebimento. Tente encaminhar ao médico **antes** de conferir — o sistema recusa. Confira e encaminhe.

Troque para **Médico**: registre a decisão. Mostre os dois campos — conteúdo clínico e *resumo para o paciente*.

Troque para **Recepção**: avise no grupo. Troque para **Call Center**: avise o paciente, escolha **entrega digital**.

- Registre só a **tentativa de envio** e tente concluir: o sistema recusa, dizendo que tentativa não é entrega.
- Confirme o recebimento. Agora conclui.

### 4. A trilha paralela do prontuário (1 min)
Com o caso **já concluído**, o prontuário ainda está fora do arquivo. Vá em **Prontuários**: a pendência está lá.

Diga: *"isto é o ponto que mais confunde num sistema mal feito: concluir o atendimento não é arquivar o prontuário. São duas trilhas, controladas separadamente. O atendimento fecha, a pendência administrativa continua visível."*

Depois devolva e arquive como Arquivo, para fechar.

### 5. Permissões (2 min) — o argumento de segurança
Menu → **Papéis e permissões**. A matriz inteira na tela.

Quatro frases que valem a reunião:
- O **Call Center** registra e acompanha, mas **não lê conteúdo clínico**.
- O **Arquivo** vê o mínimo para localizar um prontuário.
- O **administrador da clínica não ganha acesso clínico por ser administrador**.
- O **suporte técnico da VEMAX não vê dado clínico por padrão**.

Role até **Auditoria de acesso**: dado de saúde exige registrar a **leitura**, não só a alteração.

Para demonstrar ao vivo: como **Médico**, abra uma avaliação; volte em Papéis e permissões e mostre a linha nova na auditoria.

### 6. Correção de receita com versão (1 min)
Procure a solicitação com receita corrigida (filtro por tipo *Dúvida / correção*). Em **Documentos**, as duas versões coexistem: a v1 marcada como *substituída*, a v2 como *emitida*.

Diga: *"correção nunca sobrescreve. O documento anterior continua existindo."*

### 7. Relatórios (1 min)
Tempo por etapa, pendências por equipe, situação das entregas, movimentações. Exportação em CSV identificando por **protocolo, nunca por nome de paciente**.

---

## O que dizer quando perguntarem "isso já está pronto?"

Resposta honesta, e que joga a favor:

> *"Esta é a vitrine funcional: o fluxo, as regras, as permissões e as telas estão definidos e funcionando. O que falta para ir ao ar é a parte que não dá para demonstrar: as mesmas regras reescritas no banco de dados, onde elas não podem ser burladas, o login com dois fatores, o armazenamento privado dos documentos e o backup testado. Isso está especificado em detalhe e estimado por fases — e depende de sete decisões que só vocês podem tomar."*

Tenha à mão: `docs/vemaxcall/12-perguntas-abertas.md` (as 7 bloqueantes) e `docs/vemaxcall/11-backlog.md` (as fases).

## Perguntas que provavelmente virão

| Pergunta | Resposta curta |
|---|---|
| "O WhatsApp manda sozinho?" | Não, e de propósito. Hoje o sistema **registra** o que foi feito. Automação de grupo depende do provedor e é tecnicamente duvidosa — precisa confirmar antes de prometer. |
| "Dá para o paciente acessar?" | Não está no escopo aprovado. O paciente é quem liga; não tem conta. |
| "A IA emite a receita?" | Não. Decisão clínica é exclusiva do profissional, e nenhuma função de IA toca isso. |
| "E se o prontuário não for encontrado?" | Existe o registro *Não localizado*, que abre pendência e avisa o Call Center. Mas o procedimento real de vocês nesse caso é uma pergunta aberta (12.17). |
| "Onde ficam os dados?" | Na demonstração, em memória, em nada. Em produção, Postgres gerenciado em São Paulo, com acesso por papel verificado no servidor. |
| "Quanto custa?" | A infraestrutura de produção exige plano pago (projeto gratuito pausa sozinho e não tem backup com retenção). Valor conforme a proposta. |

## O que NÃO fazer na apresentação

- Não diga que está "pronto para usar". Está pronto para **ver**.
- Não prometa integração de WhatsApp.
- Não invente prazo de etapa: a meta não existe ainda.
- Não use dado real de paciente para "ficar mais convincente". Além de errado, é exatamente o contrário do que você está vendendo.
