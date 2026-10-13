-- Contratos recorrentes (suporte, hospedagem, manutenção…): valor fixo por mês, trimestre ou ano,
-- com geração automática das cobranças. Só ADICIONA; nenhum dado existente é alterado.
-- Pré-requisito: migration 012.

-- 1) O módulo de permissão do financeiro passa a proteger também os contratos.
create or replace function public.modulo_da_tabela(p_tabela text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_tabela in ('contatos_site', 'propostas') then 'contatos'
    when p_tabela in ('clientes', 'cliente_contatos', 'cliente_links') then 'clientes'
    when p_tabela in ('projetos', 'tarefas', 'projeto_membros', 'projeto_entregas', 'projeto_escopo_alteracoes', 'projeto_anexos', 'projeto_ciclos', 'projeto_updates', 'avaliacoes') then 'projetos'
    when p_tabela = 'chamados' then 'suporte'
    when p_tabela in ('cobrancas', 'despesas', 'contratos') then 'financeiro'
    when p_tabela in ('nichos', 'pesquisas', 'concorrentes', 'fontes', 'criterios', 'notas_nicho', 'anexos', 'modelos_prompt') then 'mercado'
    when p_tabela = 'conhecimento' then 'conhecimento'
    when p_tabela = 'portfolio_cases' then 'portfolio'
    else null end
$$;

-- 2) Contratos
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  projeto_id uuid references public.projetos(id) on delete set null,
  tipo text not null default 'suporte' check (tipo in ('suporte','hospedagem','manutencao','licenca','outro')),
  descricao text not null check (char_length(descricao) between 1 and 170),
  valor numeric(12,2) not null check (valor > 0),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal','trimestral','anual')),
  inicio date not null default current_date,
  fim date,
  dia_vencimento int not null check (dia_vencimento between 1 and 31),     -- dia "de verdade" do vencimento; meses curtos usam o último dia
  proximo_vencimento date not null,                                         -- vencimento da próxima cobrança a gerar
  antecedencia_dias int not null default 10 check (antecedencia_dias between 0 and 60),   -- gera a cobrança quantos dias antes
  status text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  observacoes text not null default '' check (char_length(observacoes) <= 1000),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  check (fim is null or fim >= inicio)
);
create index contratos_cliente on public.contratos (cliente_id);
create index contratos_ativos on public.contratos (proximo_vencimento) where status = 'ativo' and deleted_at is null;

alter table public.cobrancas add column contrato_id uuid references public.contratos(id) on delete set null;
-- Garante que a mesma parcela do mesmo contrato nunca seja gerada duas vezes.
create unique index cobrancas_contrato_vencimento on public.cobrancas (contrato_id, vencimento) where contrato_id is not null and deleted_at is null;

create trigger t_touch_contratos before update on public.contratos for each row execute function public.touch();
create trigger t_exclusao before update on public.contratos for each row execute function public.marcar_exclusao();
create trigger t_log_contratos after insert or update or delete on public.contratos for each row execute function public.log_mudancas('status','valor','periodicidade','fim');

alter table public.contratos enable row level security;
create policy contratos_sel on public.contratos for select to authenticated using (public.can_tabela('contratos', 'ver'));
create policy contratos_ins on public.contratos for insert to authenticated with check (public.can_tabela('contratos', 'editar'));
create policy contratos_upd on public.contratos for update to authenticated using (public.can_tabela('contratos', 'editar')) with check (public.can_tabela('contratos', 'editar'));
create policy contratos_del on public.contratos for delete to authenticated using (public.is_admin());

-- 3) Data da próxima cobrança: soma n meses a "d" e usa o dia desejado, ou o último dia do mês se ele não existir (31 -> 28/29/30).
create function public.proximo_dia(d date, meses int, dia int) returns date
language sql immutable set search_path = public as $$
  select (date_trunc('month', d) + make_interval(months => meses))::date
         + (least(dia, extract(day from (date_trunc('month', d) + make_interval(months => meses + 1) - interval '1 day'))::int) - 1)
$$;

-- 4) Gera as cobranças que já entraram na janela de antecedência. Pode ser chamada quantas vezes quiser:
--    não duplica (índice único) e só avança o contrato depois de gerar. Roda ao abrir o Financeiro; também dá para agendar com pg_cron.
create function public.gerar_cobrancas_recorrentes() returns int
language plpgsql security definer set search_path = public as $$
declare c contratos; n int := 0; novas int; passos int; meses int;
begin
  if not public.can('financeiro', 'editar') then return 0; end if;
  perform set_config('vemax.sistema', '1', true);          -- geração automática não entra no log como ação de uma pessoa
  for c in select * from contratos
           where status = 'ativo' and deleted_at is null and (fim is null or proximo_vencimento <= fim)
             and proximo_vencimento - antecedencia_dias <= current_date
           for update loop
    meses := case c.periodicidade when 'mensal' then 1 when 'trimestral' then 3 else 12 end;
    passos := 0;
    while passos < 24 and (c.fim is null or c.proximo_vencimento <= c.fim) and c.proximo_vencimento - c.antecedencia_dias <= current_date loop
      insert into cobrancas (cliente_id, projeto_id, contrato_id, descricao, valor, vencimento, status)
      values (c.cliente_id, c.projeto_id, c.id, left(c.descricao, 170) || ' (' || to_char(c.proximo_vencimento, 'MM/YYYY') || ')', c.valor, c.proximo_vencimento, 'pendente')
      on conflict (contrato_id, vencimento) where contrato_id is not null and deleted_at is null do nothing;
      get diagnostics novas = row_count;
      n := n + novas;
      c.proximo_vencimento := public.proximo_dia(c.proximo_vencimento, meses, c.dia_vencimento);
      passos := passos + 1;
    end loop;
    update contratos set proximo_vencimento = c.proximo_vencimento,
      status = case when c.fim is not null and c.proximo_vencimento > c.fim then 'encerrado' else status end
    where id = c.id;
  end loop;
  perform set_config('vemax.sistema', '', true);
  return n;
end $$;
revoke execute on function public.gerar_cobrancas_recorrentes() from public, anon;
grant execute on function public.gerar_cobrancas_recorrentes() to authenticated;
