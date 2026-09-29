-- Lançar a lista ajustando o que foi realmente usado.
--
-- Nem sempre sai tudo que foi separado: sobra meia ampola, o paciente não
-- quis o soro. Agora a equipe corrige a quantidade na hora de lançar, em
-- vez de lançar errado e ter que corrigir item por item depois.
--
-- p_itens: [{"id": "<uuid do item>", "quantidade": 2}, ...]
--   quantidade 0  -> não foi usado: fecha o item sem mexer no estoque
--   item ausente  -> fica pendente para lançar depois
--   p_itens null  -> lança tudo pela quantidade planejada

drop function if exists public.aplicar_itens_do_agendamento(uuid);

create or replace function public.aplicar_itens_do_agendamento(
  p_agendamento_id uuid,
  p_itens jsonb default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_paciente  uuid;
  v_pac_nome  text;
  v_item      record;
  v_qtd       integer;
  v_ajuste    numeric;
  v_nome      text;
  v_custo     numeric;
  v_validade  date;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n         integer := 0;
begin
  if not pode('atendimento') then
    raise exception 'Sem permissao para aplicar itens.';
  end if;

  select paciente_id into v_paciente from agendamentos where id = p_agendamento_id;
  if not found then
    raise exception 'Atendimento nao encontrado.';
  end if;
  select nome into v_pac_nome from pacientes where id = v_paciente;

  for v_item in
    select * from agendamento_itens
     where agendamento_id = p_agendamento_id
       and aplicado_em is null
     order by criado_em
     for update
  loop
    if p_itens is null then
      v_ajuste := v_item.quantidade;
    else
      select (e->>'quantidade')::numeric into v_ajuste
        from jsonb_array_elements(p_itens) e
       where (e->>'id')::uuid = v_item.id;
      -- Não veio na lista: deixa pendente para outra hora.
      if v_ajuste is null then continue; end if;
    end if;

    if v_ajuste < 0 then
      raise exception 'Quantidade negativa em "%".', v_item.nome_produto;
    end if;

    -- O estoque conta unidades inteiras: meia ampola não volta para a
    -- prateleira, entao 2,5 tira 3.
    v_qtd := ceil(v_ajuste)::integer;

    if v_qtd > 0 and v_item.produto_id is not null then
      select nome, preco_custo, validade
        into v_nome, v_custo, v_validade
        from produtos where id = v_item.produto_id;

      if not found then
        raise exception 'O produto "%" nao esta mais no estoque.', v_item.nome_produto;
      end if;

      if v_validade is not null and v_validade < v_hoje then
        raise exception '% esta vencido (validade %). Nao da para aplicar.',
          v_nome, to_char(v_validade, 'DD/MM/YYYY');
      end if;

      perform movimentar_estoque(
        v_item.produto_id,
        -v_qtd,
        v_nome || ' (Paciente: ' || coalesce(v_pac_nome, '?') || ')'
      );

      insert into consumos_paciente
        (paciente_id, produto_id, nome_produto, quantidade, custo_unitario, registrado_por)
      values (v_paciente, v_item.produto_id, v_nome, v_qtd, coalesce(v_custo, 0), auth.uid());

    elsif v_qtd > 0 then
      -- Escrito a mao: entra no historico, mas nao ha o que baixar.
      insert into consumos_paciente
        (paciente_id, produto_id, nome_produto, quantidade, custo_unitario, registrado_por)
      values (v_paciente, null, v_item.nome_produto, v_qtd, 0, auth.uid());
    end if;
    -- v_qtd = 0: nao foi usado. Fecha o item e nao lanca nada.

    update agendamento_itens
       set aplicado_em = now(), aplicado_por = auth.uid()
     where id = v_item.id;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.aplicar_itens_do_agendamento(uuid, jsonb) from public, anon;
grant execute on function public.aplicar_itens_do_agendamento(uuid, jsonb) to authenticated;
