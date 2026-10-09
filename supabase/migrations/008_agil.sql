-- Práticas ágeis no módulo Projetos: limite de WIP, bloqueio, datas de fluxo (lead time) e ciclos de 2 semanas com retrospectiva.
-- Permissões: as mesmas do módulo "projetos" (ver / editar).

-- 1) Ciclos (sprints leves) com retrospectiva
create table public.projeto_ciclos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 80),
  inicio date not null,
  fim date not null check (fim >= inicio),
  meta text not null default '' check (char_length(meta) <= 500),
  retro_manter text not null default '' check (char_length(retro_manter) <= 2000),
  retro_mudar text not null default '' check (char_length(retro_mudar) <= 2000),
  encerrado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- 2) Campos novos em projetos
alter table public.projetos
  add column bloqueado boolean not null default false,
  add column motivo_bloqueio text not null default '' check (char_length(motivo_bloqueio) <= 300),
  add column iniciado_em timestamptz,
  add column concluido_em timestamptz,
  add column ciclo_id uuid references public.projeto_ciclos(id) on delete set null;

-- Projetos que já existem: aproxima as datas para as métricas não começarem vazias.
update public.projetos set iniciado_em = criado_em where status in ('andamento','concluido');
update public.projetos set concluido_em = coalesce(atualizado_em, criado_em) where status = 'concluido';

-- Datas de fluxo preenchidas automaticamente conforme o status muda.
create function public.projetos_datas() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'andamento' and new.iniciado_em is null then new.iniciado_em := now(); end if;
  if new.status = 'concluido' then
    if new.iniciado_em is null then new.iniciado_em := new.criado_em; end if;
    if tg_op = 'INSERT' then
      new.concluido_em := coalesce(new.concluido_em, now());
    elsif old.status is distinct from 'concluido' then
      new.concluido_em := now();
    end if;
  else
    new.concluido_em := null;
  end if;
  if new.bloqueado = false then new.motivo_bloqueio := ''; end if;
  return new;
end $$;
revoke execute on function public.projetos_datas() from public, anon, authenticated;
create trigger t_projetos_datas before insert or update on public.projetos for each row execute function public.projetos_datas();

-- 3) Limite de itens em andamento por coluna (aviso visual; não bloqueia gravação)
create table public.projeto_wip (
  status text primary key check (status in ('planejado','andamento','pausado','concluido')),
  limite int not null check (limite between 1 and 99)
);

-- 4) RLS (mesmo módulo "projetos")
alter table public.projeto_ciclos enable row level security;
alter table public.projeto_wip enable row level security;
create policy ciclos_sel on public.projeto_ciclos for select to authenticated using (public.can('projetos', 'ver'));
create policy ciclos_ins on public.projeto_ciclos for insert to authenticated with check (public.can('projetos', 'editar'));
create policy ciclos_upd on public.projeto_ciclos for update to authenticated using (public.can('projetos', 'editar')) with check (public.can('projetos', 'editar'));
create policy ciclos_del on public.projeto_ciclos for delete to authenticated using (public.can('projetos', 'editar'));
create policy wip_sel on public.projeto_wip for select to authenticated using (public.can('projetos', 'ver'));
create policy wip_ins on public.projeto_wip for insert to authenticated with check (public.can('projetos', 'editar'));
create policy wip_upd on public.projeto_wip for update to authenticated using (public.can('projetos', 'editar')) with check (public.can('projetos', 'editar'));
create policy wip_del on public.projeto_wip for delete to authenticated using (public.can('projetos', 'editar'));

create trigger t_log_ciclos after insert or update or delete on public.projeto_ciclos for each row execute function public.log_atividade();
