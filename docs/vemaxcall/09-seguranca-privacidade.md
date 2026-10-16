# 9. Plano de segurança e privacidade

Base deste plano: o que o projeto **já tem** (`docs/SEGURANCA.md` e `014_seguranca.sql`) mais o que o dado de saúde **exige a mais**. A coluna "Status" diz se é reaproveitamento ou trabalho novo.

## 9.1 Controles técnicos

| Controle | Como fica no VemaxCALL | Status |
|---|---|---|
| Autenticação | Supabase Auth, senha mínima de 10 caracteres com `avaliarSenha()`, mensagem genérica de erro (sem enumeração de contas) | **reaproveita** |
| **2FA obrigatório para todos os papéis** | TOTP; sem 2FA a conta não opera (não só perde poderes de admin, como no portal) | **novo** |
| Leaked password protection | **ligar no painel do Supabase antes de criar a primeira conta da clínica** (hoje está desligada — achado A6) | **ação pendente** |
| Autorização no servidor | `can_call()` dentro de cada função de transição + RLS em todas as tabelas, padrão negar | **novo**, desenho reaproveitado |
| Isolamento entre organizações | projeto Supabase separado (ADR-001) + `empresa_id` + RLS | **novo** |
| Sessão | revogação efetiva via `sessao_valida()`; inatividade **15 min**, duração máxima **8 h** | **reaproveita** com limites próprios |
| Expiração e encerramento | aviso 2 min antes, sincronia entre abas, "encerrar outras sessões" | **reaproveita** (`app/js/sessao.js`) |
| Validação e normalização de entrada | `CHECK`/regex/funções no banco + `validacao.js` na tela (conveniência) | **reaproveita** |
| Consultas parametrizadas | PostgREST + `$1` nas funções; `limparBusca()`/`escaparLike()` no que entra em filtro | **reaproveita** |
| XSS | `h()` com `createTextNode`; **zero** `innerHTML` com dado; CSP sem `unsafe-inline` em script; `verificar.mjs` reprova script embutido | **reaproveita** |
| CSRF | não se aplica a chamada com `Authorization: Bearer` e sem cookie de sessão. **Se o ADR-007(B) for adotado, passa a se aplicar** e exige token anti-CSRF | — |
| Cabeçalhos | bloco `/call/*` no `_headers` com `no-store`, `noindex, nofollow`; CSP com o host do novo Supabase | **novo** (1 bloco) |
| Rate limiting | limites do Supabase Auth + limite por função no banco (padrão de `registrar_evento`: 60/hora) nas ações de escrita do VemaxCALL | **reaproveita** padrão |
| Controle de tentativas de autenticação | `registrar_login_falho()` com hash de e-mail e IP, alerta de força bruta, espera progressiva na tela | **reaproveita** |
| Proteção contra enumeração de contas | mensagem única "E-mail ou senha incorretos"; busca de paciente **não** confirma existência a quem não tem permissão | **reaproveita** + **novo** |
| Recuperação de senha | fluxo do Supabase por e-mail; **[RECOMENDAÇÃO]** SMTP próprio antes do go-live (o padrão do Supabase tem limite baixo) | **reaproveita** |
| Proteção de arquivos e downloads | bucket **privado**, URL assinada de TTL curto emitida por RPC que checa permissão e **audita** (ADR-005) | **novo** |
| Verificação de tipo e tamanho | `validarArquivo()`: extensão, extensão dupla, tamanho e **assinatura de bytes**; `allowed_mime_types` sem HTML/SVG/executável | **reaproveita** |
| Auditoria de alterações | trigger `log_mudancas('campo',...)` por tabela | **reaproveita** |
| **Auditoria de acesso (leitura)** | `call_auditoria` grava leitura de avaliação médica e emissão de URL de documento. O portal **não** faz isso | **novo** |
| Atualização concorrente | `select ... for update` na solicitação e no prontuário dentro das funções de transição | **novo** |
| Backups | backups do Supabase + **ensaio de restauração documentado antes do go-live** (RNF-12) | **ação pendente** |
| Monitoramento de erros | `console.error` + `mensagemErro()` que nunca mostra texto cru do banco; sem conteúdo clínico em erro | **reaproveita** + **regra nova** |

## 9.2 O que muda por ser dado de saúde

Sete controles que o portal não tem e aqui são obrigatórios:

1. **2FA para todos**, não só para administradores.
2. **Auditoria de leitura**, não só de alteração. Quem abriu a avaliação de qual paciente, quando.
3. **Projeção mínima por papel** (views). O Arquivo não recebe colunas clínicas nem por acidente de `select *`.
4. **Nada clínico em log, erro, URL ou nome de arquivo** (`RNF-09`). Caminho no Storage usa uuid, nunca nome de paciente.
5. **Acesso de emergência do suporte técnico**: o `admin_tecnico` não tem acesso clínico por padrão. Se precisar, concessão **temporária, nominal, com prazo, motivo e registro**, concedida pelo `admin_empresa` — nunca auto-concedida. Expira sozinha.
6. **Sessão mais curta** (15 min / 8 h).
7. **`no-store`** nas páginas do VemaxCALL, não `no-cache`.

## 9.3 LGPD

**[FATO]** Informação sobre saúde é **dado pessoal sensível** (LGPD, art. 5º, II), com tratamento restrito às hipóteses do art. 11 — no caso de uma clínica, tipicamente a tutela da saúde por profissional de saúde ou serviço de saúde (art. 11, II, "f").

**[PENDENTE] — tudo nesta seção depende de definição com os responsáveis. Nada aqui está decidido.**

| Item | Proposta a confirmar |
|---|---|
| **Controlador** | A clínica. Ela decide as finalidades e os meios do tratamento dos dados dos seus pacientes |
| **Operador** | A VEMAX. Trata os dados em nome da clínica, conforme instruções |
| **Instrumento** | Contrato/aditivo de operador (DPA) com: finalidades, instruções, obrigações de segurança, subcontratados (Supabase, Cloudflare), prazo, devolução/eliminação ao fim, e procedimento de incidente |
| **Subcontratados** | Supabase (dado em `sa-east-1`, São Paulo — **confirmar** para o novo projeto) e Cloudflare (assets estáticos; **não** processa dado de paciente). Ambos precisam constar no DPA |
| **Finalidades** | organizar e rastrear solicitações, localizar prontuário, registrar retorno médico e comunicação. **Nenhuma finalidade secundária** — nada de análise, marketing ou treinamento de modelo |
| **Minimização** | o VemaxCALL guarda **identificação + metadados de processo**. O conteúdo clínico fica restrito ao campo da avaliação, acessível só a quem tem permissão clínica. O prontuário em si continua em papel |
| **Direitos do titular** | procedimento de atendimento (acesso, correção, eliminação, informação sobre compartilhamento) **operado pela clínica**, com a VEMAX dando suporte técnico. Prazo e canal a definir |
| **Retenção** | **não definida.** Fato relevante: a Resolução CFM 1.821/2007 estabelece guarda mínima de 20 anos para o prontuário. O VemaxCALL guarda registros de atendimento e movimentação, não o prontuário — o prazo aplicável precisa de definição jurídica. **Até a definição, nenhum descarte automático é implementado** |
| **Incidente de segurança** | procedimento escrito: quem detecta, quem avalia, quem comunica a clínica, em quanto tempo, e quem comunica ANPD e titulares. A clínica (controladora) é quem comunica |
| **Registro das operações** | relatório de impacto (RIPD) é recomendável para dado sensível. Decisão da clínica |

**[RECOMENDAÇÃO]** A política de privacidade do site (`privacidade.html`) **não cobre** o VemaxCALL e não deve ser estendida para cobri-lo: são controladores diferentes. A clínica precisa do próprio aviso aos pacientes. (Observação: `privacidade.html` está como modelo, com campos `[entre colchetes]` a preencher — pendência que já existia.)

## 9.4 Regras de execução para quem programar

- **Nunca** colocar nome de paciente, documento, diagnóstico ou texto de avaliação em: `console.log`, mensagem de erro, URL, nome de arquivo no Storage, `detalhe` de `atividades` ou de `eventos_seguranca`.
- `log_mudancas()` recebe a lista de campos a auditar — **não** incluir campos de conteúdo clínico. Audita-se *que* mudou, com `de → para` só em campos de estado.
- Nenhuma regra de acesso em JavaScript sem a contraparte no banco. Se a regra não está em RLS ou em função, ela não existe.
- Toda função de transição começa com `can_call()` e lança `42501`. Nunca devolver dado "só para a tela decidir".
- Senha, token e segredo: nenhum no repositório. A chave anon é pública por desenho; `service_role` **nunca** no navegador.
- Dado de paciente real **não** entra em teste nem em demonstração (regra explícita do pedido). Os testes usam dados sintéticos — o padrão já existente em `tests/integration/telas.mjs`.
