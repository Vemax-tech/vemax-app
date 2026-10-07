-- Funções internas não precisam ser chamáveis pela API pública
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_atividade() from public, anon, authenticated;
-- Helpers usados pelas políticas RLS: só usuários logados
revoke execute on function public.can(text, text) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active() from public, anon;
revoke execute on function public.my_papel() from public, anon;
grant execute on function public.can(text, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.my_papel() to authenticated;
alter function public.touch() set search_path = public;
