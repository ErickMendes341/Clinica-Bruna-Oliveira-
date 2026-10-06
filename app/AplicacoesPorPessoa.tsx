'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Linha {
  quem: string;
  aplicacoes: number;
  itens: number;
  pacientes: number;
  primeiro_dia: string;
  ultimo_dia: string;
}

/** Primeiro e último dia do mês de uma data, no fuso daqui. */
function limitesDoMes(ano: number, mes: number) {
  const ini = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { de: iso(ini), ate: iso(fim) };
}

/**
 * Quantas aplicações cada pessoa fez no mês.
 *
 * Serve para fechar o pagamento por aplicação. Conta o que foi escolhido
 * no campo "Quem está aplicando" da ficha — o que foi lançado antes desse
 * campo existir aparece como "não informado", e não dá para dividir
 * depois.
 */
export default function AplicacoesPorPessoa() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  const buscar = useCallback(async () => {
    setCarregando(true);
    const { de, ate } = limitesDoMes(ano, mes);
    const { data } = await supabase.rpc('aplicacoes_por_pessoa', { p_de: de, p_ate: ate });
    setLinhas((data as Linha[] | null) ?? []);
    setCarregando(false);
  }, [ano, mes]);

  useEffect(() => {
    if (aberto) buscar();
  }, [aberto, buscar]);

  const nomeDoMes = new Date(ano, mes, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  function mudarMes(passo: number) {
    const d = new Date(ano, mes + passo, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  const totalAplicacoes = linhas.reduce((s, l) => s + Number(l.aplicacoes), 0);
  const semNome = linhas.find((l) => l.quem === 'nao informado');

  return (
    <div className="bg-white border border-amber-200/80 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-amber-50/50 transition-colors text-left"
      >
        <h3 className="font-serif font-bold text-amber-950 text-sm">
          💉 Aplicações por pessoa
          <span className="ml-2 font-sans text-xs font-normal text-amber-800/70">
            para fechar o pagamento
          </span>
        </h3>
        <span className="text-amber-700 text-xs flex-shrink-0">{aberto ? 'Fechar' : 'Abrir'}</span>
      </button>

      {aberto && (
        <div className="border-t border-amber-100">
          <div className="px-5 py-3 flex items-center justify-between gap-2 bg-amber-50/40">
            <button
              type="button"
              onClick={() => mudarMes(-1)}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-amber-200 text-amber-900 hover:bg-amber-100 transition-colors"
            >
              ←
            </button>
            <p className="font-serif font-bold text-amber-950 text-sm capitalize">{nomeDoMes}</p>
            <button
              type="button"
              onClick={() => mudarMes(1)}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-amber-200 text-amber-900 hover:bg-amber-100 transition-colors"
            >
              →
            </button>
          </div>

          {carregando ? (
            <p className="px-5 py-6 text-xs text-amber-800/60 text-center">Carregando…</p>
          ) : linhas.length === 0 ? (
            <p className="px-5 py-6 text-xs text-amber-800/60 text-center">
              Nenhuma aplicação neste mês.
            </p>
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-100/50 text-amber-950 border-y border-amber-200/80 font-serif text-xs">
                  <tr>
                    <th className="py-2 px-5">Quem aplicou</th>
                    <th className="py-2 px-3 text-right">Aplicações</th>
                    <th className="py-2 px-3 text-right">Itens</th>
                    <th className="py-2 px-5 text-right">Pacientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {linhas.map((l) => (
                    <tr
                      key={l.quem}
                      className={l.quem === 'nao informado' ? 'bg-amber-50/60' : 'hover:bg-amber-50/30'}
                    >
                      <td className="py-2.5 px-5 font-semibold text-amber-950">
                        {l.quem === 'nao informado' ? (
                          <span className="text-amber-800/70 font-normal italic">não informado</span>
                        ) : (
                          l.quem
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-amber-950 tabular-nums">
                        {l.aplicacoes}
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-900 tabular-nums">{l.itens}</td>
                      <td className="py-2.5 px-5 text-right text-amber-900 tabular-nums">
                        {l.pacientes}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-amber-100/40 font-bold">
                    <td className="py-2.5 px-5 text-amber-950">Total</td>
                    <td className="py-2.5 px-3 text-right text-amber-950 tabular-nums">
                      {totalAplicacoes}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>

              {semNome && (
                <p className="px-5 py-3 text-[11px] text-amber-900/70 leading-relaxed border-t border-amber-100">
                  <strong>{semNome.aplicacoes} aplicações sem nome:</strong> foram lançadas antes de
                  existir o campo &quot;Quem está aplicando&quot;, ou alguém deixou em branco. Não dá
                  para dividir isso depois — daqui pra frente o campo é obrigatório.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
