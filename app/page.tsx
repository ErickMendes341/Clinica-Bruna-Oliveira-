'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AuthGate from './AuthGate';
import Agenda from './Agenda';
import Pesagem from './Pesagem';
import AgendarRetorno from './AgendarRetorno';
import Pagamentos from './Pagamentos';
import Financeiro from './Financeiro';
import CadastrosRecebidos, { criarConviteFicha } from './CadastrosRecebidos';
import Backup from './Backup';
import AlertaPacientes from './AlertaPacientes';
import { cpfValido, formatarCPF, formatarTelefoneBR, telefoneValido, limparNome, nomesParecidos } from '@/lib/validacao';

interface Product {
  id: string;
  nome: string;
  categoria: string;
  lote?: string;
  quantidade: number;
  quantidade_minima: number;
  preco_custo: number;
  validade?: string;
  // Produto arquivado sai do estoque e dos seletores, mas as fichas dos
  // pacientes que o receberam continuam intactas.
  arquivado_em?: string | null;
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
  meta_peso?: number;
  // Preferências de atendimento
  pref_contato?: string | null;
  pref_musica?: string | null;
  pref_bebida?: string | null;
  pref_comida?: string | null;
  // Paciente arquivado sai da lista, mas o prontuário continua no banco.
  arquivado_em?: string | null;
}

const BEBIDAS = [
  'Água',
  'Água com gás',
  'Café puro',
  'Café com adoçante',
  'Capuccino',
  'Capuccino com Whey',
  'Sem preferência',
];

interface ConsumoPaciente {
  id: string;
  paciente_id: string;
  // Pode ser nulo se o produto foi excluído do estoque depois da aplicação.
  produto_id?: string | null;
  nome_produto: string;
  quantidade: number;
  created_at: string;
}

// Uma "página" do app: em qual aba você está e, se for o caso, qual ficha
// está aberta. É o que empilhamos para o botão de voltar funcionar.
interface Vista {
  tab: 'estoque' | 'pacientes' | 'agenda' | 'financeiro';
  pacienteId: string | null;
}

/* Validade: quantos dias faltam (negativo = já venceu). */
function diasAteValidade(validade?: string) {
  if (!validade) return null;
  const v = new Date(validade.slice(0, 10) + 'T12:00:00');
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  return Math.round((v.getTime() - hoje.getTime()) / 86400000);
}

const CATEGORIAS = [
  { id: 'todos', label: 'Todos os Itens' },
  { id: 'medicacao', label: 'Medicação' },
  { id: 'insumos', label: 'Insumos / Suplementos' },
  { id: 'descartaveis', label: 'Descartáveis' },
];

function Dashboard() {
  const [mainTab, setMainTab] = useState<'estoque' | 'pacientes' | 'agenda' | 'financeiro'>('agenda');
  const [proximoAgendamento, setProximoAgendamento] = useState<string | null>(null);
  const [pilhaVistas, setPilhaVistas] = useState<Vista[]>([]);
  
  // Estados do Estoque
  const [products, setProducts] = useState<Product[]>([]);
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  const [activeTab, setActiveTab] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [mostrarProdutosArquivados, setMostrarProdutosArquivados] = useState(false);

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
  const [metaPeso, setMetaPeso] = useState('');
  const [prefContato, setPrefContato] = useState('');
  const [prefMusica, setPrefMusica] = useState('');
  const [prefBebida, setPrefBebida] = useState('');
  const [prefComida, setPrefComida] = useState('');
  
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  
  // Estado de Consumo no Paciente
  const [consumos, setConsumos] = useState<ConsumoPaciente[]>([]);
  const [selectedProdutoId, setSelectedProdutoId] = useState('');
  const [qtdConsumo, setQtdConsumo] = useState('1');
  const [consumosAberto, setConsumosAberto] = useState(false);
  // Seções da ficha que abrem e fecham; começam fechadas para a ficha ficar enxuta.
  const [pesagemAberta, setPesagemAberta] = useState(false);
  const [pagamentosAberto, setPagamentosAberto] = useState(false);
  const [prescreverAberto, setPrescreverAberto] = useState(false);
  const [editandoConsumo, setEditandoConsumo] = useState<ConsumoPaciente | null>(null);
  const [gerenciandoPaciente, setGerenciandoPaciente] = useState<Paciente | null>(null);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  // Quem tem atendimento marcado para amanhã (alimenta o alerta do topo).
  const [agendadosAmanha, setAgendadosAmanha] = useState<Set<string>>(new Set());

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  // Atualização automática de estoque, histórico e lista de pacientes:
  // ao voltar para a tela e a cada minuto com ela aberta. Importa porque
  // quantidade de estoque velha faz aplicar item que já acabou.
  useEffect(() => {
    let ultima = Date.now();

    const atualizar = () => {
      ultima = Date.now();
      fetchProducts();
      fetchHistorico();
      fetchPacientes();
      fetchAgendadosAmanha();
    };

    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima > 10000) atualizar();
    };

    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') atualizar();
    }, 60000);

    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchData() {
    fetchProducts();
    fetchHistorico();
    fetchPacientes();
    fetchAgendadosAmanha();
  }

  async function fetchAgendadosAmanha() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const amanha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { data, error } = await supabase
      .from('agendamentos')
      .select('paciente_id')
      .eq('data', amanha)
      .in('status', ['agendado', 'confirmado']);
    if (error) return console.error('Erro ao buscar agenda de amanhã:', error);
    setAgendadosAmanha(new Set((data ?? []).map((x) => (x as { paciente_id: string }).paciente_id)));
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
    if (error) return console.error('Erro ao buscar pacientes:', error);
    if (!data) return;
    setPacientes(data);
    // A ficha aberta acompanha o banco: peso, telefone e afins não ficam velhos.
    setSelectedPaciente((atual) => (atual ? data.find((x) => x.id === atual.id) ?? atual : atual));
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
    setQuantidade('');
    setPreco(String(p.preco_custo || 0));
    setValidade(p.validade || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !preco) return alert('Preencha Nome e Preço!');
    if (!editingProductId && !quantidade) return alert('Informe a quantidade inicial!');

    // Ao editar, a quantidade NÃO entra: ela só muda pelos botões + / −,
    // que registram histórico. Senão, salvar um formulário aberto há
    // minutos desfaria as baixas feitas nesse meio-tempo.
    const payload = {
      nome,
      categoria,
      lote: lote || null,
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
      // Cadastra com 0 e registra a quantidade inicial como ENTRADA, para o
      // histórico contar a história completa do produto desde o primeiro dia.
      const { data, error } = await supabase
        .from('produtos')
        .insert([{ ...payload, quantidade: 0 }])
        .select('id')
        .single();
      if (error) {
        alert(`Erro ao cadastrar produto: ${error.message}`);
      } else {
        const inicial = parseInt(quantidade);
        if (data && inicial > 0) {
          const erro = await movimentarEstoque(data.id, inicial, `${nome} (Cadastro)`);
          if (erro) alert(`Produto cadastrado, mas a quantidade inicial não entrou: ${erro}`);
        }
        limpaFormularioProduto();
        fetchData();
      }
    }
  }

  /* ---------- Movimentação de estoque ----------
     Toda mexida na quantidade passa pela função movimentar_estoque() do
     banco: ela soma/subtrai numa instrução só (duas pessoas ao mesmo tempo
     não se atropelam), nunca deixa ficar negativo e registra no histórico
     na mesma transação. Aqui só mandamos o quanto e para quê.          */

  async function movimentarEstoque(produtoId: string, delta: number, descricao?: string) {
    const { error } = await supabase.rpc('movimentar_estoque', {
      p_produto_id: produtoId,
      p_delta: delta,
      p_descricao: descricao ?? null,
    });
    return error ? error.message : null;
  }

  async function handleEntrada(product: Product) {
    const qtdStr = prompt(`Quantidade de '${product.nome}' para ADICIONAR:`);
    if (!qtdStr) return;
    const qtd = parseInt(qtdStr);
    if (isNaN(qtd) || qtd <= 0) return alert('Número inválido!');

    const erro = await movimentarEstoque(product.id, qtd);
    if (erro) alert(`Erro ao registrar entrada: ${erro}`);
    fetchData();
  }

  async function handleBaixa(product: Product) {
    const qtdStr = prompt(`Quantidade de '${product.nome}' para RETIRAR:`);
    if (!qtdStr) return;
    const qtd = parseInt(qtdStr);
    if (isNaN(qtd) || qtd <= 0) return alert('Quantidade inválida!');

    const erro = await movimentarEstoque(product.id, -qtd);
    if (erro) alert(`Erro ao dar baixa: ${erro}`);
    fetchData();
  }

  /* ---------- Arquivar produto ----------
     Produto não é excluído: as fichas dos pacientes que o receberam
     precisam continuar mostrando o que foi aplicado. Arquivar tira ele
     do estoque e dos seletores; dá para restaurar depois.             */

  async function handleArquivarProduto(p: Product) {
    if (!confirm(`Arquivar "${p.nome}"? Ele some do estoque, mas o histórico dos pacientes fica guardado.`)) return;

    const { error } = await supabase
      .from('produtos')
      .update({ arquivado_em: new Date().toISOString() })
      .eq('id', p.id);

    if (error) return alert(`Erro ao arquivar produto: ${error.message}`);
    if (editingProductId === p.id) limpaFormularioProduto();
    fetchData();
  }

  async function handleRestaurarProduto(p: Product) {
    const { error } = await supabase.from('produtos').update({ arquivado_em: null }).eq('id', p.id);
    if (error) return alert(`Erro ao restaurar produto: ${error.message}`);
    fetchData();
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
    setMetaPeso('');
    setPrefContato('');
    setPrefMusica('');
    setPrefBebida('');
    setPrefComida('');
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
    setMetaPeso(p.meta_peso ? String(p.meta_peso) : '');
    setPrefContato(p.pref_contato || '');
    setPrefMusica(p.pref_musica || '');
    setPrefBebida(p.pref_bebida || '');
    setPrefComida(p.pref_comida || '');
  }

  async function handleSavePaciente(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = limparNome(nomePaciente);
    if (!nomeLimpo) return alert('Informe o nome do paciente!');
    if (cpfPaciente.trim() && !cpfValido(cpfPaciente)) {
      return alert('CPF inválido. Confira os números (ou deixe em branco).');
    }
    if (telPaciente.trim() && !telefoneValido(telPaciente)) {
      return alert('Telefone inválido. Use DDD + 8 ou 9 dígitos.');
    }
    // Cadastro novo com nome parecido: pergunta antes de criar duplicado.
    if (!editingPacienteId) {
      const iguais = nomesParecidos(nomeLimpo, pacientes.map((x) => ({ id: x.id, nome: x.nome })));
      if (iguais.length > 0) {
        const ok = confirm(
          `Já existe paciente com nome parecido:\n\n${iguais.map((x) => '• ' + x.nome.trim()).join('\n')}\n\nCadastrar assim mesmo?`
        );
        if (!ok) return;
      }
    }

    let alturaParsed: number | null = null;
    if (altura) {
      const val = parseFloat(String(altura).replace(',', '.'));
      alturaParsed = val > 3 ? val / 100 : val;
    }

    let pesoParsed: number | null = null;
    if (peso) pesoParsed = parseFloat(String(peso).replace(',', '.'));

    const payload = {
      nome: nomeLimpo,
      cpf: cpfPaciente ? formatarCPF(cpfPaciente) : null, 
      telefone: telPaciente || null,
      data_nascimento: dataNascimento || null,
      peso: pesoParsed,
      altura: alturaParsed,
      endereco: endereco || null,
      observacoes: observacoes || null,
      data_retorno: dataRetorno || null,
      meta_peso: metaPeso ? parseFloat(String(metaPeso).replace(',', '.')) : null,
      pref_contato: prefContato || null,
      pref_musica: prefMusica || null,
      pref_bebida: prefBebida || null,
      pref_comida: prefComida || null
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

  /* ---------- Ficha para o paciente preencher ----------
     Gera um link único (vale 7 dias) e abre o WhatsApp com a mensagem.
     O que o paciente enviar cai em "Fichas recebidas" para a equipe aceitar. */
  async function handleEnviarFicha(p: Paciente) {
    const r = await criarConviteFicha(p.id);
    if (!r.ok) return alert(`Não foi possível gerar o link: ${r.msg}`);
    const msg = `Olá ${p.nome.trim().split(' ')[0]}, aqui é da clínica Dra. Bruna Oliveira. Para adiantar seu atendimento, preencha sua ficha neste link (leva 3 minutos): ${r.link}`;
    if (p.telefone) {
      window.open(getWhatsAppLink(p.telefone, msg), '_blank', 'noreferrer');
    } else {
      try {
        await navigator.clipboard.writeText(r.link);
        alert('Paciente sem telefone. O link foi copiado — envie por onde preferir.');
      } catch {
        prompt('Paciente sem telefone. Copie o link:', r.link);
      }
    }
  }

  /* ---------- Arquivar x excluir ----------
     Prontuário tem guarda obrigatória: paciente que parou de vir deve ser
     arquivado, não apagado. Excluir de vez existe para cadastro duplicado
     ou criado por engano — e apaga o histórico junto.                   */

  async function handleArquivarPaciente(p: Paciente) {
    const { error } = await supabase
      .from('pacientes')
      .update({ arquivado_em: new Date().toISOString() })
      .eq('id', p.id);

    if (error) return alert(`Erro ao arquivar: ${error.message}`);

    if (selectedPaciente?.id === p.id) {
      setSelectedPaciente(null);
      setConsumos([]);
    }
    if (editingPacienteId === p.id) limpaFormularioPaciente();
    fetchPacientes();
  }

  async function handleRestaurarPaciente(p: Paciente) {
    const { error } = await supabase.from('pacientes').update({ arquivado_em: null }).eq('id', p.id);
    if (error) return alert(`Erro ao restaurar: ${error.message}`);
    fetchPacientes();
  }

  /* Excluir de vez só vale para cadastro vazio/duplicado. Paciente com
     pagamento, item aplicado, pesagem ou consulta tem prontuário e
     registro financeiro — esse só pode ser arquivado.               */
  async function handleDeletePaciente(p: Paciente) {
    const [pag, con, pes, ag] = await Promise.all([
      supabase.from('pagamentos').select('id', { count: 'exact', head: true }).eq('paciente_id', p.id),
      supabase.from('consumos_paciente').select('id', { count: 'exact', head: true }).eq('paciente_id', p.id),
      supabase.from('pesagens').select('id', { count: 'exact', head: true }).eq('paciente_id', p.id),
      supabase.from('agendamentos').select('id', { count: 'exact', head: true }).eq('paciente_id', p.id),
    ]);
    const partes = [
      pag.count ? `${pag.count} pagamento(s)` : '',
      con.count ? `${con.count} item(ns) aplicado(s)` : '',
      pes.count ? `${pes.count} pesagem(ns)` : '',
      ag.count ? `${ag.count} agendamento(s)` : '',
    ].filter(Boolean);

    if (partes.length > 0) {
      alert(
        `Este paciente não pode ser excluído porque tem histórico:\n\n• ${partes.join('\n• ')}\n\n` +
          'Use "Arquivar" — ele sai da lista e o prontuário fica guardado.'
      );
      return;
    }

    const { error } = await supabase.from('pacientes').delete().eq('id', p.id);

    if (error) {
      alert(`Erro ao excluir paciente: ${error.message}`);
      return;
    }
    if (selectedPaciente?.id === p.id) {
      setSelectedPaciente(null);
      setConsumos([]);
    }
    if (editingPacienteId === p.id) limpaFormularioPaciente();
    fetchPacientes();
  }

  /* ---------------- Navegação com histórico ----------------
     O app é uma página só, então "voltar" precisa ser construído: cada
     mudança de aba ou abertura de ficha empilha de onde você veio.
     Também empilhamos no histórico do navegador, para que o botão voltar
     do celular volte dentro do app em vez de fechá-lo.               */

  function aplicarVista(v: Vista) {
    setMainTab(v.tab);
    if (v.pacienteId) {
      const p = pacientes.find((x) => x.id === v.pacienteId);
      if (p) {
        setSelectedPaciente(p);
        fetchConsumos(p.id);
        fetchProximoAgendamento(p.id);
        // Cada ficha abre enxuta; a pessoa expande só o que precisa.
        setPesagemAberta(false);
        setPagamentosAberto(false);
        setPrescreverAberto(false);
        setConsumosAberto(false);
      } else {
        setSelectedPaciente(null);
      }
    } else {
      setSelectedPaciente(null);
    }
  }

  function irPara(v: Vista) {
    setPilhaVistas((h) => [...h, { tab: mainTab, pacienteId: selectedPaciente?.id ?? null }]);
    window.history.pushState({ app: true }, '');
    aplicarVista(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function voltar() {
    if (pilhaVistas.length === 0) return;
    // Dispara o popstate abaixo, que é quem de fato desempilha.
    window.history.back();
  }

  useEffect(() => {
    const aoVoltarNavegador = () => {
      if (pilhaVistas.length === 0) return;
      const anterior = pilhaVistas[pilhaVistas.length - 1];
      setPilhaVistas(pilhaVistas.slice(0, -1));
      aplicarVista(anterior);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('popstate', aoVoltarNavegador);
    return () => window.removeEventListener('popstate', aoVoltarNavegador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilhaVistas, pacientes]);

  async function openFichaPaciente(p: Paciente) {
    irPara({ tab: 'pacientes', pacienteId: p.id });
  }

  async function fetchProximoAgendamento(pacienteId: string) {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { data } = await supabase
      .from('agendamentos')
      .select('data')
      .eq('paciente_id', pacienteId)
      .in('status', ['agendado', 'confirmado'])
      .gte('data', iso)
      .order('data', { ascending: true })
      .limit(1);
    setProximoAgendamento(data && data[0] ? (data[0] as { data: string }).data : null);
  }

  // Usado pelo painel da Agenda: clicar num nome abre a ficha da pessoa.
  function abrirPacientePorId(id: string) {
    if (!pacientes.some((x) => x.id === id)) return;
    irPara({ tab: 'pacientes', pacienteId: id });
  }

  // Datas do banco vêm como "AAAA-MM-DD". Lidas com new Date() direto o
  // JavaScript entende como meia-noite em Londres, que no Brasil ainda é o
  // dia anterior — e o aniversário cai no dia errado. O "T12:00:00" força
  // meio-dia local, longe de qualquer virada de fuso.
  function dataLocal(iso: string) {
    return new Date(iso.slice(0, 10) + 'T12:00:00');
  }

  function calcularIdade(dataNascimentoStr?: string) {
    if (!dataNascimentoStr) return 'Não informada';
    const nascimento = dataLocal(dataNascimentoStr);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) idade--;
    return `${idade} anos`;
  }

  function ehAniversarianteHoje(dataNascimentoStr?: string) {
    if (!dataNascimentoStr) return false;
    const nascimento = dataLocal(dataNascimentoStr);
    const hoje = new Date();
    return nascimento.getDate() === hoje.getDate() && nascimento.getMonth() === hoje.getMonth();
  }

  function getWhatsAppLink(telefone?: string, mensagemCustomizada?: string) {
    if (!telefone) return '#';
    const numLimpo = telefone.replace(/\D/g, '');
    const numComDDI = numLimpo.startsWith('55') ? numLimpo : `55${numLimpo}`;
    return `https://wa.me/${numComDDI}?text=${encodeURIComponent(mensagemCustomizada || '')}`;
  }

  /* ---------- Itens aplicados na ficha ----------
     Aplicar, corrigir e apagar mexem no estoque de verdade. Cada uma é
     uma função no banco (aplicar_item, corrigir_consumo, estornar_consumo)
     que faz baixa + histórico + ficha numa transação só: se a internet
     cair no meio, nada fica pela metade.                                */

  async function handleDeleteConsumo(c: ConsumoPaciente) {
    if (!selectedPaciente) return;
    if (!confirm(`Apagar "${c.nome_produto}" (${c.quantidade} un.) da ficha e devolver ao estoque?`)) return;

    const { data: devolveu, error } = await supabase.rpc('estornar_consumo', { p_consumo_id: c.id });
    if (error) {
      alert(`Erro ao apagar: ${error.message}`);
      return;
    }

    if (!devolveu) {
      alert('Item apagado da ficha. O produto não está mais no estoque, então não houve devolução.');
    }

    fetchData();
    fetchConsumos(selectedPaciente.id);
  }

  async function handleSalvarEdicaoConsumo(c: ConsumoPaciente, novoProdutoId: string, novaQtd: number) {
    if (!selectedPaciente) return { ok: false, msg: 'Paciente não selecionado.' };
    if (isNaN(novaQtd) || novaQtd <= 0) return { ok: false, msg: 'Quantidade inválida.' };

    const { error } = await supabase.rpc('corrigir_consumo', {
      p_consumo_id: c.id,
      p_produto_id: novoProdutoId,
      p_qtd: novaQtd,
    });
    if (error) return { ok: false, msg: error.message };

    fetchData();
    fetchConsumos(selectedPaciente.id);
    return { ok: true, msg: '' };
  }

  async function handleUsarItemNoPaciente(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPaciente || !selectedProdutoId) return alert('Selecione um item!');

    const qtd = parseInt(qtdConsumo);
    if (isNaN(qtd) || qtd <= 0) return alert('Quantidade inválida!');

    const prod = produtosAtivos.find((x) => x.id === selectedProdutoId);
    const diasProd = diasAteValidade(prod?.validade);
    if (diasProd !== null && diasProd < 0) {
      return alert(`${prod?.nome} está VENCIDO (validade ${new Date(prod!.validade! + 'T12:00:00').toLocaleDateString('pt-BR')}). Não dá para aplicar.`);
    }

    const { error } = await supabase.rpc('aplicar_item', {
      p_paciente_id: selectedPaciente.id,
      p_produto_id: selectedProdutoId,
      p_qtd: qtd,
    });
    if (error) {
      alert(`Não foi possível aplicar: ${error.message}`);
      fetchData(); // a quantidade na tela pode estar velha
      return;
    }

    setQtdConsumo('1');
    setSelectedProdutoId('');
    fetchData();
    fetchConsumos(selectedPaciente.id);
  }

  // Só produtos ativos entram no estoque, nos alertas e nos seletores.
  const produtosAtivos = products.filter((p) => !p.arquivado_em);
  const produtosArquivados = products.filter((p) => p.arquivado_em);

  // Ordena produtos: itens < 10 aparecem PRIMEIRO na lista
  const filteredProducts = (mostrarProdutosArquivados ? produtosArquivados : produtosAtivos)
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

  const produtosEstoqueBaixo = produtosAtivos.filter(p => p.quantidade < 10);
  const produtosVencidos = produtosAtivos.filter((p) => {
    const d = diasAteValidade(p.validade);
    return d !== null && d < 0;
  });
  const produtosVencendo = produtosAtivos.filter((p) => {
    const d = diasAteValidade(p.validade);
    return d !== null && d >= 0 && d <= 30;
  });
  const aniversariantesHoje = pacientes.filter(p => ehAniversarianteHoje(p.data_nascimento));
  // Item 9: o lembrete de amanhã vem da agenda de verdade, não do campo antigo.
  const retornosAmanha = pacientes.filter((p) => agendadosAmanha.has(p.id));

  const arquivados = pacientes.filter((p) => p.arquivado_em);

  const filteredPacientes = pacientes.filter((p) => {
    // Arquivados só aparecem quando você pede para vê-los.
    if (mostrarArquivados ? !p.arquivado_em : !!p.arquivado_em) return false;
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
        
        {/* CABEÇALHO — enxuto e sempre à mão: gruda no topo quando a tela rola */}
        <header className="sticky top-0 z-40 -mx-4 md:-mx-8 px-4 md:px-8 pt-2 pb-2 bg-[#FDFBF7]/95 backdrop-blur-sm print:static print:bg-transparent">
          <div className="bg-white border border-amber-200/80 rounded-2xl shadow-sm px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center gap-3">
              {pilhaVistas.length > 0 && (
                <button
                  onClick={voltar}
                  aria-label="Voltar para a tela anterior"
                  title="Voltar"
                  className="flex-shrink-0 w-10 h-10 rounded-full border border-amber-300 bg-white text-amber-900 text-lg font-bold hover:bg-amber-100 transition-colors shadow-sm print:hidden"
                >
                  ←
                </button>
              )}

              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-amber-400/60 p-0.5 bg-amber-50 shadow-sm overflow-hidden flex-shrink-0">
                <img src="/logo.jpeg" alt="Dra. Bruna Oliveira" className="w-full h-full object-cover rounded-full" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="font-serif font-bold text-amber-950 tracking-tight text-lg sm:text-xl leading-tight truncate">
                  Dra. Bruna Oliveira
                </h1>
                <p className="text-amber-800/80 text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase truncate">
                  Medicina do Esporte <span className="text-amber-600">•</span> CRM-MG 76958
                </p>
              </div>

              <a
                href="https://wa.me/5535999871770"
                target="_blank"
                rel="noreferrer"
                title="WhatsApp da clínica · (35) 99987-1770 · Rua Juca Stockler, 2029 - Passos/MG"
                className="flex-shrink-0 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-3 py-2.5 rounded-xl shadow transition-all print:hidden"
              >
                💬<span className="hidden lg:inline"> WhatsApp</span>
              </a>
            </div>

            {/* Abas: alvos grandes, lado a lado, sem quebrar em telas estreitas */}
            <nav className="mt-2.5 grid grid-cols-4 gap-1 bg-amber-100/60 p-1 rounded-xl border border-amber-200/50 print:hidden">
              {([
                { id: 'agenda', icone: '🔔', rotulo: 'Agenda' },
                { id: 'pacientes', icone: '👤', rotulo: 'Pacientes' },
                { id: 'financeiro', icone: '💰', rotulo: 'Financeiro' },
                { id: 'estoque', icone: '📦', rotulo: 'Estoque' },
              ] as const).map((aba) => (
                <button
                  key={aba.id}
                  onClick={() => irPara({ tab: aba.id, pacienteId: null })}
                  className={`relative px-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    mainTab === aba.id ? 'bg-amber-800 text-white shadow-sm' : 'text-amber-900 hover:bg-amber-200/50'
                  }`}
                >
                  <span className="sm:hidden block text-base leading-none mb-0.5">{aba.icone}</span>
                  <span className="hidden sm:inline">{aba.icone} </span>
                  {aba.rotulo}
                  {aba.id === 'estoque' && produtosEstoqueBaixo.length > 0 && (
                    <span className="absolute top-1 right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      !
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {/* ALERTAS GERAIS */}
        <div className="space-y-3 print:hidden">
          {/* Lembrete de cópia de segurança: só aparece quando passa do prazo */}
          <Backup compacto />
          <AlertaPacientes
            icone="🎂"
            titulo="Aniversariantes de hoje"
            pessoas={aniversariantesHoje}
            rotuloBotao="Parabenizar"
            tom="amber"
            linkWhatsApp={getWhatsAppLink}
            mensagem={(p) =>
              `Olá ${p.nome}, aqui é da clínica Dra. Bruna Oliveira! Desejamos um feliz aniversário, muita saúde e sucesso!`
            }
          />

          <AlertaPacientes
            icone="🔔"
            titulo="Têm atendimento amanhã"
            pessoas={retornosAmanha}
            rotuloBotao="Ver e avisar"
            tom="blue"
            linkWhatsApp={getWhatsAppLink}
            mensagem={(p) =>
              `Olá ${p.nome}, aqui é da clínica Dra. Bruna Oliveira. Lembramos que o seu atendimento está agendado para amanhã. Confirmado?`
            }
          />
        </div>

        {/* VIEW: AGENDA — lembretes de quem vem, quem falta marcar e quem sumiu */}
        {mainTab === 'agenda' && <Agenda onAbrirPaciente={abrirPacientePorId} />}

        {/* VIEW: FINANCEIRO — pagamentos de todos os pacientes, por mês ou geral */}
        {mainTab === 'financeiro' && <Financeiro onAbrirPaciente={abrirPacientePorId} />}

        {/* VIEW: PACIENTES */}
        {mainTab === 'pacientes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="space-y-6 print:hidden">
              {/* Cópia de segurança de tudo que está no sistema */}
              <Backup />

              {/* Fichas que os próprios pacientes preencheram pelo link /ficha */}
              <CadastrosRecebidos
                pacientes={pacientes.filter((p) => !p.arquivado_em).map((p) => ({ id: p.id, nome: p.nome }))}
                onMudou={fetchPacientes}
              />

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200/60">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-serif font-bold text-amber-950">
                    <span id="form-paciente">{editingPacienteId ? 'Editar Paciente' : 'Novo Paciente'}</span>
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
                      <input type="text" inputMode="numeric" value={cpfPaciente} onChange={(e) => setCpfPaciente(formatarCPF(e.target.value))} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/50" placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">Telefone</label>
                      <input type="tel" inputMode="tel" value={telPaciente} onChange={(e) => setTelPaciente(formatarTelefoneBR(e.target.value))} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/50" placeholder="(35) 90000-0000" />
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
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Meta de Peso (kg)</label>
                    <input type="text" inputMode="decimal" value={metaPeso} onChange={(e) => setMetaPeso(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" placeholder="Ex: 72 — aparece como linha no gráfico" />
                    <p className="text-[10px] text-amber-800/60 mt-1">O retorno agora é marcado na aba 🔔 Agenda.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Endereço</label>
                    <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" placeholder="Rua, número, cidade..." />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Histórico Clínico / Avaliação Esportiva</label>
                    <textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" placeholder="Objetivos esportivos, lesões prévias, suplementação em uso..."></textarea>
                  </div>

                  {/* Preferências de atendimento — aparecem na agenda antes do paciente chegar */}
                  <div className="pt-2 mt-1 border-t border-amber-100">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800/60 mb-2">
                      ✨ Preferências de atendimento
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">Prefere contato por</label>
                        <select
                          value={prefContato}
                          onChange={(e) => setPrefContato(e.target.value)}
                          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
                        >
                          <option value="">Não informado</option>
                          <option value="ligar">📞 Ligação</option>
                          <option value="mensagem">💬 Mensagem</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">Bebida</label>
                        <select
                          value={prefBebida}
                          onChange={(e) => setPrefBebida(e.target.value)}
                          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
                        >
                          <option value="">Não informado</option>
                          {BEBIDAS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-2">
                      <label className="block text-xs font-semibold text-amber-900 mb-1">Música</label>
                      <input
                        type="text"
                        value={prefMusica}
                        onChange={(e) => setPrefMusica(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
                        placeholder="Ex: MPB, bossa nova, silêncio"
                      />
                    </div>

                    <div className="mt-2">
                      <label className="block text-xs font-semibold text-amber-900 mb-1">Comida / outras observações</label>
                      <input
                        type="text"
                        value={prefComida}
                        onChange={(e) => setPrefComida(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
                        placeholder="Ex: castanhas, não come glúten, alergia a frutos do mar"
                      />
                    </div>
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
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h2 className="text-lg font-serif font-bold text-amber-950">
                    {mostrarArquivados ? 'Pacientes Arquivados' : 'Buscar Paciente'}
                    {/* Contagem de verdade: os outros números da Agenda são
                        filas de trabalho e mudam sozinhos conforme você agenda. */}
                    <span className="text-amber-700/70 font-sans text-sm font-semibold">
                      {' '}
                      ({pacientes.filter((p) => !p.arquivado_em).length})
                    </span>
                  </h2>
                  {(arquivados.length > 0 || mostrarArquivados) && (
                    <button
                      onClick={() => setMostrarArquivados(!mostrarArquivados)}
                      className="text-xs font-semibold text-amber-700 hover:underline flex-shrink-0"
                    >
                      {mostrarArquivados ? 'voltar aos ativos' : `ver arquivados (${arquivados.length})`}
                    </button>
                  )}
                </div>
                
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
                      const eRetorno = agendadosAmanha.has(p.id);
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setGerenciandoPaciente(p);
                              }}
                              title="Arquivar ou excluir"
                              className="text-xs p-1.5 hover:bg-red-100 rounded-md"
                            >
                              🗑️
                            </button>
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
                          {agendadosAmanha.has(selectedPaciente.id) && (
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
                          onClick={() => handleEnviarFicha(selectedPaciente)}
                          title="Manda um link para o paciente preencher a própria ficha no celular"
                          className="text-xs bg-white border border-emerald-700 text-emerald-800 hover:bg-emerald-50 font-semibold px-3 py-2 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                        >
                          📲 Pedir ficha
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="text-xs bg-amber-900 hover:bg-amber-950 text-white font-semibold px-4 py-2 rounded-xl shadow transition-colors flex items-center gap-1.5"
                        >
                          🖨️ Imprimir
                        </button>
                        <button
                          onClick={() => {
                            handlePrepareEditPaciente(selectedPaciente);
                            // No celular o formulário fica acima da ficha: sem
                            // isso, clicar em Editar parecia não fazer nada.
                            setTimeout(() => {
                              const el = document.getElementById('form-paciente');
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 60);
                          }}
                          className="text-xs bg-amber-100 text-amber-900 font-semibold px-3 py-2 rounded-xl hover:bg-amber-200"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => setGerenciandoPaciente(selectedPaciente)}
                          title="Arquivar ou excluir"
                          className="text-xs bg-red-50 text-red-800 border border-red-200 font-semibold px-3 py-2 rounded-xl hover:bg-red-100"
                        >
                          🗑️ Excluir
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
                          {proximoAgendamento
                            ? new Date(proximoAgendamento + 'T12:00:00').toLocaleDateString('pt-BR')
                            : 'Não agendado'}
                        </span>
                      </div>
                    </div>

                    {selectedPaciente.endereco && (
                      <p className="text-xs text-amber-900/80 mt-3">📍 <strong>Endereço:</strong> {selectedPaciente.endereco}</p>
                    )}

                    {(selectedPaciente.pref_contato ||
                      selectedPaciente.pref_musica ||
                      selectedPaciente.pref_bebida ||
                      selectedPaciente.pref_comida) && (
                      <div className="mt-4 p-4 bg-white border border-amber-300 rounded-xl">
                        <strong className="block text-amber-900 text-xs mb-2">✨ Preferências de atendimento</strong>
                        <div className="flex flex-wrap gap-2">
                          {selectedPaciente.pref_contato && (
                            <span className="text-xs bg-amber-100 text-amber-900 font-semibold px-2.5 py-1 rounded-full">
                              {selectedPaciente.pref_contato === 'ligar' ? '📞 Prefere ligação' : '💬 Prefere mensagem'}
                            </span>
                          )}
                          {selectedPaciente.pref_bebida && (
                            <span className="text-xs bg-amber-100 text-amber-900 font-semibold px-2.5 py-1 rounded-full">
                              🥤 {selectedPaciente.pref_bebida}
                            </span>
                          )}
                          {selectedPaciente.pref_musica && (
                            <span className="text-xs bg-amber-100 text-amber-900 font-semibold px-2.5 py-1 rounded-full">
                              🎵 {selectedPaciente.pref_musica}
                            </span>
                          )}
                          {selectedPaciente.pref_comida && (
                            <span className="text-xs bg-amber-100 text-amber-900 font-semibold px-2.5 py-1 rounded-full">
                              🍽️ {selectedPaciente.pref_comida}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedPaciente.observacoes && (
                      <div className="mt-4 p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-950">
                        <strong className="block text-amber-900 mb-1">📝 Histórico Clínico & Anotações:</strong>
                        <p className="whitespace-pre-wrap leading-relaxed">{selectedPaciente.observacoes}</p>
                      </div>
                    )}
                  </div>

                  {/* Marcar o retorno sem sair da ficha, durante a consulta */}
                  <div className="print:hidden">
                    <AgendarRetorno
                      pacienteId={selectedPaciente.id}
                      pacienteNome={selectedPaciente.nome}
                      telefone={selectedPaciente.telefone}
                      onMudou={() => fetchProximoAgendamento(selectedPaciente.id)}
                    />
                  </div>

                  {/* Pesagem rápida: registra sem abrir o formulário de edição */}
                  <div className="print:hidden">
                    <Pesagem
                      pacienteId={selectedPaciente.id}
                      altura={selectedPaciente.altura}
                      metaPeso={selectedPaciente.meta_peso}
                      onMudou={fetchPacientes}
                      aberto={pesagemAberta}
                      onAlternar={() => setPesagemAberta(!pesagemAberta)}
                    />
                  </div>

                  {/* O que o paciente já pagou; a aba Financeiro soma tudo */}
                  <div className="print:hidden">
                    <Pagamentos
                      pacienteId={selectedPaciente.id}
                      aberto={pagamentosAberto}
                      onAlternar={() => setPagamentosAberto(!pagamentosAberto)}
                    />
                  </div>

                  <div className="bg-white border border-amber-200/60 rounded-xl overflow-hidden print:hidden">
                    <button
                      type="button"
                      onClick={() => setPrescreverAberto(!prescreverAberto)}
                      className={`w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-amber-50/50 transition-colors text-left ${prescreverAberto ? 'border-b border-amber-100' : ''}`}
                    >
                      <h3 className="font-serif font-bold text-amber-950 text-base">💉 Prescrever / Aplicar Item do Estoque</h3>
                      <span className="text-amber-700 text-sm flex-shrink-0">{prescreverAberto ? 'Fechar' : 'Abrir'}</span>
                    </button>
                    {prescreverAberto && (
                    <form onSubmit={handleUsarItemNoPaciente} className="flex flex-col sm:flex-row gap-3 p-4 bg-amber-50/40">
                      <div className="flex-1">
                        <select
                          value={selectedProdutoId}
                          onChange={(e) => setSelectedProdutoId(e.target.value)}
                          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
                          required
                        >
                          <option value="">Selecione o medicamento/suplemento...</option>
                          {produtosAtivos.map((p) => {
                            const d = diasAteValidade(p.validade);
                            return (
                              <option key={p.id} value={p.id} disabled={p.quantidade <= 0 || (d !== null && d < 0)}>
                                {p.nome} ({d !== null && d < 0 ? 'VENCIDO' : `Disponível: ${p.quantidade} un.`}
                                {p.quantidade < 10 && !(d !== null && d < 0) ? ' ⚠️' : ''})
                              </option>
                            );
                          })}
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
                    )}
                  </div>

                  <div className="border border-amber-200/80 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setConsumosAberto(!consumosAberto)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-amber-50/50 transition-colors text-left print:hidden"
                    >
                      <div className="min-w-0">
                        <h3 className="font-serif font-bold text-amber-950 text-base">
                          📋 Medicamentos & Procedimentos Aplicados{' '}
                          {consumos.length > 0 && (
                            <span className="text-amber-700/70 font-sans text-sm">({consumos.length})</span>
                          )}
                        </h3>
                        {!consumosAberto && consumos.length > 0 && (
                          <p className="text-xs text-amber-800/70 mt-0.5 truncate">
                            último: {consumos[0].nome_produto} em{' '}
                            {new Date(consumos[0].created_at).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                      <span className="text-amber-700 text-sm flex-shrink-0">
                        {consumosAberto ? 'Fechar' : 'Abrir'}
                      </span>
                    </button>

                    {/* Na impressão a lista sai sempre, aberta ou não. */}
                    <div className={consumosAberto ? '' : 'hidden print:block'}>
                      <h3 className="hidden print:block font-serif font-bold text-amber-950 text-base px-4 pt-2">
                        📋 Medicamentos & Procedimentos Aplicados
                      </h3>
                      <table className="w-full text-left text-sm border-t border-amber-200/80">
                        <thead className="bg-amber-100/50 text-amber-950 border-b border-amber-200/80 font-serif">
                          <tr>
                            <th className="py-2.5 px-4">Descrição do Item</th>
                            <th className="py-2.5 px-4">Quantidade</th>
                            <th className="py-2.5 px-4">Data / Hora</th>
                            <th className="py-2.5 px-4 text-right print:hidden">Corrigir</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {consumos.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-amber-800/50 text-xs">Nenhum item aplicado até o momento.</td>
                            </tr>
                          ) : (
                            consumos.map((c) => (
                              <tr key={c.id} className="hover:bg-amber-50/30">
                                <td className="py-2.5 px-4 font-medium text-amber-950">{c.nome_produto}</td>
                                <td className="py-2.5 px-4 font-semibold text-amber-900">{c.quantidade} un.</td>
                                <td className="py-2.5 px-4 text-amber-800/70 text-xs">{new Date(c.created_at).toLocaleString('pt-BR')}</td>
                                <td className="py-2.5 px-4 text-right whitespace-nowrap print:hidden">
                                  <button
                                    onClick={() => setEditandoConsumo(c)}
                                    title="Corrigir item ou quantidade"
                                    className="text-xs p-1.5 hover:bg-amber-100 rounded-md"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteConsumo(c)}
                                    title="Apagar e devolver ao estoque"
                                    className="text-xs p-1.5 hover:bg-red-100 rounded-md"
                                  >
                                    🗑️
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
              ) : (
                <div className="bg-white p-12 rounded-2xl shadow-sm border border-amber-200/60 text-center text-amber-800/60 font-serif">
                  👈 Selecione um paciente na lista ao lado para abrir a ficha médica.
                </div>
              )}
            </div>

          </div>
        )}

        {gerenciandoPaciente && (
          <ModalGerenciarPaciente
            paciente={gerenciandoPaciente}
            onFechar={() => setGerenciandoPaciente(null)}
            onArquivar={handleArquivarPaciente}
            onRestaurar={handleRestaurarPaciente}
            onExcluir={handleDeletePaciente}
          />
        )}

        {editandoConsumo && (
          <ModalEditarConsumo
            consumo={editandoConsumo}
            produtos={produtosAtivos}
            onFechar={() => setEditandoConsumo(null)}
            onSalvar={handleSalvarEdicaoConsumo}
          />
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

            {(produtosVencidos.length > 0 || produtosVencendo.length > 0) && (
              <div className="bg-amber-100 border-l-4 border-amber-700 p-4 rounded-xl shadow-sm">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">📅</span>
                  <div className="text-xs text-amber-950 space-y-1">
                    <h4 className="font-serif font-bold text-sm">Validade</h4>
                    {produtosVencidos.length > 0 && (
                      <p>
                        <strong className="text-red-800">Vencidos ({produtosVencidos.length}):</strong>{" "}
                        {produtosVencidos.map((p) => p.nome).join(", ")} — não dá para aplicar em paciente.
                      </p>
                    )}
                    {produtosVencendo.length > 0 && (
                      <p>
                        <strong>Vencem em até 30 dias ({produtosVencendo.length}):</strong>{" "}
                        {produtosVencendo.map((p) => `${p.nome} (${diasAteValidade(p.validade)}d)`).join(", ")}
                      </p>
                    )}
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
                {editingProductId ? (
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Qtd. atual</label>
                    <p className="px-3 py-2 text-sm text-amber-900/70 bg-amber-50/60 border border-amber-100 rounded-lg">
                      muda pelos botões + / −
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Qtd. inicial *</label>
                    <input type="number" min="0" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none" required />
                  </div>
                )}
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
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input type="text" placeholder="🔍 Pesquisar por nome ou lote..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-72 px-3 py-2 border border-amber-200 rounded-lg text-xs outline-none" />
                  {(produtosArquivados.length > 0 || mostrarProdutosArquivados) && (
                    <button
                      type="button"
                      onClick={() => setMostrarProdutosArquivados(!mostrarProdutosArquivados)}
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${mostrarProdutosArquivados ? 'bg-amber-800 text-white border-amber-800' : 'border-amber-200 text-amber-800 hover:bg-amber-50'}`}
                    >
                      {mostrarProdutosArquivados ? '← Voltar ao estoque' : `🗂️ Arquivados (${produtosArquivados.length})`}
                    </button>
                  )}
                </div>
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
                      const dias = diasAteValidade(p.validade);
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
                          <td className="py-3 px-3 text-xs text-amber-800">
                            {p.validade ? new Date(p.validade).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                            {dias !== null && dias < 0 && (
                              <span className="block text-[10px] font-bold text-red-700">VENCIDO</span>
                            )}
                            {dias !== null && dias >= 0 && dias <= 30 && (
                              <span className="block text-[10px] font-bold text-amber-700">vence em {dias} dia{dias === 1 ? '' : 's'}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center space-x-1">
                            {p.arquivado_em ? (
                              <button onClick={() => handleRestaurarProduto(p)} title="Restaurar ao estoque" className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1 rounded-md text-xs font-semibold">↩ Restaurar</button>
                            ) : (
                              <>
                                <button onClick={() => handleEntrada(p)} title="Adicionar Entrada" className="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 rounded-md text-xs font-bold">+</button>
                                <button onClick={() => handleBaixa(p)} title="Dar Baixa" className="bg-amber-700 hover:bg-amber-800 text-white px-2.5 py-1 rounded-md text-xs font-bold">-</button>
                                <button onClick={() => handlePrepareEditProduct(p)} title="Editar Produto" className="bg-amber-100 text-amber-900 hover:bg-amber-200 px-2 py-1 rounded-md text-xs">✏️</button>
                                <button onClick={() => handleArquivarProduto(p)} title="Arquivar Produto" className="bg-stone-600 hover:bg-stone-700 text-white px-2 py-1 rounded-md text-xs">🗂️</button>
                              </>
                            )}
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

/* ------------------------------------------------------------------ */
/* Arquivar ou excluir um paciente                                     */
/* ------------------------------------------------------------------ */

function ModalGerenciarPaciente({
  paciente,
  onFechar,
  onArquivar,
  onRestaurar,
  onExcluir,
}: {
  paciente: Paciente;
  onFechar: () => void;
  onArquivar: (p: Paciente) => Promise<void>;
  onRestaurar: (p: Paciente) => Promise<void>;
  onExcluir: (p: Paciente) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const arquivado = !!paciente.arquivado_em;

  async function executar(fn: (p: Paciente) => Promise<void>) {
    setSalvando(true);
    await fn(paciente);
    setSalvando(false);
    onFechar();
  }

  return (
    <div
      className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden"
      onClick={onFechar}
    >
      <div
        className="bg-white border border-amber-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-amber-100">
          <h2 className="text-lg font-serif font-bold text-amber-950">{paciente.nome.trim()}</h2>
          <p className="text-xs text-amber-800/70 mt-0.5">
            {arquivado ? 'Paciente arquivado' : 'O que você quer fazer com este cadastro?'}
          </p>
        </div>

        <div className="px-6 py-4 space-y-2">
          {arquivado ? (
            <button
              onClick={() => executar(onRestaurar)}
              disabled={salvando}
              className="w-full text-left px-4 py-3 rounded-xl border border-amber-200 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              ↩️ Restaurar — volta para a lista de pacientes
            </button>
          ) : (
            <button
              onClick={() => executar(onArquivar)}
              disabled={salvando}
              className="w-full text-left px-4 py-3 rounded-xl border border-amber-200 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              📦 Arquivar — sai da lista, prontuário preservado
            </button>
          )}

          {confirmando ? (
            <div className="p-3 border border-red-300 bg-red-50 rounded-xl space-y-2">
              <p className="text-xs text-red-800 font-semibold leading-relaxed">
                Excluir de vez some com o cadastro sem deixar registro. Não tem como desfazer.
              </p>
              <p className="text-xs text-red-800">
                Só funciona para cadastro vazio: quem já tem pagamento, item aplicado, pesagem ou
                agendamento é protegido pelo app — esse deve ser arquivado.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmando(false)}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg border border-red-200 text-red-800 hover:bg-red-100 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={() => executar(onExcluir)}
                  disabled={salvando}
                  className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {salvando ? 'Excluindo…' : 'Excluir tudo'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              className="w-full text-left px-4 py-3 rounded-xl border border-red-200 text-sm font-semibold text-red-800 hover:bg-red-50 transition-colors"
            >
              🗑️ Cadastro duplicado ou engano — excluir de vez
            </button>
          )}
        </div>

        <button
          onClick={onFechar}
          className="w-full px-6 py-3 border-t border-amber-100 text-sm font-semibold text-amber-800 hover:bg-amber-50 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Correção de um item já aplicado na ficha                            */
/* ------------------------------------------------------------------ */

function ModalEditarConsumo({
  consumo,
  produtos,
  onFechar,
  onSalvar,
}: {
  consumo: ConsumoPaciente;
  produtos: Product[];
  onFechar: () => void;
  onSalvar: (c: ConsumoPaciente, produtoId: string, qtd: number) => Promise<{ ok: boolean; msg: string }>;
}) {
  const [produtoId, setProdutoId] = useState(consumo.produto_id || '');
  const [qtd, setQtd] = useState(String(consumo.quantidade));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const produtoEscolhido = produtos.find((p) => p.id === produtoId);
  const mesmoProduto = produtoId === consumo.produto_id;
  const diferenca = mesmoProduto ? (parseInt(qtd) || 0) - consumo.quantidade : 0;

  async function salvar() {
    setSalvando(true);
    setErro('');
    const r = await onSalvar(consumo, produtoId, parseInt(qtd));
    setSalvando(false);
    if (!r.ok) {
      setErro(r.msg);
      return;
    }
    onFechar();
  }

  return (
    <div className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white border border-amber-200 rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-serif font-bold text-amber-950 mb-1">Corrigir item aplicado</h2>
        <p className="text-xs text-amber-900/70 mb-5">
          Era <strong>{consumo.nome_produto}</strong>, {consumo.quantidade} un. O estoque se ajusta sozinho
          à diferença.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-amber-900 mb-1">Item</label>
            <select
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
            >
              {!consumo.produto_id && <option value="">— produto não está mais no estoque —</option>}
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} (disponível: {p.quantidade} un.)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-amber-900 mb-1">Quantidade</label>
            <input
              type="number"
              min="1"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
            />
          </div>

          {mesmoProduto && diferenca !== 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {diferenca > 0
                ? `Vai sair mais ${diferenca} un. do estoque.`
                : `Vão voltar ${Math.abs(diferenca)} un. para o estoque.`}
            </p>
          )}

          {!mesmoProduto && produtoEscolhido && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {consumo.quantidade} un. de {consumo.nome_produto} voltam ao estoque, e saem {qtd || 0} un. de{' '}
              {produtoEscolhido.nome}.
            </p>
          )}

          {erro && (
            <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2.5 rounded-lg">
              <p className="text-xs text-red-800 font-semibold">{erro}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border border-amber-200 text-amber-900 hover:bg-amber-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !produtoId}
              className="flex-1 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow transition-colors"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
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
