-- Qual medicação o paciente vai fazer naquele atendimento.
--
-- Fica separado de "observacao" de propósito: observação é recado solto
-- ("trazer exames"), medicação é o que precisa estar separado na bancada
-- quando o paciente chegar. Misturar os dois faria um apagar o outro.

alter table agendamentos
  add column if not exists medicacao text;

comment on column agendamentos.medicacao is
  'Medicação/produto que será aplicado neste atendimento. Texto livre, sugerido a partir do estoque.';

-- Mesmo cuidado dos outros campos de texto: evita alguém colar um livro
-- dentro do campo por engano.
alter table agendamentos
  drop constraint if exists agendamentos_medicacao_tamanho;

alter table agendamentos
  add constraint agendamentos_medicacao_tamanho
  check (medicacao is null or char_length(medicacao) <= 200);
