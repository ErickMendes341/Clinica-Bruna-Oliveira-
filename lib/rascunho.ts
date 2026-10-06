'use client';

import { useEffect } from 'react';

/**
 * Rascunho de formulário, guardado no próprio aparelho.
 *
 * Existe porque trocar de aba no meio de um cadastro apagava tudo e a
 * equipe tinha que redigitar. O rascunho fica só neste computador, some
 * assim que o cadastro é salvo e vence sozinho em um dia — não é lugar
 * para guardar dado de paciente a longo prazo.
 *
 * Toda leitura e escrita é protegida: em aba anônima, com espaço cheio ou
 * com o site bloqueado, o navegador recusa e o cadastro segue normalmente,
 * só sem rascunho.
 */

const PREFIXO = 'clinica:rascunho:';
const VALIDADE_HORAS = 24;

export function salvarRascunho(chave: string, dados: unknown) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify({ em: Date.now(), dados }));
  } catch {
    /* sem rascunho é melhor do que travar o cadastro */
  }
}

export function lerRascunho<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (!bruto) return null;
    const { em, dados } = JSON.parse(bruto) as { em: number; dados: T };
    if (!em || Date.now() - em > VALIDADE_HORAS * 3600_000) {
      limparRascunho(chave);
      return null;
    }
    return dados;
  } catch {
    return null;
  }
}

export function limparRascunho(chave: string) {
  try {
    localStorage.removeItem(PREFIXO + chave);
  } catch {
    /* idem */
  }
}

/** Quando foi guardado, em texto curto: "há 5 minutos", "ontem às 14:30". */
export function quandoFoiGuardado(chave: string): string {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (!bruto) return '';
    const { em } = JSON.parse(bruto) as { em: number };
    const min = Math.round((Date.now() - em) / 60000);
    if (min < 1) return 'agora há pouco';
    if (min < 60) return `há ${min} minuto${min > 1 ? 's' : ''}`;
    const d = new Date(em);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const hoje = new Date().toDateString() === d.toDateString();
    return hoje ? `hoje às ${hora}` : `ontem às ${hora}`;
  } catch {
    return '';
  }
}

/**
 * Avisa antes de fechar a aba ou recarregar com cadastro pela metade.
 *
 * Só funciona para sair do site; trocar de aba dentro do app é tratado
 * pelo rascunho, que devolve o que foi digitado.
 */
export function useAvisoDeSaida(temCoisaNaoSalva: boolean) {
  useEffect(() => {
    if (!temCoisaNaoSalva) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [temCoisaNaoSalva]);
}
