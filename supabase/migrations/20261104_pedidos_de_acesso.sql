-- Pedido de acesso: a pessoa cria a própria conta e a Dra. Bruna autoriza.
--
-- Criar conta não dá acesso a nada. Quem não está em equipe_autorizada
-- não lê nenhuma tabela: as travas (RLS) barram. Por isso a conta pode ser
-- criada por qualquer um; o que protege os dados é a autorização humana.
--
-- A lista de pedidos não tem política de acesso de propósito: só as
-- funções abaixo mexem nela, e elas conferem quem está pedindo.

alter table equipe_autorizada
  add column if not exists posto boolean not null default false,
  add column if not exists aprova_acessos boolean not null default false;

comment on column equipe_autorizada.posto is
  'Login usado por varias pessoas, como a Recepcao. Nao assina mensagens.';
comment on column equipe_autorizada.aprova_acessos is
  'Pode autorizar novos acessos pelo app.';

update equipe_autorizada e
   set posto = true
  from auth.users u
 where u.id = e.user_id
   and u.email in ('recepcao@clinicabrunaoliveira.com.br',
                   'clinicabrunaoliveira@clinicabrunaoliveira.com.br');

update equipe_autorizada e
   set aprova_acessos = true
  from auth.users u
 where u.id = e.user_id
   and u.email = 'drabruna@clinicabrunaoliveira.com.br';

create table if not exists pedidos_acesso (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  -- A pessoa escolheu a própria senha ao criar a conta. Conta feita no
  -- painel do Supabase vem com senha provisória e troca no primeiro acesso.
  senha_propria boolean not null default false,
  criado_em timestamptz not null default now(),
  recusado_em timestamptz
);

comment on table pedidos_acesso is
  'Contas novas esperando autorizacao. Sem politica: so funcoes acessam.';

alter table pedidos_acesso enable row level security;
revoke all on pedidos_acesso from anon, authenticated;

-- Toda conta nova vira pedido, venha do app ou do painel do Supabase.
create or replace function public.registrar_pedido_de_acesso()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text := nullif(trim(new.raw_user_meta_data->>'nome'), '');
begin
  insert into pedidos_acesso (user_id, nome, email, senha_propria)
  values (new.id,
          left(coalesce(v_nome, split_part(new.email, '@', 1)), 60),
          new.email,
          v_nome is not null)
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- Pedido que falha não pode impedir a criação da conta.
  return new;
end;
$$;

revoke all on function public.registrar_pedido_de_acesso() from public, anon, authenticated;

drop trigger if exists trg_pedido_de_acesso on auth.users;
create trigger trg_pedido_de_acesso
  after insert on auth.users
  for each row
  execute function public.registrar_pedido_de_acesso();

create or replace function public.posso_aprovar_acessos()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select aprova_acessos from equipe_autorizada where user_id = auth.uid()), false);
$$;

-- Devolve vazio para quem não aprova: a tela simplesmente não mostra nada.
create or replace function public.pedidos_de_acesso()
returns table (user_id uuid, nome text, email text, criado_em timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.user_id, p.nome, p.email, p.criado_em
    from pedidos_acesso p
   where posso_aprovar_acessos()
     and p.recusado_em is null
   order by p.criado_em;
$$;

create or replace function public.aprovar_acesso(p_user_id uuid, p_nome text, p_papel text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pedido pedidos_acesso;
  v_nome text := left(trim(coalesce(p_nome, '')), 60);
begin
  if not posso_aprovar_acessos() then
    raise exception 'Só a Dra. Bruna pode autorizar novos acessos.';
  end if;
  if v_nome = '' then
    raise exception 'Informe o nome da pessoa.';
  end if;
  if p_papel is null or p_papel not in ('atendimento', 'estoque', 'total') then
    raise exception 'Escolha o tipo de acesso.';
  end if;

  select * into v_pedido
    from pedidos_acesso
   where user_id = p_user_id and recusado_em is null
     for update;
  if not found then
    raise exception 'Este pedido não existe mais.';
  end if;

  insert into equipe_autorizada (user_id, nome, papel, senha_trocada_em)
  values (p_user_id, v_nome, p_papel, case when v_pedido.senha_propria then now() end);

  delete from pedidos_acesso where user_id = p_user_id;
end;
$$;

create or replace function public.recusar_acesso(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not posso_aprovar_acessos() then
    raise exception 'Só a Dra. Bruna pode recusar novos acessos.';
  end if;
  update pedidos_acesso set recusado_em = now() where user_id = p_user_id;
end;
$$;

-- Quem é aprovado entra nas listas de "quem atende" e "quem aplicou" sem
-- ninguém precisar mexer no código.
create or replace function public.nomes_da_equipe()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select nome from equipe_autorizada
   where not posto and pode('atendimento')
   order by nome;
$$;

revoke all on function public.posso_aprovar_acessos() from public, anon;
revoke all on function public.pedidos_de_acesso() from public, anon;
revoke all on function public.aprovar_acesso(uuid, text, text) from public, anon;
revoke all on function public.recusar_acesso(uuid) from public, anon;
revoke all on function public.nomes_da_equipe() from public, anon;
grant execute on function public.posso_aprovar_acessos() to authenticated;
grant execute on function public.pedidos_de_acesso() to authenticated;
grant execute on function public.aprovar_acesso(uuid, text, text) to authenticated;
grant execute on function public.recusar_acesso(uuid) to authenticated;
grant execute on function public.nomes_da_equipe() to authenticated;

-- Conferidas antes de abrir o cadastro: estas funções eram chamáveis por
-- visitante. Nenhuma fazia estrago, porque conferem a permissão por
-- dentro, mas visitante não tem por que chamá-las.
revoke all on function public.aplicar_item(uuid, uuid, integer, text) from public, anon;
grant execute on function public.aplicar_item(uuid, uuid, integer, text) to authenticated;
revoke all on function public.aplicar_itens_do_agendamento(uuid, jsonb, text) from public, anon;
grant execute on function public.aplicar_itens_do_agendamento(uuid, jsonb, text) to authenticated;
revoke all on function public.cancelar_prescricao_com_atendimento() from public, anon, authenticated;
revoke all on function public.impedir_cpf_repetido() from public, anon, authenticated;
