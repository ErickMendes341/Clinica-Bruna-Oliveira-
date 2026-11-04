-- Conta criada no painel vira pedido, mas o acesso ainda pode ser dado pelo
-- SQL do manual. Sem este filtro o pedido ficava na tela da Dra. Bruna e
-- autorizar daria erro, porque a pessoa já está na equipe.
create or replace function public.pedidos_de_acesso()
returns table (user_id uuid, nome text, email text, criado_em timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.user_id, p.nome, p.email, p.criado_em
    from pedidos_acesso p
   where posso_aprovar_acessos()
     and p.recusado_em is null
     and not exists (select 1 from equipe_autorizada e where e.user_id = p.user_id)
   order by p.criado_em;
$$;
