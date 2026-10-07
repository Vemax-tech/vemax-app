-- Conta só entra ativa (e só pode virar admin) se o e-mail já estiver confirmado,
-- como acontece nas contas criadas pelo administrador. Cadastros públicos não confirmados ficam inativos.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare confirmado boolean := new.email_confirmed_at is not null;
begin
  insert into public.profiles (id, nome, papel, ativo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          case when confirmado and not exists (select 1 from public.profiles where papel = 'admin') then 'admin' else 'membro' end,
          confirmado);
  return new;
end $$;
