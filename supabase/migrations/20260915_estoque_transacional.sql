-- Estoque consistente: operações atômicas no banco e proteção do prontuário.
--
-- 1. Excluir/arquivar produto não apaga mais o histórico do paciente
--    (consumos_paciente.produto_id passa a ficar NULL em vez de sumir a linha).
-- 2. Toda mexida em estoque passa por movimentar_estoque(): uma única
--    instrução UPDATE ... SET quantidade = quantidade + delta, que nunca
--    deixa ficar negativo e sempre registra no histórico.
-- 3. Aplicar, corrigir e estornar item na ficha do paciente viram funções
--    transacionais: ou tudo acontece, ou nada acontece.

-- ---------------------------------------------------------------- 1
alter table public.consumos_paciente
  drop constraint if exists consumos_paciente_produto_id_fkey;

alter table public.consumos_paciente
  add constraint consumos_paciente_produto_id_fkey
  foreign key (produto_id) references public.produtos(id) on delete set null;

-- ---------------------------------------------------------------- 2
create or replace function public.movimentar_estoque(
  p_produto_id uuid,
  p_delta integer,
  p_descricao text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nome text;
  v_qtd  integer;
begin
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

-- ---------------------------------------------------------------- 3
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
  v_id   uuid;
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  select nome into v_prod from produtos where id = p_produto_id;
  if not found then raise exception 'Produto não encontrado no estoque.'; end if;

  select nome into v_pac from pacientes where id = p_paciente_id;
  if not found then raise exception 'Paciente não encontrado.'; end if;

  perform movimentar_estoque(p_produto_id, -p_qtd, v_prod || ' (Paciente: ' || v_pac || ')');

  insert into consumos_paciente (paciente_id, produto_id, nome_produto, quantidade, registrado_por)
  values (p_paciente_id, p_produto_id, v_prod, p_qtd, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.estornar_consumo(p_consumo_id uuid)
returns boolean  -- true se devolveu ao estoque, false se o produto já não existe
language plpgsql
security invoker
set search_path = public
as $$
declare
  c    consumos_paciente%rowtype;
  v_prod text;
  v_pac  text;
begin
  select * into c from consumos_paciente where id = p_consumo_id;
  if not found then raise exception 'Item não encontrado na ficha.'; end if;

  select nome into v_pac from pacientes where id = c.paciente_id;

  if c.produto_id is not null then
    select nome into v_prod from produtos where id = c.produto_id;
  end if;

  if v_prod is not null then
    perform movimentar_estoque(c.produto_id, c.quantidade, v_prod || ' (Estorno: ' || coalesce(v_pac, '') || ')');
  end if;

  delete from consumos_paciente where id = p_consumo_id;
  return v_prod is not null;
end;
$$;

create or replace function public.corrigir_consumo(
  p_consumo_id uuid,
  p_produto_id uuid,
  p_qtd integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  c        consumos_paciente%rowtype;
  v_novo   text;
  v_antigo text;
  v_pac    text;
  v_delta  integer;
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  select * into c from consumos_paciente where id = p_consumo_id;
  if not found then raise exception 'Item não encontrado na ficha.'; end if;

  select nome into v_novo from produtos where id = p_produto_id;
  if not found then raise exception 'Produto não encontrado no estoque.'; end if;

  select nome into v_pac from pacientes where id = c.paciente_id;

  if c.produto_id = p_produto_id then
    -- Mesmo produto: só ajusta a diferença.
    v_delta := p_qtd - c.quantidade;
    if v_delta <> 0 then
      perform movimentar_estoque(p_produto_id, -v_delta, v_novo || ' (Correção: ' || coalesce(v_pac, '') || ')');
    end if;
  else
    -- Trocou de produto: devolve tudo ao antigo (se ainda existir) e tira do novo.
    if c.produto_id is not null then
      select nome into v_antigo from produtos where id = c.produto_id;
      if v_antigo is not null then
        perform movimentar_estoque(c.produto_id, c.quantidade, v_antigo || ' (Estorno: ' || coalesce(v_pac, '') || ')');
      end if;
    end if;
    perform movimentar_estoque(p_produto_id, -p_qtd, v_novo || ' (Correção: ' || coalesce(v_pac, '') || ')');
  end if;

  update consumos_paciente
     set produto_id = p_produto_id, nome_produto = v_novo, quantidade = p_qtd
   where id = p_consumo_id;
end;
$$;

-- Só quem está logado pode chamar (o RLS das tabelas ainda exige eh_equipe()).
revoke all on function public.movimentar_estoque(uuid, integer, text) from public, anon;
revoke all on function public.aplicar_item(uuid, uuid, integer) from public, anon;
revoke all on function public.estornar_consumo(uuid) from public, anon;
revoke all on function public.corrigir_consumo(uuid, uuid, integer) from public, anon;
grant execute on function public.movimentar_estoque(uuid, integer, text) to authenticated;
grant execute on function public.aplicar_item(uuid, uuid, integer) to authenticated;
grant execute on function public.estornar_consumo(uuid) to authenticated;
grant execute on function public.corrigir_consumo(uuid, uuid, integer) to authenticated;
