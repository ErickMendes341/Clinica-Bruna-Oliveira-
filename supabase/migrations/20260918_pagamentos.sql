-- Pagamentos por paciente. Cada linha é um pagamento recebido: valor,
-- forma, do que se trata e a data. A aba Financeiro soma isso por mês
-- e por paciente.

create table if not exists public.pagamentos (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  valor         numeric(10,2) not null check (valor > 0),
  forma         text not null check (forma in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro')),
  descricao     text,
  data          date not null default current_date,
  registrado_por uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists pagamentos_paciente_idx on public.pagamentos (paciente_id, data desc);
create index if not exists pagamentos_data_idx on public.pagamentos (data desc);

alter table public.pagamentos enable row level security;

drop policy if exists "equipe acessa pagamentos" on public.pagamentos;
create policy "equipe acessa pagamentos"
  on public.pagamentos for all to authenticated
  using (eh_equipe()) with check (eh_equipe());
