-- Qual pessoa aplicou a medicação.
--
-- Existe porque duas funcionárias ganham por aplicação, e o login não
-- resolve: a Recepção é um crachá compartilhado, então 124 aplicações já
-- estão gravadas sem dizer quem fez. Aqui a pessoa escolhe o próprio nome
-- na hora de lançar, e isso aguenta uma conversa sobre pagamento.
--
-- Fica separado de registrado_por de propósito:
--   registrado_por -> qual login digitou (auditoria, preenchido sozinho)
--   quem_aplicou   -> quem encostou a mão no paciente (pagamento)

alter table consumos_paciente
  add column if not exists quem_aplicou text;

comment on column consumos_paciente.quem_aplicou is
  'Pessoa que aplicou, escolhida na tela. Base do pagamento por aplicacao.';

alter table consumos_paciente
  drop constraint if exists consumos_quem_aplicou_tamanho;
alter table consumos_paciente
  add constraint consumos_quem_aplicou_tamanho
  check (quem_aplicou is null or char_length(quem_aplicou) between 1 and 60);

-- Relatório do mês por pessoa. É só leitura e só para quem tem acesso
-- total, porque fecha pagamento.
create or replace function public.aplicacoes_por_pessoa(p_de date, p_ate date)
returns table (
  quem         text,
  aplicacoes   bigint,
  itens        bigint,
  pacientes    bigint,
  primeiro_dia date,
  ultimo_dia   date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    coalesce(nullif(trim(c.quem_aplicou), ''), 'nao informado') as quem,
    count(*)                                   as aplicacoes,
    sum(c.quantidade)::bigint                  as itens,
    count(distinct c.paciente_id)              as pacientes,
    min((c.created_at at time zone 'America/Sao_Paulo')::date) as primeiro_dia,
    max((c.created_at at time zone 'America/Sao_Paulo')::date) as ultimo_dia
  from consumos_paciente c
  where pode('total')
    and (c.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  group by 1
  order by count(*) desc;
$$;

revoke all on function public.aplicacoes_por_pessoa(date, date) from public, anon;
grant execute on function public.aplicacoes_por_pessoa(date, date) to authenticated;
