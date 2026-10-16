# 10. Plano de testes

## 10.1 Aproveitamento da infraestrutura existente

**[FATO]** O projeto já tem três camadas de teste (`01-auditoria.md`, 1.6). Todas servem ao VemaxCALL com ajuste pequeno:

| Camada | Ferramenta | Ajuste necessário |
|---|---|---|
| Unitário | `node --test` sobre funções puras | nenhum. Novos arquivos em `tests/` |
| **Banco real em memória** | **PGlite** com as migrations aplicadas em ordem e `as({uid, sid, aal}, sql)` | `banco.mjs` passa a receber a **pasta de migrations** como parâmetro (hoje é fixa em `supabase/migrations`) |
| Telas | jsdom + `fake-supabase.mjs` via loader hook | o hook já casa com `./supabase.js`; serve para `call/js/` sem mudança |

A camada PGlite é o que torna este plano viável: **as regras de autorização e a máquina de estados são testadas contra Postgres de verdade, executando como cada papel**, sem tocar em produção.

## 10.2 TDD: onde se aplica de verdade

O pedido diz *"Utilize TDD quando apropriado, especialmente nas regras de negócio e nos controles de acesso"*. Onde o teste vem primeiro:

1. **Matriz de permissão** (`06-papeis-permissoes.md`): escrever o teste que percorre papel × transição e espera `42501` onde a matriz diz `—`. O teste é a especificação executável da matriz.
2. **Máquina de estados**: escrever o teste de cada transição da tabela de `03-fluxos.md` (T01–T16, C01–C10), incluindo as inválidas, **antes** de `mover_solicitacao()`.
3. **`pode_concluir()`**: os requisitos por tipo (RN-06) são regras puras — teste primeiro.
4. **Idempotência e concorrência** (RN-17, RN-08): o teste define o comportamento esperado antes de existir a função.

Onde TDD **não** se aplica bem: layout, montagem de tela, dashboard. Ali o teste vem depois, como regressão (`telas.mjs`).

## 10.3 Suíte por nível

### Nível 1 — unitário (`tests/call-*.test.js`)

| O que | Casos |
|---|---|
| Regras puras de etapa | próxima ação por etapa × tipo; etapa terminal; etapa válida para o tipo (RN-22) |
| Tempo na etapa, tempo de conclusão | fuso horário, virada de dia, data pura × timestamp (reaproveita o cuidado de `lib.js`) |
| Detecção de duplicidade | mesmo paciente/tipo dentro e fora da janela; paciente diferente; **não bloqueia** |
| Pendência derivada | prontuário fora do arquivo com e sem arquivamento posterior |
| Rótulo e formatação | protocolo, nomes de etapa, estados de entrega |

### Nível 2 — banco (`tests/integration/call-sql-*.mjs`)

**`call-sql-permissoes.mjs`** — o teste central. Para **cada** linha da matriz 6.3 e **cada** transição:

```
para cada papel em [callcenter, arquivo, recepcao, medico, admin_empresa, admin_tecnico]:
  para cada transição em [T01..T16, C01..C10]:
    executar como esse papel
    esperar sucesso se a matriz permite, 42501 se não
```

Mais: usuário sem 2FA (`aal1`) é recusado em tudo (RNF-07); usuário inativo é recusado; sessão revogada é recusada (padrão já testado em `sql-seguranca.mjs`).

**`call-sql-estados.mjs`**

| Teste | Verifica |
|---|---|
| Caminho feliz do Fluxo 1, etapa por etapa | ordem do fluxograma preservada |
| Caminho feliz do Fluxo 2, com receita, nas duas opções de entrega | F2 completo |
| F2 sem receita (`nao_aprovado`) | RN-23 — desfecho legítimo, pendência de comunicar |
| Transição inválida (`aberta → concluida`) | RN-04 |
| Entrega de prontuário sem confirmação da Recepção | **RN-21** — fica `em_transito`, não conclui |
| Arquivo tentando confirmar o próprio recebimento | **RN-09** — recusa |
| Concluir F2 com `envio_tentado` | **RN-13** — recusa |
| Concluir F1 sem contato efetivo | RN-06 — recusa |
| `retirada_confirmada` com `modo = digital` | **RN-14** — recusa |
| Devolver e arquivar com a solicitação **já concluída** | **RF-17** — funciona |
| Devolver e arquivar com a solicitação **ainda aberta** | RF-17 — funciona |
| Avaliação em solicitação não encaminhada ao médico | **RN-10** — recusa |
| Recepção tentando registrar avaliação | **RN-11** — recusa |
| Médico sem `registro_profissional` | RN-11 — recusa |
| Correção de receita | **RN-15** — duas versões coexistem, a antiga intacta |
| Reabrir e cancelar | RN-15, RN-20 — histórico idêntico antes e depois |
| Comunicação sem resultado | RN-12 — recusa |

**`call-sql-seguranca.mjs`**

| Teste | Verifica |
|---|---|
| Acesso cruzado entre empresas | **RN-02, RN-19** — 0 linhas (não "sem permissão") |
| Mesma transição chamada 3× | **RN-17** — um efeito só |
| Duas transações movimentando o mesmo prontuário | **RN-08** — uma ganha, estado consistente |
| Injeção: `'; drop table ...; --`, `<script>`, `%`, `_`, unicode de controle | consultas parametrizadas, `escaparLike()` |
| Texto gigante em cada campo de texto | `CHECK` de tamanho rejeita |
| 6 logins falhos | alerta de força bruta, só hashes gravados, mensagem genérica |
| Leitura de avaliação e emissão de URL de documento | **grava em `call_auditoria`** |
| Call Center tentando baixar documento clínico | **RN-18** — recusa |
| `admin_tecnico` tentando ler conteúdo clínico | recusa; concessão temporária funciona e **expira** |
| `admin_empresa` tentando se dar papel `medico` sem registro | recusa |
| Acesso direto ao bucket sem URL assinada | recusa |

### Nível 3 — telas (`tests/integration/call-telas.mjs`)

Cada tela do VemaxCALL renderizada com o Supabase falso, para cada papel:

- Dashboard, central, detalhe, as quatro filas, prontuários, documentos, comunicações, relatórios.
- **Ações invisíveis quando o papel não pode** — e, no servidor, recusadas mesmo se forçadas (os dois lados são testados).
- Estados vazios, carregamento e erro (`mensagemErro()`).
- Abrir solicitação dos dois tipos; executar cada transição pela interface.
- Nenhum `console.error` não esperado (o harness já falha nisso).
- **A próxima ação em destaque** aparece e corresponde à etapa.

### Nível 4 — verificação estática (`scripts/verificar.mjs` estendido)

| Nova verificação | Por quê |
|---|---|
| `call/` incluído em sintaxe, imports e páginas com `boot.js` | igual ao `app/` |
| Páginas de `call/` com `noindex` | dado de saúde |
| `_headers` tem bloco `/call/*` com `no-store` | ADR-008 |
| CSP inclui o host do novo Supabase e **não** ganhou `unsafe-inline` em script | regressão de segurança |
| Nenhum `innerHTML` com variável em `call/` | XSS |
| `robots.txt` bloqueia `/call/` | — |

## 10.4 Dados de teste

**Regra firme do pedido:** *"Não use dados reais de pacientes para testes ou demonstrações sem autorização e proteção apropriadas."*

- Todos os dados de teste são **sintéticos**, gerados no próprio arquivo de teste, como já se faz em `telas.mjs` (`seed()`).
- Nomes fictícios óbvios, CPFs sintéticos que passam o dígito verificador mas não pertencem a ninguém, telefones em faixa reservada.
- **Nenhum dump de produção** em ambiente de desenvolvimento. Nem anonimizado — anonimização de dado de saúde é difícil de garantir e não é necessária aqui.

## 10.5 Homologação (Fase F)

| Frente | O que é exercitado | Critério |
|---|---|---|
| Funcional | os 24 casos de uso de `05-casos-de-uso.md`, executados **pelos próprios papéis**, com os fluxogramas na mão | cada caso bate com o fluxograma, etapa por etapa |
| Permissões | cada pessoa tenta o que não é dela | nenhum acesso indevido; tudo registrado |
| Concorrência | duas pessoas movimentando o mesmo prontuário ao mesmo tempo, de verdade | estado consistente, mensagem compreensível |
| Falhas | queda de internet no meio de uma ação; envio digital que falha | nada perdido; pendência visível |
| Recuperação | **restauração de backup ensaiada** e cronometrada | RNF-12 cumprido, com registro |
| Segurança | `/security-review` no diff + *Security Advisor* do Supabase no projeto novo | zero achado de nível alto aberto |
| Celular | Arquivo e Recepção usando no celular, circulando pelo prédio | fluxo completo utilizável em 360 px |
| Acessibilidade | teclado, foco, leitor de tela nas telas principais | RNF-06 |
| Carga | base semeada com 10 mil solicitações | RNF-03: p95 < 1,5 s nas filas e na central |

**Critério de aceite da homologação:** nenhum caso de uso reprovado, nenhum achado de segurança de nível alto aberto, restauração de backup comprovada, e **aceite por escrito dos quatro papéis operacionais** de que o sistema reproduz o processo que eles executam hoje.
