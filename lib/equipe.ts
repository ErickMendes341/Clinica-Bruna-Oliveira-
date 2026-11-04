import { normalizarNome } from './validacao';

/**
 * Quem atende na clínica.
 *
 * Fica aqui, e não espalhado por tela, porque a mesma lista alimenta três
 * coisas: quem atende na agenda, quem aplicou a medicação na ficha e o
 * relatório de aplicações por pessoa. Lista divergente daria pagamento
 * errado no fim do mês.
 *
 * Quem é autorizado pelo app entra sozinho, por `juntarPessoas`. Aqui ficam
 * as pessoas que precisam aparecer mesmo sem ter login.
 */
export const PESSOAS = [
  'Bruna',
  // Ginecologia e obstetrícia.
  'Giullia',
  // Medicação e intradermoterapia capilar: as três fazem o mesmo serviço.
  'Nicole',
  'Melissa',
  'Maisa',
  'Ludimila',
  'Thalita',
  'Jaqueline',
] as const;

/** "Dra. Giullia" vira "Giullia": a lista usa o nome sem o título. */
export function semTitulo(nome: string) {
  return nome.startsWith('Dra. ') ? nome.slice(5) : nome;
}

/**
 * A lista acima mais quem tem login na equipe, sem repetir ninguém.
 *
 * @param daEquipe os nomes que vêm do banco, de `nomes_da_equipe`
 */
export function juntarPessoas(daEquipe: readonly string[]) {
  const lista: string[] = [...PESSOAS];
  const vistos = new Set(lista.map(normalizarNome));
  for (const bruto of daEquipe) {
    const nome = semTitulo(bruto.trim());
    if (!nome || vistos.has(normalizarNome(nome))) continue;
    vistos.add(normalizarNome(nome));
    lista.push(nome);
  }
  return lista;
}
