-- O que separar para cada atendimento: B12, agulha, soro, álcool…
--
-- Isto é a LISTA DO QUE VAI SER USADO, montada na hora de agendar. Não é
-- baixa de estoque: a baixa continua acontecendo quando a equipe aplica
-- de verdade, em consumos_paciente. Se o paciente desmarcar, nada saiu do
-- estoque — que é justamente o certo.

create table if not exists agendamento_itens (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  -- Guardamos o nome junto: se o produto for arquivado depois, a lista do
  -- atendimento continua legível. Mesmo cuidado de consumos_paciente.
  produto_id uuid references produtos(id) on delete set null,
  nome_produto text not null,
  quantidade numeric(10,2) not null default 1,
  criado_em timestamptz not null default now(),
  constraint agendamento_itens_quantidade_positiva check (quantidade > 0),
  constraint agendamento_itens_nome_tamanho check (char_length(nome_produto) between 1 and 200)
);

create index if not exists idx_agendamento_itens_agendamento
  on agendamento_itens (agendamento_id);

comment on table agendamento_itens is
  'Materiais previstos para um atendimento. Planejamento, não baixa de estoque.';

alter table agendamento_itens enable row level security;

-- Mesma regra da agenda: quem pode agendar pode montar a lista.
drop policy if exists "equipe usa itens do atendimento" on agendamento_itens;
create policy "equipe usa itens do atendimento" on agendamento_itens
  for all
  using ((select pode('atendimento')))
  with check ((select pode('atendimento')));

-- A lista substitui o campo de texto único criado mais cedo hoje, que
-- ninguém chegou a usar (zero registros).
alter table agendamentos drop constraint if exists agendamentos_medicacao_tamanho;
alter table agendamentos drop column if exists medicacao;
