/**
 * O texto que vai para o paciente no WhatsApp.
 *
 * Fica num lugar só porque o mesmo lembrete sai de três telas — alerta do
 * painel, agenda e ficha. Espalhado, uma mudança pegava uma e esquecia as
 * outras, e o paciente recebia textos diferentes da mesma clínica.
 *
 * Por que a mensagem é assim:
 *  - a data e a hora vão em NEGRITO e sozinhas numa linha, porque é a
 *    única informação que o paciente precisa ler de fato;
 *  - no lugar de "Confirmado?" vai uma pergunta de escolha. Sim/não é
 *    fácil de ignorar; escolher a bebida dá menos trabalho do que deixar
 *    sem responder — e a resposta já serve de confirmação. Em 785
 *    agendamentos, o "Confirmado?" tinha produzido zero confirmações;
 *  - a bebida respondida preenche um campo que a clínica já usa, aquele
 *    "deixar pronto para o atendimento" da agenda do dia;
 *  - a última linha, discreta, dá caminho para quem NÃO pode vir. Sem
 *    ela, quem não vem simplesmente não responde e o horário se perde.
 *
 * No WhatsApp, *texto* fica em negrito e _texto_ em itálico.
 */

const BEBIDAS_NA_PERGUNTA = 'água, café ou capuccino';

/** "quarta-feira, 08/10 às 14:30" — dia da semana ajuda a situar. */
export function quandoPorExtenso(iso: string, hora?: string | null) {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${semana}, ${dia}${hora ? ` às ${hora.slice(0, 5)}` : ''}`;
}

/**
 * Lembrete de atendimento.
 *
 * @param nome   primeiro nome do paciente
 * @param quando "amanhã, às 09:15" ou "quarta-feira, 08/10 às 14:30"
 */
export function mensagemDeLembrete(nome: string, quando: string) {
  const saudacao = nome.trim() ? `Olá ${nome.trim()}!` : 'Olá!';
  return (
    `${saudacao} Aqui é da Clínica Dra. Bruna Oliveira 💛\n\n` +
    `Seu atendimento é *${quando}*.\n\n` +
    `Para já deixarmos tudo pronto: você prefere ${BEBIDAS_NA_PERGUNTA}?\n\n` +
    `_Precisando remarcar, é só me avisar por aqui._`
  );
}
