-- Vemax — portal interno: esquema inicial
-- Pré-requisito: em Authentication > Providers > Email, DESATIVE "Allow new users to sign up".
-- Contas são criadas pelo admin (Dashboard > Authentication > Add user, ou convite).

create extension if not exists pgcrypto;

-- ============ PERFIS E PERMISSÕES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  cargo text not null default '',
  papel text not null default 'membro' check (papel in ('admin','membro')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.permissoes (
  modulo text not null check (modulo in ('mercado','projetos','contatos','conhecimento')),
  pode_ver boolean not null default false,
  pode_editar boolean not null default false,
  primary key (modulo)            -- regra do papel "membro"; admin sempre pode tudo
);
insert into public.permissoes (modulo, pode_ver, pode_editar) values
  ('mercado', true, true), ('projetos', true, false), ('contatos', true, false), ('conhecimento', true, true);

-- Primeiro usuário criado vira admin; os demais entram como membro.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, papel)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          case when exists (select 1 from public.profiles where papel = 'admin') then 'membro' else 'admin' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers (security definer evita recursão de RLS)
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and papel = 'admin' and ativo)
$$;

create function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo)
$$;

create function public.my_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from profiles where id = auth.uid()
$$;

create function public.can(p_modulo text, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when pr.papel = 'admin' then true
      when p_acao = 'ver' then pm.pode_ver
      when p_acao = 'editar' then pm.pode_editar
      else false end
    from profiles pr left join permissoes pm on pm.modulo = p_modulo
    where pr.id = auth.uid() and pr.ativo
  ), false)
$$;

-- ============ ATIVIDADES (log) ============
create table public.atividades (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  acao text not null,            -- criou | editou | excluiu
  entidade text not null,
  detalhe text,
  criado_em timestamptz not null default now()
);

create function public.log_atividade() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  d := coalesce(to_jsonb(coalesce(new, old))->>'titulo', to_jsonb(coalesce(new, old))->>'nome', '');
  insert into atividades (usuario_id, acao, entidade, detalhe)
  values (auth.uid(), case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'editou' else 'excluiu' end, tg_table_name, d);
  return coalesce(new, old);
end $$;

-- ============ INTELIGÊNCIA DE MERCADO ============
create table public.nichos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null default '',
  problemas text not null default '',
  necessidades text not null default '',
  oportunidades text not null default '',
  riscos text not null default '',
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.pesquisas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  nicho_id uuid references public.nichos(id) on delete set null,
  status text not null default 'planejada' check (status in ('planejada','andamento','concluida','revisao')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  resumo text not null default '',
  tags text[] not null default '{}',
  confianca text not null default 'media' check (confianca in ('baixa','media','alta')),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.concorrentes (
  id uuid primary key default gen_random_uuid(),
  nicho_id uuid not null references public.nichos(id) on delete cascade,
  nome text not null,
  site text not null default '',
  oferta text not null default '',
  preco text not null default '',        -- somente se público; texto livre
  pontos_fracos text not null default ''
);

create table public.fontes (
  id uuid primary key default gen_random_uuid(),
  nicho_id uuid references public.nichos(id) on delete cascade,
  pesquisa_id uuid references public.pesquisas(id) on delete cascade,
  titulo text not null,
  url text not null,
  acessado_em date not null default current_date,
  confiabilidade text not null default 'media' check (confiabilidade in ('baixa','media','alta')),
  check (nicho_id is not null or pesquisa_id is not null)
);

create table public.criterios (
  id uuid primary key default gen_random_uuid(),
  chave text unique not null,
  nome text not null,
  peso numeric not null default 1 check (peso >= 0),
  ordem int not null default 0
);
insert into public.criterios (chave, nome, peso, ordem) values
  ('tamanho','Tamanho do mercado',1,1), ('dor','Dor / necessidade tecnológica',1.5,2),
  ('digitalizacao','Nível de digitalização atual (maior = mais espaço)',1,3),
  ('concorrencia','Concorrência (maior nota = menos concorrência)',1,4),
  ('pagar','Disposição a pagar',1.5,5), ('aquisicao','Facilidade de aquisição',1,6),
  ('recorrencia','Recorrência de receita',1,7), ('aderencia','Aderência ao que a Vemax entrega',1,8);

create table public.notas_nicho (
  nicho_id uuid not null references public.nichos(id) on delete cascade,
  criterio_id uuid not null references public.criterios(id) on delete cascade,
  nota numeric not null check (nota between 0 and 10),
  evidencia text not null default '',                   -- sem evidência/fonte = "não verificada"
  fonte_id uuid references public.fontes(id) on delete set null,
  primary key (nicho_id, criterio_id)
);

create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisas(id) on delete cascade,
  tipo text not null check (tipo in ('pdf','xlsx','pbix','csv','png','link')),
  nome text not null,
  caminho text,                -- caminho no bucket "entregaveis"
  url text,                    -- para tipo link
  tamanho bigint,
  criado_em timestamptz not null default now()
);

create table public.modelos_prompt (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  corpo text not null,
  atualizado_em timestamptz not null default now()
);
insert into public.modelos_prompt (titulo, corpo) values ('Pesquisa estratégica de nicho',
'Realize uma investigação profunda sobre o nicho [NICHO] no Brasil [REGIÃO], período [PERÍODO], identificando: (1) problemas operacionais reais; (2) necessidades tecnológicas não atendidas; (3) concorrentes e soluções existentes, com pontos fortes e fracos; (4) tamanho e tendência do mercado; (5) oportunidades e riscos para uma empresa de desenvolvimento de software sob medida.

Regras: use apenas fontes confiáveis e atualizadas (IBGE, SEBRAE, associações setoriais, relatórios de mercado, estudos acadêmicos, sites oficiais, veículos reconhecidos); cite cada fonte com URL e data de acesso; separe FATO (com fonte) de INFERÊNCIA (sua análise); sinalize lacunas e dados incertos em vez de preenchê-los; não invente números, empresas ou citações; não pule etapas.

Entregáveis: relatório PDF com gráficos; planilha Excel com dashboard e matriz de comparação de nichos; arquivo Power BI quando possível. Inclua ranking dos nichos com pontuação por critério e justificativa de cada nota.

Fora de escopo: não desenvolver software e não fazer prospecção comercial. O foco é exclusivamente a pesquisa estratégica de mercado.');

-- ============ OUTROS MÓDULOS (estrutura) ============
create table public.projetos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cliente text not null default '',
  status text not null default 'planejado' check (status in ('planejado','andamento','pausado','concluido')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  prazo date,
  criado_em timestamptz not null default now()
);

create table public.contatos_site (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 120),
  contato text not null check (char_length(contato) between 3 and 160),
  mensagem text not null check (char_length(mensagem) between 3 and 2000),
  problema text check (char_length(problema) <= 2000),
  solucao_sugerida text check (char_length(solucao_sugerida) <= 600),
  status text not null default 'novo' check (status in ('novo','em_contato','concluido','descartado')),
  criado_em timestamptz not null default now()
);

create table public.conhecimento (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null default 'processo' check (categoria in ('processo','template','prompt','documento')),
  corpo text not null default '',
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

-- ============ TRIGGERS ============
create function public.touch() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
create trigger t_touch_n before update on public.nichos for each row execute function public.touch();
create trigger t_touch_p before update on public.pesquisas for each row execute function public.touch();
create trigger t_touch_c before update on public.conhecimento for each row execute function public.touch();
create trigger t_touch_m before update on public.modelos_prompt for each row execute function public.touch();

create trigger t_log_nichos after insert or update or delete on public.nichos for each row execute function public.log_atividade();
create trigger t_log_pesquisas after insert or update or delete on public.pesquisas for each row execute function public.log_atividade();
create trigger t_log_projetos after insert or update or delete on public.projetos for each row execute function public.log_atividade();
create trigger t_log_conhecimento after insert or update or delete on public.conhecimento for each row execute function public.log_atividade();
create trigger t_log_anexos after insert or delete on public.anexos for each row execute function public.log_atividade();

-- ============ RLS (padrão = negar) ============
alter table public.profiles enable row level security;
alter table public.permissoes enable row level security;
alter table public.atividades enable row level security;
alter table public.nichos enable row level security;
alter table public.pesquisas enable row level security;
alter table public.concorrentes enable row level security;
alter table public.fontes enable row level security;
alter table public.criterios enable row level security;
alter table public.notas_nicho enable row level security;
alter table public.anexos enable row level security;
alter table public.modelos_prompt enable row level security;
alter table public.projetos enable row level security;
alter table public.contatos_site enable row level security;
alter table public.conhecimento enable row level security;

-- profiles: todo usuário ativo vê a equipe; só admin altera papel/ativo; cada um edita nome/cargo
create policy profiles_ver on public.profiles for select to authenticated using (public.is_active() or id = auth.uid());
create policy profiles_admin on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and papel = public.my_papel() and ativo);

create policy permissoes_ver on public.permissoes for select to authenticated using (true);
create policy permissoes_admin on public.permissoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy atividades_ver on public.atividades for select to authenticated using (public.is_admin() or usuario_id = auth.uid());

-- módulo mercado
do $$
declare t text;
begin
  foreach t in array array['nichos','pesquisas','concorrentes','fontes','criterios','notas_nicho','anexos','modelos_prompt'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can(''mercado'',''ver''))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can(''mercado'',''editar''))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can(''mercado'',''editar'')) with check (public.can(''mercado'',''editar''))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can(''mercado'',''editar''))', t||'_del', t);
  end loop;
  foreach t in array array['projetos','conhecimento'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can(%L,''ver''))', t||'_sel', t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can(%L,''editar''))', t||'_ins', t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can(%L,''editar'')) with check (public.can(%L,''editar''))', t||'_upd', t, t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can(%L,''editar''))', t||'_del', t, t);
  end loop;
end $$;

-- contatos do site: qualquer visitante pode INSERIR (validado por CHECK); leitura/edição só equipe autorizada
create policy contatos_insert_publico on public.contatos_site for insert to anon, authenticated
  with check (status = 'novo');
create policy contatos_sel on public.contatos_site for select to authenticated using (public.can('contatos','ver'));
create policy contatos_upd on public.contatos_site for update to authenticated using (public.can('contatos','editar')) with check (public.can('contatos','editar'));
create policy contatos_del on public.contatos_site for delete to authenticated using (public.is_admin());

-- ============ STORAGE (bucket privado de entregáveis) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregaveis', 'entregaveis', false, 52428800,
  array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream','text/csv','image/png'])
on conflict (id) do nothing;

create policy entregaveis_sel on storage.objects for select to authenticated using (bucket_id = 'entregaveis' and public.can('mercado','ver'));
create policy entregaveis_ins on storage.objects for insert to authenticated with check (bucket_id = 'entregaveis' and public.can('mercado','editar'));
create policy entregaveis_upd on storage.objects for update to authenticated using (bucket_id = 'entregaveis' and public.can('mercado','editar'));
create policy entregaveis_del on storage.objects for delete to authenticated using (bucket_id = 'entregaveis' and public.can('mercado','editar'));
