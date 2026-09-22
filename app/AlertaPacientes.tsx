'use client';

import { useState } from 'react';

/**
 * Aviso do topo (aniversariantes, retornos de amanhã).
 *
 * Fechado, é uma linha só: contagem, os primeiros nomes e um botão.
 * Antes despejava a lista inteira mais um botão por pessoa, o que
 * ocupava a tela toda quando havia muita gente.
 */

export interface PessoaAlerta {
  id: string;
  nome: string;
  telefone?: string;
}

const TONS = {
  amber: {
    caixa: 'bg-amber-100 border-amber-600',
    titulo: 'text-amber-950',
    texto: 'text-amber-900',
    botao: 'bg-amber-700 hover:bg-amber-800',
    abrir: 'text-amber-900 border-amber-300 hover:bg-amber-200/60',
  },
  blue: {
    caixa: 'bg-blue-50 border-blue-600',
    titulo: 'text-blue-950',
    texto: 'text-blue-900',
    botao: 'bg-blue-700 hover:bg-blue-800',
    abrir: 'text-blue-900 border-blue-300 hover:bg-blue-100',
  },
};

export default function AlertaPacientes({
  icone,
  titulo,
  pessoas,
  rotuloBotao,
  mensagem,
  tom = 'amber',
  linkWhatsApp,
}: {
  icone: string;
  titulo: string;
  pessoas: PessoaAlerta[];
  rotuloBotao: string;
  mensagem: (p: PessoaAlerta) => string;
  tom?: keyof typeof TONS;
  linkWhatsApp: (telefone: string | undefined, msg: string) => string;
}) {
  const [aberto, setAberto] = useState(false);
  if (pessoas.length === 0) return null;

  const cor = TONS[tom];
  const primeiros = pessoas.slice(0, 3).map((p) => p.nome.trim().split(' ')[0]);
  const resto = pessoas.length - primeiros.length;

  return (
    <div className={`${cor.caixa} border-l-4 rounded-xl shadow-sm print:hidden`}>
      <div className="p-3 sm:p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl sm:text-2xl flex-shrink-0">{icone}</span>
          <div className="min-w-0">
            <h4 className={`font-serif font-bold ${cor.titulo} text-sm`}>
              {titulo} ({pessoas.length})
            </h4>
            <p className={`text-xs ${cor.texto} truncate`}>
              {primeiros.join(', ')}
              {resto > 0 && ` e mais ${resto}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setAberto(!aberto)}
          className={`flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border bg-white/70 transition-colors ${cor.abrir}`}
        >
          {aberto ? 'Fechar' : rotuloBotao}
        </button>
      </div>

      {aberto && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 flex flex-wrap gap-1.5">
          {pessoas.map((p) => (
            <a
              key={p.id}
              href={linkWhatsApp(p.telefone, mensagem(p))}
              target="_blank"
              rel="noreferrer"
              className={`text-xs ${cor.botao} text-white font-semibold px-3 py-1.5 rounded-lg transition-all`}
            >
              💬 {p.nome.trim().split(' ')[0]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
