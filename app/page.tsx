'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AuthGate from './AuthGate';

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
  data_retorno?: string;
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
  { id: 'insumos', label: 'Insumos / Suplementos' },
  { id: 'descartaveis', label: 'Descartáveis' },
];

function Dashboard() {
  const [mainTab, setMainTab] = useState<'estoque' | 'pacientes'>('pacientes');
  
  // Estados do Estoque
  const [products, setProducts] = useState<Product[]>([]);
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  const [activeTab, setActiveTab] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Cadastro e Edição de Produto
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('medicacao');
  const [lote, setLote] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('');
  const [validade, setValidade] = useState('');

  // Estados de Pacientes
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [editingPacienteId, setEditingPacienteId] = useState<string | null>(null);
  const [searchPaciente, setSearchPaciente] = useState('');
  const [nomePaciente, setNomePaciente] = useState('');
  const [cpfPaciente, setCpfPaciente] = useState('');
  const [telPaciente, setTelPaciente] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [endereco, setEndereco] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataRetorno, setDataRetorno] = useState('');
  
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
  function limpaFormularioProduto() {
    setEditingProductId(null);
    setNome('');
    setCategoria('medicacao');
    setLote('');
    setQuantidade('');
    setPreco('');
    setValidade('');
  }

  function handlePrepareEditProduct(p: Product) {
    setEditingProductId(p.id);
    setNome(p.nome || '');
    setCategoria(p.categoria || 'medicacao');
    setLote(p.lote || '');
    setQuantidade(String(p.quantidade || 0));
    setPreco(String(p.preco_custo || 0));
    setValidade(p.validade || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !quantidade || !preco) return alert('Preencha Nome, Quantidade e Preço!');

    const payload = {
      nome,
      categoria,
      lote: lote || null,
      quantidade: parseInt(quantidade),
      quantidade_minima: 10,
      preco_custo: parseFloat(preco),
      validade: validade || null,
    };

    if (editingProductId) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', editingProductId);
      if (error) alert(`Erro ao atualizar produto: ${error.message}`);
      else {
        limpaFormularioProduto();
        fetchData();
      }
    } else {
      const { data, error } = await supabase.from('produtos').insert([payload]).select();
      if (error) {
        alert(`Erro ao cadastrar produto: ${error.message}`);
      } else {
        if (data && data[0]) {
          await registrarMovimentacao(data[0].id, nome, 'ENTRADA', parseInt(quantidade));
        }
        limpaFormularioProduto();
        fetchData();
      }
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
    if (!confirm(`Tem certeza que deseja excluir "${nome}"?`)) return;

    try {
      await supabase.from('historico_movimentacoes').delete().eq('produto_id', id);
      await supabase.from('consumos_paciente').delete().eq('produto_id', id);
      const { error } = await supabase.from('produtos').delete().eq('id', id);

      if (error) {
        alert(`Erro ao excluir produto: ${error.message}`);
      } else {
        setProducts(prev => prev.filter(item => item.id !== id));
        fetchData();
      }
    } catch (err) {
      console.error('Erro ao excluir produto:', err);
    }
  }

  // --- PACIENTES HANDLERS ---
  function limpaFormularioPaciente() {
    setEditingPacienteId(null);
    setNomePaciente('');
    setCpfPaciente('');
    setTelPaciente('');
    setDataNascimento('');
    setPeso('');
    setAltura('');
    setEndereco('');
    setObservacoes('');
    setDataRetorno('');
  }

  function handlePrepareEditPaciente(p: Paciente, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setEditingPacienteId(p.id);
    setNomePaciente(p.nome || '');
    setCpfPaciente(p.cpf || '');
    setTelPaciente(p.telefone || '');
    setDataNascimento(p.data_nascimento || '');
    setPeso(p.peso ? String(p.peso) : '');
    setAltura(p.altura ? String(p.altura) : '');
    setEndereco(p.endereco || '');
    setObservacoes(p.observacoes || '');
    setDataRetorno(p.data_retorno || '');
  }

  async function handleSavePaciente(e: React.FormEvent) {
    e.preventDefault();
    if (!nomePaciente.trim()) return alert('Informe o nome do paciente!');

    let alturaParsed: number | null = null;
    if (altura) {
      const val = parseFloat(String(altura).replace(',', '.'));
      alturaParsed = val > 3 ? val / 100 : val;
    }

    let pesoParsed: number | null = null;
    if (peso) pesoParsed = parseFloat(String(peso).replace(',', '.'));

    const payload = {
      nome: nomePaciente, 
      cpf: cpfPaciente || null, 
      telefone: telPaciente || null,
      data_nascimento: dataNascimento || null,
      peso: pesoParsed,
      altura: alturaParsed,
      endereco: endereco || null,
      observacoes: observacoes || null,
      data_retorno: dataRetorno || null
    };

    try {
      if (editingPacienteId) {
        const { error } = await supabase.from('pacientes').update(payload).eq('id', editingPacienteId);
        if (error) alert(`Erro ao atualizar paciente: ${error.message}`);
        else {
          if (selectedPaciente?.id === editingPacienteId) {
            setSelectedPaciente({ id: editingPacienteId, ...payload } as Paciente);
          }
          limpaFormularioPaciente();
          fetchPacientes();
        }
      } else {
        const { error } = await supabase.from('pacientes').insert([payload]);
        if (error) alert(`Erro ao cadastrar paciente: ${error.message}`);
        else {
          limpaFormularioPaciente();
          fetchPacientes();
        }
      }
    } catch (err) {
      console.error('Erro:', err);
    }
  }

  async function handleDeletePaciente(p: Paciente, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm(`Tem certeza que deseja excluir o paciente "${p.nome}"?`)) return;

    await supabase.from('consumos_paciente').delete().eq('paciente_id', p.id);
    const { error } = await supabase.from('pacientes').delete().eq('id', p.id);

    if (error) {
      alert(`Erro ao excluir paciente: ${error.message}`);
    } else {
      if (selectedPaciente?.id === p.id) {
        setSelectedPaciente(null);
        setConsumos([]);
      }
      if (editingPacienteId === p.id) limpaFormularioPaciente();
      fetchPacientes();
    }
  }

  async function openFichaPaciente(p: Paciente) {
    setSelectedPaciente(p);
    fetchConsumos(p.id);
  }

  function calcularIdade(dataNascimentoStr?: string) {
    if (!dataNascimentoStr) return 'Não informada';
    const nascimento = new Date(dataNascimentoStr);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) idade--;
    return `${idade} anos`;
  }

  function ehAniversarianteHoje(dataNascimentoStr?: string) {
    if (!dataNascimentoStr) return false;
    const nascimento = new Date(dataNascimentoStr);
    const hoje = new Date();
    return (
      nascimento.getUTCDate() === hoje.getDate() &&
      nascimento.getUTCMonth() === hoje.getMonth()
    );
  }

  function ehRetornoAmanha(dataRetornoStr?: string) {
    if (!dataRetornoStr) return false;
    const retorno = new Date(dataRetornoStr);
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);

    return (
      retorno.getUTCDate() === amanha.getDate() &&
      retorno.getUTCMonth() === amanha.getMonth() &&
      retorno.getUTCFullYear() === amanha.getFullYear()
    );
  }

  function getWhatsAppLink(telefone?: string, mensagemCustomizada?: string) {
    if (!telefone) return '#';
    const numLimpo = telefone.replace(/\D/g, '');
    const numComDDI = numLimpo.startsWith('55') ? numLimpo : `55${numLimpo}`;
    return `https://wa.me/${numComDDI}?text=${encodeURIComponent(mensagemCustomizada || '')}`;
  }

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

    const novaQtd = produto.quantidade - qtd;
    await supabase.from('produtos').update({ quantidade: novaQtd }).eq('id', produto.id);
    await registrarMovimentacao(produto.id, `${produto.nome} (Paciente: ${selectedPaciente.nome})`, 'SAIDA', qtd);
    await supabase.from('consumos_paciente').insert([
      { paciente_id: selectedPaciente.id, produto_id: produto.id, nome_produto: produto.nome, quantidade: qtd }
    ]);

    setQtdConsumo('1');
    setSelectedProdutoId('');
    fetchData();
    fetchConsumos(selectedPaciente.id);
  }

  // Ordena produtos: itens < 10 aparecem PRIMEIRO na lista
  const filteredProducts = products
    .filter((product) => {
      const matchesTab = activeTab === 'todos' || (product.categoria || 'insumos') === activeTab;
      const matchesSearch = product.nome.toLowerCase().includes(searchTerm.toLowerCase()) || (product.lote && product.lote.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesTab && matchesSearch;
    })
    .sort((a, b) => {
      const aBaixo = a.quantidade < 10 ? 0 : 1;
      const bBaixo = b.quantidade < 10 ? 0 : 1;
      return aBaixo - bBaixo;
    });

  const produtosEstoqueBaixo = products.filter(p => p.quantidade < 10);
  const aniversariantesHoje = pacientes.filter(p => ehAniversarianteHoje(p.data_nascimento));
  const retornosAmanha = pacientes.filter(p => ehRetornoAmanha(p.data_retorno));

  const filteredPacientes = pacientes.filter((p) => {
    const cleanSearch = searchPaciente.replace(/\D/g, '').toLowerCase();
    const cleanCPF = (p.cpf || '').replace(/\D/g, '').toLowerCase();
    const matchCPF = cleanSearch !== '' && cleanCPF.includes(cleanSearch);
    const matchNome = p.nome.toLowerCase().includes(searchPaciente.toLowerCase());
    return matchNome || matchCPF;
  });

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-amber-950 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* CABEÇALHO DA CLÍNICA */}
        <header className="bg-white border border-amber-200/80 rounded-2xl shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-0"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            
            <div className="flex items-center space-x-5">
              <div className="w-20 h-20 rounded-full border-2 border-amber-400/60 p-0.5 bg-amber-50 shadow-md overflow-hidden flex-shrink-0">
                <img
                  src="/logo.jpeg"
                  alt="Dra. Bruna Oliveira"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-serif font-bold text-amber-950 tracking-tight">
                  Dra. Bruna Oliveira
                </h1>
                <p className="text-amber-800 text-xs md:text-sm font-semibold tracking-wider uppercase mt-0.5">
                  Medicina do Esporte <span className="text-amber-600">•</span> CRM-MG 76958
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-900/70 mt-1.5">
                  <span>📍 Rua Juca Stockler, 2029 - Passos/MG</span>
                  <span>•</span>
                  <span>📞 (35) 99987-1770</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 print:hidden">
              <a
                href="https://wa.me/5535999871770"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-4 py-2.5 rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
              >
                💬 WhatsApp Clínica
              </a>
              
              <div className="flex space-x-1 bg-amber-100/60 p-1 rounded-xl border border-amber-200/50">
                <button
                  onClick={() => setMainTab('pacientes')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mainTab === 'pacientes' ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900 hover:text-amber-950'}`}
                >
                  👤 Pacientes
                </button>
                <button
                  onClick={() => setMainTab('estoque')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mainTab === 'estoque' ? 'bg-amber-800 text-white shadow-sm relative' : 'text-amber-900 hover:text-amber-950'}`}
                >
                  📦 Estoque Médico
                  {produtosEstoqueBaixo.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      !
                    </span>
                  )}
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* ALERTAS GERAIS */}
        <div className="space-y-3 print:hidden">
          {aniversariantesHoje.length > 0 && (
            <div className="bg-amber-100 border-l-4 border-amber-600 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🎂</span>
                <div>
                  <h4 className="font-serif font-bold text-amber-950 text-sm">Aniversariantes do Dia ({aniversariantesHoje.length})</h4>
                  <p className="text-xs text-amber-900">
                    {aniversariantesHoje.map(p => p.nome).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {aniversariantesHoje.map(p => (
                  <a
                    key={p.id}
                    href={getWhatsAppLink(p.telefone, `Olá ${p.nome}, aqui é da clínica Dra. Bruna Oliveira! Desejamos um feliz aniversário, muita saúde e sucesso!`)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-3 py-1.5 rounded-lg transition-all"
                  >
                    🎉 Parabéns p/ {p.nome.split(' ')[0]}
                  </a>
                ))}
              </div>
            </div>
          )}

          {retornosAmanha.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🔔</span>
                <div>
                  <h4 className="font-serif font-bold text-blue-950 text-sm">Lembrete de Retorno Amanhã ({retornosAmanha.length})</h4>
                  <p className="text-xs text-blue-900">
                    {retornosAmanha.map(p => p.nome).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {retornosAmanha.map(p => (
                  <a
                    key={p.id}
                    href={getWhatsAppLink(p.telefone, `Olá ${p.nome}, aqui é da clínica Dra. Bruna Oliveira. Lembramos que o seu retorno está agendado para amanhã. Confirmado?`)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-semibold px-3 py-1.5 rounded-lg transition-all"
                  >
                    📩 Lembrar {p.nome.split(' ')[0]}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* VIEW: PACIENTES */}
        {mainTab === 'pacientes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="space-y-6 print:hidden">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-serif font-bold text-amber-950">
                    {editingPacienteId ? 'Editar Paciente' : 'Novo Paciente'}
                  </h2>
                  {editingPacienteId && (
                    <button onClick={limpaFormularioPaciente} className="text-xs text-amber-700 hover:underline">
                      Cancelar
                    </button>
                  )}
                </div>

                <form onSubmit={handleSavePaciente} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Nome Completo *</label>
                    <input type="text" value={nomePaciente} onChange={(e) => setNomePaciente(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/50" placeholder="Ex: Lucas Andrade" required />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">CPF</label>
                      <input type="text" value={cpfPaciente} onChange={(e) => setCpfPaciente(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/50" placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">Telefone</label>
                      <input type="text" value={telPaciente} onChange={(e) => setTelPaciente(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/50" placeholder="(35) 90000-0000" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">Nascimento</label>
                      <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} className="w-full px-2 py-2 border border-amber-200 rounded-lg text-xs outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">Peso (kg)</label>
                      <input type="text" value={peso} onChange={(e) => setPeso(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" placeholder="75" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">Altura (m)</label>
                      <input type="text" value={altura} onChange={(e) => setAltura(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" placeholder="1.75" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Data do Próximo Retorno</label>
                    <input type="date" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Endereço</label>
                    <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" placeholder="Rua, número, cidade..." />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Histórico Clínico / Avaliação Esportiva</label>
                    <textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" placeholder="Objetivos esportivos, lesões prévias, suplementação em uso..."></textarea>
                  </div>

                  <button
                    type="submit"
                    className={`w-full text-white font-medium py-2.5 rounded-xl text-sm transition-all shadow ${editingPacienteId ? 'bg-amber-700 hover:bg-amber-800' : 'bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-95'}`}
                  >
                    {editingPacienteId ? 'Atualizar Paciente' : 'Salvar Paciente'}
                  </button>
                </form>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60">
                <h2 className="text-lg font-serif font-bold text-amber-950 mb-3">Buscar Paciente</h2>
                
                <input
                  type="text"
                  placeholder="🔍 Digite o Nome ou CPF..."
                  value={searchPaciente}
                  onChange={(e) => setSearchPaciente(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/50 mb-3"
                />

                <div className="divide-y divide-amber-100 max-h-80 overflow-y-auto pr-1">
                  {filteredPacientes.length === 0 ? (
                    <p className="text-xs text-amber-800/60 py-4 text-center">Nenhum paciente cadastrado.</p>
                  ) : (
                    filteredPacientes.map((p) => {
                      const eAniversario = ehAniversarianteHoje(p.data_nascimento);
                      const eRetorno = ehRetornoAmanha(p.data_retorno);
                      return (
                        <div
                          key={p.id}
                          onClick={() => openFichaPaciente(p)}
                          className={`p-3 my-1 cursor-pointer rounded-xl transition-all flex items-center justify-between ${selectedPaciente?.id === p.id ? 'bg-amber-50 border-l-4 border-amber-700 shadow-sm' : 'hover:bg-amber-50/50'}`}
                        >
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <p className="font-semibold text-amber-950 text-sm">{p.nome}</p>
                              {eAniversario && <span title="Aniversariante Hoje!">🎂</span>}
                              {eRetorno && <span title="Retorno amanhã!">🔔</span>}
                            </div>
                            <p className="text-xs text-amber-800/70">CPF: {p.cpf || 'Não informado'} • {calcularIdade(p.data_nascimento)}</p>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button onClick={(e) => handlePrepareEditPaciente(p, e)} className="text-xs p-1.5 hover:bg-amber-100 rounded-md">✏️</button>
                            <button onClick={(e) => handleDeletePaciente(p, e)} className="text-xs p-1.5 hover:bg-red-100 rounded-md">🗑️</button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            <div className="lg:col-span-2 print:w-full print:col-span-3">
              {selectedPaciente ? (
                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-amber-200/80 space-y-6 print:border-none print:shadow-none print:p-0">
                  
                  <div className="border-b border-amber-100 pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full print:hidden">
                            Ficha Técnica do Paciente
                          </span>
                          {ehAniversarianteHoje(selectedPaciente.data_nascimento) && (
                            <span className="text-[10px] uppercase font-bold bg-amber-500 text-white px-2.5 py-0.5 rounded-full">
                              🎂 Aniversariante de Hoje!
                            </span>
                          )}
                          {ehRetornoAmanha(selectedPaciente.data_retorno) && (
                            <span className="text-[10px] uppercase font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full">
                              🔔 Retorno Amanhã!
                            </span>
                          )}
                        </div>
                        <h2 className="text-2xl md:text-3xl font-serif font-bold text-amber-950">{selectedPaciente.nome}</h2>
                      </div>
                      
                      <div className="flex items-center space-x-2 print:hidden">
                        {selectedPaciente.telefone && (
                          <a
                            href={getWhatsAppLink(selectedPaciente.telefone, `Olá ${selectedPaciente.nome} aqui é da clinica Bruna Oliveira.`)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-3 py-2 rounded-xl shadow transition-colors flex items-center gap-1.5"
                          >
                            💬 Contatar no WhatsApp
                          </a>
                        )}
                        <button
                          onClick={() => window.print()}
                          className="text-xs bg-amber-900 hover:bg-amber-950 text-white font-semibold px-4 py-2 rounded-xl shadow transition-colors flex items-center gap-1.5"
                        >
                          🖨️ Imprimir
                        </button>
                        <button onClick={() => handlePrepareEditPaciente(selectedPaciente)} className="text-xs bg-amber-100 text-amber-900 font-semibold px-3 py-2 rounded-xl hover:bg-amber-200">
                          ✏️ Editar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/50">
                        <span className="text-amber-800/70 block font-semibold">CPF</span>
                        <span className="font-medium text-amber-950">{selectedPaciente.cpf || '-'}</span>
                      </div>
                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/50">
                        <span className="text-amber-800/70 block font-semibold">Telefone</span>
                        <span className="font-medium text-amber-950">{selectedPaciente.telefone || '-'}</span>
                      </div>
                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/50">
                        <span className="text-amber-800/70 block font-semibold">Peso / Altura</span>
                        <span className="font-medium text-amber-950">{selectedPaciente.peso ? `${selectedPaciente.peso} kg` : '-'} / {selectedPaciente.altura ? `${selectedPaciente.altura} m` : '-'}</span>
                      </div>
                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/50">
                        <span className="text-amber-800/70 block font-semibold">Próximo Retorno</span>
                        <span className="font-bold text-amber-900">
                          {selectedPaciente.data_retorno ? new Date(selectedPaciente.data_retorno).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não agendado'}
                        </span>
                      </div>
                    </div>

                    {selectedPaciente.endereco && (
                      <p className="text-xs text-amber-900/80 mt-3">📍 <strong>Endereço:</strong> {selectedPaciente.endereco}</p>
                    )}

                    {selectedPaciente.observacoes && (
                      <div className="mt-4 p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-950">
                        <strong className="block text-amber-900 mb-1">📝 Histórico Clínico & Anotações:</strong>
                        <p className="whitespace-pre-wrap leading-relaxed">{selectedPaciente.observacoes}</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/60 print:hidden">
                    <h3 className="font-serif font-semibold text-amber-950 text-sm mb-3">💉 Prescrever / Aplicar Item do Estoque</h3>
                    <form onSubmit={handleUsarItemNoPaciente} className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <select
                          value={selectedProdutoId}
                          onChange={(e) => setSelectedProdutoId(e.target.value)}
                          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
                          required
                        >
                          <option value="">Selecione o medicamento/suplemento...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id} disabled={p.quantidade <= 0}>
                              {p.nome} (Disponível: {p.quantidade} un. {p.quantidade < 10 ? '⚠️' : ''})
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
                          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
                          placeholder="Qtd"
                          required
                        />
                      </div>

                      <button type="submit" className="bg-amber-800 hover:bg-amber-900 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-sm">
                        Lançar na Ficha
                      </button>
                    </form>
                  </div>

                  <div>
                    <h3 className="font-serif font-bold text-amber-950 text-base mb-3">📋 Medicamentos & Procedimentos Aplicados</h3>
                    <div className="border border-amber-200/80 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-amber-100/50 text-amber-950 border-b border-amber-200/80 font-serif">
                          <tr>
                            <th className="py-2.5 px-4">Descrição do Item</th>
                            <th className="py-2.5 px-4">Quantidade</th>
                            <th className="py-2.5 px-4">Data / Hora</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {consumos.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-6 text-center text-amber-800/50 text-xs">Nenhum item aplicado até o momento.</td>
                            </tr>
                          ) : (
                            consumos.map((c) => (
                              <tr key={c.id} className="hover:bg-amber-50/30">
                                <td className="py-2.5 px-4 font-medium text-amber-950">{c.nome_produto}</td>
                                <td className="py-2.5 px-4 font-semibold text-amber-900">{c.quantidade} un.</td>
                                <td className="py-2.5 px-4 text-amber-800/70 text-xs">{new Date(c.created_at).toLocaleString('pt-BR')}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white p-12 rounded-2xl shadow-sm border border-amber-200/60 text-center text-amber-800/60 font-serif">
                  👈 Selecione um paciente na lista ao lado para abrir a ficha médica.
                </div>
              )}
            </div>

          </div>
        )}

        {/* VIEW: ESTOQUE */}
        {mainTab === 'estoque' && (
          <div className="space-y-6">
            
            {produtosEstoqueBaixo.length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="font-serif font-bold text-red-950 text-sm">Atenção: Itens com Estoque Baixo ({produtosEstoqueBaixo.length})</h4>
                    <p className="text-xs text-red-900">
                      Os seguintes itens estão com menos de 10 unidades: <strong>{produtosEstoqueBaixo.map(p => p.nome).join(', ')}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-serif font-bold text-amber-950">
                  {editingProductId ? 'Editar Item do Estoque' : 'Cadastrar Novo Produto / Insumo'}
                </h2>
                {editingProductId && (
                  <button onClick={limpaFormularioProduto} className="text-xs text-amber-700 hover:underline">
                    Cancelar
                  </button>
                )}
              </div>
              <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Nome do Item *</label>
                  <input type="text" placeholder="Ex: Vitamina D3..." value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Categoria</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none">
                    <option value="medicacao">Medicação</option>
                    <option value="insumos">Insumos / Suplementos</option>
                    <option value="descartaveis">Descartáveis</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Nº do Lote</label>
                  <input type="text" placeholder="Ex: L1234" value={lote} onChange={(e) => setLote(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Qtd. *</label>
                  <input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Preço Custo (R$) *</label>
                  <input type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Validade</label>
                  <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="w-full px-2 py-2 border border-amber-200 rounded-lg text-xs outline-none" />
                </div>
                <div className="lg:col-span-7 flex justify-end">
                  <button type="submit" className="bg-amber-800 hover:bg-amber-900 text-white font-medium py-2 px-6 rounded-xl text-sm transition-all shadow">
                    {editingProductId ? 'Atualizar Produto' : 'Cadastrar no Estoque'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60 space-y-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-amber-100 pb-4">
                <div className="flex space-x-1 bg-amber-50 p-1 rounded-xl border border-amber-200/50">
                  {CATEGORIAS.map((cat) => (
                    <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === cat.id ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="🔍 Pesquisar por nome ou lote..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-72 px-3 py-2 border border-amber-200 rounded-lg text-xs outline-none" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-amber-50/50 text-amber-950 font-serif">
                    <tr>
                      <th className="py-3 px-3">Item</th>
                      <th className="py-3 px-3">Categoria</th>
                      <th className="py-3 px-3">Lote</th>
                      <th className="py-3 px-3">Qtd. Atual</th>
                      <th className="py-3 px-3">Preço Un.</th>
                      <th className="py-3 px-3">Validade</th>
                      <th className="py-3 px-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {filteredProducts.map((p) => {
                      const isBaixo = p.quantidade < 10;
                      return (
                        <tr key={p.id} className={`transition-colors ${isBaixo ? 'bg-red-50/60 hover:bg-red-100/60' : 'hover:bg-amber-50/30'}`}>
                          <td className="py-3 px-3 font-medium text-amber-950">
                            <div className="flex items-center space-x-2">
                              <span>{p.nome}</span>
                              {isBaixo && (
                                <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                  ⚠️ ESTOQUE BAIXO (&lt;10)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs uppercase text-amber-800">{p.categoria}</td>
                          <td className="py-3 px-3 text-xs font-mono text-amber-900">{p.lote || '-'}</td>
                          <td className={`py-3 px-3 font-bold ${isBaixo ? 'text-red-700' : 'text-amber-900'}`}>
                            {p.quantidade} un.
                          </td>
                          <td className="py-3 px-3 text-amber-950">R$ {Number(p.preco_custo || 0).toFixed(2)}</td>
                          <td className="py-3 px-3 text-xs text-amber-800">{p.validade ? new Date(p.validade).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</td>
                          <td className="py-3 px-3 text-center space-x-1">
                            <button onClick={() => handleEntrada(p)} title="Adicionar Entrada" className="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 rounded-md text-xs font-bold">+</button>
                            <button onClick={() => handleBaixa(p)} title="Dar Baixa" className="bg-amber-700 hover:bg-amber-800 text-white px-2.5 py-1 rounded-md text-xs font-bold">-</button>
                            <button onClick={() => handlePrepareEditProduct(p)} title="Editar Produto" className="bg-amber-100 text-amber-900 hover:bg-amber-200 px-2 py-1 rounded-md text-xs">✏️</button>
                            <button onClick={() => handleDeleteProduct(p.id, p.nome)} title="Excluir Produto" className="bg-red-700 hover:bg-red-800 text-white px-2 py-1 rounded-md text-xs">🗑️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/**
 * Nada do painel é renderizado — nem consultado no banco — antes do login.
 */
export default function Page() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
