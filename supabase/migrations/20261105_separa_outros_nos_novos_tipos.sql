-- Os "Outros" que ainda vão acontecer passam para o tipo certo.
--
-- Só o tipo muda: o texto digitado continua na observação. Atendimentos que
-- já passaram ficam como estão.

update agendamentos
   set tipo = 'recado'
 where tipo = 'outros'
   and data >= current_date
   and status in ('agendado', 'confirmado')
   and trim(observacao) ~* '^(chamar|mandar|lembrar)\y';

update agendamentos
   set tipo = 'massagem'
 where tipo = 'outros'
   and data >= current_date
   and status in ('agendado', 'confirmado')
   and trim(observacao) ilike 'massagem%';

update agendamentos
   set tipo = 'limpeza_pele'
 where tipo = 'outros'
   and data >= current_date
   and status in ('agendado', 'confirmado')
   and trim(observacao) ilike 'limpeza de pele%';

update agendamentos
   set tipo = 'bioestimulador'
 where tipo = 'outros'
   and data >= current_date
   and status in ('agendado', 'confirmado')
   and trim(observacao) ilike 'bioestimulador%';
