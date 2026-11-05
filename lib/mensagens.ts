/**
 * O texto que vai para o paciente no WhatsApp.
 *
 * Fica num lugar só porque o mesmo lembrete sai de três telas — alerta do
 * painel, agenda e ficha. Espalhado, uma mudança pegava uma e esquecia as
 * outras, e o paciente recebia textos diferentes da mesma clínica.
 *
 * Por que a mensagem é assim:
 *  - a data e a hora vão em NEGRITO e sozinhas numa linha, porque é o que
 *    o paciente mais precisa ler;
 *  - logo abaixo vai o procedimento, também em negrito, para a pessoa saber
 *    o que vem fazer;
 *  - no lugar de "Confirmado?" vai uma pergunta de escolha. Sim/não é
 *    fácil de ignorar; escolher a bebida dá menos trabalho do que deixar
 *    sem responder — e a resposta já serve de confirmação. Em 785
 *    agendamentos, o "Confirmado?" tinha produzido zero confirmações;
 *  - a bebida respondida preenche um campo que a clínica já usa, aquele
 *    "deixar pronto para o atendimento" da agenda do dia.
 *
 * No WhatsApp, *texto* fica em negrito.
 */

import { semTitulo } from './equipe';

const BEBIDAS_NA_PERGUNTA = 'água, café ou capuccino';

/**
 * O nome de cada procedimento para o paciente.
 *
 * É separado dos nomes da agenda porque aqui o texto é para fora: "Consulta
 * nova" organiza a agenda, mas para o paciente é só uma consulta.
 *
 * "Outros" fica de fora de propósito: a equipe usa esse texto livre também
 * para recados internos, como "Chamar para repetir exames", e isso não pode
 * chegar ao paciente. Tipo que não estiver aqui simplesmente não aparece.
 */
const PROCEDIMENTOS: Record<string, string> = {
  consulta_nova: 'Consulta',
  retorno: 'Retorno',
  implante: 'Implante',
  bioestimulador: 'Aplicação de bioestimulador',
  medicacao: 'Medicação',
  intradermo: 'Intradermoterapia capilar',
  estetica: 'Estética',
  fisioterapia: 'Fisioterapia',
  ginecologia: 'Ginecologia e Obstetrícia',
  bodyshape: 'BodyShape',
};

function eADraBruna(remetente?: string | null) {
  return semTitulo((remetente ?? '').trim()) === 'Bruna';
}

/**
 * Como a clínica se apresenta, conforme quem está logado.
 *
 * Todas usam o mesmo número, e o WhatsApp não mostra ao paciente qual
 * atendente enviou: o nome só chega se estiver escrito no texto.
 *
 * Sem nome, sai o texto neutro. É o caso do login de posto, como a
 * Recepção: o AuthGate não manda nome nenhum, porque várias pessoas usam
 * esse login e nome errado é pior do que nome nenhum.
 *
 * @param remetente o nome de quem está enviando
 */
export function apresentacao(remetente?: string | null) {
  const nome = (remetente ?? '').trim();
  if (!nome) return 'aqui é da Clínica Dra. Bruna Oliveira';
  const pessoa = semTitulo(nome);
  if (pessoa === 'Bruna') return 'aqui é a Dra. Bruna Oliveira';
  return `aqui é ${pessoa === nome ? nome : `a ${nome}`}, da Clínica Dra. Bruna Oliveira`;
}

/** "quarta-feira, 08/10 às 14:30" — dia da semana ajuda a situar. */
export function quandoPorExtenso(iso: string, hora?: string | null) {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${semana}, ${dia}${hora ? ` às ${hora.slice(0, 5)}` : ''}`;
}

/** "Medicação", "Medicação e Estética", "Medicação, Estética e Retorno". */
export function emLista(itens: string[]) {
  if (itens.length < 2) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** A linha que diz o que a pessoa vem fazer. Vazia se não houver o que dizer. */
function linhaDoProcedimento(tipos: string[]) {
  const nomes = [...new Set(tipos.map((t) => PROCEDIMENTOS[t]).filter(Boolean))];
  if (nomes.length === 0) return '';
  return `\n${nomes.length > 1 ? 'Procedimentos' : 'Procedimento'}: *${emLista(nomes)}*`;
}

/**
 * Lembrete de atendimento.
 *
 * @param nome   primeiro nome do paciente
 * @param quando "amanhã, às 09:15" ou "quarta-feira, 08/10 às 14:30"
 * @param remetente o nome do login que está enviando
 * @param tipos  o tipo de cada agendamento: mais de um quando a pessoa tem
 *               dois atendimentos no mesmo dia
 */
export function mensagemDeLembrete(
  nome: string,
  quando: string,
  remetente?: string | null,
  tipos: string[] = []
) {
  const saudacao = nome.trim() ? `Olá ${nome.trim()}!` : 'Olá!';
  const fala = apresentacao(remetente);
  return (
    `${saudacao} ${fala[0].toUpperCase()}${fala.slice(1)} 💛\n\n` +
    `Seu atendimento é *${quando}*.${linhaDoProcedimento(tipos)}\n\n` +
    `Para já deixarmos tudo pronto: você prefere ${BEBIDAS_NA_PERGUNTA}?`
  );
}

/** Convite para quem sumiu. A Dra. Bruna não fala de si na terceira pessoa. */
export function mensagemPacienteSumido(nome: string, remetente?: string | null) {
  const convite = eADraBruna(remetente) ? 'Gostaria' : 'Dra. Bruna gostaria';
  return `Olá ${nome}, ${apresentacao(remetente)}. Sentimos sua falta! ${convite} de acompanhar sua evolução, vamos agendar uma consulta?`;
}
