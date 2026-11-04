-- A visão painel_pacientes rodava com a permissão do dono e ignorava as
-- travas das tabelas. Como o papel anon podia ler a visão, qualquer
-- visitante, sem login, conseguia ler nome, telefone, CPF, nascimento e
-- peso de todos os pacientes usando a chave pública do site.
--
-- security_invoker faz a visão obedecer às travas de quem consulta.
-- Toda visão nova neste projeto precisa nascer com essa opção.

alter view public.painel_pacientes set (security_invoker = true);
revoke all on public.painel_pacientes from anon;
