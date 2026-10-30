'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Rascunho de formulário, guardado no próprio aparelho.
 *
 * Existe porque sair do app no meio de um cadastro apagava tudo e a
 * equipe tinha que redigitar. O rascunho fica só neste aparelho, some
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
 * Guarda o que está sendo digitado e devolve quando a pessoa volta.
 *
 * Três momentos salvam:
 *  - enquanto digita, com uma pausa curta para não escrever a cada tecla;
 *  - quando o app sai da frente (trocar de aplicativo no celular, bloquear
 *    a tela, mudar de aba) — este é o que mais importa, porque no celular
 *    o navegador descarta a página sem avisar e o beforeunload não chega;
 *  - ao fechar a aba, junto com o aviso de "tem coisa não salva".
 *
 * @param chave        nome do rascunho, único por formulário
 * @param valores      o que está digitado agora
 * @param ativo        o formulário está aberto
 * @param temConteudo  já foi digitado algo que valha a pena guardar
 */
export function useRascunho<T>(
  chave: string,
  valores: T,
  ativo: boolean,
  temConteudo: boolean
) {
  const [disponivel, setDisponivel] = useState('');
  // O valor mais recente, para salvar na saída sem reinstalar os ouvintes
  // a cada tecla digitada.
  const atual = useRef(valores);
  useEffect(() => {
    atual.current = valores;
  });

  // Formulário aberto e ainda vazio: oferece o que ficou da última vez.
  useEffect(() => {
    if (!ativo) {
      setDisponivel('');
      return;
    }
    if (temConteudo) return;
    setDisponivel(lerRascunho(chave) ? quandoFoiGuardado(chave) : '');
  }, [ativo, temConteudo, chave]);

  // Enquanto digita.
  const assinatura = JSON.stringify(valores);
  useEffect(() => {
    if (!ativo || !temConteudo) return;
    const id = setTimeout(() => salvarRascunho(chave, atual.current), 500);
    return () => clearTimeout(id);
  }, [ativo, temConteudo, chave, assinatura]);

  // Saindo do app, bloqueando a tela, trocando de aba.
  useEffect(() => {
    if (!ativo || !temConteudo) return;

    const guardar = () => salvarRascunho(chave, atual.current);
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') guardar();
    };
    const aoFechar = (e: BeforeUnloadEvent) => {
      guardar();
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', guardar);
    window.addEventListener('beforeunload', aoFechar);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', guardar);
      window.removeEventListener('beforeunload', aoFechar);
    };
  }, [ativo, temConteudo, chave]);

  return {
    /** Texto de quando foi guardado, ou vazio se não há rascunho a oferecer. */
    disponivel,
    /** Devolve o que foi guardado, para o formulário preencher os campos. */
    recuperar: () => {
      const r = lerRascunho<T>(chave);
      setDisponivel('');
      return r;
    },
    /** A pessoa não quer o rascunho. */
    descartar: () => {
      limparRascunho(chave);
      setDisponivel('');
    },
    /** Salvou de verdade: o rascunho não serve para mais nada. */
    concluir: () => {
      limparRascunho(chave);
      setDisponivel('');
    },
  };
}

/** Mantido para quem já usa: avisa antes de fechar a aba. */
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
