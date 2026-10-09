-- Notificações no portal, acompanhamento do projeto pelo cliente (link privado) e avaliação pós-entrega.
-- Pré-requisito: migration 008 (datas de fluxo e bloqueio em projetos).

-- ============ 1) NOTIFICAÇÕES (sino do portal) ============
create table public.notificacoes (
  id bigint generated always as identity primary key,
  modulo text not null check (modulo in ('contatos','projetos','equipe')),
  tipo text not null,
  titulo text not null check (char_length(titulo) <= 200),
  link text not null default '',          -- caminho dentro do portal, ex.: contatos/
  criado_em timestamptz not null default now()
);
create index notificacoes_criado on public.notificacoes (criado_em desc);
alter table public.notificacoes enable row level security;
create policy notif_sel on public.notificacoes for select to authenticated
  using (case when modulo = 'equipe' then public.is_admin() else public.can(modulo, 'ver') end);

-- Cada usuário guarda até quando já viu as notificações.
alter table public.profiles add column notif_visto_em timestamptz not null default now();

create function public.notificar(p_modulo text, p_tipo text, p_titulo text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notificacoes (modulo, tipo, titulo, link) values (p_modulo, p_tipo, left(p_titulo, 200), p_link)
$$;
revoke execute on function public.notificar(text, text, text, text) from public, anon, authenticated;

create function public.tg_notif_contato() returns trigger language plpgsql security definer set search_path = public as $$
begin perform notificar('contatos', 'lead', 'Novo lead: ' || left(new.nome, 60), 'contatos/'); return new; end $$;
create trigger t_notif_contato after insert on public.contatos_site for each row execute function public.tg_notif_contato();

create function public.tg_notif_proposta() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'enviada' and new.status in ('aceita','recusada') then
    perform notificar('contatos', 'proposta', 'Proposta ' || case when new.status = 'aceita' then 'aceita' else 'recusada' end || ': ' || left(new.titulo, 100), 'contatos/');
  end if;
  return new;
end $$;
create trigger t_notif_proposta after update on public.propostas for each row execute function public.tg_notif_proposta();

create function public.tg_notif_cadastro() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pendente' then perform notificar('equipe', 'cadastro', 'Cadastro aguardando aprovação: ' || left(new.nome, 60), 'equipe/'); end if;
  return new;
end $$;
create trigger t_notif_cadastro after insert on public.profiles for each row execute function public.tg_notif_cadastro();

revoke execute on function public.tg_notif_contato() from public, anon, authenticated;
revoke execute on function public.tg_notif_proposta() from public, anon, authenticated;
revoke execute on function public.tg_notif_cadastro() from public, anon, authenticated;

-- ============ 2) ACOMPANHAMENTO PELO CLIENTE ============
alter table public.projetos
  add column token_cliente text unique check (token_cliente is null or token_cliente ~ '^[a-f0-9]{64}$');   -- null = link desativado

create table public.projeto_updates (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 1000),
  publico boolean not null default true,          -- true = aparece para o cliente
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index projeto_updates_proj on public.projeto_updates (projeto_id, criado_em desc);
alter table public.projeto_updates enable row level security;
create policy pupd_sel on public.projeto_updates for select to authenticated using (public.can('projetos', 'ver'));
create policy pupd_ins on public.projeto_updates for insert to authenticated with check (public.can('projetos', 'editar'));
create policy pupd_upd on public.projeto_updates for update to authenticated using (public.can('projetos', 'editar')) with check (public.can('projetos', 'editar'));
create policy pupd_del on public.projeto_updates for delete to authenticated using (public.can('projetos', 'editar'));

-- Página pública: só campos seguros (sem notas internas, anexos ou responsáveis).
create function public.projeto_publico(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titulo', p.titulo, 'cliente', p.cliente, 'status', p.status, 'prazo', p.prazo,
    'iniciado_em', p.iniciado_em, 'concluido_em', p.concluido_em, 'bloqueado', p.bloqueado,
    'atualizacoes', coalesce((
      select jsonb_agg(jsonb_build_object('texto', u.texto, 'criado_em', u.criado_em) order by u.criado_em desc)
      from (select texto, criado_em from projeto_updates where projeto_id = p.id and publico order by criado_em desc limit 50) u
    ), '[]'::jsonb))
  from projetos p
  where p_token ~ '^[a-f0-9]{64}$' and p.token_cliente = p_token
$$;

-- ============ 3) AVALIAÇÃO PÓS-ENTREGA ============
create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  nota int check (nota between 0 and 10),
  comentario text not null default '' check (char_length(comentario) <= 1000),
  nome text not null default '' check (char_length(nome) <= 120),
  autoriza_depoimento boolean not null default false,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  respondida_em timestamptz
);
create index avaliacoes_proj on public.avaliacoes (projeto_id, criado_em desc);
alter table public.avaliacoes enable row level security;
create policy aval_sel on public.avaliacoes for select to authenticated using (public.can('projetos', 'ver'));
create policy aval_ins on public.avaliacoes for insert to authenticated with check (public.can('projetos', 'editar'));
create policy aval_del on public.avaliacoes for delete to authenticated using (public.can('projetos', 'editar'));

create function public.tg_notif_avaliacao() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.respondida_em is null and new.respondida_em is not null then
    perform notificar('projetos', 'avaliacao', 'Nova avaliação recebida (nota ' || new.nota || ')', 'projetos/');
  end if;
  return new;
end $$;
revoke execute on function public.tg_notif_avaliacao() from public, anon, authenticated;
create trigger t_notif_avaliacao after update on public.avaliacoes for each row execute function public.tg_notif_avaliacao();

create function public.avaliacao_publica(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('titulo', p.titulo, 'cliente', p.cliente, 'respondida', a.respondida_em is not null)
  from avaliacoes a join projetos p on p.id = a.projeto_id
  where p_token ~ '^[a-f0-9]{64}$' and a.token = p_token
$$;

create function public.responder_avaliacao(p_token text, p_nota int, p_comentario text, p_nome text, p_autoriza boolean) returns text
language plpgsql security definer set search_path = public as $$
declare a avaliacoes;
begin
  if p_token !~ '^[a-f0-9]{64}$' then return 'indisponivel'; end if;
  select * into a from avaliacoes where token = p_token and respondida_em is null for update;
  if not found then return 'indisponivel'; end if;
  if p_nota is null or p_nota not between 0 and 10 or char_length(coalesce(p_comentario, '')) > 1000 or char_length(coalesce(p_nome, '')) > 120 then return 'invalido'; end if;
  update avaliacoes set nota = p_nota, comentario = trim(coalesce(p_comentario, '')), nome = trim(coalesce(p_nome, '')),
    autoriza_depoimento = coalesce(p_autoriza, false) and char_length(trim(coalesce(p_comentario, ''))) > 0, respondida_em = now()
  where id = a.id;
  return 'ok';
end $$;

-- ============ 4) Acesso anônimo apenas às funções públicas ============
revoke execute on function public.projeto_publico(text) from public;
revoke execute on function public.avaliacao_publica(text) from public;
revoke execute on function public.responder_avaliacao(text, int, text, text, boolean) from public;
grant execute on function public.projeto_publico(text) to anon, authenticated;
grant execute on function public.avaliacao_publica(text) to anon, authenticated;
grant execute on function public.responder_avaliacao(text, int, text, text, boolean) to anon, authenticated;
