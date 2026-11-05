/* Regras dos tipos de agendamento que valem para mais de uma tela. */

export const RECADO = 'recado';

/**
 * Recado interno é lembrete para a equipe, como "Chamar para repetir exames".
 * Fica na agenda para aparecer no dia certo, mas não é atendimento: não manda
 * mensagem ao paciente e não conta como consulta marcada.
 */
export const ehRecado = (tipo: string) => tipo === RECADO;

/** Tipos sem nome próprio: o texto digitado ao marcar é que diz o que é. */
export const tipoDigitado = (tipo: string) => tipo === 'outros' || ehRecado(tipo);
