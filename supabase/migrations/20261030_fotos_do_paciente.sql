-- Fotos do paciente: antes e depois, mais a foto de perfil.
--
-- PRIVACIDADE É O PONTO AQUI. São fotos de corpo de paciente. O balde é
-- privado, sem exceção: nada de link público que funcione para quem tiver
-- o endereço. A tela monta um link assinado que vale uma hora e depois
-- morre. Quem não está na equipe não lê nem a lista, nem o arquivo.
--
-- O tamanho também importa: o plano gratuito dá 1 GB. Foto de celular vem
-- com 3 a 5 MB; por isso a tela diminui a imagem antes de enviar e o
-- balde recusa qualquer coisa acima de 5 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos-pacientes',
  'fotos-pacientes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Só a equipe mexe nas fotos. Vale para ver, enviar e apagar.
drop policy if exists "equipe ve fotos" on storage.objects;
create policy "equipe ve fotos" on storage.objects
  for select using (bucket_id = 'fotos-pacientes' and (select eh_equipe()));

drop policy if exists "equipe envia fotos" on storage.objects;
create policy "equipe envia fotos" on storage.objects
  for insert with check (bucket_id = 'fotos-pacientes' and (select eh_equipe()));

drop policy if exists "equipe apaga fotos" on storage.objects;
create policy "equipe apaga fotos" on storage.objects
  for delete using (bucket_id = 'fotos-pacientes' and (select eh_equipe()));

-- A ficha de cada foto: onde está, o que é, de quando é.
create table if not exists fotos_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  -- Caminho dentro do balde. Único para não haver duas fichas apontando
  -- para o mesmo arquivo e uma apagar a foto da outra.
  caminho text not null unique,
  descricao text,
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  momento text not null default 'antes',
  criado_em timestamptz not null default now(),
  criado_por uuid,
  constraint fotos_momento_valido check (momento in ('antes', 'depois')),
  constraint fotos_descricao_tamanho check (descricao is null or char_length(descricao) <= 300)
);

create index if not exists idx_fotos_paciente on fotos_paciente (paciente_id, data);

comment on table fotos_paciente is
  'Fotos de evolucao do paciente. Arquivo fica no balde privado fotos-pacientes.';

alter table fotos_paciente enable row level security;

drop policy if exists "equipe usa fotos do paciente" on fotos_paciente;
create policy "equipe usa fotos do paciente" on fotos_paciente
  for all
  using ((select eh_equipe()))
  with check ((select eh_equipe()));

-- Foto de perfil: uma por paciente, por isso fica na propria ficha.
alter table pacientes
  add column if not exists foto_perfil text;

comment on column pacientes.foto_perfil is
  'Caminho da foto de perfil no balde privado. Nulo = sem foto.';
