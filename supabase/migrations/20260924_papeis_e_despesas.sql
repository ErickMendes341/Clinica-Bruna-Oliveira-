-- Cada pessoa da equipe passa a ter o seu login e o seu papel, e o
-- financeiro ganha o lado das saídas.
--
-- Papéis:
--   atendimento — Thalita, Ludimila: agenda, pacientes e aplicar item do
--                 estoque na ficha (não administram o estoque nem veem o
--                 financeiro).
--   estoque     — Nicole: o de atendimento, mais a aba Estoque.
--   total       — Bruna, Jaqueline: tudo, inclusive financeiro, backup e
--                 exclusões.

-- ------------------------------------------------------------ papéis
alter table public.equipe_autorizada
  add column if not exists papel text not null default 'total';

alter table public.equipe_autorizada drop constraint if exists equipe_papel_valido;
alter table public.equipe_autorizada add constraint equipe_papel_valido
  check (papel in ('atendimento', 'estoque', 'total'));

create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select papel from equipe_autorizada where user_id = auth.uid();
$$;

create or replace function public.pode(p_minimo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- 'atendimento' < 'estoque' < 'total'
  select case meu_papel()
           when 'total' then true
           when 'estoque' then p_minimo in ('atendimento', 'estoque')
           when 'atendimento' then p_minimo = 'atendimento'
           else false
         end;
$$;

revoke all on function public.meu_papel() from public, anon;
revoke all on function public.pode(text) from public, anon;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.pode(text) to authenticated;

-- ------------------------------------------------- acesso por papel
-- Produtos: todo mundo lê (para escolher o que aplicar); cadastrar,
-- editar e arquivar é de quem cuida do estoque.
drop policy if exists "equipe acessa produtos" on public.produtos;
create policy "equipe le produtos" on public.produtos
  for select to authenticated using ((select pode('atendimento')));
create policy "estoque administra produtos" on public.produtos
  for insert to authenticated with check ((select pode('estoque')));
create policy "estoque edita produtos" on public.produtos
  for update to authenticated using ((select pode('estoque'))) with check ((select pode('estoque')));
create policy "estoque exclui produtos" on public.produtos
  for delete to authenticated using ((select pode('estoque')));

-- Histórico de movimentação: todos leem e registram (aplicar item gera
-- linha aqui); apagar é do estoque.
drop policy if exists "equipe acessa historico" on public.historico_movimentacoes;
create policy "equipe usa historico" on public.historico_movimentacoes
  for select to authenticated using ((select pode('atendimento')));
create policy "equipe registra historico" on public.historico_movimentacoes
  for insert to authenticated with check ((select pode('atendimento')));
create policy "estoque ajusta historico" on public.historico_movimentacoes
  for update to authenticated using ((select pode('estoque'))) with check ((select pode('estoque')));
create policy "estoque apaga historico" on public.historico_movimentacoes
  for delete to authenticated using ((select pode('estoque')));

-- Financeiro é só de quem tem acesso total.
drop policy if exists "equipe acessa pagamentos" on public.pagamentos;
create policy "financeiro acessa pagamentos" on public.pagamentos
  for all to authenticated using ((select pode('total'))) with check ((select pode('total')));

drop policy if exists "equipe acessa exportacoes" on public.exportacoes;
create policy "financeiro acessa exportacoes" on public.exportacoes
  for all to authenticated using ((select pode('total'))) with check ((select pode('total')));

-- Excluir paciente ou agendamento de vez fica com quem tem acesso total;
-- o resto da equipe cria e edita normalmente.
drop policy if exists "equipe acessa pacientes" on public.pacientes;
create policy "equipe usa pacientes" on public.pacientes
  for select to authenticated using ((select pode('atendimento')));
create policy "equipe cria pacientes" on public.pacientes
  for insert to authenticated with check ((select pode('atendimento')));
create policy "equipe edita pacientes" on public.pacientes
  for update to authenticated using ((select pode('atendimento'))) with check ((select pode('atendimento')));
create policy "total exclui pacientes" on public.pacientes
  for delete to authenticated using ((select pode('total')));

drop policy if exists "equipe acessa agendamentos" on public.agendamentos;
create policy "equipe usa agendamentos" on public.agendamentos
  for select to authenticated using ((select pode('atendimento')));
create policy "equipe cria agendamentos" on public.agendamentos
  for insert to authenticated with check ((select pode('atendimento')));
create policy "equipe edita agendamentos" on public.agendamentos
  for update to authenticated using ((select pode('atendimento'))) with check ((select pode('atendimento')));
create policy "equipe exclui agendamentos" on public.agendamentos
  for delete to authenticated using ((select pode('atendimento')));

-- Cada pessoa vê quem é e qual o seu papel (o app usa para montar o menu).
drop policy if exists "equipe le a si mesma" on public.equipe_autorizada;
create policy "equipe le a si mesma" on public.equipe_autorizada
  for select to authenticated using (user_id = auth.uid() or (select pode('total')));

-- ------------------------------------------- custo do item aplicado
-- O preço muda com o tempo; o custo é congelado no momento do uso.
alter table public.consumos_paciente
  add column if not exists custo_unitario numeric(10,2);

update consumos_paciente c
   set custo_unitario = p.preco_custo
  from produtos p
 where c.produto_id = p.id and c.custo_unitario is null;

create or replace function public.aplicar_item(
  p_paciente_id uuid,
  p_produto_id uuid,
  p_qtd integer
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_prod text;
  v_pac  text;
  v_custo numeric;
  v_id   uuid;
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  select nome, preco_custo into v_prod, v_custo from produtos where id = p_produto_id;
  if not found then raise exception 'Produto não encontrado no estoque.'; end if;

  select nome into v_pac from pacientes where id = p_paciente_id;
  if not found then raise exception 'Paciente não encontrado.'; end if;

  perform movimentar_estoque(p_produto_id, -p_qtd, v_prod || ' (Paciente: ' || v_pac || ')');

  insert into consumos_paciente (paciente_id, produto_id, nome_produto, quantidade, custo_unitario, registrado_por)
  values (p_paciente_id, p_produto_id, v_prod, p_qtd, coalesce(v_custo, 0), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.aplicar_item(uuid, uuid, integer) from public, anon;
grant execute on function public.aplicar_item(uuid, uuid, integer) to authenticated;

-- movimentar_estoque precisa atualizar produtos mesmo para quem não
-- administra o estoque (aplicar item na ficha), por isso SECURITY
-- DEFINER com a checagem de papel feita aqui dentro.
create or replace function public.movimentar_estoque(
  p_produto_id uuid,
  p_delta integer,
  p_descricao text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_qtd  integer;
begin
  if not pode('atendimento') then
    raise exception 'Sem permissão para mexer no estoque.';
  end if;
  -- Entrada de estoque (compra, estorno grande) é de quem administra.
  if p_delta > 0 and not pode('estoque') then
    raise exception 'Só quem cuida do estoque pode dar entrada.';
  end if;

  if p_delta = 0 then
    select quantidade into v_qtd from produtos where id = p_produto_id;
    return v_qtd;
  end if;

  update produtos
     set quantidade = quantidade + p_delta
   where id = p_produto_id
     and quantidade + p_delta >= 0
  returning nome, quantidade into v_nome, v_qtd;

  if not found then
    if not exists (select 1 from produtos where id = p_produto_id) then
      raise exception 'Produto não encontrado no estoque.';
    end if;
    select quantidade into v_qtd from produtos where id = p_produto_id;
    raise exception 'Estoque insuficiente. Disponível: % un.', v_qtd;
  end if;

  insert into historico_movimentacoes (produto_id, nome_produto, tipo, quantidade, registrado_por)
  values (
    p_produto_id,
    coalesce(p_descricao, v_nome),
    case when p_delta > 0 then 'ENTRADA' else 'SAIDA' end,
    abs(p_delta),
    auth.uid()
  );

  return v_qtd;
end;
$$;

revoke all on function public.movimentar_estoque(uuid, integer, text) from public, anon;
grant execute on function public.movimentar_estoque(uuid, integer, text) to authenticated;

-- ------------------------------------------------------ despesas
create table if not exists public.despesas (
  id         uuid primary key default gen_random_uuid(),
  data       date not null default current_date,
  descricao  text not null,
  valor      numeric(10,2) not null check (valor > 0),
  categoria  text not null default 'outros'
             check (categoria in ('produtos','aluguel','salarios','energia_agua','marketing','impostos','manutencao','outros')),
  observacao text,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists despesas_data_idx on public.despesas (data desc);
create index if not exists despesas_criado_por_idx on public.despesas (criado_por);

alter table public.despesas enable row level security;

drop policy if exists "financeiro acessa despesas" on public.despesas;
create policy "financeiro acessa despesas" on public.despesas
  for all to authenticated using ((select pode('total'))) with check ((select pode('total')));
