'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  nome: string;
  lote?: string;
  quantidade: number;
  quantidade_minima: number;
  preco_custo: number;
  validade?: string;
}

interface Movimentacao {
  id: string;
  nome_produto: string;
  tipo: 'ENTRADA' | 'SAIDA';
  quantidade: number;
  created_at: string;
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  
  // Campos do formulário
  const [nome, setNome] = useState('');
  const [lote, setLote] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('');
  const [validade, setValidade] = useState('');
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  async function fetchData() {
    fetchProducts();
    fetchHistorico();
  }

  async function fetchProducts() {
    const { data, error } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (error) console.error('Erro ao buscar produtos:', error);
    else if (data) setProducts(data);
  }

  async function fetchHistorico() {
    const { data, error } = await supabase
      .from('historico_movimentacoes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) console.error('Erro ao buscar histórico:', error);
    else if (data) setHistorico(data as Movimentacao[]);
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !quantidade || !preco) {
      alert('Preencha pelo menos Nome, Quantidade e Preço!');
      return;
    }

    const { data, error } = await supabase.from('produtos').insert([
      {
        nome,
        lote: lote || null,
        quantidade: parseInt(quantidade),
        quantidade_minima: 10,
        preco_custo: parseFloat(preco),
        validade: validade || null,
      },
    ]).select();

    if (error) {
      alert('Erro ao cadastrar produto!');
      console.error(error);
    } else {
      if (data && data[0]) {
        await registrarMovimentacao(data[0].id, nome, 'ENTRADA', parseInt(quantidade));
      }
      
      setNome('');
      setLote('');
      setQuantidade('');
      setPreco('');
      setValidade('');
      fetchData();
    }
  }

  async function registrarMovimentacao(produto_id: string, nome_produto: string, tipo: 'ENTRADA' | 'SAIDA', cantidad: number) {
    await supabase.from('historico_movimentacoes').insert([
      {
        produto_id,
        nome_produto,
        tipo,
        quantidade: cantidad,
      },
    ]);
  }

  async function handleEntrada(product: Product) {
    const qtdStr = prompt(`Quantidade de '${product.nome}' para ADICIONAR ao estoque:`);
    if (!qtdStr) return;

    const qtdEntrada = parseInt(qtdStr);
    if (isNaN(qtdEntrada) || qtdEntrada <= 0) {
      alert('Por favor, digite um número válido!');
      return;
    }

    const novaQuantidade = product.quantidade + qtdEntrada;

    const { error } = await supabase
      .from('produtos')
      .update({ quantidade: novaQuantidade })
      .eq('id', product.id);

    if (error) {
      alert('Erro ao repor estoque!');
      console.error(error);
    } else {
      await registrarMovimentacao(product.id, product.nome, 'ENTRADA', qtdEntrada);
      fetchData();
    }
  }

  async function handleBaixa(product: Product) {
    const qtdStr = prompt(`Quantidade de '${product.nome}' para DAR BAIXA (retirar):`);
    if (!qtdStr) return;

    const qtdSaida = parseInt(qtdStr);
    if (isNaN(qtdSaida) || qtdSaida <= 0) {
      alert('Por favor, digite um número válido!');
      return;
    }

    if (qtdSaida > product.quantidade) {
      alert('Quantidade de saída é maior do que o estoque disponível!');
      return;
    }

    const novaQuantidade = product.quantidade - qtdSaida;

    const { error } = await supabase
      .from('produtos')
      .update({ quantidade: novaQuantidade })
      .eq('id', product.id);

    if (error) {
      alert('Erro ao dar baixa no produto!');
      console.error(error);
    } else {
      await registrarMovimentacao(product.id, product.nome, 'SAIDA', qtdSaida);
      fetchData();
    }
  }

  const totalItens = products.length;
  const estoqueBaixoCount = products.filter(p => p.quantidade <= (p.quantidade_minima || 10)).length;
  
  const hoje = new Date();
  const em30Dias = new Date();
  em30Dias.setDate(hoje.getDate() + 30);

  const aVencerCount = products.filter(p => {
    if (!p.validade) return false;
    const val = new Date(p.validade);
    return val <= em30Dias;
  }).length;

  const valorTotalEstoque = products.reduce((acc, p) => acc + (p.quantidade * (p.preco_custo || 0)), 0);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Cabeçalho */}
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Clínica Médica - Gestão de Estoque</h1>
          <p className="text-slate-500">Painel Geral e Controle de Validade/Movimentações</p>
        </div>

        {/* CARDS DE RESUMO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Total de Insumos</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalItens}</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Alerta de Estoque Baixo</p>
            <p className={`text-2xl font-bold mt-1 ${estoqueBaixoCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {estoqueBaixoCount} {estoqueBaixoCount > 0 && '⚠️'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Vencidos / A Vencer (30d)</p>
            <p className={`text-2xl font-bold mt-1 ${aVencerCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {aVencerCount} {aVencerCount > 0 && '🚨'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Valor Total do Estoque</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              R$ {valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* FORMULÁRIO DE CADASTRO */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Cadastrar Novo Insumo</h2>
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Item</label>
              <input
                type="text"
                placeholder="Ex: Anestésico..."
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nº do Lote</label>
              <input
                type="text"
                placeholder="Ex: L12345"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Qtd. Inicial</label>
              <input
                type="number"
                placeholder="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preço Custo (R$)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Validade</label>
              <input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Salvar Insumo
              </button>
            </div>
          </form>
        </div>

        {/* TABELA DE ESTOQUE */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Itens em Estoque</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-sm">
                  <th className="py-3 px-2">Nome</th>
                  <th className="py-3 px-2">Lote</th>
                  <th className="py-3 px-2">Quantidade</th>
                  <th className="py-3 px-2">Preço Un.</th>
                  <th className="py-3 px-2">Validade</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-400">
                      Nenhum produto cadastrado.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => {
                    let statusValidade = 'text-slate-600';
                    let textoValidade = product.validade ? new Date(product.validade).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Sem Data';
                    
                    if (product.validade) {
                      const dataVal = new Date(product.validade);
                      if (dataVal < hoje) {
                        statusValidade = 'text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded';
                        textoValidade += ' (VENCIDO)';
                      } else if (dataVal <= em30Dias) {
                        statusValidade = 'text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded';
                        textoValidade += ' (A Vencer)';
                      }
                    }

                    return (
                      <tr key={product.id} className="hover:bg-slate-50">
                        <td className="py-3 px-2 font-medium">{product.nome}</td>
                        <td className="py-3 px-2 text-sm text-slate-500 font-mono">{product.lote || '-'}</td>
                        <td className="py-3 px-2 font-semibold">{product.quantidade} un.</td>
                        <td className="py-3 px-2">
                          R$ {Number(product.preco_custo || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-sm">
                          <span className={statusValidade}>{textoValidade}</span>
                        </td>
                        <td className="py-3 px-2">
                          {product.quantidade <= (product.quantidade_minima || 10) ? (
                            <span className="px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full">
                              Estoque Baixo
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                              Normal
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center space-x-2">
                          <button
                            onClick={() => handleEntrada(product)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-semibold transition-colors"
                          >
                            + Repor
                          </button>
                          <button
                            onClick={() => handleBaixa(product)}
                            className="bg-red-500 hover:bg-red-600 text-white px-2.5 py-1 rounded text-xs font-semibold transition-colors"
                          >
                            - Baixa
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* HISTÓRICO DE MOVIMENTAÇÕES */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Últimas Movimentações (Entradas / Saídas)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-sm">
                  <th className="py-2 px-2">Tipo</th>
                  <th className="py-2 px-2">Produto</th>
                  <th className="py-2 px-2">Quantidade</th>
                  <th className="py-2 px-2">Data / Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
                {historico.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      Nenhuma movimentação registrada ainda.
                    </td>
                  </tr>
                ) : (
                  historico.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 px-2">
                        {m.tipo === 'ENTRADA' ? (
                          <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded">
                            ENTRADA
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-800 rounded">
                            SAÍDA
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-medium">{m.nome_produto}</td>
                      <td className="py-2 px-2">{m.quantidade} un.</td>
                      <td className="py-2 px-2 text-slate-500 text-xs">
                        {new Date(m.created_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}