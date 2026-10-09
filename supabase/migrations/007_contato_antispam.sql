-- Anti-spam do formulário do site: limita inserções públicas em contatos_site.
-- Qualquer visitante pode inserir (RLS), então o banco impõe teto por contato e global.
create or replace function public.limitar_contatos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from contatos_site where contato = new.contato and criado_em > now() - interval '1 hour') >= 3 then
    raise exception 'Muitas mensagens deste contato. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  if (select count(*) from contatos_site where criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'Limite de mensagens atingido. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function public.limitar_contatos() from public, anon, authenticated;
create trigger t_limitar_contatos before insert on public.contatos_site for each row execute function public.limitar_contatos();
