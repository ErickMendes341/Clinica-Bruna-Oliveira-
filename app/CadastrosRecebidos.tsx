'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/* O que o paciente mandou pelo formulário /ficha, esperando a equipe aceitar. */
interface Recebido {
  id: string;
  paciente_id: string | null;
  dados: Record<string, string>;
  created_at: string;
  pacientes?: { nome: string } | null;
}

interface PacienteMin {
  id: string;
  nome: string;
}

const ROTULOS: Record<string, string> = {
  nome: 'Nome',
  telefone: 'Telefone',
  cpf: 'CPF',
  data_nascimento: 'Nascimento',
  endereco: 'Endereço',
  peso: 'Peso',
  altura: 'Altura',
  pref_contato: 'Contato',
  pref_bebida: 'Bebida',
  pref_musica: 'Música',
  pref_comida: 'Comida',
  observacoes: 'Observações',
};

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function dataBR(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function linkFichaGeral() {
  return `${window.location.origin}/ficha`;
}

/* Gera o convite e devolve o link único do paciente (vale 7 dias). */
export async function criarConviteFicha(pacienteId: string) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const { data: sessao } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('convites_ficha')
    .insert([{ token, paciente_id: pacienteId, criado_por: sessao.user?.id ?? null }]);
  if (error) return { ok: false as const, msg: error.message };
  return { ok: true as const, link: `${window.location.origin}/ficha?t=${token}` };
}

export default function CadastrosRecebidos({
  pacientes,
  onMudou,
}: {
  pacientes: PacienteMin[];
  onMudou: () => void;
}) {
  const [lista, setLista] = useState<Recebido[]>([]);
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('cadastros_recebidos')
      .select('id,paciente_id,dados,created_at,pacientes(nome)')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });
    setLista((data as unknown as Recebido[]) || []);
  }, []);

  useEffect(() => {
    carregar();
    // Chega ficha nova enquanto a tela está aberta: confere a cada minuto.
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') carregar();
    }, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  async function copiarLinkGeral() {
    try {
      await navigator.clipboard.writeText(linkFichaGeral());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      prompt('Copie o link:', linkFichaGeral());
    }
  }

  if (lista.length === 0 && !aberto) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-200/60 flex items-center justify-between gap-3">
        <p className="text-xs text-amber-900/70">
          📥 Nenhuma ficha aguardando. Pacientes novos podem preencher pelo link geral.
        </p>
        <button
          type="button"
          onClick={copiarLinkGeral}
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-50"
        >
          {copiado ? '✅ Copiado' : '🔗 Copiar link geral'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-300 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full px-5 py-3.5 flex items-center justify-between gap-3 bg-amber-50/70 hover:bg-amber-100/60 transition-colors text-left"
      >
        <h3 className="font-serif font-bold text-amber-950 text-base">
          📥 Fichas recebidas <span className="text-amber-700/70 font-sans text-sm">({lista.length})</span>
        </h3>
        <span className="text-amber-700 text-sm flex-shrink-0">{aberto ? 'Fechar' : 'Conferir'}</span>
      </button>

      {aviso && (
        <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs font-semibold text-emerald-900">{aviso}</div>
      )}

      {aberto && (
        <div className="divide-y divide-amber-100">
          {lista.length === 0 && <p className="px-5 py-4 text-xs text-amber-800/70">Nenhuma ficha aguardando.</p>}
          {lista.map((r) => (
            <ItemRecebido
              key={r.id}
              r={r}
              pacientes={pacientes}
              onProcessado={(msg) => {
                setAviso(msg);
                setTimeout(() => setAviso(''), 4000);
                carregar();
                onMudou();
              }}
            />
          ))}
          <div className="px-5 py-3 flex items-center justify-between gap-3 bg-amber-50/40">
            <p className="text-[11px] text-amber-900/60">Link geral para pacientes novos: {typeof window !== 'undefined' ? linkFichaGeral() : '/ficha'}</p>
            <button type="button" onClick={copiarLinkGeral} className="text-[11px] font-semibold text-amber-800 hover:underline flex-shrink-0">
              {copiado ? '✅ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRecebido({
  r,
  pacientes,
  onProcessado,
}: {
  r: Recebido;
  pacientes: PacienteMin[];
  onProcessado: (msg: string) => void;
}) {
  const d = r.dados;
  // Ficha sem convite: tenta achar alguém com o mesmo nome para não duplicar.
  const parecidos = r.paciente_id
    ? []
    : pacientes.filter((p) => {
        const a = norm(p.nome).split(' ');
        const b = norm(d.nome || '').split(' ');
        return b.length > 0 && b[0] === a[0] && (b.length === 1 || a.includes(b[b.length - 1]));
      });
  const [vincular, setVincular] = useState<string>(r.paciente_id ?? (parecidos.length === 1 ? parecidos[0].id : ''));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function aceitar() {
    setSalvando(true);
    setErro('');
    const { error } = await supabase.rpc('aceitar_cadastro', {
      p_id: r.id,
      p_paciente_id: vincular || null,
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    onProcessado(vincular ? `✅ Ficha de ${d.nome} atualizada.` : `✅ Ficha de ${d.nome} criada — já aparece na lista.`);
  }

  async function descartar() {
    if (!confirm('Descartar esta ficha? Ela não entra em nenhum cadastro.')) return;
    const { error } = await supabase
      .from('cadastros_recebidos')
      .update({ status: 'descartado', processado_em: new Date().toISOString() })
      .eq('id', r.id);
    if (error) return setErro(error.message);
    onProcessado('Ficha descartada.');
  }

  const preenchidos = Object.entries(ROTULOS).filter(([k]) => (d[k] || '').trim());

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-amber-950">{d.nome}</p>
          <p className="text-xs text-amber-800/70">
            recebida em {dataBR(r.created_at)}
            {r.paciente_id && r.pacientes?.nome && (
              <>
                {' '}· vai atualizar a ficha de <strong>{r.pacientes.nome.trim()}</strong>
              </>
            )}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {preenchidos.map(([k, rot]) => (
          <div key={k} className={k === 'observacoes' || k === 'endereco' ? 'sm:col-span-2' : ''}>
            <dt className="inline text-amber-800/60 font-semibold">{rot}: </dt>
            <dd className="inline text-amber-950 whitespace-pre-wrap">
              {k === 'pref_contato' ? (d[k] === 'ligar' ? 'Ligação' : 'Mensagem') : d[k]}
            </dd>
          </div>
        ))}
      </dl>

      {!r.paciente_id && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label className="text-xs font-semibold text-amber-900 flex-shrink-0">Esta pessoa é:</label>
          <select
            value={vincular}
            onChange={(e) => setVincular(e.target.value)}
            className="flex-1 px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
          >
            <option value="">➕ Paciente novo (criar ficha)</option>
            {parecidos.length > 0 && (
              <optgroup label="Parece ser…">
                {parecidos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome.trim()}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Outro paciente já cadastrado">
              {pacientes
                .filter((p) => !parecidos.some((x) => x.id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.nome.trim()}</option>
                ))}
            </optgroup>
          </select>
        </div>
      )}

      {erro && <p className="text-xs text-red-700 font-semibold">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={aceitar}
          disabled={salvando}
          className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition-colors"
        >
          {salvando ? 'Salvando…' : vincular ? '✅ Aceitar e atualizar ficha' : '✅ Aceitar e criar ficha'}
        </button>
        <button
          type="button"
          onClick={descartar}
          disabled={salvando}
          className="text-sm font-semibold px-4 py-2 rounded-lg border border-amber-200 text-amber-900 hover:bg-amber-50 transition-colors"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
