-- Cadastro com aprovação: funcionários se cadastram em /app/login e o admin aprova na tela Equipe.
-- Pré-requisito: Authentication > Providers > Email > ATIVAR "Allow new users to sign up".
-- (Recomendado: manter "Confirm email" ligado.)

alter table public.profiles
  add column email text not null default '',
  add column status text not null default 'aprovado' check (status in ('pendente','aprovado','recusado'));

-- Perfis já existentes: aprovados; preenche o e-mail a partir do auth.
update public.profiles p set email = coalesce(u.email, '') from auth.users u where u.id = p.id;

-- Todo novo usuário entra PENDENTE e inativo (inclusive os criados pelo painel do Supabase),
-- exceto o primeiro, que vira administrador. Só o admin ativa, via UPDATE protegido por RLS.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean := new.email_confirmed_at is not null and not exists (select 1 from public.profiles where papel = 'admin');
begin
  insert into public.profiles (id, nome, cargo, email, papel, ativo, status)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), split_part(new.email,'@',1)), 120),
          left(coalesce(trim(new.raw_user_meta_data->>'cargo'), ''), 120),
          coalesce(new.email, ''),
          case when primeiro then 'admin' else 'membro' end,
          primeiro,
          case when primeiro then 'aprovado' else 'pendente' end);
  return new;
end $$;

-- Usuário comum não pode alterar o próprio status (nem e-mail) — só nome/cargo.
drop policy profiles_self on public.profiles;
create policy profiles_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and papel = public.my_papel() and ativo
              and status = 'aprovado'
              and email = (select p.email from public.profiles p where p.id = auth.uid()));
