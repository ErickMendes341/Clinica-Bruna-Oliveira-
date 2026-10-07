-- Conserta "Could not choose the best candidate function".
--
-- Ao acrescentar o parâmetro p_quem, o "create or replace" não substituiu
-- as funções: como a lista de parâmetros mudou, o Postgres criou uma
-- segunda versão ao lado da antiga. Com as duas no banco e o parâmetro
-- novo tendo valor padrão, uma chamada com os 3 argumentos antigos servia
-- para as duas — e o Postgres se recusa a escolher.
--
-- Lição para a próxima vez: mudar a lista de parâmetros de uma função
-- exige DROP antes do CREATE. E testar chamando por NOME de parâmetro,
-- como o app faz, e não por posição — por posição a chamada é exata e o
-- problema não aparece.

drop function if exists public.aplicar_item(uuid, uuid, integer);
drop function if exists public.aplicar_itens_do_agendamento(uuid, jsonb);
