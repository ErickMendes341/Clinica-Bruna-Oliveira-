-- Agendamento passa a ter hora de chegada (hora) e de saída (hora_fim).
-- google_uid guarda o identificador do evento importado do Google Agenda,
-- para uma reimportação não duplicar nada.

alter table public.agendamentos
  add column if not exists hora_fim time,
  add column if not exists google_uid text;

create unique index if not exists agendamentos_google_uid_idx
  on public.agendamentos (google_uid) where google_uid is not null;
