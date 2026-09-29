-- "Usei tudo que estava separado": dá baixa na lista inteira de uma vez.
--
-- Evita a equipe redigitar item por item na ficha depois do atendimento.
-- Tudo numa transação só: se faltar estoque de um item, nada sai — não
-- existe meio atendimento lançado.

alter table agendamento_itens
  add column if not exists aplicado_em timestamptz,
  add column if not exists aplicado_por uuid;

comment on column agendamento_itens.aplicado_em is
  'Quando este item virou baixa de estoque. Nulo = ainda não foi usado.';

create index if not exists idx_agendamento_itens_pendentes
  on agendamento_itens (agendamento_id) where aplicado_em is null;

create or replace function public.aplicar_itens_do_agendamento(p_agendamento_id uuid)
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
  v_nome      text;
  v_custo     numeric;
  v_validade  date;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n         integer := 0;
begin
  if not pode('atendimento') then
    raise exception 'Sem permissão para aplicar itens.';
  end if;

  select paciente_id into v_paciente from agendamentos where id = p_agendamento_id;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  select nome into v_pac_nome from pacientes where id = v_paciente;

  for v_item in
    select * from agendamento_itens
     where agendamento_id = p_agendamento_id
       and aplicado_em is null
     order by criado_em
     for update
  loop
    -- O estoque conta unidades inteiras: meia ampola não volta para a
    -- prateleira, então 2,5 planejado tira 3.
    v_qtd := ceil(v_item.quantidade)::integer;

    if v_item.produto_id is not null then
      select nome, preco_custo, validade
        into v_nome, v_custo, v_validade
        from produtos where id = v_item.produto_id;

      if not found then
        raise exception 'O produto "%" não está mais no estoque.', v_item.nome_produto;
      end if;

      if v_validade is not null and v_validade < v_hoje then
        raise exception '% está vencido (validade %). Não dá para aplicar.',
          v_nome, to_char(v_validade, 'DD/MM/YYYY');
      end if;

      -- Esta chamada é quem confere permissão e saldo, e grava o histórico
      -- de movimentação. Se estourar, a transação inteira volta atrás.
      perform movimentar_estoque(
        v_item.produto_id,
        -v_qtd,
        v_nome || ' (Paciente: ' || coalesce(v_pac_nome, '?') || ')'
      );

      insert into consumos_paciente
        (paciente_id, produto_id, nome_produto, quantidade, custo_unitario, registrado_por)
      values (v_paciente, v_item.produto_id, v_nome, v_qtd, coalesce(v_custo, 0), auth.uid());
    else
      -- Item escrito à mão: entra no histórico do paciente, mas não há o
      -- que baixar no estoque.
      insert into consumos_paciente
        (paciente_id, produto_id, nome_produto, quantidade, custo_unitario, registrado_por)
      values (v_paciente, null, v_item.nome_produto, v_qtd, 0, auth.uid());
    end if;

    update agendamento_itens
       set aplicado_em = now(), aplicado_por = auth.uid()
     where id = v_item.id;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.aplicar_itens_do_agendamento(uuid) from public, anon;
grant execute on function public.aplicar_itens_do_agendamento(uuid) to authenticated;
