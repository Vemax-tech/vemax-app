-- Fase 2 do portal: contatos com responsável, projetos com anexos, nichos-alvo.

-- ============ CONTATOS ============
alter table public.contatos_site
  add column responsavel_id uuid references public.profiles(id) on delete set null,
  add column notas text not null default '' check (char_length(notas) <= 4000),
  add column atualizado_em timestamptz not null default now();
create trigger t_touch_contatos before update on public.contatos_site for each row execute function public.touch();
create trigger t_log_contatos after update or delete on public.contatos_site for each row execute function public.log_atividade();

-- ============ PROJETOS ============
alter table public.projetos
  add column descricao text not null default '',
  add column contato_id uuid references public.contatos_site(id) on delete set null,
  add column nicho_id uuid references public.nichos(id) on delete set null,
  add column atualizado_em timestamptz not null default now();
create trigger t_touch_projetos before update on public.projetos for each row execute function public.touch();

create table public.projeto_anexos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  nome text not null,
  caminho text not null,        -- caminho no bucket "projetos"
  tamanho bigint,
  criado_em timestamptz not null default now()
);
alter table public.projeto_anexos enable row level security;
create policy projeto_anexos_sel on public.projeto_anexos for select to authenticated using (public.can('projetos','ver'));
create policy projeto_anexos_ins on public.projeto_anexos for insert to authenticated with check (public.can('projetos','editar'));
create policy projeto_anexos_del on public.projeto_anexos for delete to authenticated using (public.can('projetos','editar'));
create trigger t_log_projeto_anexos after insert or delete on public.projeto_anexos for each row execute function public.log_atividade();

insert into storage.buckets (id, name, public, file_size_limit)
values ('projetos', 'projetos', false, 52428800)
on conflict (id) do nothing;
create policy projetos_obj_sel on storage.objects for select to authenticated using (bucket_id = 'projetos' and public.can('projetos','ver'));
create policy projetos_obj_ins on storage.objects for insert to authenticated with check (bucket_id = 'projetos' and public.can('projetos','editar'));
create policy projetos_obj_del on storage.objects for delete to authenticated using (bucket_id = 'projetos' and public.can('projetos','editar'));

-- ============ NICHOS ============
alter table public.nichos add column alvo boolean not null default false;
