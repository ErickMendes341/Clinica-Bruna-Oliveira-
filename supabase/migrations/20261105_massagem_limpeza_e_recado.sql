-- Três tipos novos na agenda: Massagem, Limpeza de pele e Recado interno.
--
-- Recado interno é lembrete para a equipe, como "Chamar para repetir exames".
-- Fica na agenda para aparecer no dia certo, mas não é atendimento: por isso
-- sai das contas de "próximo agendamento" e de "última consulta" do painel.
-- Sem isso, um paciente com recado futuro nunca aparecia como sem retorno.

alter table agendamentos drop constraint if exists agendamentos_tipo_check;

alter table agendamentos
  add constraint agendamentos_tipo_check
  check (tipo = any (array[
    'consulta_nova', 'retorno', 'implante', 'bioestimulador', 'medicacao',
    'intradermo', 'estetica', 'massagem', 'limpeza_pele', 'fisioterapia',
    'ginecologia', 'bodyshape', 'recado', 'outros'
  ]));

-- ATENÇÃO: create or replace apaga as opções da view. Sem o "with" abaixo ela
-- volta a rodar como dona e os pacientes ficam legíveis sem login, que foi
-- exatamente o vazamento corrigido em 20261104_fecha_painel_pacientes.sql.
create or replace view public.painel_pacientes
with (security_invoker = true) as
 select p.id,
    p.nome,
    p.telefone,
    p.cpf,
    p.data_nascimento,
    p.meta_peso,
    p.arquivado_em,
    p.created_at,
    ult.ultimo_consumo,
    vis.ultima_consulta,
    greatest(p.created_at::date, coalesce(ult.ultimo_consumo, p.created_at::date), coalesce(vis.ultima_consulta, p.created_at::date)) as ultima_atividade,
    current_date - greatest(p.created_at::date, coalesce(ult.ultimo_consumo, p.created_at::date), coalesce(vis.ultima_consulta, p.created_at::date)) as dias_sem_vir,
    ag.proximo_agendamento,
    ag.proximo_agendamento_id,
    pe.peso_atual,
    pe.peso_anterior,
    pe.primeiro_peso,
    pe.total_pesagens,
    p.pref_contato,
    p.pref_musica,
    p.pref_bebida,
    p.pref_comida
   from pacientes p
     left join lateral ( select max(c.created_at)::date as ultimo_consumo
           from consumos_paciente c
          where c.paciente_id = p.id) ult on true
     left join lateral ( select max(a.data) as ultima_consulta
           from agendamentos a
          where a.paciente_id = p.id
            and a.data <= current_date
            and a.status = any (array['compareceu'::text, 'agendado'::text, 'confirmado'::text])
            and a.tipo <> 'recado') vis on true
     left join lateral ( select a.data as proximo_agendamento,
            a.id as proximo_agendamento_id
           from agendamentos a
          where a.paciente_id = p.id
            and a.status = any (array['agendado'::text, 'confirmado'::text])
            and a.data >= current_date
            and a.tipo <> 'recado'
          order by a.data, a.hora
         limit 1) ag on true
     left join lateral ( select (array_agg(s.peso order by s.data desc, s.created_at desc))[1] as peso_atual,
            (array_agg(s.peso order by s.data desc, s.created_at desc))[2] as peso_anterior,
            (array_agg(s.peso order by s.data, s.created_at))[1] as primeiro_peso,
            count(*) as total_pesagens
           from pesagens s
          where s.paciente_id = p.id) pe on true;

revoke all on public.painel_pacientes from anon;
