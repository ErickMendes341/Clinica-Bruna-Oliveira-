'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ROTULO_PAPEL, type Papel } from '@/lib/permissoes';
import { limparNome } from '@/lib/validacao';

const UM_MINUTO = 60_000;
const TEMPO_DO_AVISO = 6_000;
const PAPEIS: Papel[] = ['atendimento', 'estoque', 'total'];

export interface Pedido {
  user_id: string;
  nome: string;
  email: string;
  criado_em: string;
}

/** Devolve o problema em texto, ou vazio quando deu certo. */
type Resposta = Promise<string>;

function quandoPediu(iso: string) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
}

function CartaoDoPedido({
  pedido,
  onAutorizar,
  onRecusar,
}: {
  pedido: Pedido;
  onAutorizar: (pedido: Pedido, nome: string, papel: Papel) => Resposta;
  onRecusar: (pedido: Pedido) => Resposta;
}) {
  // Só o primeiro nome: é assim que a equipe aparece no app e nas mensagens.
  const [nome, setNome] = useState(pedido.nome.trim().split(' ')[0]);
  const [papel, setPapel] = useState<Papel>('atendimento');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  async function executar(acao: () => Resposta) {
    setErro('');
    setOcupado(true);
    const problema = await acao();
    setOcupado(false);
    setErro(problema);
  }

  function autorizar() {
    const limpo = limparNome(nome);
    if (!limpo) return setErro('Escreva o nome da pessoa.');
    if (
      papel === 'total' &&
      !confirm(`Dar ACESSO TOTAL para ${limpo}?\n\nCom ele, a pessoa vê o financeiro e pode excluir definitivamente.`)
    ) {
      return;
    }
    executar(() => onAutorizar(pedido, limpo, papel));
  }

  function recusar() {
    if (!confirm(`Recusar o pedido de ${pedido.nome} (${pedido.email})?`)) return;
    executar(() => onRecusar(pedido));
  }

  return (
    <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2.5">
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-950 break-words">{pedido.nome}</p>
        <p className="text-xs text-amber-900/80 break-all">{pedido.email}</p>
        <p className="text-[11px] text-amber-800/60">Pediu em {quandoPediu(pedido.criado_em)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block text-xs font-semibold text-amber-900">
          Nome no app e nas mensagens
          <input
            type="text"
            value={nome}
            maxLength={60}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-amber-200 rounded-lg text-sm font-normal bg-white outline-none focus:border-amber-500"
          />
        </label>
        <label className="block text-xs font-semibold text-amber-900">
          Tipo de acesso
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value as Papel)}
            className="mt-1 w-full px-3 py-2 border border-amber-200 rounded-lg text-sm font-normal bg-white outline-none"
          >
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && <p className="text-xs text-red-800 font-semibold">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={autorizar}
          disabled={ocupado}
          className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold px-3 py-2.5 rounded-lg transition-colors"
        >
          Autorizar
        </button>
        <button
          type="button"
          onClick={recusar}
          disabled={ocupado}
          className="flex-1 border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60 text-xs font-bold px-3 py-2.5 rounded-lg transition-colors"
        >
          Recusar
        </button>
      </div>
    </div>
  );
}

/** A faixa com os pedidos. Separada para poder ser testada sem banco. */
export function ListaDePedidos({
  pedidos,
  aviso,
  onAutorizar,
  onRecusar,
}: {
  pedidos: Pedido[];
  aviso: string;
  onAutorizar: (pedido: Pedido, nome: string, papel: Papel) => Resposta;
  onRecusar: (pedido: Pedido) => Resposta;
}) {
  if (pedidos.length === 0 && !aviso) return null;

  return (
    <section
      aria-label="Pedidos de acesso"
      className="bg-amber-50 border-b border-amber-200 px-4 md:px-8 py-3 print:hidden"
    >
      <div className="max-w-3xl mx-auto space-y-2.5">
        {aviso && <p className="text-xs font-semibold text-emerald-800">✅ {aviso}</p>}

        {pedidos.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-amber-950">
              🔔 {pedidos.length === 1 ? '1 pedido de acesso' : `${pedidos.length} pedidos de acesso`}
            </h2>
            <p className="text-xs text-amber-900/80 leading-relaxed">
              O app não confere se o e-mail é mesmo da pessoa. Antes de autorizar, confirme com
              ela, pessoalmente ou por telefone, que foi ela quem pediu.
            </p>
          </div>
        )}

        {pedidos.map((p) => (
          <CartaoDoPedido key={p.user_id} pedido={p} onAutorizar={onAutorizar} onRecusar={onRecusar} />
        ))}
      </div>
    </section>
  );
}

/**
 * Pedidos de acesso esperando autorização.
 *
 * Fica fora das abas para a Dra. Bruna ver em qualquer tela do app. Para
 * o resto da equipe não aparece nada, e quem decide isso é o banco: as
 * funções recusam quem não aprova, mesmo que a tela fosse burlada.
 */
export default function PedidosDeAcesso() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('pedidos_de_acesso');
    if (data) setPedidos(data as Pedido[]);
  }, []);

  useEffect(() => {
    let montado = true;
    let relogio: ReturnType<typeof setInterval> | undefined;
    const seVisivel = () => {
      if (document.visibilityState === 'visible') carregar();
    };

    // Só quem aprova fica perguntando ao banco.
    supabase.rpc('posso_aprovar_acessos').then(({ data }) => {
      if (!montado || data !== true) return;
      carregar();
      relogio = setInterval(seVisivel, UM_MINUTO);
      document.addEventListener('visibilitychange', seVisivel);
    });

    return () => {
      montado = false;
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', seVisivel);
    };
  }, [carregar]);

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(''), TEMPO_DO_AVISO);
    return () => clearTimeout(id);
  }, [aviso]);

  const tirarDaLista = (pedido: Pedido) =>
    setPedidos((lista) => lista.filter((p) => p.user_id !== pedido.user_id));

  async function autorizar(pedido: Pedido, nome: string, papel: Papel) {
    const { error } = await supabase.rpc('aprovar_acesso', {
      p_user_id: pedido.user_id,
      p_nome: nome,
      p_papel: papel,
    });
    if (error) return error.message;
    tirarDaLista(pedido);
    setAviso(`Acesso de ${nome} liberado. Já pode entrar no app.`);
    return '';
  }

  async function recusar(pedido: Pedido) {
    const { error } = await supabase.rpc('recusar_acesso', { p_user_id: pedido.user_id });
    if (error) return error.message;
    tirarDaLista(pedido);
    setAviso(`Pedido de ${pedido.nome} recusado.`);
    return '';
  }

  return (
    <ListaDePedidos pedidos={pedidos} aviso={aviso} onAutorizar={autorizar} onRecusar={recusar} />
  );
}
