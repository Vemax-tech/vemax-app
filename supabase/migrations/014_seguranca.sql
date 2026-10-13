-- Segurança: sessão com prazo máximo e revogação efetiva, 2FA para administradores, eventos de segurança,
-- alerta de tentativas de login, limite por IP no formulário público, validações de formato e ajustes de permissão.
-- Pré-requisito: migrations 001 a 013. Só adiciona e endurece; nenhum dado é removido.
--
-- COMO DESLIGAR UM RECURSO SE ALGO DER ERRADO (no SQL Editor, como administrador do projeto):
--   limite de duração da sessão:   update public.config_seguranca set valor = 0 where chave = 'sessao_max_horas';
--   exigência de 2FA para admins:  update public.config_seguranca set valor = 0 where chave = 'exigir_mfa_admin';

-- ============ 1) CONFIGURAÇÃO ============
create table public.config_seguranca (
  chave text primary key,
  valor int not null,
  check ((chave = 'sessao_max_horas' and valor between 0 and 720) or (chave = 'exigir_mfa_admin' and valor in (0, 1)))
);
insert into public.config_seguranca (chave, valor) values ('sessao_max_horas', 12), ('exigir_mfa_admin', 0);
alter table public.config_seguranca enable row level security;
create policy cfgseg_sel on public.config_seguranca for select to authenticated using (public.is_admin());
create policy cfgseg_upd on public.config_seguranca for update to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger t_log_cfgseg after update on public.config_seguranca for each row execute function public.log_mudancas('valor');

-- Sal usado para guardar e-mail e IP apenas como hash (nunca o valor original) no log de segurança.
create table public.seguranca_sal (
  id int primary key default 1 check (id = 1),
  sal text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.seguranca_sal (id) values (1);
alter table public.seguranca_sal enable row level security;       -- sem políticas: só as funções abaixo enxergam

create function public.cfg_seg(p_chave text, p_padrao int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from public.config_seguranca where chave = p_chave), p_padrao)
$$;
revoke execute on function public.cfg_seg(text, int) from public, anon;
grant execute on function public.cfg_seg(text, int) to authenticated;

-- ============ 2) SESSÃO: DURAÇÃO MÁXIMA E REVOGAÇÃO ============
-- O JWT do Supabase vale até expirar mesmo depois do logout. Aqui o banco confere se a SESSÃO ainda existe e é recente:
--   * logout / "encerrar outras sessões" apagam a sessão -> o token deixa de dar acesso aos dados na hora;
--   * passou do limite de horas desde o login -> acesso negado, mesmo com token ainda válido.
create function public.sessao_valida() returns boolean
language plpgsql stable security definer set search_path = public, auth as $$
declare sid uuid; max_h int; criada timestamptz;
begin
  max_h := public.cfg_seg('sessao_max_horas', 0);
  begin sid := (auth.jwt() ->> 'session_id')::uuid; exception when others then sid := null; end;
  if sid is null then return true; end if;                 -- token sem sessão (anônimo/serviço): não se aplica
  select created_at into criada from auth.sessions where id = sid;
  if criada is null then return false; end if;             -- sessão encerrada ou revogada
  return max_h <= 0 or criada > now() - make_interval(hours => max_h);
end $$;
revoke execute on function public.sessao_valida() from public, anon;
grant execute on function public.sessao_valida() to authenticated;

-- 2FA: quem cadastrou um fator verificado só age como administrador em sessão que passou pelo 2FA (aal2).
-- Com 'exigir_mfa_admin' = 1, administrador SEM 2FA também perde os poderes de admin (vira membro) até ativar.
create function public.mfa_ok() returns boolean
language plpgsql stable security definer set search_path = public, auth as $$
declare tem boolean := false;
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then return true; end if;
  begin
    select exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified') into tem;
  exception when others then tem := false;
  end;
  if tem then return false; end if;
  return public.cfg_seg('exigir_mfa_admin', 0) = 0;
end $$;
revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo) and public.sessao_valida()
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and papel = 'admin' and ativo) and public.sessao_valida() and public.mfa_ok()
$$;
create or replace function public.can(p_modulo text, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when pr.papel = 'admin' and public.mfa_ok() then true
      when p_acao = 'ver' then pm.pode_ver
      when p_acao = 'editar' then pm.pode_editar
      else false end
    from profiles pr left join permissoes pm on pm.modulo = p_modulo
    where pr.id = auth.uid() and pr.ativo
  ), false) and public.sessao_valida()
$$;

-- A matriz de permissões só precisa ser lida por quem tem conta ativa (antes: qualquer usuário logado, até pendente).
drop policy permissoes_ver on public.permissoes;
create policy permissoes_ver on public.permissoes for select to authenticated using (public.is_active());

-- ============ 3) EVENTOS DE SEGURANÇA ============
create table public.eventos_seguranca (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  tipo text not null check (tipo in ('login_ok','login_falha','logout','sessao_expirada','inatividade','mfa_ativado','mfa_removido','mfa_falha',
                                     'senha_alterada','sessoes_encerradas','acesso_negado','permissao_alterada','papel_alterado','usuario_desativado',
                                     'cadastro_solicitado','alerta_forca_bruta')),
  usuario_id uuid references auth.users(id) on delete set null,
  email_hash text,                                   -- sha256(e-mail + sal): permite correlacionar tentativas sem guardar o e-mail
  ip_hash text,                                      -- sha256(IP + sal)
  detalhe text not null default '' check (char_length(detalhe) <= 300)
);
create index eventos_seguranca_quando on public.eventos_seguranca (quando desc);
create index eventos_seguranca_email on public.eventos_seguranca (email_hash, quando desc) where email_hash is not null;
create index eventos_seguranca_ip on public.eventos_seguranca (ip_hash, quando desc) where ip_hash is not null;
alter table public.eventos_seguranca enable row level security;
create policy eventos_sel on public.eventos_seguranca for select to authenticated using (public.is_admin());
-- sem políticas de insert/update/delete: só as funções abaixo gravam, e ninguém edita ou apaga o histórico pelo navegador.

create function public.ip_hash() returns text
language plpgsql stable security definer set search_path = public as $$
declare h json; ip text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  if h is null then return null; end if;
  ip := coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''), nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''));
  if ip is null then return null; end if;
  return encode(sha256(convert_to(ip || ':' || (select sal from public.seguranca_sal where id = 1), 'utf8')), 'hex');
end $$;
revoke execute on function public.ip_hash() from public, anon, authenticated;

-- Eventos da própria pessoa logada (login, logout, 2FA, troca de senha, acesso negado…). Limitado a 60 por hora por pessoa.
create function public.registrar_evento(p_tipo text, p_detalhe text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_tipo not in ('login_ok','logout','sessao_expirada','inatividade','mfa_ativado','mfa_removido','mfa_falha','senha_alterada','sessoes_encerradas','acesso_negado') then
    raise exception 'Tipo de evento inválido.';
  end if;
  if (select count(*) from eventos_seguranca where usuario_id = auth.uid() and quando > now() - interval '1 hour') >= 60 then return; end if;
  insert into eventos_seguranca (tipo, usuario_id, ip_hash, detalhe) values (p_tipo, auth.uid(), public.ip_hash(), left(regexp_replace(coalesce(p_detalhe, ''), '[\r\n\t]+', ' ', 'g'), 300));
end $$;
revoke execute on function public.registrar_evento(text, text) from public, anon;
grant execute on function public.registrar_evento(text, text) to authenticated;

-- Falha de login (chamada pela tela de login, sem estar logado). Guarda só hashes, limita o próprio registro por IP e no total
-- e avisa os administradores quando uma conta recebe 5 falhas em 15 minutos. NÃO bloqueia o login: o bloqueio é do Supabase Auth.
create function public.registrar_login_falho(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(btrim(coalesce(p_email, ''))); eh text; ih text; n int;
begin
  if char_length(em) not between 3 and 254 then return; end if;
  ih := public.ip_hash();
  if ih is not null and (select count(*) from eventos_seguranca where tipo = 'login_falha' and ip_hash = ih and quando > now() - interval '10 minutes') >= 30 then return; end if;
  if (select count(*) from eventos_seguranca where tipo = 'login_falha' and quando > now() - interval '1 hour') >= 600 then return; end if;
  eh := encode(sha256(convert_to(em || ':' || (select sal from seguranca_sal where id = 1), 'utf8')), 'hex');
  insert into eventos_seguranca (tipo, email_hash, ip_hash) values ('login_falha', eh, ih);
  select count(*) into n from eventos_seguranca where tipo = 'login_falha' and email_hash = eh and quando > now() - interval '15 minutes';
  if n >= 5 and not exists (select 1 from eventos_seguranca where tipo = 'alerta_forca_bruta' and email_hash = eh and quando > now() - interval '1 hour') then
    insert into eventos_seguranca (tipo, email_hash, ip_hash, detalhe) values ('alerta_forca_bruta', eh, ih, n || ' falhas em 15 minutos');
    perform notificar('equipe', 'seguranca', 'Muitas falhas de login em uma conta (' || n || ' em 15 min). Veja Configurações > Segurança.', 'configuracoes/');
  end if;
  if random() < 0.01 then delete from eventos_seguranca where quando < now() - interval '180 days'; end if;     -- retenção de 180 dias
end $$;
revoke execute on function public.registrar_login_falho(text) from public;
grant execute on function public.registrar_login_falho(text) to anon, authenticated;

-- Só administradores: descobre de qual conta da equipe é um hash de e-mail (não revela e-mails que não são do time).
create function public.conta_do_hash(p_hash text) returns table (nome text, email text)
language sql stable security definer set search_path = public as $$
  select p.nome, p.email from profiles p
  where public.is_admin() and p_hash ~ '^[a-f0-9]{64}$'
    and encode(sha256(convert_to(lower(p.email) || ':' || (select sal from seguranca_sal where id = 1), 'utf8')), 'hex') = p_hash
$$;
revoke execute on function public.conta_do_hash(text) from public, anon;
grant execute on function public.conta_do_hash(text) to authenticated;

-- Mudanças de permissão, papel e ativação ficam também no log de segurança.
create function public.tg_evento_seguranca() returns trigger
language plpgsql security definer set search_path = public as $$
declare src jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  if tg_table_name = 'permissoes' then
    insert into eventos_seguranca (tipo, usuario_id, ip_hash, detalhe)
    values ('permissao_alterada', auth.uid(), public.ip_hash(),
            left((src ->> 'modulo') || ': ' || case when tg_op = 'DELETE' then 'removida' else 'ver=' || (src ->> 'pode_ver') || ', editar=' || (src ->> 'pode_editar') end, 300));
  elsif tg_op = 'INSERT' then
    if new.status = 'pendente' then insert into eventos_seguranca (tipo, usuario_id, detalhe) values ('cadastro_solicitado', new.id, left('Cadastro pendente: ' || new.nome, 300)); end if;
  else
    if old.papel is distinct from new.papel then
      insert into eventos_seguranca (tipo, usuario_id, ip_hash, detalhe) values ('papel_alterado', auth.uid(), public.ip_hash(), left(new.nome || ': ' || old.papel || ' -> ' || new.papel, 300));
    end if;
    if old.ativo and not new.ativo then
      insert into eventos_seguranca (tipo, usuario_id, ip_hash, detalhe) values ('usuario_desativado', auth.uid(), public.ip_hash(), left(new.nome || ' desativado', 300));
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.tg_evento_seguranca() from public, anon, authenticated;
create trigger t_evento_permissoes after insert or update or delete on public.permissoes for each row execute function public.tg_evento_seguranca();
create trigger t_evento_profiles after insert or update on public.profiles for each row execute function public.tg_evento_seguranca();

-- ============ 4) FORMULÁRIO PÚBLICO: LIMITE POR IP E FORMATO DO CONTATO ============
alter table public.contatos_site add column ip_hash text;

create function public.email_ok(p text) returns boolean
language sql immutable set search_path = public as $$
  select p = '' or (char_length(p) <= 254 and p ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')
$$;
create function public.telefone_ok(p text) returns boolean
language sql immutable set search_path = public as $$
  select p = '' or (p ~ '^[0-9+()[:space:].-]{8,40}$' and length(regexp_replace(p, '[^0-9]', '', 'g')) between 8 and 15)
$$;
-- CPF (11) ou CNPJ (14) com dígitos verificadores; vazio é permitido.
create function public.documento_valido(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare d int[]; s int; i int; r int; pesos13 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; pesos14 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if p = '' then return true; end if;
  if p !~ '^[0-9]+$' then return false; end if;
  d := array(select substr(p, g, 1)::int from generate_series(1, length(p)) g order by g);     -- cada dígito vira um elemento
  if length(p) = 11 then
    if p ~ '^(.)\1{10}$' then return false; end if;
    s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
    r := (s * 10) % 11 % 10; if r <> d[10] then return false; end if;
    s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
    r := (s * 10) % 11 % 10; return r = d[11];
  elsif length(p) = 14 then
    if p ~ '^(.)\1{13}$' then return false; end if;
    s := 0; for i in 1..12 loop s := s + d[i] * pesos13[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end; if r <> d[13] then return false; end if;
    s := 0; for i in 1..13 loop s := s + d[i] * pesos14[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end; return r = d[14];
  end if;
  return false;
end $$;

-- "NOT VALID": vale para tudo o que for gravado daqui para a frente, sem reprovar registros antigos.
alter table public.clientes add constraint clientes_email_formato check (public.email_ok(email)) not valid;
alter table public.clientes add constraint clientes_telefone_formato check (public.telefone_ok(telefone)) not valid;
alter table public.clientes add constraint clientes_documento_digitos check (public.documento_valido(documento)) not valid;
alter table public.cliente_contatos add constraint cliente_contatos_email_formato check (public.email_ok(email)) not valid;
alter table public.cliente_contatos add constraint cliente_contatos_telefone_formato check (public.telefone_ok(telefone)) not valid;
alter table public.contatos_site add constraint contatos_site_email_formato check (public.email_ok(email)) not valid;
alter table public.contatos_site add constraint contatos_site_telefone_formato check (public.telefone_ok(telefone)) not valid;

-- Limite do formulário: por contato (já existia), por IP (novo) e global. Também exige e-mail ou telefone válido em NOVOS contatos.
create or replace function public.limitar_contatos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (new.contato <> '' and (public.email_ok(new.contato) or public.telefone_ok(new.contato))) then
    raise exception 'Informe um e-mail ou telefone válido para retorno.' using errcode = 'P0001';
  end if;
  new.ip_hash := public.ip_hash();
  if (select count(*) from contatos_site where contato = new.contato and criado_em > now() - interval '1 hour') >= 3 then
    raise exception 'Muitas mensagens deste contato. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  if new.ip_hash is not null and (select count(*) from contatos_site where ip_hash = new.ip_hash and criado_em > now() - interval '1 hour') >= 5 then
    raise exception 'Muitas mensagens deste acesso. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  if (select count(*) from contatos_site where criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'Limite de mensagens atingido. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ============ 5) AJUSTES ============
revoke execute on function public.touch() from public, anon, authenticated;

-- Anexos de projeto: só tipos de documento esperados (sem HTML, SVG ou executáveis, que poderiam rodar script ao serem abertos).
update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain', 'text/csv', 'application/json', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet'
] where id = 'projetos';

-- O log de auditoria passa a identificar também as configurações pela "chave" (ex.: sessao_max_horas).
create or replace function public.log_mudancas() returns trigger language plpgsql security definer set search_path = public as $$
declare
  j_new jsonb := to_jsonb(new);
  j_old jsonb := to_jsonb(old);
  src jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  k text; partes text[] := '{}'; rot text; v_acao text;
begin
  if current_setting('vemax.sistema', true) = '1' then return coalesce(new, old); end if;
  rot := left(coalesce(src->>'titulo', src->>'assunto', src->>'descricao', src->>'nome', src->>'modulo', src->>'chave', ''), 120);
  if tg_op = 'INSERT' then v_acao := 'criou';
  elsif tg_op = 'DELETE' then v_acao := 'excluiu definitivamente';
  elsif j_old->>'deleted_at' is null and j_new->>'deleted_at' is not null then v_acao := 'enviou para a lixeira';
  elsif j_old->>'deleted_at' is not null and j_new->>'deleted_at' is null then v_acao := 'restaurou';
  else
    v_acao := 'editou';
    foreach k in array coalesce(tg_argv, '{}'::text[]) loop
      if (j_old->>k) is distinct from (j_new->>k) then
        partes := partes || (k || ': ' || coalesce(j_old->>k, '—') || ' → ' || coalesce(j_new->>k, '—'));
      end if;
    end loop;
    if cardinality(partes) = 0 then return new; end if;
  end if;
  insert into atividades (usuario_id, acao, entidade, detalhe)
  values (auth.uid(), v_acao, tg_table_name, left(rot || case when cardinality(partes) > 0 then ' (' || array_to_string(partes, '; ') || ')' else '' end, 500));
  return coalesce(new, old);
end $$;
