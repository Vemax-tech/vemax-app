-- Área interna completa: clientes, funil ampliado, propostas ligadas a clientes, projetos com escopo e entregas,
-- tarefas, suporte, financeiro básico, configurações editáveis, lixeira (exclusão recuperável) e auditoria detalhada.
-- Pré-requisitos: migrations 001 a 011 aplicadas, nesta ordem. Esta migration só ADICIONA: nenhuma tabela existente é apagada
-- e nenhum dado é removido. Mudanças em restrições (CHECK) só ampliam os valores aceitos.

-- ============ 0) HELPERS DE PERMISSÃO POR TABELA ============
-- Qual módulo de permissão protege cada tabela (usado nas políticas RLS e no log de atividades).
create function public.modulo_da_tabela(p_tabela text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_tabela in ('contatos_site', 'propostas') then 'contatos'
    when p_tabela in ('clientes', 'cliente_contatos', 'cliente_links') then 'clientes'
    when p_tabela in ('projetos', 'tarefas', 'projeto_membros', 'projeto_entregas', 'projeto_escopo_alteracoes', 'projeto_anexos', 'projeto_ciclos', 'projeto_updates', 'avaliacoes') then 'projetos'
    when p_tabela = 'chamados' then 'suporte'
    when p_tabela in ('cobrancas', 'despesas') then 'financeiro'
    when p_tabela in ('nichos', 'pesquisas', 'concorrentes', 'fontes', 'criterios', 'notas_nicho', 'anexos', 'modelos_prompt') then 'mercado'
    when p_tabela = 'conhecimento' then 'conhecimento'
    when p_tabela = 'portfolio_cases' then 'portfolio'
    else null end
$$;

-- Tabelas sem módulo (configurações, perfis, permissões) só o administrador enxerga/edita.
create function public.can_tabela(p_tabela text, p_acao text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when public.modulo_da_tabela(p_tabela) is null then public.is_admin()
              else public.can(public.modulo_da_tabela(p_tabela), p_acao) end
$$;
revoke execute on function public.can_tabela(text, text) from public, anon;
grant execute on function public.can_tabela(text, text) to authenticated;

-- ============ 1) NOVOS MÓDULOS DE PERMISSÃO ============
alter table public.permissoes drop constraint permissoes_modulo_check;
alter table public.permissoes add constraint permissoes_modulo_check
  check (modulo in ('mercado','projetos','contatos','conhecimento','portfolio','clientes','suporte','financeiro'));
-- Padrão do papel Membro: vê clientes, atende chamados; financeiro fica restrito até o administrador liberar.
insert into public.permissoes (modulo, pode_ver, pode_editar) values
  ('clientes', true, false), ('suporte', true, true), ('financeiro', false, false)
  on conflict (modulo) do nothing;

alter table public.notificacoes drop constraint notificacoes_modulo_check;
alter table public.notificacoes add constraint notificacoes_modulo_check
  check (modulo in ('contatos','projetos','equipe','suporte','financeiro','clientes'));

-- Preferências de notificação de cada pessoa: {"contatos": false} desliga o aviso daquele módulo no sino.
alter table public.profiles
  add column notif_prefs jsonb not null default '{}'::jsonb
  check (jsonb_typeof(notif_prefs) = 'object' and pg_column_size(notif_prefs) <= 500);

-- ============ 2) CONFIGURAÇÕES EDITÁVEIS (sem alterar código) ============
-- Rótulos, ordem e disponibilidade das etapas dos quadros, prioridades e listas de apoio.
-- As CHAVES das etapas são fixas (o banco valida); o administrador renomeia, reordena e oculta.
create table public.opcoes (
  grupo text not null check (grupo in ('etapa_lead','etapa_projeto','etapa_tarefa','etapa_chamado','prioridade','origem_lead','motivo_perda','categoria_despesa')),
  chave text not null check (chave ~ '^[a-z0-9_]{1,40}$'),
  nome text not null check (char_length(nome) between 1 and 60),
  ordem int not null default 0,
  ativo boolean not null default true,
  primary key (grupo, chave)
);
insert into public.opcoes (grupo, chave, nome, ordem) values
  ('etapa_lead','novo','Novo',1), ('etapa_lead','em_contato','Primeiro contato',2), ('etapa_lead','reuniao','Reunião ou levantamento',3),
  ('etapa_lead','proposta','Proposta enviada',4), ('etapa_lead','negociacao','Negociação',5), ('etapa_lead','concluido','Ganho',6), ('etapa_lead','descartado','Perdido',7),
  ('etapa_projeto','planejado','Planejamento',1), ('etapa_projeto','andamento','Em andamento',2), ('etapa_projeto','aguardando_cliente','Aguardando cliente',3),
  ('etapa_projeto','revisao','Em revisão',4), ('etapa_projeto','pausado','Parado',5), ('etapa_projeto','concluido','Concluído',6), ('etapa_projeto','cancelado','Cancelado',7),
  ('etapa_tarefa','a_fazer','A fazer',1), ('etapa_tarefa','andamento','Em andamento',2), ('etapa_tarefa','bloqueada','Bloqueada',3),
  ('etapa_tarefa','revisao','Em revisão',4), ('etapa_tarefa','concluida','Concluída',5),
  ('etapa_chamado','novo','Novo',1), ('etapa_chamado','atendimento','Em atendimento',2), ('etapa_chamado','aguardando_cliente','Aguardando cliente',3),
  ('etapa_chamado','resolvido','Resolvido',4), ('etapa_chamado','fechado','Fechado',5),
  ('prioridade','baixa','Baixa',1), ('prioridade','media','Média',2), ('prioridade','alta','Alta',3), ('prioridade','urgente','Urgente',4),
  ('origem_lead','site','Site',1), ('origem_lead','indicacao','Indicação',2), ('origem_lead','whatsapp','WhatsApp',3), ('origem_lead','instagram','Instagram',4),
  ('origem_lead','linkedin','LinkedIn',5), ('origem_lead','evento','Evento',6), ('origem_lead','outro','Outro',7),
  ('motivo_perda','preco','Preço',1), ('motivo_perda','prazo','Prazo',2), ('motivo_perda','concorrente','Escolheu outro fornecedor',3),
  ('motivo_perda','sem_retorno','Sem retorno do contato',4), ('motivo_perda','sem_orcamento','Sem orçamento',5), ('motivo_perda','fora_escopo','Fora do que fazemos',6), ('motivo_perda','outro','Outro',7),
  ('categoria_despesa','ferramentas','Ferramentas e licenças',1), ('categoria_despesa','hospedagem','Hospedagem e domínios',2), ('categoria_despesa','terceiros','Terceiros e freelancers',3),
  ('categoria_despesa','deslocamento','Deslocamento',4), ('categoria_despesa','outro','Outros',5);

create table public.categorias_servico (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 60),
  ordem int not null default 0,
  ativo boolean not null default true
);
create unique index categorias_servico_nome on public.categorias_servico (lower(nome));
insert into public.categorias_servico (nome, ordem) values
  ('Site', 1), ('Sistema', 2), ('Automação', 3), ('Dados e BI', 4), ('Inteligência artificial', 5), ('Suporte', 6), ('Infraestrutura e segurança', 7);

-- Modelo de projeto: ao criar um projeto a partir dele, as tarefas e entregas abaixo são criadas com prazos relativos ao início.
create table public.modelos_projeto (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 80),
  categoria_id uuid references public.categorias_servico(id) on delete set null,
  descricao text not null default '' check (char_length(descricao) <= 1000),
  prazo_dias int check (prazo_dias is null or prazo_dias between 1 and 1000),
  esforco_horas numeric(8,1) check (esforco_horas is null or esforco_horas >= 0),
  tarefas jsonb not null default '[]'::jsonb check (jsonb_typeof(tarefas) = 'array' and jsonb_array_length(tarefas) <= 40),   -- [{titulo, prioridade, dias}]
  entregas jsonb not null default '[]'::jsonb check (jsonb_typeof(entregas) = 'array' and jsonb_array_length(entregas) <= 20), -- [{titulo, dias}]
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create trigger t_touch_modelos_projeto before update on public.modelos_projeto for each row execute function public.touch();

insert into public.modelos_projeto (nome, categoria_id, descricao, prazo_dias, esforco_horas, tarefas, entregas)
select m.nome, c.id, m.descricao, m.prazo, m.horas, m.tarefas::jsonb, m.entregas::jsonb
from (values
  ('Site institucional', 'Site', 'Site de apresentação da empresa, com contato e publicação.', 30, 60,
   '[{"titulo":"Briefing e levantamento de conteúdo","prioridade":"alta","dias":3},{"titulo":"Layout e protótipo","prioridade":"alta","dias":8},{"titulo":"Desenvolvimento das páginas","prioridade":"media","dias":20},{"titulo":"Revisão com o cliente","prioridade":"media","dias":24},{"titulo":"Publicação e testes finais","prioridade":"alta","dias":28}]',
   '[{"titulo":"Layout aprovado","dias":8},{"titulo":"Site publicado","dias":30}]'),
  ('Sistema sob medida', 'Sistema', 'Sistema web com cadastro, regras do negócio e acesso por perfil.', 60, 240,
   '[{"titulo":"Levantamento de requisitos","prioridade":"alta","dias":7},{"titulo":"Modelagem e protótipo","prioridade":"alta","dias":14},{"titulo":"Desenvolvimento","prioridade":"media","dias":45},{"titulo":"Testes e homologação","prioridade":"alta","dias":54},{"titulo":"Implantação e treinamento","prioridade":"media","dias":60}]',
   '[{"titulo":"Requisitos aprovados","dias":7},{"titulo":"Primeira versão para homologação","dias":45},{"titulo":"Sistema em produção","dias":60}]'),
  ('Automação de processo', 'Automação', 'Automatiza uma rotina manual entre sistemas ou planilhas.', 30, 80,
   '[{"titulo":"Mapear o processo atual","prioridade":"alta","dias":5},{"titulo":"Desenhar o fluxo automatizado","prioridade":"media","dias":10},{"titulo":"Construir e integrar","prioridade":"media","dias":20},{"titulo":"Testar com dados reais","prioridade":"alta","dias":25},{"titulo":"Documentar e entregar","prioridade":"media","dias":30}]',
   '[{"titulo":"Fluxo desenhado e aprovado","dias":10},{"titulo":"Automação em uso","dias":30}]'),
  ('Painel de dados (BI)', 'Dados e BI', 'Painéis a partir das fontes de dados do cliente.', 35, 90,
   '[{"titulo":"Levantar fontes de dados e perguntas do negócio","prioridade":"alta","dias":5},{"titulo":"Tratar e modelar os dados","prioridade":"media","dias":14},{"titulo":"Construir os painéis","prioridade":"media","dias":25},{"titulo":"Validar os números com o cliente","prioridade":"alta","dias":30},{"titulo":"Publicar e treinar a equipe","prioridade":"media","dias":35}]',
   '[{"titulo":"Modelo de dados validado","dias":14},{"titulo":"Painéis publicados","dias":35}]'),
  ('Solução com IA', 'Inteligência artificial', 'Assistente ou automação que usa IA em um caso de uso definido.', 45, 100,
   '[{"titulo":"Definir o caso de uso e os critérios de qualidade","prioridade":"alta","dias":5},{"titulo":"Preparar dados e instruções","prioridade":"media","dias":14},{"titulo":"Construir e avaliar o protótipo","prioridade":"media","dias":28},{"titulo":"Ajustar com o retorno do cliente","prioridade":"media","dias":35},{"titulo":"Colocar em uso e monitorar custo e qualidade","prioridade":"alta","dias":45}]',
   '[{"titulo":"Protótipo avaliado","dias":28},{"titulo":"Solução em uso","dias":45}]'),
  ('Contrato de suporte', 'Suporte', 'Início de um atendimento recorrente de TI.', 15, 20,
   '[{"titulo":"Levantar ambiente, equipamentos e acessos","prioridade":"alta","dias":3},{"titulo":"Combinar escopo, canais e prazos de atendimento","prioridade":"alta","dias":5},{"titulo":"Configurar os canais de atendimento","prioridade":"media","dias":10},{"titulo":"Documentar rotinas e contatos","prioridade":"baixa","dias":15}]',
   '[{"titulo":"Plano de atendimento acordado","dias":5}]'),
  ('Infraestrutura e segurança', 'Infraestrutura e segurança', 'Organização de rede, servidores, backups e acessos.', 30, 60,
   '[{"titulo":"Inventário do ambiente atual","prioridade":"alta","dias":5},{"titulo":"Plano de mudança e janela de execução","prioridade":"alta","dias":10},{"titulo":"Executar a mudança","prioridade":"media","dias":20},{"titulo":"Revisar segurança, backups e acessos","prioridade":"alta","dias":25},{"titulo":"Validar, monitorar e documentar","prioridade":"media","dias":30}]',
   '[{"titulo":"Plano aprovado","dias":10},{"titulo":"Ambiente entregue e documentado","dias":30}]')
) as m(nome, categoria, descricao, prazo, horas, tarefas, entregas)
join public.categorias_servico c on c.nome = m.categoria;

-- ============ 3) CLIENTES ============
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 160),
  razao_social text not null default '' check (char_length(razao_social) <= 160),
  documento text not null default '' check (documento ~ '^[0-9]{0,14}$'),     -- CPF/CNPJ, só dígitos
  email text not null default '' check (char_length(email) <= 160),
  telefone text not null default '' check (char_length(telefone) <= 40),
  site text not null default '' check (char_length(site) <= 200 and (site = '' or site ~* '^https?://')),
  cidade text not null default '' check (char_length(cidade) <= 120),
  observacoes text not null default '' check (char_length(observacoes) <= 4000),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
-- Impede duplicar a mesma empresa (mesmo nome, ignorando maiúsculas e espaços) ou o mesmo CPF/CNPJ.
create unique index clientes_nome_unico on public.clientes (lower(btrim(nome))) where deleted_at is null;
create unique index clientes_documento_unico on public.clientes (documento) where deleted_at is null and documento <> '';

create table public.cliente_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  cargo text not null default '' check (char_length(cargo) <= 80),
  email text not null default '' check (char_length(email) <= 160),
  telefone text not null default '' check (char_length(telefone) <= 40),
  principal boolean not null default false,
  criado_em timestamptz not null default now()
);
create index cliente_contatos_cliente on public.cliente_contatos (cliente_id);

create table public.cliente_links (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  url text not null check (char_length(url) <= 500 and url ~* '^https?://'),
  criado_em timestamptz not null default now()
);
create index cliente_links_cliente on public.cliente_links (cliente_id);

-- ============ 4) LEADS (contatos_site) ============
alter table public.contatos_site drop constraint contatos_site_status_check;
alter table public.contatos_site add constraint contatos_site_status_check
  check (status in ('novo','em_contato','reuniao','proposta','negociacao','concluido','descartado'));

alter table public.contatos_site
  add column empresa text not null default '' check (char_length(empresa) <= 160),
  add column pessoa_contato text not null default '' check (char_length(pessoa_contato) <= 120),
  add column email text not null default '' check (char_length(email) <= 160),
  add column telefone text not null default '' check (char_length(telefone) <= 40),
  add column categoria_id uuid references public.categorias_servico(id) on delete set null,
  add column origem text not null default 'site' check (char_length(origem) between 1 and 40),
  add column valor_estimado numeric(12,2) check (valor_estimado is null or valor_estimado >= 0),
  add column proximo_contato date,
  add column primeiro_contato_em timestamptz,
  add column etapa_desde timestamptz not null default now(),
  add column motivo_perda text not null default '' check (char_length(motivo_perda) <= 40),
  add column detalhe_perda text not null default '' check (char_length(detalhe_perda) <= 500),
  add column cliente_id uuid references public.clientes(id) on delete set null,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;
create index contatos_site_funil on public.contatos_site (status) where deleted_at is null;

create function public.leads_etapa() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then new.etapa_desde := now(); end if;
  end if;
  if new.primeiro_contato_em is null and new.status in ('em_contato','reuniao','proposta','negociacao','concluido') then
    new.primeiro_contato_em := now();
  end if;
  if new.status <> 'descartado' then new.motivo_perda := ''; new.detalhe_perda := ''; end if;
  return new;
end $$;
revoke execute on function public.leads_etapa() from public, anon, authenticated;
create trigger t_leads_etapa before insert or update on public.contatos_site for each row execute function public.leads_etapa();

-- O formulário público só pode criar um lead "limpo": sem responsável, valor, cliente ou qualquer campo interno preenchido.
drop policy contatos_insert_publico on public.contatos_site;
create policy contatos_insert_publico on public.contatos_site for insert to anon, authenticated
  with check (status = 'novo' and responsavel_id is null and cliente_id is null and categoria_id is null and valor_estimado is null
              and proximo_contato is null and primeiro_contato_em is null and deleted_at is null and motivo_perda = '' and notas = '');
create policy contatos_ins_equipe on public.contatos_site for insert to authenticated with check (public.can('contatos', 'editar'));

-- ============ 5) PROPOSTAS ============
alter table public.propostas alter column contato_id drop not null;
alter table public.propostas drop constraint propostas_status_check;
alter table public.propostas add constraint propostas_status_check check (status in ('rascunho','enviada','aceita','recusada','vencida'));
alter table public.propostas
  add column cliente_id uuid references public.clientes(id) on delete set null,
  add column servicos text not null default '' check (char_length(servicos) <= 4000),
  add column condicoes_pagamento text not null default '' check (char_length(condicoes_pagamento) <= 1000),
  add column responsavel_id uuid references public.profiles(id) on delete set null,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;
alter table public.propostas add constraint propostas_origem_check check (contato_id is not null or cliente_id is not null);
create index propostas_cliente on public.propostas (cliente_id);

-- Página pública: continua mostrando só campos seguros; proposta vencida aparece como expirada.
create or replace function public.proposta_publica(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titulo', p.titulo, 'escopo', p.escopo, 'servicos', p.servicos, 'condicoes_pagamento', p.condicoes_pagamento,
    'prazo_texto', p.prazo_texto, 'valor', p.valor,
    'validade', p.validade, 'status', case when p.status = 'vencida' then 'enviada' else p.status end,
    'respondida_em', p.respondida_em, 'resposta_nome', p.resposta_nome,
    'expirada', (p.status = 'vencida' or (p.validade is not null and p.validade < current_date and p.status = 'enviada')))
  from propostas p
  where p.token = p_token and p.status in ('enviada','aceita','recusada','vencida') and p.deleted_at is null
$$;

create or replace function public.responder_proposta(p_token text, p_aceita boolean, p_nome text, p_obs text) returns text
language plpgsql security definer set search_path = public as $$
declare r propostas;
begin
  select * into r from propostas where token = p_token and status in ('enviada','vencida') and deleted_at is null for update;
  if not found then return 'indisponivel'; end if;
  if r.status = 'vencida' or (r.validade is not null and r.validade < current_date) then return 'expirada'; end if;
  if char_length(trim(coalesce(p_nome, ''))) < 2 or char_length(p_nome) > 120 or char_length(coalesce(p_obs, '')) > 1000 then return 'invalido'; end if;
  update propostas set status = case when p_aceita then 'aceita' else 'recusada' end,
    respondida_em = now(), resposta_nome = trim(p_nome), resposta_obs = trim(coalesce(p_obs, ''))
  where id = r.id;
  return 'ok';
end $$;

-- Marca como "vencida" as propostas enviadas cuja validade passou. Idempotente; qualquer pessoa da equipe pode disparar ao abrir a tela.
create function public.atualizar_vencimentos() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.can('contatos', 'ver') then return 0; end if;
  perform set_config('vemax.sistema', '1', true);
  update propostas set status = 'vencida' where status = 'enviada' and validade is not null and validade < current_date and deleted_at is null;
  get diagnostics n = row_count;
  perform set_config('vemax.sistema', '', true);
  return n;
end $$;
revoke execute on function public.atualizar_vencimentos() from public, anon;
grant execute on function public.atualizar_vencimentos() to authenticated;

-- ============ 6) PROJETOS ============
alter table public.projetos drop constraint projetos_status_check;
alter table public.projetos add constraint projetos_status_check
  check (status in ('planejado','andamento','aguardando_cliente','revisao','pausado','concluido','cancelado'));
alter table public.projeto_wip drop constraint projeto_wip_status_check;
alter table public.projeto_wip add constraint projeto_wip_status_check
  check (status in ('planejado','andamento','aguardando_cliente','revisao','pausado','concluido','cancelado'));

alter table public.projetos
  add column cliente_id uuid references public.clientes(id) on delete set null,
  add column proposta_id uuid references public.propostas(id) on delete set null,
  add column categoria_id uuid references public.categorias_servico(id) on delete set null,
  add column escopo text not null default '' check (char_length(escopo) <= 8000),
  add column prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  add column valor_contratado numeric(12,2) check (valor_contratado is null or valor_contratado >= 0),
  add column esforco_horas numeric(8,1) check (esforco_horas is null or esforco_horas >= 0),
  add column inicio_previsto date,
  add column link_repositorio text not null default '' check (char_length(link_repositorio) <= 300 and (link_repositorio = '' or link_repositorio ~* '^https?://')),
  add column link_ambiente text not null default '' check (char_length(link_ambiente) <= 300 and (link_ambiente = '' or link_ambiente ~* '^https?://')),
  add column link_documentacao text not null default '' check (char_length(link_documentacao) <= 300 and (link_documentacao = '' or link_documentacao ~* '^https?://')),
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;
create index projetos_cliente on public.projetos (cliente_id);
create unique index projetos_proposta_unica on public.projetos (proposta_id) where proposta_id is not null and deleted_at is null;

create table public.projeto_membros (
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  primary key (projeto_id, usuario_id)
);

create table public.projeto_entregas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 160),
  tipo text not null default 'entrega' check (tipo in ('entrega','marco')),
  data_prevista date,
  concluida boolean not null default false,
  concluida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index projeto_entregas_proj on public.projeto_entregas (projeto_id);

-- Pedidos extras fora do combinado: o que foi pedido, quanto muda e o que ficou decidido.
create table public.projeto_escopo_alteracoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  descricao text not null check (char_length(descricao) between 1 and 2000),
  solicitante text not null default '' check (char_length(solicitante) <= 120),
  impacto_dias int check (impacto_dias is null or impacto_dias between -365 and 1000),
  impacto_valor numeric(12,2),
  decisao text not null default 'pendente' check (decisao in ('pendente','aprovada','recusada')),
  decisao_obs text not null default '' check (char_length(decisao_obs) <= 1000),
  aplicada boolean not null default false,          -- true = o impacto já foi somado ao prazo/valor do projeto
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em timestamptz,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index projeto_escopo_proj on public.projeto_escopo_alteracoes (projeto_id, criado_em desc);

-- ============ 7) TAREFAS ============
create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references public.projetos(id) on delete cascade,
  entrega_id uuid references public.projeto_entregas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  titulo text not null check (char_length(titulo) between 1 and 160),
  descricao text not null default '' check (char_length(descricao) <= 4000),
  status text not null default 'a_fazer' check (status in ('a_fazer','andamento','bloqueada','revisao','concluida')),
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  prazo date,
  horas_estimadas numeric(6,1) check (horas_estimadas is null or horas_estimadas >= 0),
  horas_gastas numeric(6,1) not null default 0 check (horas_gastas >= 0),
  motivo_bloqueio text not null default '' check (char_length(motivo_bloqueio) <= 300),
  concluida_em timestamptz,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
create index tarefas_projeto on public.tarefas (projeto_id) where deleted_at is null;
create index tarefas_responsavel on public.tarefas (responsavel_id, status) where deleted_at is null;

create function public.tarefas_datas() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'concluida' then
    if tg_op = 'INSERT' then new.concluida_em := now();
    elsif old.status is distinct from 'concluida' then new.concluida_em := now(); end if;
  else
    new.concluida_em := null;
  end if;
  if new.status <> 'bloqueada' then new.motivo_bloqueio := ''; end if;
  return new;
end $$;
revoke execute on function public.tarefas_datas() from public, anon, authenticated;
create trigger t_tarefas_datas before insert or update on public.tarefas for each row execute function public.tarefas_datas();

-- ============ 8) SUPORTE (chamados) ============
create table public.chamados (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  cliente_id uuid references public.clientes(id) on delete set null,
  projeto_id uuid references public.projetos(id) on delete set null,
  assunto text not null check (char_length(assunto) between 1 and 160),
  descricao text not null default '' check (char_length(descricao) <= 4000),
  canal text not null default 'outro' check (canal in ('formulario','email','telefone','whatsapp','outro')),
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  status text not null default 'novo' check (status in ('novo','atendimento','aguardando_cliente','resolvido','fechado')),
  aberto_em timestamptz not null default now(),
  prazo date,                                         -- prazo combinado com o cliente
  solucao text not null default '' check (char_length(solucao) <= 4000),
  resolvido_em timestamptz,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
create index chamados_status on public.chamados (status) where deleted_at is null;
create index chamados_cliente on public.chamados (cliente_id);

create function public.chamados_datas() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('resolvido','fechado') then
    if tg_op = 'INSERT' then new.resolvido_em := coalesce(new.resolvido_em, now());
    elsif old.status not in ('resolvido','fechado') then new.resolvido_em := now(); end if;
  else
    new.resolvido_em := null;
  end if;
  return new;
end $$;
revoke execute on function public.chamados_datas() from public, anon, authenticated;
create trigger t_chamados_datas before insert or update on public.chamados for each row execute function public.chamados_datas();

create function public.tg_notif_chamado() returns trigger language plpgsql security definer set search_path = public as $$
begin perform notificar('suporte', 'chamado', 'Novo chamado #' || new.numero || ': ' || left(new.assunto, 80), 'suporte/'); return new; end $$;
revoke execute on function public.tg_notif_chamado() from public, anon, authenticated;
create trigger t_notif_chamado after insert on public.chamados for each row execute function public.tg_notif_chamado();

-- ============ 9) FINANCEIRO BÁSICO ============
-- Controle operacional de recebimentos e custos. Não guarda dados de cartão, conta bancária ou credenciais.
create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  projeto_id uuid references public.projetos(id) on delete set null,
  proposta_id uuid references public.propostas(id) on delete set null,
  descricao text not null check (char_length(descricao) between 1 and 200),
  parcela int not null default 1 check (parcela >= 1),
  total_parcelas int not null default 1 check (total_parcelas >= 1),
  valor numeric(12,2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'pendente' check (status in ('prevista','pendente','paga','atrasada','cancelada')),
  pago_em date,
  valor_pago numeric(12,2) check (valor_pago is null or valor_pago >= 0),
  metodo text check (metodo is null or metodo in ('pix','boleto','transferencia','cartao','dinheiro','outro')),
  observacoes text not null default '' check (char_length(observacoes) <= 1000),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  check (parcela <= total_parcelas),
  check (status <> 'paga' or (pago_em is not null and valor_pago is not null))
);
create index cobrancas_venc on public.cobrancas (vencimento) where deleted_at is null;
create index cobrancas_cliente on public.cobrancas (cliente_id);
create index cobrancas_projeto on public.cobrancas (projeto_id);

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references public.projetos(id) on delete set null,
  descricao text not null check (char_length(descricao) between 1 and 200),
  categoria text not null default 'outro' check (char_length(categoria) between 1 and 40),
  fornecedor text not null default '' check (char_length(fornecedor) <= 120),
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  observacoes text not null default '' check (char_length(observacoes) <= 1000),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
create index despesas_data on public.despesas (data) where deleted_at is null;
create index despesas_projeto on public.despesas (projeto_id);

-- ============ 10) LINHA DO TEMPO (notas, decisões, contatos, mensagens ao cliente) ============
-- Notas internas e mensagens enviadas ao cliente ficam separadas por "tipo". Nada daqui aparece em página pública.
create table public.interacoes (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('contatos_site','propostas','clientes','projetos','tarefas','chamados','cobrancas')),
  entidade_id uuid not null,
  cliente_id uuid references public.clientes(id) on delete set null,   -- preenchido automaticamente: alimenta a linha do tempo do cliente
  tipo text not null default 'nota' check (tipo in ('nota','decisao','contato','mensagem','solucao','sistema')),
  texto text not null check (char_length(texto) between 1 and 4000),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index interacoes_entidade on public.interacoes (entidade, entidade_id, criado_em desc);
create index interacoes_cliente on public.interacoes (cliente_id, criado_em desc);

create function public.interacao_preenche() returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  if new.entidade = 'clientes' then
    new.cliente_id := new.entidade_id;
  else
    execute format('select to_jsonb(x) from public.%I x where x.id = $1', new.entidade) into j using new.entidade_id;
    if j is null then raise exception 'Registro não encontrado para a linha do tempo.'; end if;
    new.cliente_id := nullif(j->>'cliente_id', '')::uuid;
  end if;
  return new;
end $$;
revoke execute on function public.interacao_preenche() from public, anon, authenticated;
create trigger t_interacao_preenche before insert on public.interacoes for each row execute function public.interacao_preenche();

-- Registrar um contato ou mensagem num lead conta como "primeiro contato".
create function public.interacao_efeitos() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.entidade = 'contatos_site' and new.tipo in ('contato','mensagem') then
    update contatos_site set primeiro_contato_em = coalesce(primeiro_contato_em, now()) where id = new.entidade_id;
  end if;
  return new;
end $$;
revoke execute on function public.interacao_efeitos() from public, anon, authenticated;
create trigger t_interacao_efeitos after insert on public.interacoes for each row execute function public.interacao_efeitos();

-- Se o cliente de um registro mudar (ex.: lead convertido), a linha do tempo acompanha.
create function public.propaga_cliente() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is distinct from old.cliente_id then
    update interacoes set cliente_id = new.cliente_id where entidade = tg_table_name and entidade_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.propaga_cliente() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['contatos_site','propostas','projetos','tarefas','chamados','cobrancas'] loop
    execute format('create trigger t_propaga_cliente after update of cliente_id on public.%I for each row execute function public.propaga_cliente()', t);
  end loop;
end $$;

-- ============ 11) EXCLUSÃO RECUPERÁVEL + DATAS ============
-- Quem exclui e quando é preenchido pelo servidor (não dá para falsificar pelo navegador).
create function public.marcar_exclusao() returns trigger language plpgsql set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); new.deleted_by := auth.uid();
  elsif new.deleted_at is null then new.deleted_by := null;
  else new.deleted_by := old.deleted_by; new.deleted_at := old.deleted_at;
  end if;
  return new;
end $$;
revoke execute on function public.marcar_exclusao() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['contatos_site','propostas','clientes','projetos','tarefas','chamados','cobrancas','despesas'] loop
    execute format('create trigger t_exclusao before update on public.%I for each row execute function public.marcar_exclusao()', t);
  end loop;
  foreach t in array array['clientes','tarefas','chamados','cobrancas','despesas'] loop
    execute format('create trigger t_touch_%s before update on public.%I for each row execute function public.touch()', t, t);
  end loop;
end $$;

-- ============ 12) AUDITORIA DETALHADA ============
-- Registra criação, envio para a lixeira, restauração e a mudança (de → para) dos campos importantes de cada tabela.
create function public.log_mudancas() returns trigger language plpgsql security definer set search_path = public as $$
declare
  j_new jsonb := to_jsonb(new);
  j_old jsonb := to_jsonb(old);
  src jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  k text; partes text[] := '{}'; rot text; v_acao text;
begin
  if current_setting('vemax.sistema', true) = '1' then return coalesce(new, old); end if;
  rot := left(coalesce(src->>'titulo', src->>'assunto', src->>'descricao', src->>'nome', src->>'modulo', ''), 120);
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
    if cardinality(partes) = 0 then return new; end if;     -- edição sem campo relevante: não polui o log
  end if;
  insert into atividades (usuario_id, acao, entidade, detalhe)
  values (auth.uid(), v_acao, tg_table_name, left(rot || case when cardinality(partes) > 0 then ' (' || array_to_string(partes, '; ') || ')' else '' end, 500));
  return coalesce(new, old);
end $$;
revoke execute on function public.log_mudancas() from public, anon, authenticated;

drop trigger if exists t_log_projetos on public.projetos;
drop trigger if exists t_log_contatos on public.contatos_site;
drop trigger if exists t_log_propostas on public.propostas;
create trigger t_log_projetos after insert or update or delete on public.projetos for each row execute function public.log_mudancas('status','valor_contratado','prazo','prioridade','esforco_horas');
create trigger t_log_contatos after insert or update or delete on public.contatos_site for each row execute function public.log_mudancas('status','valor_estimado','motivo_perda');
create trigger t_log_propostas after insert or update or delete on public.propostas for each row execute function public.log_mudancas('status','valor','validade');
create trigger t_log_clientes after insert or update or delete on public.clientes for each row execute function public.log_mudancas('nome','documento');
create trigger t_log_tarefas after insert or update or delete on public.tarefas for each row execute function public.log_mudancas('status','prazo','prioridade');
create trigger t_log_chamados after insert or update or delete on public.chamados for each row execute function public.log_mudancas('status','prioridade','prazo');
create trigger t_log_cobrancas after insert or update or delete on public.cobrancas for each row execute function public.log_mudancas('status','valor','vencimento','pago_em','valor_pago');
create trigger t_log_despesas after insert or update or delete on public.despesas for each row execute function public.log_mudancas('valor','data');
create trigger t_log_escopo after insert or update or delete on public.projeto_escopo_alteracoes for each row execute function public.log_mudancas('decisao','impacto_valor','impacto_dias');
create trigger t_log_permissoes after insert or update or delete on public.permissoes for each row execute function public.log_mudancas('pode_ver','pode_editar');
create trigger t_log_profiles after update or delete on public.profiles for each row execute function public.log_mudancas('papel','ativo','status');
create trigger t_log_opcoes after insert or update or delete on public.opcoes for each row execute function public.log_mudancas('nome','ativo');
create trigger t_log_categorias after insert or update or delete on public.categorias_servico for each row execute function public.log_mudancas('nome','ativo');
create trigger t_log_modelos after insert or update or delete on public.modelos_projeto for each row execute function public.log_mudancas('nome','ativo');

-- Quem pode ler o log: administrador, o próprio autor e quem tem acesso ao módulo do registro alterado.
drop policy atividades_ver on public.atividades;
create policy atividades_ver on public.atividades for select to authenticated
  using (public.is_admin() or usuario_id = auth.uid()
         or (public.modulo_da_tabela(entidade) is not null and public.can(public.modulo_da_tabela(entidade), 'ver')));

-- ============ 13) RLS DAS TABELAS NOVAS ============
alter table public.opcoes enable row level security;
alter table public.categorias_servico enable row level security;
alter table public.modelos_projeto enable row level security;
alter table public.interacoes enable row level security;

do $$
declare t text;
begin
  -- Configurações: toda a equipe lê (precisa dos rótulos); só o administrador altera.
  foreach t in array array['opcoes','categorias_servico','modelos_projeto'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active())', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t||'_del', t);
  end loop;

  -- Tabelas de módulo: ver/editar conforme a permissão do módulo.
  foreach t in array array['clientes','cliente_contatos','cliente_links','tarefas','chamados','cobrancas','despesas','projeto_membros','projeto_entregas','projeto_escopo_alteracoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_tabela(%L, ''ver''))', t||'_sel', t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_tabela(%L, ''editar''))', t||'_ins', t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_tabela(%L, ''editar'')) with check (public.can_tabela(%L, ''editar''))', t||'_upd', t, t, t);
  end loop;
  -- Detalhes (contatos, links, membros, entregas): quem edita também remove.
  foreach t in array array['cliente_contatos','cliente_links','projeto_membros','projeto_entregas'] loop
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_tabela(%L, ''editar''))', t||'_del', t, t);
  end loop;
  -- Registros de negócio: a equipe só envia para a lixeira (UPDATE de deleted_at); exclusão definitiva é do administrador.
  foreach t in array array['clientes','tarefas','chamados','cobrancas','despesas','projeto_escopo_alteracoes'] loop
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t||'_del', t);
  end loop;
end $$;

drop policy propostas_del on public.propostas;
create policy propostas_del on public.propostas for delete to authenticated using (public.is_admin());
drop policy projetos_del on public.projetos;
create policy projetos_del on public.projetos for delete to authenticated using (public.is_admin());

-- Linha do tempo: lê/escreve quem tem acesso ao módulo da entidade; não há edição; só o administrador remove.
create policy interacoes_sel on public.interacoes for select to authenticated using (public.can_tabela(entidade, 'ver'));
create policy interacoes_ins on public.interacoes for insert to authenticated with check (public.can_tabela(entidade, 'editar') and criado_por = auth.uid());
create policy interacoes_del on public.interacoes for delete to authenticated using (public.is_admin());

-- ============ 14) FUNÇÕES DE FLUXO (criação atômica) ============
-- Cria tarefas e entregas de um projeto a partir de um modelo. Prazos contam a partir do início previsto (ou de hoje).
create function public.aplicar_modelo_projeto(p_projeto uuid, p_modelo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pr projetos; m modelos_projeto; t jsonb; base date;
begin
  if not public.can('projetos', 'editar') then raise exception 'Sem permissão para editar projetos.' using errcode = '42501'; end if;
  select * into pr from projetos where id = p_projeto and deleted_at is null;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  select * into m from modelos_projeto where id = p_modelo and ativo;
  if not found then raise exception 'Modelo não encontrado ou desativado.'; end if;
  base := coalesce(pr.inicio_previsto, current_date);
  for t in select value from jsonb_array_elements(m.tarefas) loop
    insert into tarefas (projeto_id, cliente_id, titulo, prioridade, prazo)
    values (pr.id, pr.cliente_id, left(coalesce(t->>'titulo', 'Tarefa'), 160),
            case when t->>'prioridade' in ('baixa','media','alta','urgente') then t->>'prioridade' else 'media' end,
            base + coalesce((t->>'dias')::int, 0));
  end loop;
  for t in select value from jsonb_array_elements(m.entregas) loop
    insert into projeto_entregas (projeto_id, titulo, data_prevista)
    values (pr.id, left(coalesce(t->>'titulo', 'Entrega'), 160), base + coalesce((t->>'dias')::int, 0));
  end loop;
end $$;
revoke execute on function public.aplicar_modelo_projeto(uuid, uuid) from public, anon;
grant execute on function public.aplicar_modelo_projeto(uuid, uuid) to authenticated;

-- Proposta aprovada -> projeto: reaproveita cliente, escopo, valor e responsável; marca o lead como ganho. Tudo ou nada.
create function public.projeto_de_proposta(p_proposta uuid, p_prazo date default null, p_modelo uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare pr propostas; cli clientes; m modelos_projeto; v_cliente uuid; v_id uuid;
begin
  if not (public.can('projetos', 'editar') and public.can('contatos', 'editar')) then
    raise exception 'Sem permissão para criar projetos a partir de propostas.' using errcode = '42501';
  end if;
  select * into pr from propostas where id = p_proposta and deleted_at is null for update;
  if not found then raise exception 'Proposta não encontrada.'; end if;
  if pr.status <> 'aceita' then raise exception 'Só propostas aprovadas podem virar projeto.'; end if;
  if exists (select 1 from projetos where proposta_id = pr.id and deleted_at is null) then raise exception 'Esta proposta já gerou um projeto.'; end if;
  v_cliente := pr.cliente_id;
  if v_cliente is null and pr.contato_id is not null then select cliente_id into v_cliente from contatos_site where id = pr.contato_id; end if;
  if v_cliente is null then raise exception 'Vincule o lead a um cliente antes de criar o projeto.'; end if;
  select * into cli from clientes where id = v_cliente and deleted_at is null;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  select * into m from modelos_projeto where id = p_modelo and ativo;

  insert into projetos (titulo, cliente, cliente_id, proposta_id, contato_id, escopo, valor_contratado, responsavel_id, inicio_previsto, prazo, categoria_id, esforco_horas)
  values (left(pr.titulo, 140), left(cli.nome, 160), v_cliente, pr.id, pr.contato_id,
          left(concat_ws(E'\n\n', nullif(pr.servicos, ''), nullif(pr.escopo, '')), 8000),
          pr.valor, pr.responsavel_id, current_date, p_prazo, m.categoria_id, m.esforco_horas)
  returning id into v_id;

  update propostas set cliente_id = v_cliente where id = pr.id and cliente_id is null;
  if pr.contato_id is not null then
    update contatos_site set status = 'concluido', cliente_id = coalesce(cliente_id, v_cliente) where id = pr.contato_id and deleted_at is null;
  end if;
  if m.id is not null then perform public.aplicar_modelo_projeto(v_id, m.id); end if;
  insert into interacoes (entidade, entidade_id, tipo, texto) values
    ('propostas', pr.id, 'sistema', 'Projeto criado a partir desta proposta aprovada.'),
    ('projetos', v_id, 'sistema', 'Projeto criado a partir da proposta “' || left(pr.titulo, 100) || '”.');
  return v_id;
end $$;
revoke execute on function public.projeto_de_proposta(uuid, date, uuid) from public, anon;
grant execute on function public.projeto_de_proposta(uuid, date, uuid) to authenticated;
