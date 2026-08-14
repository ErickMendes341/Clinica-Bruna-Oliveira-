'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  nome: string;
  quantidade: number;
  quantidade_minima: number;
  preco_custo: number;
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const { data, error } = await supabase.from('produtos').select('*');
    if (error) {
      console.error('Erro ao buscar produtos:', error);
    } else if (data) {
      setProducts(data);
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !quantidade || !preco) {
      alert('Preencha todos os campos!');
      return;
    }

    const { error } = await supabase.from('produtos').insert([
      {
        nome,
        quantidade: parseInt(quantidade),
        quantidade_minima: 10,
        preco_custo: parseFloat(preco),
      },
    ]);

    if (error) {
      alert('Erro ao cadastrar produto!');
      console.error(error);
    } else {
      setNome('');
      setQuantidade('');
      setPreco('');
      fetchProducts();
    }
  }

  async function handleBaixa(id: string, quantidadeAtual: number) {
    const qtdStr = prompt('Quantidade que deseja retirar do estoque:');
    if (!qtdStr) return;

    const qtdSaida = parseInt(qtdStr);
    if (isNaN(qtdSaida) || qtdSaida <= 0) {
      alert('Por favor, digite um número válido!');
      return;
    }

    if (qtdSaida > quantidadeAtual) {
      alert('Quantidade de saída é maior do que o estoque disponível!');
      return;
    }

    const novaQuantidade = quantidadeAtual - qtdSaida;

    const { error } = await supabase
      .from('produtos')
      .update({ quantidade: novaQuantidade })
      .eq('id', id);

    if (error) {
      alert('Erro ao dar baixa no produto!');
      console.error(error);
    } else {
      fetchProducts();
    }
  }

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Clínica Médica - Gestão</h1>
          <p className="text-slate-500">Controle de Estoque de Insumos e Finanças</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Cadastrar Insumo</h2>
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nome do Item
              </label>
              <input
                type="text"
                placeholder="Ex: Anestésico, Luvas..."
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Quantidade
              </label>
              <input
                type="number"
                placeholder="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Preço de Custo (R$)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Salvar no Estoque
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Itens em Estoque</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-sm">
                  <th className="py-3 px-2">Nome</th>
                  <th className="py-3 px-2">Quantidade</th>
                  <th className="py-3 px-2">Preço Unitário</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      Nenhum produto cadastrado ainda.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="py-3 px-2 font-medium">{product.nome}</td>
                      <td className="py-3 px-2">{product.quantidade} un.</td>
                      <td className="py-3 px-2">
                        R$ {Number(product.preco_custo || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2">
                        {product.quantidade <= (product.quantidade_minima || 5) ? (
                          <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
                            Estoque Baixo
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => handleBaixa(product.id, product.quantidade)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-xs font-semibold transition-colors"
                        >
                          Dar Baixa
                        </button>
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