-- Auditoria de 21/09/2026 — itens 8, 15, 18, 19 e 20.
--
--  8. "última visita" passa a contar consulta com presença, não só
--     aplicação de item do estoque (paciente de BodyShape/estética
--     aparecia como sumido mesmo vindo toda semana).
-- 15. Fichas recebidas e convites vencidos são apagados depois de 30
--     dias (LGPD: dado que cumpriu o propósito não fica guardado).
-- 18. Regras que a tela já impõe passam a valer também no banco.
-- 19. Tabelas e função de uma versão antiga, vazias, saem de cena.
-- 20. Políticas de acesso avaliam eh_equipe() uma vez por consulta.

-- ------------------------------------------------------- 8
-- A coluna nova muda a ordem, então a view é recriada do zero.
drop view if exists public.painel_pacientes;
create view public.painel_pacientes as
select
  p.id, p.nome, p.telefone, p.cpf, p.data_nascimento, p.meta_peso,
  p.arquivado_em, p.created_at,
  ult.ultimo_consumo,
  vis.ultima_consulta,
  greatest(
    p.created_at::date,
    coalesce(ult.ultimo_consumo, p.created_at::date),
    coalesce(vis.ultima_consulta, p.created_at::date)
  ) as ultima_atividade,
  current_date - greatest(
    p.created_at::date,
    coalesce(ult.ultimo_consumo, p.created_at::date),
    coalesce(vis.ultima_consulta, p.created_at::date)
  ) as dias_sem_vir,
  ag.proximo_agendamento,
  ag.proximo_agendamento_id,
  pe.peso_atual, pe.peso_anterior, pe.primeiro_peso, pe.total_pesagens,
  p.pref_contato, p.pref_musica, p.pref_bebida, p.pref_comida
from pacientes p
left join lateral (
  select max(c.created_at)::date as ultimo_consumo
  from consumos_paciente c where c.paciente_id = p.id
) ult on true
left join lateral (
  -- Compareceu de fato, ou consulta passada que ninguém deu baixa.
  select max(a.data) as ultima_consulta
  from agendamentos a
  where a.paciente_id = p.id
    and a.data <= current_date
    and a.status in ('compareceu', 'agendado', 'confirmado')
) vis on true
left join lateral (
  select a.data as proximo_agendamento, a.id as proximo_agendamento_id
  from agendamentos a
  where a.paciente_id = p.id
    and a.status in ('agendado', 'confirmado')
    and a.data >= current_date
  order by a.data, a.hora nulls last
  limit 1
) ag on true
left join lateral (
  select
    (array_agg(s.peso order by s.data desc, s.created_at desc))[1] as peso_atual,
    (array_agg(s.peso order by s.data desc, s.created_at desc))[2] as peso_anterior,
    (array_agg(s.peso order by s.data asc, s.created_at asc))[1] as primeiro_peso,
    count(*) as total_pesagens
  from pesagens s where s.paciente_id = p.id
) pe on true;

-- ------------------------------------------------------- 15
create or replace function public.limpar_dados_temporarios()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_fichas int;
  v_convites int;
begin
  delete from cadastros_recebidos
   where status in ('aceito', 'descartado')
     and coalesce(processado_em, created_at) < now() - interval '30 days';
  get diagnostics v_fichas = row_count;

  delete from convites_ficha
   where (usado_em is not null and usado_em < now() - interval '30 days')
      or (usado_em is null and expira_em < now() - interval '30 days');
  get diagnostics v_convites = row_count;

  return jsonb_build_object('fichas', v_fichas, 'convites', v_convites);
end;
$$;

revoke all on function public.limpar_dados_temporarios() from public, anon;
grant execute on function public.limpar_dados_temporarios() to authenticated;

-- ------------------------------------------------------- 18
-- Saída depois da chegada; agendamento no passado longínquo é engano.
alter table public.agendamentos drop constraint if exists agendamentos_hora_coerente;
alter table public.agendamentos add constraint agendamentos_hora_coerente
  check (hora_fim is null or (hora is not null and hora_fim > hora)) not valid;

-- Estoque nunca negativo, nem por update direto.
alter table public.produtos drop constraint if exists produtos_quantidade_nao_negativa;
alter table public.produtos add constraint produtos_quantidade_nao_negativa
  check (quantidade >= 0) not valid;

alter table public.historico_movimentacoes drop constraint if exists historico_tipo_valido;
alter table public.historico_movimentacoes add constraint historico_tipo_valido
  check (tipo in ('ENTRADA', 'SAIDA')) not valid;

alter table public.historico_movimentacoes drop constraint if exists historico_quantidade_positiva;
alter table public.historico_movimentacoes add constraint historico_quantidade_positiva
  check (quantidade > 0) not valid;

alter table public.consumos_paciente drop constraint if exists consumos_quantidade_positiva;
alter table public.consumos_paciente add constraint consumos_quantidade_positiva
  check (quantidade > 0) not valid;

alter table public.pesagens drop constraint if exists pesagens_peso_plausivel;
alter table public.pesagens add constraint pesagens_peso_plausivel
  check (peso > 20 and peso <= 400) not valid;

alter table public.pacientes drop constraint if exists pacientes_medidas_plausiveis;
alter table public.pacientes add constraint pacientes_medidas_plausiveis
  check (
    (peso is null or (peso > 20 and peso <= 400)) and
    (altura is null or (altura > 0.5 and altura < 2.6)) and
    (data_nascimento is null or (data_nascimento > '1900-01-01' and data_nascimento <= current_date))
  ) not valid;

-- Índices das chaves estrangeiras e das buscas do dia a dia.
create index if not exists agendamentos_paciente_idx on public.agendamentos (paciente_id, data desc);
create index if not exists agendamentos_data_status_idx on public.agendamentos (data, status);
create index if not exists agendamentos_criado_por_idx on public.agendamentos (criado_por);
create index if not exists consumos_paciente_pac_idx on public.consumos_paciente (paciente_id, created_at desc);
create index if not exists consumos_paciente_prod_idx on public.consumos_paciente (produto_id);
create index if not exists consumos_paciente_reg_idx on public.consumos_paciente (registrado_por);
create index if not exists historico_produto_idx on public.historico_movimentacoes (produto_id, created_at desc);
create index if not exists historico_reg_idx on public.historico_movimentacoes (registrado_por);
create index if not exists pesagens_reg_idx on public.pesagens (registrado_por);
create index if not exists pagamentos_reg_idx on public.pagamentos (registrado_por);
create index if not exists cadastros_recebidos_pac_idx on public.cadastros_recebidos (paciente_id);
create index if not exists cadastros_recebidos_proc_idx on public.cadastros_recebidos (processado_por);
create index if not exists convites_ficha_criado_por_idx on public.convites_ficha (criado_por);
create index if not exists produtos_ativos_idx on public.produtos (arquivado_em) where arquivado_em is null;

-- ------------------------------------------------------- 19
drop table if exists public.transacoes_financeiras;
drop table if exists public.categorias;
drop table if exists public.movimentacao_estoque;
drop table if exists public.estoque_produtos;
drop function if exists public.dar_baixa_produto(uuid, integer);

-- ------------------------------------------------------- 20
-- Recria cada política existente usando (select eh_equipe()), mantendo o nome.
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select eh_equipe())) with check ((select eh_equipe()))',
      r.policyname, r.tablename);
  end loop;
end $$;
