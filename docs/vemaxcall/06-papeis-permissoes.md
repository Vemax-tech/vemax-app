# 6. Matriz de papéis e permissões

## 6.1 Por que o modelo atual não serve

**[FATO]** O portal da VEMAX tem exatamente dois papéis (`admin`, `membro`) e uma tabela `permissoes` com chave primária **só no módulo** — ou seja, um perfil único para todos os membros (ver `01-auditoria.md`, 1.3).

Os quatro papéis operacionais do fluxograma **não são expressáveis** nesse modelo: não há como dizer "o Arquivo movimenta prontuário mas não lê avaliação médica" e "a Recepção confirma recebimento mas não registra avaliação". E `is_admin()` devolve acesso a tudo, o que o item 10 do pedido proíbe expressamente.

**[RECOMENDAÇÃO]** O VemaxCALL precisa de permissão **por papel × recurso × ação**, verificada no servidor. Ver ADR-003.

## 6.2 Papéis

| Papel | Chave | Quem é | 2FA |
|---|---|---|---|
| Call Center | `callcenter` | Atendentes | obrigatório |
| Arquivo | `arquivo` | Responsável pelo arquivo (o "Silvio" do fluxograma) | obrigatório |
| Recepção | `recepcao` | Recepção da clínica | obrigatório |
| Médico | `medico` | Profissional habilitado. Exige `registro_profissional` preenchido | obrigatório |
| Administrador da empresa | `admin_empresa` | Gestor da clínica: usuários, papéis e configurações | obrigatório |
| Administrador técnico VEMAX | `admin_tecnico` | Suporte técnico da VEMAX | obrigatório |

Um usuário pode ter **mais de um papel** (a Recepção pequena pode acumular Arquivo). Permissão efetiva = união dos papéis.

**O paciente não é papel e não tem conta** (item 10 do pedido).

## 6.3 Matriz

`V` = ver · `E` = editar/registrar · `—` = sem acesso · `Vm` = ver **mínimo** (só os campos necessários à função, por view com projeção reduzida)

| Recurso / ação | Call Center | Arquivo | Recepção | Médico | Admin empresa | Admin téc. VEMAX |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Paciente** — identificação (nome, documento, contato) | V E | Vm | V | V | Vm | — |
| **Paciente** — histórico de solicitações | V | Vm | V | V | Vm | — |
| **Solicitação** — abrir | E | — | — | — | — | — |
| **Solicitação** — ver lista/detalhe | V | Vm | V | V | V | Vm |
| **Solicitação** — editar dados do pedido | E | — | — | — | E | — |
| **Solicitação** — pedir prontuário (T03) | E | — | — | — | — | — |
| **Solicitação** — encaminhar ao médico (T06) | — | — | E | — | — | — |
| **Solicitação** — concluir (T11/T13) | E | — | E | — | E | — |
| **Solicitação** — cancelar / reabrir (T15/T16) | E | — | — | — | E | — |
| **Prontuário** — localizar, retirar, entregar (C01–C03) | — | E | — | — | — | — |
| **Prontuário** — confirmar recebimento (C04) | — | — | **E** | — | — | — |
| **Prontuário** — conferir / registrar divergência | — | — | E | — | — | — |
| **Prontuário** — devolver (C07) | — | — | E | — | — | — |
| **Prontuário** — receber devolução e arquivar (C08–C09) | — | **E** | — | — | — | — |
| **Prontuário** — ver custódia e histórico | V | V | V | V | V | Vm |
| **Avaliação médica** — registrar (T07/T08/T14) | — | — | — | **E** | — | — |
| **Avaliação médica** — ver conteúdo clínico | **—** | **—** | Vm | V | **—** | **—** |
| **Avaliação médica** — ver *que existe* retorno | V | — | V | V | V | V |
| **Documento (receita)** — emitir / versionar | — | — | — | **E** | — | — |
| **Documento** — baixar/abrir conteúdo | **—** | — | V | V | **—** | **—** |
| **Documento** — ver metadados (tipo, versão, disponível) | V | — | V | V | V | V |
| **Comunicação** — registrar | E | E | E | E | E | — |
| **Comunicação** — ver | V | V | V | V | V | Vm |
| **Entrega** — orientar / anunciar / registrar envio | E | — | E | — | — | — |
| **Entrega** — confirmar retirada física | — | — | E | — | — | — |
| **Tarefa** — ver a própria fila | V | V | V | V | V | — |
| **Tarefa** — atribuir a outra pessoa | E | — | E | — | E | — |
| **Dashboard operacional** | V | Vm | V | Vm | V | Vm |
| **Relatórios** (agregados, sem dado clínico) | V | — | V | V | V | V |
| **Usuários e papéis** | — | — | — | — | **E** | — |
| **Configurações da empresa** (rótulos, metas) | — | — | — | — | E | — |
| **Log de auditoria e eventos de segurança** | — | — | — | — | V | V |
| **Saúde técnica** (erros, migrations, backup) | — | — | — | — | — | **V E** |

## 6.4 As quatro decisões que essa matriz toma

Cada uma vem de uma exigência explícita do item 10 do pedido:

1. **O Call Center registra e acompanha, mas não lê conteúdo clínico.** Ele vê *que* existe retorno e precisa comunicar; não vê o texto da avaliação nem baixa a receita. É o que permite o atendente fazer o trabalho dele (etapas 12 e 13 dos dois fluxos) sem acesso desnecessário a dado sensível. **[PENDENTE]** confirmar com a operação se o atendente precisa *ler* a resposta para repassá-la por telefone — se precisar, a saída é um campo "resumo para o paciente" escrito pelo médico, separado do conteúdo clínico completo (item 12.4).

2. **O Arquivo tem acesso mínimo.** Para localizar um prontuário basta nome, documento e referência do prontuário. Não precisa de relato, avaliação nem documento. `Vm` em todas as linhas de paciente e solicitação.

3. **O administrador da empresa não ganha acesso clínico por ser administrador.** Ele gerencia pessoas e configurações. Se também for médico, recebe o papel `medico` **com registro profissional**, e aí o acesso vem do papel clínico, não do administrativo.

4. **A administração técnica da VEMAX não tem acesso a dado clínico por padrão.** Ela vê saúde técnica, auditoria e metadados. Acesso a conteúdo exige concessão temporária, registrada e com prazo — ver `09-seguranca-privacidade.md`, seção "acesso de emergência".

## 6.5 Como isso é imposto no banco

```sql
-- Esboço (não aplicar sem revisão); vai na primeira migration do VemaxCALL.
create table call_papeis_permissoes (
  papel   text not null check (papel in ('callcenter','arquivo','recepcao','medico','admin_empresa','admin_tecnico')),
  recurso text not null,           -- 'solicitacao', 'prontuario', 'avaliacao_medica', 'documento', ...
  acao    text not null check (acao in ('ver','ver_minimo','editar')),
  primary key (papel, recurso, acao)
);

create table call_usuario_papeis (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel      text not null,
  primary key (usuario_id, papel)
);

-- Mesmo desenho de can() do portal: security definer, checa sessão e 2FA.
create function can_call(p_recurso text, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from call_usuario_papeis up
    join call_papeis_permissoes pp on pp.papel = up.papel
    where up.usuario_id = auth.uid() and pp.recurso = p_recurso and pp.acao = p_acao
  ) and sessao_valida() and mfa_ok_call()
$$;
```

**Pontos de projeto, cada um com um motivo:**

- A matriz é **dado**, não código: o admin da empresa ajusta rótulos e metas, mas **não** a matriz de permissão clínica (essa fica fora do alcance da interface, só por migration). Evita que uma configuração errada abra acesso a dado de saúde.
- `can_call()` repete o padrão de `can()` do portal (`security definer`, confere sessão e 2FA) — por consistência e porque esse desenho já foi testado em `tests/integration/sql-seguranca.mjs`.
- `mfa_ok_call()` é mais estrito que `mfa_ok()`: no VemaxCALL o 2FA é obrigatório para **todos** os papéis, não só admin (`RNF-07`).
- `ver_minimo` existe porque RLS no Postgres filtra **linhas**, não colunas. A projeção mínima é feita por **views** dedicadas por papel (`v_call_solicitacoes_arquivo`, etc.), com `security_invoker` e `grant select` só para quem deve.
- Cada função de transição chama `can_call()` **antes** de qualquer escrita e lança `42501` (o `mensagemErro()` do portal já traduz esse código para "Sem permissão para esta ação").
