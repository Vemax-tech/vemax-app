-- Funil de leads + propostas online.
-- Etapas do lead: novo -> em_contato -> proposta -> concluido (fechado) | descartado (perdido).
-- Propostas: a equipe cria no portal e compartilha um link privado (token); o cliente aceita ou recusa em proposta.html.
-- O acesso anônimo é só via duas funções (RPC) que expõem campos seguros; a tabela em si fica protegida por RLS.

-- 1) Nova etapa no funil
alter table public.contatos_site drop constraint contatos_site_status_check;
alter table public.contatos_site add constraint contatos_site_status_check
  check (status in ('novo','em_contato','proposta','concluido','descartado'));

-- 2) Propostas
create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null references public.contatos_site(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 140),
  escopo text not null default '' check (char_length(escopo) <= 8000),
  prazo_texto text not null default '' check (char_length(prazo_texto) <= 120),   -- ex.: "6 semanas"
  valor numeric(12,2) check (valor is null or valor >= 0),
  validade date,                                                                   -- após essa data não aceita resposta
  status text not null default 'rascunho' check (status in ('rascunho','enviada','aceita','recusada')),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviada_em timestamptz,
  respondida_em timestamptz,
  resposta_nome text not null default '' check (char_length(resposta_nome) <= 120),
  resposta_obs text not null default '' check (char_length(resposta_obs) <= 1000)
);
create index propostas_contato on public.propostas (contato_id, criado_em desc);
create trigger t_touch_propostas before update on public.propostas for each row execute function public.touch();
create trigger t_log_propostas after insert or update or delete on public.propostas for each row execute function public.log_atividade();

alter table public.propostas enable row level security;
create policy propostas_sel on public.propostas for select to authenticated using (public.can('contatos', 'ver'));
create policy propostas_ins on public.propostas for insert to authenticated with check (public.can('contatos', 'editar'));
create policy propostas_upd on public.propostas for update to authenticated using (public.can('contatos', 'editar')) with check (public.can('contatos', 'editar'));
create policy propostas_del on public.propostas for delete to authenticated using (public.can('contatos', 'editar'));

-- 3) Acesso público por token (somente propostas já enviadas ou respondidas)
create function public.proposta_publica(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titulo', p.titulo, 'escopo', p.escopo, 'prazo_texto', p.prazo_texto, 'valor', p.valor,
    'validade', p.validade, 'status', p.status, 'respondida_em', p.respondida_em, 'resposta_nome', p.resposta_nome,
    'expirada', (p.validade is not null and p.validade < current_date and p.status = 'enviada'))
  from propostas p
  where p.token = p_token and p.status in ('enviada','aceita','recusada')
$$;

create function public.responder_proposta(p_token text, p_aceita boolean, p_nome text, p_obs text) returns text
language plpgsql security definer set search_path = public as $$
declare r propostas;
begin
  select * into r from propostas where token = p_token and status = 'enviada' for update;
  if not found then return 'indisponivel'; end if;
  if r.validade is not null and r.validade < current_date then return 'expirada'; end if;
  if char_length(trim(coalesce(p_nome, ''))) < 2 or char_length(p_nome) > 120 or char_length(coalesce(p_obs, '')) > 1000 then return 'invalido'; end if;
  update propostas set status = case when p_aceita then 'aceita' else 'recusada' end,
    respondida_em = now(), resposta_nome = trim(p_nome), resposta_obs = trim(coalesce(p_obs, ''))
  where id = r.id;
  return 'ok';
end $$;

revoke execute on function public.proposta_publica(text) from public;
revoke execute on function public.responder_proposta(text, boolean, text, text) from public;
grant execute on function public.proposta_publica(text) to anon, authenticated;
grant execute on function public.responder_proposta(text, boolean, text, text) to anon, authenticated;
