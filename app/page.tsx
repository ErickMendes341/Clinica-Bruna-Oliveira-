'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  nome: string;
  categoria: string;
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

interface Paciente {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  data_nascimento?: string;
  peso?: number;
  altura?: number;
  endereco?: string;
  observacoes?: string;
}

interface ConsumoPaciente {
  id: string;
  paciente_id: string;
  nome_produto: string;
  quantidade: number;
  created_at: string;
}

const CATEGORIAS = [
  { id: 'todos', label: 'Todos os Itens' },
  { id: 'medicacao', label: 'Medicação' },
  { id: 'insumos', label: 'Insumos' },
  { id: 'descartaveis', label: 'Descartáveis' },
];

export default function Dashboard() {
  const [mainTab, setMainTab] = useState<'estoque' | 'pacientes'>('estoque');
  
  // Estados do Estoque
  const [products, setProducts] = useState<Product[]>([]);
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  const [activeTab, setActiveTab] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Cadastro de Produto
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('medicacao');
  const [lote, setLote] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('');
  const [validade, setValidade] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Estados de Pacientes (Campos Expandidos)
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [nomePaciente, setNomePaciente] = useState('');
  const [cpfPaciente, setCpfPaciente] = useState('');
  const [telPaciente, setTelPaciente] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [endereco, setEndereco] = useState('');
  const [observacoes, setObservacoes] = useState('');
  
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  
  // Estado de Consumo no Paciente
  const [consumos, setConsumos] = useState<ConsumoPaciente[]>([]);
  const [selectedProdutoId, setSelectedProdutoId] = useState('');
  const [qtdConsumo, setQtdConsumo] = useState('1');

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  async function fetchData() {
    fetchProducts();
    fetchHistorico();
    fetchPacientes();
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

  async function fetchPacientes() {
    const { data, error } = await supabase.from('pacientes').select('*').order('nome', { ascending: true });
    if (error) console.error('Erro ao buscar pacientes:', error);
    else if (data) setPacientes(data);
  }

  async function fetchConsumos(pacienteId: string) {
    const { data, error } = await supabase
      .from('consumos_paciente')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    if (error) console.error('Erro ao buscar consumos:', error);
    else if (data) setConsumos(data);
  }

  // --- ESTOQUE HANDLERS ---
  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !quantidade || !preco) return alert('Preencha Nome, Quantidade e Preço!');

    const { data, error } = await supabase.from('produtos').insert([
      { nome, categoria, lote: lote || null, quantidade: parseInt(quantidade), quantidade_minima: 10, preco_custo: parseFloat(preco), validade: validade || null },
    ]).select();

    if (error) {
      alert(`Erro ao cadastrar produto: ${error.message}`);
    } else {
      if (data && data[0]) {
        await registrarMovimentacao(data[0].id, nome, 'ENTRADA', parseInt(quantidade));
      }
      setNome(''); setCategoria('medicacao'); setLote(''); setQuantidade(''); setPreco(''); setValidade('');
      fetchData();
    }
  }

  async function registrarMovimentacao(produto_id: string, nome_produto: string, tipo: 'ENTRADA' | 'SAIDA', cantidad: number) {
    await supabase.from('historico_movimentacoes').insert([{ produto_id, nome_produto, tipo, quantidade: cantidad }]);
  }

  async function handleEntrada(product: Product) {
    const qtdStr = prompt(`Quantidade de '${product.nome}' para ADICIONAR:`);
    if (!qtdStr) return;
    const qtd = parseInt(qtdStr);
    if (isNaN(qtd) || qtd <= 0) return alert('Número inválido!');

    await supabase.from('produtos').update({ quantidade: product.quantidade + qtd }).eq('id', product.id);
    await registrarMovimentacao(product.id, product.nome, 'ENTRADA', qtd);
    fetchData();
  }

  async function handleBaixa(product: Product) {
    const qtdStr = prompt(`Quantidade de '${product.nome}' para RETIRAR:`);
    if (!qtdStr) return;
    const qtd = parseInt(qtdStr);
    if (isNaN(qtd) || qtd <= 0 || qtd > product.quantidade) return alert('Quantidade inválida!');

    await supabase.from('produtos').update({ quantidade: product.quantidade - qtd }).eq('id', product.id);
    await registrarMovimentacao(product.id, product.nome, 'SAIDA', qtd);
    fetchData();
  }

  async function handleDeleteProduct(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"?`)) return;
    await supabase.from('produtos').delete().eq('id', id);
    fetchData();
  }

  // --- PACIENTES HANDLERS ---
  async function handleAddPaciente(e: React.FormEvent) {
    e.preventDefault();
    if (!nomePaciente.trim()) {
      alert('Informe o nome do paciente!');
      return;
    }

    try {
      const { error } = await supabase
        .from('pacientes')
        .insert([
          { 
            nome: nomePaciente, 
            cpf: cpfPaciente || null, 
            telefone: telPaciente || null,
            data_nascimento: dataNascimento || null,
            peso: peso ? parseFloat(peso) : null,
            altura: altura ? parseFloat(altura) : null,
            endereco: endereco || null,
            observacoes: observacoes || null
          }
        ]);

      if (error) {
        alert(`Erro ao cadastrar paciente: ${error.message}`);
      } else {
        alert('Paciente cadastrado com sucesso!');
        setNomePaciente('');
        setCpfPaciente('');
        setTelPaciente('');
        setDataNascimento('');
        setPeso('');
        setAltura('');
        setEndereco('');
        setObservacoes('');
        fetchPacientes();
      }
    } catch (err) {
      console.error('Erro:', err);
      alert('Erro inesperado ao cadastrar paciente.');
    }
  }

  async function openFichaPaciente(p: Paciente) {
    setSelectedPaciente(p);
    fetchConsumos(p.id);
  }

  // Função para calcular a idade
  function calcularIdade(dataNascimentoStr?: string) {
    if (!dataNascimentoStr) return 'Não informada';
    const nascimento = new Date(dataNascimentoStr);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }
    return `${idade} anos`;
  }

  // APLICAR ITEM DE ESTOQUE NO PACIENTE (BAIXA AUTOMÁTICA)
  async function handleUsarItemNoPaciente(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPaciente || !selectedProdutoId) return alert('Selecione um item!');

    const qtd = parseInt(qtdConsumo);
    if (isNaN(qtd) || qtd <= 0) return alert('Quantidade inválida!');

    const produto = products.find(p => p.id === selectedProdutoId);
    if (!produto) return;

    if (qtd > produto.quantidade) {
      return alert(`Estoque insuficiente! Disponível: ${produto.quantidade} un.`);
    }

    // 1. Dar baixa no estoque
    const novaQtd = produto.quantidade - qtd;
    await supabase.from('produtos').update({ quantidade: novaQtd }).eq('id', produto.id);

    // 2. Registrar no histórico geral
    await registrarMovimentacao(produto.id, `${produto.nome} (Paciente: ${selectedPaciente.nome})`, 'SAIDA', qtd);

    // 3. Registrar na ficha do paciente
    await supabase.from('consumos_paciente').insert([
      { paciente_id: selectedPaciente.id, produto_id: produto.id, nome_produto: produto.nome, quantidade: qtd }
    ]);

    setQtdConsumo('1');
    setSelectedProdutoId('');
    fetchData();
    fetchConsumos(selectedPaciente.id);
    alert(`Item lançado na ficha do paciente e baixado do estoque!`);
  }

  const filteredProducts = products.filter((product) => {
    const matchesTab = activeTab === 'todos' || (product.categoria || 'insumos') === activeTab;
    const matchesSearch = product.nome.toLowerCase().includes(searchTerm.toLowerCase()) || (product.lote && product.lote.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* NAVEGAÇÃO PRINCIPAL */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Clínica Médica</h1>
            <p className="text-slate-500">Gestão de Estoque e Ficha do Paciente</p>
          </div>
          <div className="flex space-x-2 bg-slate-200 p-1 rounded-xl">
            <button
              onClick={() => setMainTab('estoque')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${mainTab === 'estoque' ? 'bg-white text-blue-600 shadow' : 'text-slate-600'}`}
            >
              📦 Controle de Estoque
            </button>
            <button
              onClick={() => setMainTab('pacientes')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${mainTab === 'pacientes' ? 'bg-white text-blue-600 shadow' : 'text-slate-600'}`}
            >
              👤 Pacientes & Fichas
            </button>
          </div>
        </div>

        {/* VIEW: CONTROLE DE ESTOQUE */}
        {mainTab === 'estoque' && (
          <>
            {/* FORMULÁRIO DE CADASTRO DE PRODUTO */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Cadastrar Novo Item</h2>
              <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Item</label>
                  <input type="text" placeholder="Ex: Paracetamol..." value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none bg-white">
                    <option value="medicacao">Medicação</option>
                    <option value="insumos">Insumos</option>
                    <option value="descartaveis">Descartáveis</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nº do Lote</label>
                  <input type="text" placeholder="L12345" value={lote} onChange={(e) => setLote(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Qtd. Inicial</label>
                  <input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Preço (R$)</label>
                  <input type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Validade</label>
                  <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none" />
                </div>
                <div className="lg:col-span-7 flex justify-end">
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg">Salvar Cadastro</button>
                </div>
              </form>
            </div>

            {/* TABELA DE ESTOQUE */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b pb-4">
                <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg">
                  {CATEGORIAS.map((cat) => (
                    <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === cat.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="🔍 Pesquisar item..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-72 px-3 py-2 border rounded-lg text-sm outline-none" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b text-slate-600 text-sm">
                      <th className="py-3 px-2">Nome</th>
                      <th className="py-3 px-2">Categoria</th>
                      <th className="py-3 px-2">Quantidade</th>
                      <th className="py-3 px-2">Preço Un.</th>
                      <th className="py-3 px-2">Validade</th>
                      <th className="py-3 px-2 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 px-2 font-medium">{p.nome}</td>
                        <td className="py-3 px-2 text-xs font-semibold">{p.categoria}</td>
                        <td className="py-3 px-2 font-semibold">{p.quantidade} un.</td>
                        <td className="py-3 px-2">R$ {Number(p.preco_custo || 0).toFixed(2)}</td>
                        <td className="py-3 px-2 text-sm">{p.validade ? new Date(p.validade).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</td>
                        <td className="py-3 px-2 text-center space-x-1">
                          <button onClick={() => handleEntrada(p)} className="bg-emerald-600 text-white px-2 py-1 rounded text-xs font-semibold">+ Repor</button>
                          <button onClick={() => handleBaixa(p)} className="bg-amber-600 text-white px-2 py-1 rounded text-xs font-semibold">- Baixa</button>
                          <button onClick={() => handleDeleteProduct(p.id, p.nome)} className="bg-red-600 text-white px-2 py-1 rounded text-xs">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* VIEW: PACIENTES & FICHAS */}
        {mainTab === 'pacientes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* CADASTRO E LISTA DE PACIENTES */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Cadastrar Paciente</h2>
                <form onSubmit={handleAddPaciente} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nome Completo *</label>
                    <input type="text" value={nomePaciente} onChange={(e) => setNomePaciente(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ex: Maria Silva" required />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">CPF</label>
                      <input type="text" value={cpfPaciente} onChange={(e) => setCpfPaciente(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Telefone</label>
                      <input type="text" value={telPaciente} onChange={(e) => setTelPaciente(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="(00) 90000-0000" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Nascimento</label>
                      <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} className="w-full px-2 py-2 border rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Peso (kg)</label>
                      <input type="number" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="70.5" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Altura (m)</label>
                      <input type="number" step="0.01" value={altura} onChange={(e) => setAltura(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="1.75" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Endereço</label>
                    <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Rua, número, bairro..." />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição / Histórico do Paciente</label>
                    <textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" placeholder="Alergias, observações médicas, preferências..."></textarea>
                  </div>

                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors">Cadastrar Paciente</button>
                </form>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-800 mb-3">Lista de Pacientes</h2>
                <div className="divide-y max-h-80 overflow-y-auto">
                  {pacientes.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => openFichaPaciente(p)}
                      className={`p-3 cursor-pointer rounded-lg transition-colors flex items-center justify-between ${selectedPaciente?.id === p.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-slate-50'}`}
                    >
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{p.nome}</p>
                        <p className="text-xs text-slate-500">{p.cpf || 'Sem CPF'} • {calcularIdade(p.data_nascimento)}</p>
                      </div>
                      <span className="text-xs text-blue-600 font-bold">Ver Ficha →</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* FICHA DO PACIENTE SELECIONADO */}
            <div className="lg:col-span-2">
              {selectedPaciente ? (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
                  
                  {/* CABEÇALHO COM DADOS DO PACIENTE */}
                  <div className="border-b pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Ficha Médica</span>
                        <h2 className="text-2xl font-bold text-slate-800 mt-1">{selectedPaciente.nome}</h2>
                      </div>
                      <div className="text-right bg-slate-50 p-2 rounded-lg border text-xs">
                        <span className="text-slate-500 block">Idade</span>
                        <span className="font-bold text-slate-800 text-sm">{calcularIdade(selectedPaciente.data_nascimento)}</span>
                      </div>
                    </div>

                    {/* CARTÕES DE DETALHES DO PACIENTE */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded-lg border">
                        <span className="text-slate-400 block font-semibold">CPF</span>
                        <span className="font-medium text-slate-700">{selectedPaciente.cpf || '-'}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border">
                        <span className="text-slate-400 block font-semibold">Telefone</span>
                        <span className="font-medium text-slate-700">{selectedPaciente.telefone || '-'}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border">
                        <span className="text-slate-400 block font-semibold">Peso / Altura</span>
                        <span className="font-medium text-slate-700">{selectedPaciente.peso ? `${selectedPaciente.peso} kg` : '-'} / {selectedPaciente.altura ? `${selectedPaciente.altura} m` : '-'}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border">
                        <span className="text-slate-400 block font-semibold">Nascimento</span>
                        <span className="font-medium text-slate-700">{selectedPaciente.data_nascimento ? new Date(selectedPaciente.data_nascimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</span>
                      </div>
                    </div>

                    {selectedPaciente.endereco && (
                      <p className="text-xs text-slate-600 mt-3">📍 <strong>Endereço:</strong> {selectedPaciente.endereco}</p>
                    )}

                    {selectedPaciente.observacoes && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                        <strong>📝 Observações / Histórico:</strong>
                        <p className="mt-1 whitespace-pre-wrap">{selectedPaciente.observacoes}</p>
                      </div>
                    )}
                  </div>

                  {/* FORMULÁRIO DE LANÇAMENTO DE MATERIAL/MEDICAÇÃO */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-semibold text-slate-800 text-sm mb-3">💉 Aplicar Item de Estoque no Paciente</h3>
                    <form onSubmit={handleUsarItemNoPaciente} className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <select
                          value={selectedProdutoId}
                          onChange={(e) => setSelectedProdutoId(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                          required
                        >
                          <option value="">Selecione o produto/medicação...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id} disabled={p.quantidade <= 0}>
                              {p.nome} (Estoque: {p.quantidade} un.)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          min="1"
                          value={qtdConsumo}
                          onChange={(e) => setQtdConsumo(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                          placeholder="Qtd"
                          required
                        />
                      </div>

                      <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
                        Dar Baixa & Registrar
                      </button>
                    </form>
                  </div>

                  {/* HISTÓRICO DE CONSUMO DO PACIENTE */}
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm mb-3">📋 Histórico de Itens Utilizados pelo Paciente</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="py-2 px-3">Item Utilizado</th>
                            <th className="py-2 px-3">Quantidade</th>
                            <th className="py-2 px-3">Data / Hora</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {consumos.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-4 text-center text-slate-400">Nenhum item utilizado por este paciente ainda.</td>
                            </tr>
                          ) : (
                            consumos.map((c) => (
                              <tr key={c.id}>
                                <td className="py-2 px-3 font-medium text-slate-800">{c.nome_produto}</td>
                                <td className="py-2 px-3 font-semibold text-slate-700">{c.quantidade} un.</td>
                                <td className="py-2 px-3 text-slate-500 text-xs">{new Date(c.created_at).toLocaleString('pt-BR')}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center text-slate-400">
                  👈 Selecione um paciente na lista ao lado para abrir a ficha completa e lançar materiais.
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}