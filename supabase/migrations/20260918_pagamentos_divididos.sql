-- Um pagamento pode ser dividido em mais de uma forma (parte em dinheiro,
-- parte no cartão...). Cada parte é uma linha; as partes do mesmo
-- pagamento compartilham o grupo_id. Linhas antigas ganham um grupo só
-- delas, então continuam sendo "um pagamento de uma parte".

alter table public.pagamentos
  add column if not exists grupo_id uuid not null default gen_random_uuid();

create index if not exists pagamentos_grupo_idx on public.pagamentos (grupo_id);
