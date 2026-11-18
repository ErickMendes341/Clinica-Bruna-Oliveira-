'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ROTULO_PAPEL, type Papel } from '@/lib/permissoes';

export interface Conta {
  user_id: string;
  email: string;
  nome: string;
  situacao: 'equipe' | 'aguardando' | 'recusada' | 'sem_acesso';
  papel: Papel | null;
  posto: boolean;
  autoriza: boolean;
  sou_eu: boolean;
  criada_em: string;
  ultimo_acesso: string | null;
}

const GRUPOS: { situacao: Conta['situacao']; titulo: string }[] = [
  { situacao: 'equipe', titulo: 'Equipe' },
  { situacao: 'aguardando', titulo: 'Aguardando autorização' },
  { situacao: 'recusada', titulo: 'Recusadas' },
  { situacao: 'sem_acesso', titulo: 'Sem acesso' },
];

/** A lista no banco. Vem vazia para quem não autoriza acessos. */
async function buscarContas() {
  const { data, error } = await supabase.rpc('contas_do_app');
  return { lista: (data as Conta[] | null) ?? [], falhou: !!error };
}

function ultimoAcesso(iso: string | null) {
  if (!iso) return 'nunca entrou';
  const dia = new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return `último acesso em ${dia}`;
}

/** O aviso antes de apagar: diz quem é e o que acontece, sem rodeio. */
export function textoDaConfirmacao(c: Conta) {
  return (
    `Excluir a conta de ${c.nome} (${c.email})?\n\n` +
    (c.posto ? 'Este login é usado por várias pessoas: todas ficam sem acesso.\n\n' : '') +
    'A pessoa perde o acesso na hora. O que ela registrou continua no sistema.\n\n' +
    'Isso não pode ser desfeito.'
  );
}

function LinhaDaConta({
  conta,
  ocupado,
  onExcluir,
}: {
  conta: Conta;
  ocupado: boolean;
  onExcluir: (c: Conta) => void;
}) {
  const etiqueta = conta.sou_eu
    ? 'você'
    : conta.posto
      ? 'login de várias pessoas'
      : conta.papel
        ? ROTULO_PAPEL[conta.papel]
        : '';

  return (
    <li className="py-2.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-950 break-words">
          {conta.nome}
          {etiqueta && <span className="ml-1.5 text-[11px] font-semibold text-amber-800/70">· {etiqueta}</span>}
        </p>
        <p className="text-xs text-amber-900/80 break-all">{conta.email}</p>
        <p className="text-[11px] text-amber-800/60">{ultimoAcesso(conta.ultimo_acesso)}</p>
      </div>
      {/* O banco recusa os dois casos de qualquer jeito; aqui só não oferece o botão. */}
      {conta.sou_eu ? null : conta.autoriza ? (
        <span className="text-[11px] text-amber-800/60 flex-shrink-0 pt-1">autoriza acessos</span>
      ) : (
        <button
          type="button"
          onClick={() => onExcluir(conta)}
          disabled={ocupado}
          className="flex-shrink-0 text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          Excluir
        </button>
      )}
    </li>
  );
}

/** A lista agrupada. Separada para poder ser testada sem banco. */
export function ListaDeContas({
  contas,
  ocupado,
  onExcluir,
}: {
  contas: Conta[];
  ocupado: string;
  onExcluir: (c: Conta) => void;
}) {
  return (
    <div className="space-y-4">
      {GRUPOS.map(({ situacao, titulo }) => {
        const doGrupo = contas.filter((c) => c.situacao === situacao);
        if (doGrupo.length === 0) return null;
        return (
          <section key={situacao}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-800/70">
              {titulo} ({doGrupo.length})
            </h3>
            <ul className="divide-y divide-amber-100">
              {doGrupo.map((c) => (
                <LinhaDaConta key={c.user_id} conta={c} ocupado={ocupado === c.user_id} onExcluir={onExcluir} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Todas as contas do app, para a Dra. Bruna excluir quem não faz parte da
 * clínica.
 *
 * Quem decide quem pode excluir é o banco: a lista vem vazia e a exclusão é
 * recusada para quem não autoriza acessos, mesmo que a tela fosse burlada.
 */
export default function ContasDoApp({ onFechar }: { onFechar: () => void }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const mostrar = useCallback(({ lista, falhou }: { lista: Conta[]; falhou: boolean }) => {
    if (falhou) setErro('Não foi possível carregar as contas. Tente de novo.');
    else setContas(lista);
    setCarregando(false);
  }, []);

  useEffect(() => {
    let aberto = true;
    buscarContas().then((r) => {
      if (aberto) mostrar(r);
    });
    return () => {
      aberto = false;
    };
  }, [mostrar]);

  async function excluir(c: Conta) {
    if (!confirm(textoDaConfirmacao(c))) return;
    setErro('');
    setAviso('');
    setOcupado(c.user_id);
    const { error } = await supabase.rpc('excluir_conta', { p_user_id: c.user_id });
    setOcupado('');
    if (error) return setErro(error.message);
    setAviso(`Conta de ${c.nome} excluída.`);
    mostrar(await buscarContas());
  }

  return (
    // Acima da navegação do rodapé no celular (z-50), que cobria o fim da lista.
    <div
      className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white border border-amber-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-amber-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-serif font-bold text-amber-950">Contas do app</h2>
            <p className="text-xs text-amber-900/70 leading-relaxed mt-0.5">
              Exclua quem não faz parte da clínica. O que a pessoa registrou continua no sistema.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-amber-200 text-amber-900 hover:bg-amber-50 transition-colors"
          >
            Fechar
          </button>
        </div>

        <div className="px-5 py-3 overflow-y-auto">
          {aviso && <p className="text-xs font-semibold text-emerald-800 mb-2">✅ {aviso}</p>}
          {erro && (
            <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2 rounded-lg mb-2">
              <p className="text-xs text-red-800 font-semibold">{erro}</p>
            </div>
          )}
          {carregando ? (
            <p className="text-xs text-amber-800/60 py-6 text-center">Carregando contas…</p>
          ) : (
            <ListaDeContas contas={contas} ocupado={ocupado} onExcluir={excluir} />
          )}
        </div>
      </div>
    </div>
  );
}
