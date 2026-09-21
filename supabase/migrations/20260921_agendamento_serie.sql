-- Pacote de sessões: agendamentos criados juntos (ex.: toda quarta às 14h
-- por 4 semanas) compartilham o serie_id. Cada um continua sendo uma
-- linha normal — remarcar/desmarcar um não mexe nos outros, a não ser
-- que a pessoa peça "este e os próximos".

alter table public.agendamentos
  add column if not exists serie_id uuid;

create index if not exists agendamentos_serie_idx on public.agendamentos (serie_id) where serie_id is not null;
