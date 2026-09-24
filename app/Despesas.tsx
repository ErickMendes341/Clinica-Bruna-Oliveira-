'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { reais, dataBR } from './Pagamentos';

/* Gastos da clínica que não são produto usado em paciente: aluguel,
   salários, compra de material, luz, marketing… */

export interface Despesa {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  observacao?: string | null;
}

export const CATEGORIAS_DESPESA = [
  { id: 'produtos', label: 'Compra de produtos', icone: '📦' },
  { id: 'aluguel', label: 'Aluguel', icone: '🏠' },
  { id: 'salarios', label: 'Salários / pró-labore', icone: '👥' },
  { id: 'energia_agua', label: 'Energia, água, internet', icone: '💡' },
  { id: 'marketing', label: 'Marketing', icone: '📣' },
  { id: 'impostos', label: 'Impostos e taxas', icone: '🧾' },
  { id: 'manutencao', label: 'Manutenção e limpeza', icone: '🔧' },
  { id: 'outros', label: 'Outros', icone: '•' },
];

export function rotuloCategoria(id: string) {
  return CATEGORIAS_DESPESA.find((c) => c.id === id)?.label ?? id;
}

export function iconeCategoria(id: string) {
  return CATEGORIAS_DESPESA.find((c) => c.id === id)?.icone ?? '•';
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Despesas({
  despesas,
  carregando,
  onMudou,
  dataSugerida,
}: {
  despesas: Despesa[];
  carregando: boolean;
  onMudou: () => void;
  dataSugerida?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('produtos');
  const [data, setData] = useState(dataSugerida || hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function limpar() {
    setEditandoId(null);
    setDescricao('');
    setValor('');
    setCategoria('produtos');
    setData(dataSugerida || hojeISO());
    setErro('');
    setAberto(false);
  }

  function editar(d: Despesa) {
    setEditandoId(d.id);
    setDescricao(d.descricao);
    setValor(d.valor.toFixed(2).replace('.', ','));
    setCategoria(d.categoria);
    setData(d.data);
    setAberto(true);
    setErro('');
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
    if (!descricao.trim()) return setErro('Escreva do que se trata.');
    if (isNaN(num) || num <= 0) return setErro('Informe o valor. Ex: 1.200 ou 89,90');

    setErro('');
    setSalvando(true);
    const campos = { data, descricao: descricao.trim(), valor: num, categoria };

    let error;
    if (editandoId) {
      ({ error } = await supabase.from('despesas').update(campos).eq('id', editandoId));
    } else {
      const { data: sessao } = await supabase.auth.getUser();
      ({ error } = await supabase.from('despesas').insert([{ ...campos, criado_por: sessao.user?.id ?? null }]));
    }
    setSalvando(false);
    if (error) return setErro(`Não foi possível salvar: ${error.message}`);
    limpar();
    onMudou();
  }

  async function remover(d: Despesa) {
    if (!confirm(`Excluir o gasto "${d.descricao}" de ${reais(d.valor)}?`)) return;
    const { error } = await supabase.from('despesas').delete().eq('id', d.id);
    if (error) return alert(`Não foi possível excluir: ${error.message}`);
    if (editandoId === d.id) limpar();
    onMudou();
  }

  const total = despesas.reduce((s, d) => s + d.valor, 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-200/60 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-amber-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif font-bold text-amber-950 text-base">🧾 Outros gastos da clínica</h3>
          <p className="text-xs text-amber-900/70 mt-0.5">
            Aluguel, salários, compra de material — fora o que já entra como produto usado.
          </p>
        </div>
        <button
          onClick={() => (aberto ? limpar() : setAberto(true))}
          className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-50"
        >
          {aberto ? 'Fechar' : '➕ Lançar gasto'}
        </button>
      </div>

      {aberto && (
        <form onSubmit={salvar} className={`px-5 py-4 space-y-2 ${editandoId ? 'bg-blue-50/60' : 'bg-amber-50/40'}`}>
          {editandoId && <p className="text-xs font-semibold text-blue-900">✏️ Alterando gasto</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Do que se trata — ex: aluguel de setembro"
              className="px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:border-amber-500 bg-white"
            />
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
            >
              {CATEGORIAS_DESPESA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icone} {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Valor — ex: 1.200"
              className="px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:border-amber-500 bg-white"
            />
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
            />
            <button
              type="submit"
              disabled={salvando}
              className={`${editandoId ? 'bg-blue-700 hover:bg-blue-800' : 'bg-amber-800 hover:bg-amber-900'} disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition-colors`}
            >
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alteração' : 'Lançar'}
            </button>
          </div>
          {erro && <p className="text-xs text-red-700 font-semibold">{erro}</p>}
        </form>
      )}

      {carregando ? (
        <p className="px-5 py-4 text-xs text-amber-800/60">Carregando…</p>
      ) : despesas.length === 0 ? (
        <p className="px-5 py-4 text-xs text-amber-800/70">Nenhum gasto lançado neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-amber-50/50 text-amber-950 font-serif text-xs">
              <tr>
                <th className="py-2 px-4">Data</th>
                <th className="py-2 px-4">Descrição</th>
                <th className="py-2 px-4">Categoria</th>
                <th className="py-2 px-4">Valor</th>
                <th className="py-2 px-4 print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {despesas.map((d) => (
                <tr key={d.id} className={editandoId === d.id ? 'bg-blue-50/60' : 'hover:bg-amber-50/30'}>
                  <td className="py-2 px-4 text-xs text-amber-800 tabular-nums">{dataBR(d.data)}</td>
                  <td className="py-2 px-4 text-amber-950">{d.descricao}</td>
                  <td className="py-2 px-4 text-xs text-amber-900">
                    {iconeCategoria(d.categoria)} {rotuloCategoria(d.categoria)}
                  </td>
                  <td className="py-2 px-4 font-semibold text-red-800 tabular-nums">{reais(d.valor)}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap print:hidden">
                    <button
                      onClick={() => editar(d)}
                      title="Editar gasto"
                      className="text-xs bg-amber-100 text-amber-900 hover:bg-amber-200 px-2 py-1 rounded-md mr-1"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => remover(d)}
                      title="Excluir gasto"
                      className="text-xs bg-red-700 hover:bg-red-800 text-white px-2 py-1 rounded-md"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-amber-200">
              <tr>
                <td className="py-3 px-4 text-xs font-bold text-amber-950" colSpan={3}>
                  Total de outros gastos
                </td>
                <td className="py-3 px-4 font-bold text-red-900 tabular-nums">{reais(total)}</td>
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
