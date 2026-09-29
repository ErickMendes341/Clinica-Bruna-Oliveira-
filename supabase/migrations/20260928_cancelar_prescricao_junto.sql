-- Cancelou o atendimento, cancelou a prescrição.
--
-- O paciente desmarcou em cima da hora: o que estava separado não vai ser
-- usado. Antes a lista só sumia da tela; agora ela é cancelada de fato, e
-- não tem como alguém lançá-la depois por engano.
--
-- Fica no banco, e não na tela, porque cancelar acontece em dois lugares
-- do app e pode pegar um pacote inteiro de sessões de uma vez.

alter table agendamento_itens
  add column if not exists cancelado_em timestamptz;

comment on column agendamento_itens.cancelado_em is
  'Quando o atendimento foi cancelado/faltou e a prescrição caiu junto.';

create or replace function public.cancelar_prescricao_com_atendimento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Desmarcou ou não veio: nada foi usado.
  if new.status in ('cancelado', 'faltou')
     and old.status is distinct from new.status then
    update agendamento_itens
       set cancelado_em = now()
     where agendamento_id = new.id
       and aplicado_em is null
       and cancelado_em is null;

  -- Voltou atrás (remarcou, corrigiu a falta): a lista volta a valer.
  elsif old.status in ('cancelado', 'faltou')
        and new.status not in ('cancelado', 'faltou') then
    update agendamento_itens
       set cancelado_em = null
     where agendamento_id = new.id
       and aplicado_em is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cancelar_prescricao on agendamentos;
create trigger trg_cancelar_prescricao
  after update of status on agendamentos
  for each row
  execute function public.cancelar_prescricao_com_atendimento();

-- Põe em dia o que já estava cancelado antes deste gatilho existir.
update agendamento_itens i
   set cancelado_em = now()
  from agendamentos a
 where a.id = i.agendamento_id
   and a.status in ('cancelado', 'faltou')
   and i.aplicado_em is null
   and i.cancelado_em is null;
