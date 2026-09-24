'use client';

import { createContext, useContext } from 'react';

/**
 * O que cada pessoa da equipe pode fazer.
 *
 *  atendimento — Thalita, Ludimila: agenda, pacientes e aplicar item do
 *                estoque na ficha.
 *  estoque     — Nicole: o de atendimento, mais a aba Estoque Médico.
 *  total       — Bruna, Jaqueline: tudo, inclusive financeiro, cópia de
 *                segurança e exclusões definitivas.
 *
 * O banco impõe as mesmas regras (RLS): esconder na tela é conveniência,
 * quem tranca de verdade é o Supabase.
 */
export type Papel = 'atendimento' | 'estoque' | 'total';

export const ROTULO_PAPEL: Record<Papel, string> = {
  atendimento: 'Atendimento',
  estoque: 'Atendimento e estoque',
  total: 'Acesso total',
};

const NIVEL: Record<Papel, number> = { atendimento: 1, estoque: 2, total: 3 };

export function papelPode(papel: Papel | null, minimo: Papel) {
  if (!papel) return false;
  return NIVEL[papel] >= NIVEL[minimo];
}

export const PapelContexto = createContext<{ papel: Papel | null; nome: string }>({
  papel: null,
  nome: '',
});

export function usarPapel() {
  return useContext(PapelContexto);
}

/** Atalho: `pode('estoque')` dentro de um componente. */
export function usarPode() {
  const { papel } = usarPapel();
  return (minimo: Papel) => papelPode(papel, minimo);
}
