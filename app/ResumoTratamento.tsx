'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Paciente {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
}

interface Sessao { data: string; tipo: string; profissional?: string | null; status: string }
interface Aplicacao { created_at: string; nome_produto: string; quantidade: number }
interface Pagamento { data: string; valor: number; forma: string; descricao?: string | null }
interface Pesagem { data: string; peso: number }

const ROTULO_TIPO: Record<string, string> = {
  consulta_nova: 'Consulta nova',
  retorno: 'Retorno',
  implante: 'Implante',
  bioestimulador: 'Aplicação de bioestimulador',
  medicacao: 'Medicação',
  intradermo: 'Intradermoterapia capilar',
  estetica: 'Estética',
  fisioterapia: 'Fisioterapia',
  bodyshape: 'BodyShape',
  outros: 'Outros',
};

const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data do banco vira dia daqui. Nunca usar toISOString nisso. */
const dia = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');

/**
 * Resumo do tratamento, para entregar ao paciente.
 *
 * É documento comercial, não prontuário: traz as sessões, o que foi
 * aplicado e quanto foi pago. O prontuário clínico continua separado de
 * propósito — se um dia precisar ir para outro médico ou convênio, não
 * leva valores junto.
 *
 * Os valores vêm da aba Pagamentos, que é o que o paciente pagou de
 * verdade. O custo dos produtos não entra: é informação interna.
 */
export default function ResumoTratamento({
  paciente,
  onFechar,
}: {
  paciente: Paciente;
  onFechar: () => void;
}) {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [aplicacoes, setAplicacoes] = useState<Aplicacao[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [pesagens, setPesagens] = useState<Pesagem[]>([]);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    setCarregando(true);
    const [ag, co, pg, pe] = await Promise.all([
      supabase.from('agendamentos').select('data,tipo,profissional,status')
        .eq('paciente_id', paciente.id)
        .in('status', ['compareceu', 'confirmado', 'agendado'])
        .order('data'),
      supabase.from('consumos_paciente').select('created_at,nome_produto,quantidade')
        .eq('paciente_id', paciente.id).order('created_at'),
      supabase.from('pagamentos').select('data,valor,forma,descricao')
        .eq('paciente_id', paciente.id).order('data'),
      supabase.from('pesagens').select('data,peso')
        .eq('paciente_id', paciente.id).order('data'),
    ]);
    setSessoes((ag.data as Sessao[] | null) ?? []);
    setAplicacoes((co.data as Aplicacao[] | null) ?? []);
    setPagamentos((pg.data as Pagamento[] | null) ?? []);
    setPesagens((pe.data as Pesagem[] | null) ?? []);
    setCarregando(false);
  }, [paciente.id]);

  useEffect(() => { buscar(); }, [buscar]);

  const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0);

  // Agrupa aplicações iguais: "B12 — 12x" lê melhor que doze linhas iguais.
  const porProduto = new Map<string, number>();
  for (const a of aplicacoes) {
    const nome = a.nome_produto.trim();
    porProduto.set(nome, (porProduto.get(nome) ?? 0) + Number(a.quantidade));
  }

  const feitas = sessoes.filter((s) => s.status === 'compareceu');
  const marcadas = sessoes.filter((s) => s.status !== 'compareceu');

  const datas = [
    ...sessoes.map((s) => s.data),
    ...aplicacoes.map((a) => a.created_at.slice(0, 10)),
  ].sort();
  const periodo = datas.length > 0 ? dia(datas[0]) + ' a ' + dia(datas[datas.length - 1]) : '—';

  const pesoInicial = pesagens[0];
  const pesoFinal = pesagens[pesagens.length - 1];
  const variacao =
    pesoInicial && pesoFinal && pesagens.length > 1
      ? Number(pesoFinal.peso) - Number(pesoInicial.peso)
      : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto p-4 print:static print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl print:shadow-none print:rounded-none print:max-w-none">
        <div className="px-6 py-4 border-b border-amber-200 flex items-center justify-between gap-3 print:hidden">
          <h2 className="font-serif font-bold text-amber-950">Resumo do tratamento</h2>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="text-xs bg-amber-800 hover:bg-amber-900 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              🖨️ Imprimir / PDF
            </button>
            <button
              onClick={onFechar}
              className="text-xs border border-amber-200 text-amber-900 hover:bg-amber-50 font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>

        {carregando ? (
          <p className="px-6 py-10 text-center text-sm text-amber-800/60">Carregando…</p>
        ) : (
          <div className="px-6 py-6 space-y-5 text-amber-950">
            <header className="text-center border-b border-amber-200 pb-4">
              <h1 className="font-serif font-bold text-xl">Dra. Bruna Oliveira</h1>
              <p className="text-[11px] uppercase tracking-wider text-amber-800/80">
                Medicina do Esporte • CRM-MG 76958
              </p>
            </header>

            <section>
              <h2 className="font-serif font-bold text-base">{paciente.nome.trim()}</h2>
              <p className="text-xs text-amber-900/80">
                {paciente.cpf ? 'CPF ' + paciente.cpf : 'CPF não informado'}
                {paciente.telefone ? ' • ' + paciente.telefone : ''}
              </p>
              <p className="text-xs text-amber-900/80 mt-0.5">Período: {periodo}</p>
            </section>

            <section className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-amber-50 border border-amber-200 rounded-lg py-2.5">
                <p className="text-lg font-bold">{feitas.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-amber-800/80">sessões feitas</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg py-2.5">
                <p className="text-lg font-bold">{aplicacoes.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-amber-800/80">aplicações</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg py-2.5">
                <p className="text-lg font-bold">{dinheiro(totalPago)}</p>
                <p className="text-[10px] uppercase tracking-wide text-amber-800/80">total pago</p>
              </div>
            </section>

            {variacao !== null && (
              <section className="bg-amber-50/60 border border-amber-200 rounded-lg px-4 py-2.5">
                <p className="text-xs">
                  <strong>Peso:</strong> {Number(pesoInicial.peso).toFixed(1)} kg em{' '}
                  {dia(pesoInicial.data)} → {Number(pesoFinal.peso).toFixed(1)} kg em{' '}
                  {dia(pesoFinal.data)}
                  <strong className={variacao < 0 ? 'text-emerald-700' : 'text-amber-800'}>
                    {' '}
                    ({variacao > 0 ? '+' : ''}
                    {variacao.toFixed(1)} kg)
                  </strong>
                </p>
              </section>
            )}

            {porProduto.size > 0 && (
              <section>
                <h3 className="font-serif font-bold text-sm mb-1.5">Medicações e materiais aplicados</h3>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-amber-100">
                    {[...porProduto.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([nome, qtd]) => (
                        <tr key={nome}>
                          <td className="py-1.5">{nome}</td>
                          <td className="py-1.5 text-right tabular-nums font-semibold w-16">{qtd}×</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </section>
            )}

            {feitas.length > 0 && (
              <section>
                <h3 className="font-serif font-bold text-sm mb-1.5">Sessões realizadas</h3>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-amber-100">
                    {feitas.map((s, i) => (
                      <tr key={i}>
                        <td className="py-1.5 w-24 tabular-nums">{dia(s.data)}</td>
                        <td className="py-1.5">{ROTULO_TIPO[s.tipo] ?? s.tipo}</td>
                        <td className="py-1.5 text-right text-amber-800/70">{s.profissional ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {pagamentos.length > 0 && (
              <section>
                <h3 className="font-serif font-bold text-sm mb-1.5">Pagamentos</h3>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-amber-100">
                    {pagamentos.map((p, i) => (
                      <tr key={i}>
                        <td className="py-1.5 w-24 tabular-nums">{dia(p.data)}</td>
                        <td className="py-1.5">
                          {p.descricao?.trim() || p.forma}
                          {p.descricao?.trim() && (
                            <span className="text-amber-800/60"> · {p.forma}</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-semibold">
                          {dinheiro(Number(p.valor))}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold border-t-2 border-amber-300">
                      <td className="py-1.5" colSpan={2}>
                        Total pago
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{dinheiro(totalPago)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            )}

            {marcadas.length > 0 && (
              <section>
                <h3 className="font-serif font-bold text-sm mb-1.5">Próximas sessões marcadas</h3>
                <ul className="text-xs space-y-0.5">
                  {marcadas.map((s, i) => (
                    <li key={i}>
                      {dia(s.data)} — {ROTULO_TIPO[s.tipo] ?? s.tipo}
                      {s.profissional ? ' · ' + s.profissional : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="border-t border-amber-200 pt-3 text-center">
              <p className="text-[10px] text-amber-800/60">
                Documento informativo emitido em {new Date().toLocaleDateString('pt-BR')}. Não
                substitui o prontuário clínico.
              </p>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
