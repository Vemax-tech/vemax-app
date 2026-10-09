-- Diagnóstico guiado: o site envia, junto do lead, um perfil opcional (segmento, porte, prazo, orçamento).
alter table public.contatos_site
  add column perfil jsonb check (perfil is null or (jsonb_typeof(perfil) = 'object' and pg_column_size(perfil) <= 1000));
