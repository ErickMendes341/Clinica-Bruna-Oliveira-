-- A Dra. Bruna exclui pelo app as contas que não fazem parte da clínica.
--
-- Quem sai deixa os registros: agendamentos, aplicações, pesagens e
-- movimentos de estoque continuam, só perdem a ligação com a conta apagada.
-- Antes, estas quatro ligações impediam apagar a conta de quem já tinha
-- registrado alguma coisa. As outras ligações com contas já se esvaziavam
-- sozinhas, e a lista de equipe e de pedidos some junto com a conta.

alter table agendamentos
  drop constraint agendamentos_criado_por_fkey,
  add constraint agendamentos_criado_por_fkey
    foreign key (criado_por) references auth.users(id) on delete set null;

alter table consumos_paciente
  drop constraint consumos_paciente_registrado_por_fkey,
  add constraint consumos_paciente_registrado_por_fkey
    foreign key (registrado_por) references auth.users(id) on delete set null;

alter table historico_movimentacoes
  drop constraint historico_movimentacoes_registrado_por_fkey,
  add constraint historico_movimentacoes_registrado_por_fkey
    foreign key (registrado_por) references auth.users(id) on delete set null;

alter table pesagens
  drop constraint pesagens_registrado_por_fkey,
  add constraint pesagens_registrado_por_fkey
    foreign key (registrado_por) references auth.users(id) on delete set null;

-- Todas as contas, para a tela "Contas". Vazia para quem não autoriza acessos.
create or replace function public.contas_do_app()
returns table (
  user_id uuid,
  email text,
  nome text,
  situacao text,
  papel text,
  posto boolean,
  autoriza boolean,
  sou_eu boolean,
  criada_em timestamptz,
  ultimo_acesso timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.id,
         u.email::text,
         coalesce(e.nome, p.nome, split_part(u.email, '@', 1)),
         case when e.user_id is not null then 'equipe'
              when p.user_id is not null and p.recusado_em is null then 'aguardando'
              when p.user_id is not null then 'recusada'
              else 'sem_acesso' end,
         e.papel,
         coalesce(e.posto, false),
         coalesce(e.aprova_acessos, false),
         u.id = auth.uid(),
         u.created_at,
         u.last_sign_in_at
    from auth.users u
    left join equipe_autorizada e on e.user_id = u.id
    left join pedidos_acesso p on p.user_id = u.id
   where posso_aprovar_acessos()
   order by 4, 3;
$$;

-- Apaga a conta de vez. A pessoa perde o acesso na hora; se voltar a
-- trabalhar na clínica, cria um cadastro novo pelo app.
create or replace function public.excluir_conta(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not posso_aprovar_acessos() then
    raise exception 'Só a Dra. Bruna pode excluir contas.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode excluir a sua própria conta.';
  end if;
  -- Quem autoriza acessos não sai pelo app: evita a clínica ficar sem
  -- ninguém para liberar contas novas.
  if exists (select 1 from equipe_autorizada where user_id = p_user_id and aprova_acessos) then
    raise exception 'Esta conta também autoriza acessos e não pode ser excluída pelo app.';
  end if;

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'Esta conta não existe mais.';
  end if;
end;
$$;

revoke all on function public.contas_do_app() from public, anon;
revoke all on function public.excluir_conta(uuid) from public, anon;
grant execute on function public.contas_do_app() to authenticated;
grant execute on function public.excluir_conta(uuid) to authenticated;
