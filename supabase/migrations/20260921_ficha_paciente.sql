-- Formulário que o próprio paciente preenche no celular.
--
-- Fluxo: a equipe gera um convite (link único) na ficha e manda pelo
-- WhatsApp — ou o paciente novo usa o link geral. O que ele envia cai em
-- cadastros_recebidos; ninguém de fora lê nada, só entrega. A equipe
-- confere na caixa de entrada do app e clica "Aceitar", que cria ou
-- atualiza a ficha.
--
-- Segurança: as tabelas têm RLS só para a equipe. O visitante anônimo só
-- consegue chamar duas funções (dados_convite e enviar_ficha), ambas
-- SECURITY DEFINER e com validação própria.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.convites_ficha (
  token        text primary key,
  paciente_id  uuid not null references public.pacientes(id) on delete cascade,
  expira_em    timestamptz not null default now() + interval '7 days',
  usado_em     timestamptz,
  criado_por   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.cadastros_recebidos (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid references public.pacientes(id) on delete set null,
  token          text,
  dados          jsonb not null,
  status         text not null default 'pendente' check (status in ('pendente','aceito','descartado')),
  consentimento_em timestamptz not null default now(),
  processado_em  timestamptz,
  processado_por uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists cadastros_recebidos_status_idx on public.cadastros_recebidos (status, created_at desc);
create index if not exists convites_ficha_paciente_idx on public.convites_ficha (paciente_id);

alter table public.convites_ficha enable row level security;
alter table public.cadastros_recebidos enable row level security;

drop policy if exists "equipe acessa convites" on public.convites_ficha;
create policy "equipe acessa convites" on public.convites_ficha
  for all to authenticated using (eh_equipe()) with check (eh_equipe());

drop policy if exists "equipe acessa cadastros recebidos" on public.cadastros_recebidos;
create policy "equipe acessa cadastros recebidos" on public.cadastros_recebidos
  for all to authenticated using (eh_equipe()) with check (eh_equipe());

-- ---------------------------------------------------------------- público
-- O que a página do formulário pode saber sobre o convite: só o primeiro
-- nome (para a saudação) e se ainda vale. Nada da ficha sai por aqui.
create or replace function public.dados_convite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c convites_ficha%rowtype;
  v_nome text;
begin
  select * into c from convites_ficha where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'invalido'); end if;
  if c.usado_em is not null then return jsonb_build_object('ok', false, 'motivo', 'usado'); end if;
  if c.expira_em < now() then return jsonb_build_object('ok', false, 'motivo', 'expirado'); end if;
  select split_part(trim(nome), ' ', 1) into v_nome from pacientes where id = c.paciente_id;
  return jsonb_build_object('ok', true, 'primeiro_nome', coalesce(v_nome, ''));
end;
$$;

-- Recebe o formulário. Com token: vincula ao paciente e queima o convite.
-- Sem token (link geral): entra como cadastro novo para a equipe avaliar.
create or replace function public.enviar_ficha(p_token text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c convites_ficha%rowtype;
  v_pac uuid;
  v_nome text;
begin
  if p_dados is null or pg_column_size(p_dados) > 20000 then
    return jsonb_build_object('ok', false, 'motivo', 'dados');
  end if;
  v_nome := trim(coalesce(p_dados->>'nome', ''));
  if length(v_nome) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'nome');
  end if;
  if coalesce(p_dados->>'consentimento', 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'motivo', 'consentimento');
  end if;

  if p_token is not null and p_token <> '' then
    select * into c from convites_ficha where token = p_token for update;
    if not found or c.usado_em is not null or c.expira_em < now() then
      return jsonb_build_object('ok', false, 'motivo', 'convite');
    end if;
    v_pac := c.paciente_id;
    update convites_ficha set usado_em = now() where token = p_token;
  else
    -- Link geral: freio simples contra enxurrada de envios.
    if (select count(*) from cadastros_recebidos where created_at > now() - interval '1 hour') > 100 then
      return jsonb_build_object('ok', false, 'motivo', 'limite');
    end if;
  end if;

  insert into cadastros_recebidos (paciente_id, token, dados)
  values (v_pac, nullif(p_token, ''), p_dados);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dados_convite(text) from public;
revoke all on function public.enviar_ficha(text, jsonb) from public;
grant execute on function public.dados_convite(text) to anon, authenticated;
grant execute on function public.enviar_ficha(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- equipe
-- "Aceitar": cria a ficha (p_paciente_id nulo) ou atualiza a existente
-- com o que o paciente preencheu. Campo em branco no formulário não
-- apaga o que já estava na ficha.
create or replace function public.aceitar_cadastro(p_id uuid, p_paciente_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r cadastros_recebidos%rowtype;
  d jsonb;
  v_pac uuid;
  v_peso numeric; v_altura numeric; v_nasc date;
begin
  select * into r from cadastros_recebidos where id = p_id for update;
  if not found then raise exception 'Cadastro não encontrado.'; end if;
  if r.status <> 'pendente' then raise exception 'Este cadastro já foi processado.'; end if;
  d := r.dados;
  v_pac := coalesce(p_paciente_id, r.paciente_id);

  v_peso   := nullif(replace(trim(coalesce(d->>'peso','')), ',', '.'), '')::numeric;
  v_altura := nullif(replace(trim(coalesce(d->>'altura','')), ',', '.'), '')::numeric;
  if v_altura is not null and v_altura > 3 then v_altura := v_altura / 100; end if;
  v_nasc   := nullif(trim(coalesce(d->>'data_nascimento','')), '')::date;

  if v_pac is null then
    insert into pacientes (nome, cpf, telefone, data_nascimento, peso, altura, endereco, observacoes,
                           pref_contato, pref_bebida, pref_musica, pref_comida)
    values (trim(d->>'nome'), nullif(trim(d->>'cpf'),''), nullif(trim(d->>'telefone'),''), v_nasc, v_peso, v_altura,
            nullif(trim(d->>'endereco'),''), nullif(trim(d->>'observacoes'),''),
            nullif(d->>'pref_contato',''), nullif(trim(d->>'pref_bebida'),''),
            nullif(trim(d->>'pref_musica'),''), nullif(trim(d->>'pref_comida'),''))
    returning id into v_pac;
  else
    update pacientes set
      nome            = coalesce(nullif(trim(d->>'nome'),''), nome),
      cpf             = coalesce(nullif(trim(d->>'cpf'),''), cpf),
      telefone        = coalesce(nullif(trim(d->>'telefone'),''), telefone),
      data_nascimento = coalesce(v_nasc, data_nascimento),
      peso            = coalesce(v_peso, peso),
      altura          = coalesce(v_altura, altura),
      endereco        = coalesce(nullif(trim(d->>'endereco'),''), endereco),
      observacoes     = case when nullif(trim(d->>'observacoes'),'') is null then observacoes
                             when observacoes is null or observacoes = '' then trim(d->>'observacoes')
                             else observacoes || E'\n\n[Informado pelo paciente em ' || to_char(r.created_at, 'DD/MM/YYYY') || ']\n' || trim(d->>'observacoes') end,
      pref_contato    = coalesce(nullif(d->>'pref_contato',''), pref_contato),
      pref_bebida     = coalesce(nullif(trim(d->>'pref_bebida'),''), pref_bebida),
      pref_musica     = coalesce(nullif(trim(d->>'pref_musica'),''), pref_musica),
      pref_comida     = coalesce(nullif(trim(d->>'pref_comida'),''), pref_comida)
    where id = v_pac;
  end if;

  update cadastros_recebidos
     set status = 'aceito', paciente_id = v_pac, processado_em = now(), processado_por = auth.uid()
   where id = p_id;
  return v_pac;
end;
$$;

revoke all on function public.aceitar_cadastro(uuid, uuid) from public, anon;
grant execute on function public.aceitar_cadastro(uuid, uuid) to authenticated;
