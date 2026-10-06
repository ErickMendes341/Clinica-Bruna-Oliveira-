/**
 * Quem atende na clínica.
 *
 * Fica aqui, e não espalhado por tela, porque a mesma lista alimenta três
 * coisas: quem atende na agenda, quem aplicou a medicação na ficha e o
 * relatório de aplicações por pessoa. Lista divergente daria pagamento
 * errado no fim do mês.
 *
 * Para incluir ou tirar alguém, mexa só nesta lista.
 */
export const PESSOAS = [
  'Bruna',
  // Medicação e intradermoterapia capilar: as três fazem o mesmo serviço.
  'Nicole',
  'Melissa',
  'Maisa',
  'Ludimila',
  'Thalita',
  'Jaqueline',
] as const;
