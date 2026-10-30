-- Ginecologia e Obstetrícia: atendimento próprio da Dra. Giullia Novack.
--
-- Precisa entrar na regra do banco junto com a opção na tela. Já tivemos
-- um procedimento oferecido na tela e ausente daqui, e o resultado foi
-- agendamento recusado com mensagem técnica, paciente cadastrado em
-- duplicata e a recepção tentando de novo. Lista da tela e lista do banco
-- andam juntas, sempre.

alter table agendamentos drop constraint if exists agendamentos_tipo_check;

alter table agendamentos
  add constraint agendamentos_tipo_check
  check (tipo = any (array[
    'consulta_nova', 'retorno', 'implante', 'bioestimulador',
    'medicacao', 'intradermo', 'estetica', 'fisioterapia',
    'ginecologia',
    'bodyshape', 'outros'
  ]));
