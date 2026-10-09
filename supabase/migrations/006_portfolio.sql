-- Portfólio público: cases gerenciados no portal (módulo "portfolio") e exibidos no site.
-- Visitantes (anon) só leem cases publicados; quem edita é definido por permissoes/papel, como nos outros módulos.

-- 1) Novo módulo de permissão
alter table public.permissoes drop constraint permissoes_modulo_check;
alter table public.permissoes add constraint permissoes_modulo_check
  check (modulo in ('mercado','projetos','contatos','conhecimento','portfolio'));
insert into public.permissoes (modulo, pode_ver, pode_editar) values ('portfolio', true, false)
  on conflict (modulo) do nothing;

-- 2) Tabela
create table public.portfolio_cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  titulo text not null check (length(titulo) between 1 and 140),
  segmento text not null default '' check (length(segmento) <= 60),
  problema text not null default '' check (length(problema) <= 600),
  solucao text not null default '' check (length(solucao) <= 600),
  resultado text not null default '' check (length(resultado) <= 600),
  antes text not null default '' check (length(antes) <= 200),     -- "Antes" (frase curta)
  depois text not null default '' check (length(depois) <= 200),   -- "Depois" (frase curta)
  historia text not null default '' check (length(historia) <= 8000), -- texto longo da página do case
  etapas jsonb not null default '[]' check (jsonb_typeof(etapas) = 'array' and jsonb_array_length(etapas) <= 8), -- [{titulo,texto,duracao}]
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  imagem_path text check (imagem_path is null or imagem_path ~ '^[A-Za-z0-9/_.-]{1,200}$'),  -- caminho no bucket "portfolio"
  depoimento text not null default '' check (length(depoimento) <= 600),
  depoimento_autor text not null default '' check (length(depoimento_autor) <= 120),
  ilustrativo boolean not null default false,   -- true = exemplo, mostra o selo "Case ilustrativo" no site
  publicado boolean not null default false,
  ordem int not null default 0,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index portfolio_cases_ordem on public.portfolio_cases (publicado, ordem, criado_em desc);

create trigger t_touch_pf before update on public.portfolio_cases for each row execute function public.touch();
create trigger t_log_pf after insert or update or delete on public.portfolio_cases for each row execute function public.log_atividade();

-- 3) RLS
alter table public.portfolio_cases enable row level security;
create policy pf_publico on public.portfolio_cases for select to anon, authenticated using (publicado);
create policy pf_equipe_ver on public.portfolio_cases for select to authenticated using (public.can('portfolio', 'ver'));
create policy pf_ins on public.portfolio_cases for insert to authenticated with check (public.can('portfolio', 'editar'));
create policy pf_upd on public.portfolio_cases for update to authenticated using (public.can('portfolio', 'editar')) with check (public.can('portfolio', 'editar'));
create policy pf_del on public.portfolio_cases for delete to authenticated using (public.can('portfolio', 'editar'));

-- 4) Storage: bucket PÚBLICO só para imagens do portfólio (leitura por URL; escrita só com permissão)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio', 'portfolio', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy portfolio_obj_ins on storage.objects for insert to authenticated with check (bucket_id = 'portfolio' and public.can('portfolio','editar'));
create policy portfolio_obj_upd on storage.objects for update to authenticated using (bucket_id = 'portfolio' and public.can('portfolio','editar'));
create policy portfolio_obj_del on storage.objects for delete to authenticated using (bucket_id = 'portfolio' and public.can('portfolio','editar'));
create policy portfolio_obj_sel on storage.objects for select to authenticated using (bucket_id = 'portfolio' and public.can('portfolio','ver'));
