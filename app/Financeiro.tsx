'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FORMAS, rotuloForma, reais, dataBR, agrupar, resumoFormas } from './Pagamentos';
import type { ParteDb, Pagamento } from './Pagamentos';
import Despesas, { type Despesa, rotuloCategoria, iconeCategoria } from './Despesas';

/* Produto usado em paciente: sai do estoque e entra como custo no dia. */
interface ProdutoUsado {
  id: string;
  created_at: string;
  nome_produto: string;
  quantidade: number;
  custo_unitario: number | null;
  pacientes?: { nome: string } | null;
}

/* Cada linha do banco vem com o nome do paciente junto. */
interface Linha extends ParteDb {
  pacientes?: { nome: string } | null;
}

interface PagamentoComNome extends Pagamento {
  nome: string;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rotuloMes(ym: string) {
  const [a, m] = ym.split('-');
  return `${MESES[Number(m) - 1]} de ${a}`;
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function somaDias(iso: string, dias: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function porExtenso(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function primeiroDia(ym: string) {
  return `${ym}-01`;
}

function ultimoDia(ym: string) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m, 0); // dia 0 do mês seguinte = último deste
  return `${ym}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Baixa a tabela como planilha. CSV com ; abre direto no Excel em português.
   Uma linha por forma de pagamento: um pagamento dividido vira duas linhas. */
function baixarPlanilha(linhas: Linha[], nomeArquivo: string) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const cab = ['Data', 'Paciente', 'Valor (R$)', 'Forma', 'Descrição'];
  const corpo = linhas.map((l) => [
    dataBR(l.data),
    l.pacientes?.nome ?? '',
    Number(l.valor).toFixed(2).replace('.', ','),
    rotuloForma(l.forma),
    l.descricao ?? '',
  ]);
  const csv = [cab, ...corpo].map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Aba Financeiro                                                      */
/* ------------------------------------------------------------------ */

export default function Financeiro({ onAbrirPaciente }: { onAbrirPaciente?: (id: string) => void }) {
  const [modo, setModo] = useState<'dia' | 'mes' | 'geral'>('dia');
  const [mes, setMes] = useState(mesAtual());
  const [dia, setDia] = useState(hojeISO());
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [usados, setUsados] = useState<ProdutoUsado[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  // Entradas (o que entrou), saídas (o que saiu) ou o resumo dos dois.
  const [lado, setLado] = useState<'entradas' | 'saidas' | 'resumo'>('entradas');
  const [busca, setBusca] = useState('');
  const [visao, setVisao] = useState<'lancamentos' | 'por_paciente'>('lancamentos');

  const carregar = useCallback(async () => {
    setCarregando(true);
    let q = supabase
      .from('pagamentos')
      .select('id,paciente_id,grupo_id,valor,forma,descricao,data,created_at,pacientes(nome)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });
    // Mesmo intervalo para tudo: o que entrou, o que foi usado e o que se gastou.
    const de = modo === 'dia' ? dia : modo === 'mes' ? primeiroDia(mes) : null;
    const ate = modo === 'dia' ? dia : modo === 'mes' ? ultimoDia(mes) : null;

    if (de && ate) q = q.gte('data', de).lte('data', ate);

    let qUsados = supabase
      .from('consumos_paciente')
      .select('id,created_at,nome_produto,quantidade,custo_unitario,pacientes(nome)')
      .order('created_at', { ascending: false });
    if (de && ate) qUsados = qUsados.gte('created_at', de + 'T00:00:00').lte('created_at', ate + 'T23:59:59');

    let qDespesas = supabase.from('despesas').select('*').order('data', { ascending: false });
    if (de && ate) qDespesas = qDespesas.gte('data', de).lte('data', ate);

    const [{ data }, { data: du }, { data: dd }] = await Promise.all([q, qUsados, qDespesas]);
    setLinhas(((data as unknown as Linha[]) || []).map((l) => ({ ...l, valor: Number(l.valor) })));
    setUsados(((du as unknown as ProdutoUsado[]) || []).map((u) => ({ ...u, custo_unitario: Number(u.custo_unitario ?? 0) })));
    setDespesas(((dd as unknown as Despesa[]) || []).map((d) => ({ ...d, valor: Number(d.valor) })));
    setCarregando(false);
  }, [modo, mes, dia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function mudarMes(delta: number) {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const filtradas = busca.trim()
    ? linhas.filter((l) => (l.pacientes?.nome ?? '').toLowerCase().includes(busca.toLowerCase()))
    : linhas;

  const total = filtradas.reduce((s, l) => s + l.valor, 0);

  // Por forma soma as partes: R$100 dinheiro + R$250 pix contam em cada uma.
  const porForma = FORMAS.map((f) => ({
    ...f,
    total: filtradas.filter((l) => l.forma === f.id).reduce((s, l) => s + l.valor, 0),
  })).filter((f) => f.total > 0);

  // Lançamentos mostram o pagamento inteiro, com as partes resumidas na coluna Forma.
  const nomes = new Map(filtradas.map((l) => [l.paciente_id, l.pacientes?.nome ?? 'Paciente']));
  const pagamentos: PagamentoComNome[] = agrupar(filtradas).map((p) => ({
    ...p,
    nome: nomes.get(p.paciente_id) ?? 'Paciente',
  }));

  // Agrupa por paciente para a visão "por paciente"
  const porPaciente = Object.values(
    pagamentos.reduce<Record<string, { id: string; nome: string; total: number; qtd: number; ultimo: string }>>((acc, p) => {
      const k = p.paciente_id;
      if (!acc[k]) acc[k] = { id: k, nome: p.nome, total: 0, qtd: 0, ultimo: p.data };
      acc[k].total += p.total;
      acc[k].qtd += 1;
      if (p.data > acc[k].ultimo) acc[k].ultimo = p.data;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  // Saídas: o que foi usado em paciente (pelo custo) e os gastos lançados.
  const custoProdutos = usados.reduce((s, u) => s + u.quantidade * (u.custo_unitario ?? 0), 0);
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const totalSaidas = custoProdutos + totalDespesas;
  const lucro = total - totalSaidas;

  const porCategoria = Object.values(
    despesas.reduce<Record<string, { categoria: string; total: number }>>((acc, d) => {
      if (!acc[d.categoria]) acc[d.categoria] = { categoria: d.categoria, total: 0 };
      acc[d.categoria].total += d.valor;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const titulo =
    modo === 'dia'
      ? dia === hojeISO()
        ? 'Hoje'
        : porExtenso(dia).replace(/^\w/, (c) => c.toUpperCase())
      : modo === 'mes'
        ? rotuloMes(mes)
        : 'Todos os pagamentos';
  const nomeArquivo =
    modo === 'dia' ? `pagamentos-${dia}.csv` : modo === 'mes' ? `pagamentos-${mes}.csv` : 'pagamentos-geral.csv';

  return (
    <div className="space-y-6">
      {/* ---------- Cabeçalho / filtros ---------- */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-serif font-bold text-amber-950">💰 Financeiro</h2>
            <p className="text-xs text-amber-900/70 mt-0.5">Pagamentos registrados nas fichas dos pacientes.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex space-x-1 bg-amber-50 p-1 rounded-xl border border-amber-200/50">
              <button
                onClick={() => setModo('dia')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${modo === 'dia' ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900'}`}
              >
                Do dia
              </button>
              <button
                onClick={() => setModo('mes')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${modo === 'mes' ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900'}`}
              >
                Mensal
              </button>
              <button
                onClick={() => setModo('geral')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${modo === 'geral' ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900'}`}
              >
                Geral
              </button>
            </div>

            {modo === 'dia' && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/50 rounded-xl px-1 py-1">
                <button
                  onClick={() => setDia(somaDias(dia, -1))}
                  title="Dia anterior"
                  className="w-8 h-8 rounded-lg hover:bg-amber-100 text-amber-900 font-bold"
                >
                  ‹
                </button>
                <input
                  type="date"
                  value={dia}
                  onChange={(e) => e.target.value && setDia(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-amber-950 outline-none px-1"
                />
                <button
                  onClick={() => setDia(somaDias(dia, 1))}
                  title="Próximo dia"
                  className="w-8 h-8 rounded-lg hover:bg-amber-100 text-amber-900 font-bold"
                >
                  ›
                </button>
                {dia !== hojeISO() && (
                  <button
                    onClick={() => setDia(hojeISO())}
                    className="text-[11px] font-semibold text-amber-800 hover:underline px-2"
                  >
                    hoje
                  </button>
                )}
              </div>
            )}

            {modo === 'mes' && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/50 rounded-xl px-1 py-1">
                <button onClick={() => mudarMes(-1)} className="w-8 h-8 rounded-lg hover:bg-amber-100 text-amber-900 font-bold">‹</button>
                <input
                  type="month"
                  value={mes}
                  onChange={(e) => e.target.value && setMes(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-amber-950 outline-none px-1"
                />
                <button onClick={() => mudarMes(1)} className="w-8 h-8 rounded-lg hover:bg-amber-100 text-amber-900 font-bold">›</button>
              </div>
            )}

            <button
              onClick={() => baixarPlanilha(filtradas, nomeArquivo)}
              disabled={filtradas.length === 0}
              className="text-xs bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl shadow transition-all"
            >
              📥 Baixar planilha
            </button>
          </div>
        </div>

        {/* ---------- Entrou, saiu, sobrou ---------- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setLado('entradas')}
            className={`text-left bg-emerald-50 border rounded-xl p-4 transition-all ${lado === 'entradas' ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-emerald-200 hover:border-emerald-400'}`}
          >
            <p className="text-[11px] font-semibold text-emerald-900/70 uppercase tracking-wide">Entrou · {titulo}</p>
            <p className="text-2xl font-serif font-bold text-emerald-900 mt-1">{reais(total)}</p>
            <p className="text-[11px] text-emerald-900/60 mt-0.5">
              {pagamentos.length} {pagamentos.length === 1 ? 'pagamento' : 'pagamentos'}
            </p>
          </button>

          <button
            onClick={() => setLado('saidas')}
            className={`text-left bg-red-50 border rounded-xl p-4 transition-all ${lado === 'saidas' ? 'border-red-500 ring-2 ring-red-500/30' : 'border-red-200 hover:border-red-400'}`}
          >
            <p className="text-[11px] font-semibold text-red-900/70 uppercase tracking-wide">Saiu</p>
            <p className="text-2xl font-serif font-bold text-red-900 mt-1">{reais(totalSaidas)}</p>
            <p className="text-[11px] text-red-900/60 mt-0.5">
              {usados.length} item(ns) usado(s) · {despesas.length} gasto(s)
            </p>
          </button>

          <button
            onClick={() => setLado('resumo')}
            className={`text-left rounded-xl p-4 border transition-all ${
              lucro >= 0
                ? lado === 'resumo' ? 'bg-amber-50 border-amber-600 ring-2 ring-amber-600/30' : 'bg-amber-50 border-amber-300 hover:border-amber-500'
                : lado === 'resumo' ? 'bg-red-100 border-red-600 ring-2 ring-red-600/30' : 'bg-red-100 border-red-300 hover:border-red-500'
            }`}
          >
            <p className="text-[11px] font-semibold text-amber-900/70 uppercase tracking-wide">
              {lucro >= 0 ? 'Sobrou' : 'Faltou'}
            </p>
            <p className={`text-2xl font-serif font-bold mt-1 ${lucro >= 0 ? 'text-amber-900' : 'text-red-900'}`}>
              {reais(Math.abs(lucro))}
            </p>
            <p className="text-[11px] text-amber-900/60 mt-0.5">
              {total > 0 ? `${Math.round((lucro / total) * 100)}% do que entrou` : 'sem entradas no período'}
            </p>
          </button>
        </div>

        {lado === 'entradas' && porForma.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {porForma.map((f) => (
              <span key={f.id} className="text-xs bg-amber-50/60 border border-amber-200/60 rounded-lg px-3 py-1.5">
                <span className="text-amber-900/70">{f.label}: </span>
                <strong className="text-amber-950">{reais(f.total)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Saídas: produtos usados e gastos ---------- */}
      {lado === 'saidas' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-amber-100">
              <h3 className="font-serif font-bold text-amber-950 text-base">
                💉 Produtos usados em pacientes{' '}
                <span className="text-amber-700/70 font-sans text-sm">({usados.length})</span>
              </h3>
              <p className="text-xs text-amber-900/70 mt-0.5">
                Entra sozinho quando alguém aplica um item na ficha, pelo preço de custo do produto.
              </p>
            </div>
            {carregando ? (
              <p className="px-5 py-4 text-xs text-amber-800/60">Carregando…</p>
            ) : usados.length === 0 ? (
              <p className="px-5 py-4 text-xs text-amber-800/70">Nenhum produto usado neste período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-amber-50/50 text-amber-950 font-serif text-xs">
                    <tr>
                      <th className="py-2 px-4">Data</th>
                      <th className="py-2 px-4">Paciente</th>
                      <th className="py-2 px-4">Produto</th>
                      <th className="py-2 px-4">Qtd</th>
                      <th className="py-2 px-4">Custo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {usados.map((u) => (
                      <tr key={u.id} className="hover:bg-amber-50/30">
                        <td className="py-2 px-4 text-xs text-amber-800 tabular-nums">
                          {new Date(u.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-2 px-4 text-amber-950">{u.pacientes?.nome?.trim() ?? '—'}</td>
                        <td className="py-2 px-4 text-xs text-amber-900">{u.nome_produto}</td>
                        <td className="py-2 px-4 text-xs text-amber-900 tabular-nums">{u.quantidade}</td>
                        <td className="py-2 px-4 font-semibold text-red-800 tabular-nums">
                          {reais(u.quantidade * (u.custo_unitario ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-amber-200">
                    <tr>
                      <td className="py-3 px-4 text-xs font-bold text-amber-950" colSpan={4}>
                        Total em produtos usados
                      </td>
                      <td className="py-3 px-4 font-bold text-red-900 tabular-nums">{reais(custoProdutos)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <Despesas
            despesas={despesas}
            carregando={carregando}
            onMudou={carregar}
            dataSugerida={modo === 'dia' ? dia : undefined}
          />
        </div>
      )}

      {/* ---------- Resumo: entrou x saiu ---------- */}
      {lado === 'resumo' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60 space-y-4">
          <h3 className="font-serif font-bold text-amber-950 text-base">📊 Resumo · {titulo}</h3>

          <div className="space-y-2">
            <LinhaResumo rotulo="Entrou (pagamentos de pacientes)" valor={total} tom="bom" />
            <LinhaResumo rotulo="Produtos usados em pacientes" valor={-custoProdutos} tom="ruim" />
            <LinhaResumo rotulo="Outros gastos da clínica" valor={-totalDespesas} tom="ruim" />
            <div className="border-t-2 border-amber-300 pt-2">
              <LinhaResumo rotulo={lucro >= 0 ? 'Sobrou' : 'Faltou'} valor={lucro} tom={lucro >= 0 ? 'bom' : 'ruim'} forte />
            </div>
          </div>

          {porCategoria.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-amber-900 mb-2">Gastos por categoria</p>
              <div className="space-y-1.5">
                {porCategoria.map((c) => (
                  <div key={c.categoria} className="flex items-center gap-3">
                    <span className="text-xs text-amber-900 w-48 flex-shrink-0 truncate">
                      {iconeCategoria(c.categoria)} {rotuloCategoria(c.categoria)}
                    </span>
                    <div className="flex-1 h-2.5 bg-amber-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-700/70 rounded-full"
                        style={{ width: `${totalDespesas > 0 ? (c.total / totalDespesas) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-red-900 tabular-nums w-24 text-right flex-shrink-0">
                      {reais(c.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-amber-900/60 leading-relaxed pt-2 border-t border-amber-100">
            O custo do produto entra no dia em que foi usado no paciente. Por isso, não lance também a
            compra desses produtos em &ldquo;outros gastos&rdquo; — contaria duas vezes.
          </p>
        </div>
      )}

      {/* ---------- Tabela ---------- */}
      {lado === 'entradas' && (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-amber-100 pb-4">
          <div className="flex space-x-1 bg-amber-50 p-1 rounded-xl border border-amber-200/50">
            <button
              onClick={() => setVisao('lancamentos')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${visao === 'lancamentos' ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900'}`}
            >
              Lançamentos
            </button>
            <button
              onClick={() => setVisao('por_paciente')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${visao === 'por_paciente' ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900'}`}
            >
              Por paciente
            </button>
          </div>
          <input
            type="text"
            placeholder="🔍 Filtrar por nome do paciente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full md:w-72 px-3 py-2 border border-amber-200 rounded-lg text-xs outline-none"
          />
        </div>

        {carregando ? (
          <p className="text-xs text-amber-800/60 py-4">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="text-xs text-amber-800/70 py-4">
            Nenhum pagamento{' '}
            {modo === 'dia'
              ? `em ${new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR')}`
              : modo === 'mes'
                ? `em ${rotuloMes(mes).toLowerCase()}`
                : 'registrado'}.
            {' '}Registre pela ficha do paciente, na seção 💳 Pagamentos.
          </p>
        ) : visao === 'lancamentos' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-amber-50/50 text-amber-950 font-serif text-xs">
                <tr>
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Paciente</th>
                  <th className="py-3 px-3">Valor</th>
                  <th className="py-3 px-3">Forma</th>
                  <th className="py-3 px-3">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {pagamentos.map((p) => (
                  <tr key={p.grupo_id} className="hover:bg-amber-50/30">
                    <td className="py-2.5 px-3 text-xs text-amber-800 tabular-nums">{dataBR(p.data)}</td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => onAbrirPaciente?.(p.paciente_id)}
                        className="font-medium text-amber-950 hover:underline text-left"
                      >
                        {p.nome}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-800 tabular-nums">{reais(p.total)}</td>
                    <td className="py-2.5 px-3 text-xs text-amber-900">{resumoFormas(p)}</td>
                    <td className="py-2.5 px-3 text-xs text-amber-900/80">{p.descricao || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-amber-200">
                <tr>
                  <td className="py-3 px-3 text-xs font-bold text-amber-950" colSpan={2}>Total</td>
                  <td className="py-3 px-3 font-bold text-emerald-900 tabular-nums">{reais(total)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-amber-50/50 text-amber-950 font-serif text-xs">
                <tr>
                  <th className="py-3 px-3">Paciente</th>
                  <th className="py-3 px-3">Pagamentos</th>
                  <th className="py-3 px-3">Último</th>
                  <th className="py-3 px-3">Total pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {porPaciente.map((p) => (
                  <tr key={p.id} className="hover:bg-amber-50/30">
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => onAbrirPaciente?.(p.id)}
                        className="font-medium text-amber-950 hover:underline text-left"
                      >
                        {p.nome}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-amber-900 tabular-nums">{p.qtd}</td>
                    <td className="py-2.5 px-3 text-xs text-amber-800 tabular-nums">{dataBR(p.ultimo)}</td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-800 tabular-nums">{reais(p.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-amber-200">
                <tr>
                  <td className="py-3 px-3 text-xs font-bold text-amber-950" colSpan={3}>Total</td>
                  <td className="py-3 px-3 font-bold text-emerald-900 tabular-nums">{reais(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

/* Uma linha do resumo: rótulo à esquerda, valor à direita. */
function LinhaResumo({
  rotulo,
  valor,
  tom,
  forte,
}: {
  rotulo: string;
  valor: number;
  tom: 'bom' | 'ruim';
  forte?: boolean;
}) {
  const cor = tom === 'bom' ? 'text-emerald-800' : 'text-red-800';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${forte ? 'text-sm font-bold text-amber-950' : 'text-sm text-amber-900'}`}>{rotulo}</span>
      <span className={`tabular-nums ${forte ? 'text-xl font-serif font-bold' : 'font-semibold'} ${cor}`}>
        {valor < 0 ? '−' : ''}{reais(Math.abs(valor))}
      </span>
    </div>
  );
}
