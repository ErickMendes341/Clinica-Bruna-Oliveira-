-- Dose e observação de cada item do atendimento.
--
--   quantidade -> quantas unidades saem da prateleira (2 ampolas)
--   dose       -> quanto vai ser usado em cada uma ("1ml", "1,25mg")
--   observacao -> recado do uso ("aplicar devagar", "glúteo direito")
--
-- Tudo texto livre: dose de medicação vem em ml, mg, UI e gotas, e forçar
-- um formato só atrapalharia quem está com o paciente na frente.

alter table agendamento_itens
  add column if not exists dose text,
  add column if not exists observacao text;

comment on column agendamento_itens.dose is
  'Dose usada neste item. Texto livre: 1ml, 1,25mg, 10 gotas.';
comment on column agendamento_itens.observacao is
  'Recado sobre o uso deste item, para quem for aplicar.';

alter table agendamento_itens
  drop constraint if exists agendamento_itens_dose_tamanho;
alter table agendamento_itens
  add constraint agendamento_itens_dose_tamanho
  check (dose is null or char_length(dose) <= 60);

alter table agendamento_itens
  drop constraint if exists agendamento_itens_observacao_tamanho;
alter table agendamento_itens
  add constraint agendamento_itens_observacao_tamanho
  check (observacao is null or char_length(observacao) <= 300);
