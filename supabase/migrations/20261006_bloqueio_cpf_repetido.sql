-- Dois pacientes não podem ter o mesmo CPF.
--
-- É gatilho, e não índice único, por um motivo prático: já existem 5 CPFs
-- repetidos na base (cadastros antigos da mesma pessoa com o nome escrito
-- diferente, e um erro de digitação). Um índice único recusaria criar até
-- alguém limpar tudo; o gatilho vale a partir de agora e deixa o passado
-- para ser arrumado com calma.
--
-- Telefone NÃO entra aqui de propósito: família divide número. Hoje há
-- quatro casos legítimos na base (marido e esposa, mãe e filha). Telefone
-- repetido vira aviso na tela, que a equipe pode confirmar.

create or replace function public.impedir_cpf_repetido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cpf   text;
  v_outro text;
begin
  v_cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g'), '');

  -- Sem CPF, ou CPF incompleto, não há o que comparar.
  if v_cpf is null or length(v_cpf) <> 11 then
    return new;
  end if;

  select p.nome into v_outro
    from pacientes p
   where p.id is distinct from new.id
     and p.arquivado_em is null
     and regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') = v_cpf
   limit 1;

  if v_outro is not null then
    raise exception 'Este CPF já está cadastrado para %. Abra a ficha dela em vez de criar outra.', trim(v_outro)
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cpf_repetido on pacientes;
create trigger trg_cpf_repetido
  before insert or update of cpf on pacientes
  for each row
  execute function public.impedir_cpf_repetido();
