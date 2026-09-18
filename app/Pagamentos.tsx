'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/* Uma linha no banco = uma parte do pagamento (uma forma, um valor).
   Partes do mesmo pagamento compartilham o grupo_id.                    */
export interface ParteDb {
  id: string;
  paciente_id: string;
  grupo_id: string;
  valor: number;
  forma: string;
  descricao?: string | null;
  data: string;
  created_at: string;
}

/* Um pagamento como a pessoa vê: data, descrição e as partes somadas. */
export interface Pagamento {
  grupo_id: string;
  paciente_id: string;
  data: string;
  descricao?: string | null;
  partes: ParteDb[];
  total: number;
}

export const FORMAS = [
  { id: 'pix', label: 'Pix' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_credito', label: 'Cartão de crédito' },
  { id: 'cartao_debito', label: 'Cartão de débito' },
  { id: 'transferencia', label: 'Transferência' },
  { id: 'outro', label: 'Outro' },
];

export function rotuloForma(id: string) {
  return FORMAS.find((f) => f.id === id)?.label ?? id;
}

export function reais(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataBR(iso: string) {
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
}

/* "R$ 100,00 Dinheiro + R$ 250,00 Pix" — ou só "Pix" quando é uma parte. */
export function resumoFormas(p: Pagamento) {
  if (p.partes.length === 1) return rotuloForma(p.partes[0].forma);
  return p.partes.map((x) => `${reais(x.valor)} ${rotuloForma(x.forma)}`).join(' + ');
}

/* Junta as linhas do banco em pagamentos, mantendo a ordem de chegada. */
export function agrupar(linhas: ParteDb[]): Pagamento[] {
  const mapa = new Map<string, Pagamento>();
  for (const l of linhas) {
    const parte = { ...l, valor: Number(l.valor) };
    const g = mapa.get(l.grupo_id);
    if (g) {
      g.partes.push(parte);
      g.total += parte.valor;
    } else {
      mapa.set(l.grupo_id, {
        grupo_id: l.grupo_id,
        paciente_id: l.paciente_id,
        data: l.data,
        descricao: l.descricao,
        partes: [parte],
        total: parte.valor,
      });
    }
  }
  return [...mapa.values()];
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function paraNumero(s: string) {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

function paraTexto(n: number) {
  return n.toFixed(2).replace('.', ',');
}

interface ParteForm {
  forma: string;
  valor: string;
}

const PARTE_VAZIA: ParteForm = { forma: 'pix', valor: '' };

/* ------------------------------------------------------------------ */
/* Pagamentos de um paciente, dentro da ficha                          */
/* ------------------------------------------------------------------ */

export default function Pagamentos({ pacienteId }: { pacienteId: string }) {
  const [lista, setLista] = useState<Pagamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [partes, setPartes] = useState<ParteForm[]>([PARTE_VAZIA]);
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  // Quando preenchido, o formulário está alterando esse pagamento em vez de criar um novo.
  const [editandoGrupo, setEditandoGrupo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data: linhas } = await supabase
      .from('pagamentos')
      .select('id,paciente_id,grupo_id,valor,forma,descricao,data,created_at')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });
    setLista(agrupar((linhas as ParteDb[]) || []));
    setCarregando(false);
  }, [pacienteId]);

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [carregar]);

  function limpar() {
    setEditandoGrupo(null);
    setPartes([PARTE_VAZIA]);
    setDescricao('');
    setData(hojeISO());
    setErro('');
  }

  function editar(p: Pagamento) {
    setEditandoGrupo(p.grupo_id);
    setPartes(p.partes.map((x) => ({ forma: x.forma, valor: paraTexto(x.valor) })));
    setDescricao(p.descricao ?? '');
    setData(p.data);
    setErro('');
  }

  function mudarParte(i: number, campo: keyof ParteForm, v: string) {
    setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));
  }

  function adicionarParte() {
    // Sugere uma forma diferente da última, que é o caso comum (dinheiro + cartão).
    const usadas = new Set(partes.map((p) => p.forma));
    const proxima = FORMAS.find((f) => !usadas.has(f.id))?.id ?? 'outro';
    setPartes((ps) => [...ps, { forma: proxima, valor: '' }]);
  }

  function removerParte(i: number) {
    setPartes((ps) => (ps.length === 1 ? ps : ps.filter((_, j) => j !== i)));
  }

  const totalForm = partes.reduce((s, p) => {
    const n = paraNumero(p.valor);
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();

    const valores = partes.map((p) => ({ forma: p.forma, valor: paraNumero(p.valor) }));
    if (valores.some((v) => isNaN(v.valor) || v.valor <= 0)) {
      setErro(partes.length === 1 ? 'Informe o valor. Ex: 350 ou 1.250,00' : 'Preencha o valor de cada parte.');
      return;
    }
    setErro('');
    setSalvando(true);

    const grupo = editandoGrupo ?? crypto.randomUUID();
    const { data: sessao } = await supabase.auth.getUser();

    // Ao alterar, troca as partes antigas pelas novas (o grupo continua o mesmo).
    if (editandoGrupo) {
      const { error } = await supabase.from('pagamentos').delete().eq('grupo_id', editandoGrupo);
      if (error) {
        setSalvando(false);
        setErro(`Não foi possível alterar: ${error.message}`);
        return;
      }
    }

    const { error } = await supabase.from('pagamentos').insert(
      valores.map((v) => ({
        paciente_id: pacienteId,
        grupo_id: grupo,
        valor: v.valor,
        forma: v.forma,
        descricao: descricao.trim() || null,
        data,
        registrado_por: sessao.user?.id ?? null,
      }))
    );

    setSalvando(false);
    if (error) {
      setErro(`Não foi possível ${editandoGrupo ? 'alterar' : 'registrar'}: ${error.message}`);
      carregar();
      return;
    }
    limpar();
    carregar();
  }

  async function remover(p: Pagamento) {
    if (!confirm(`Excluir o pagamento de ${reais(p.total)} de ${dataBR(p.data)}?`)) return;
    const { error } = await supabase.from('pagamentos').delete().eq('grupo_id', p.grupo_id);
    if (error) return alert(`Não foi possível excluir: ${error.message}`);
    if (editandoGrupo === p.grupo_id) limpar();
    carregar();
  }

  const total = lista.reduce((s, p) => s + p.total, 0);

  return (
    <div className="bg-white rounded-xl border border-amber-200/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-100 flex items-center justify-between gap-3">
        <h3 className="font-serif font-bold text-amber-950 text-sm">💳 Pagamentos</h3>
        {lista.length > 0 && (
          <span className="text-xs text-amber-900">
            Total pago: <strong className="text-emerald-800">{reais(total)}</strong>
          </span>
        )}
      </div>

      {/* ---------- Registro / alteração ---------- */}
      <form
        onSubmit={salvar}
        className={`px-5 py-4 border-b border-amber-100 space-y-2 ${editandoGrupo ? 'bg-blue-50/60' : 'bg-amber-50/40'}`}
      >
        {editandoGrupo && (
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-900">✏️ Alterando pagamento</p>
            <button type="button" onClick={limpar} className="text-xs text-blue-800 hover:underline">
              Cancelar
            </button>
          </div>
        )}

        {/* Uma linha por forma de pagamento */}
        {partes.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={p.valor}
              onChange={(e) => mudarParte(i, 'valor', e.target.value)}
              placeholder={partes.length === 1 ? 'Valor — ex: 350' : `Parte ${i + 1}`}
              className="flex-1 min-w-0 px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:border-amber-500 bg-white"
            />
            <select
              value={p.forma}
              onChange={(e) => mudarParte(i, 'forma', e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
            >
              {FORMAS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            {partes.length > 1 && (
              <button
                type="button"
                onClick={() => removerParte(i)}
                title="Tirar esta parte"
                className="flex-shrink-0 w-9 rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-100 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={adicionarParte}
            className="text-xs font-semibold text-amber-800 hover:text-amber-950 hover:underline"
          >
            ＋ Dividir em outra forma
          </button>
          {partes.length > 1 && (
            <span className="text-xs text-amber-900">
              Total: <strong className="text-emerald-800">{reais(totalForm)}</strong>
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Do que se trata (opcional) — ex: consulta, implante, parcela 2/3"
            className="flex-1 min-w-0 px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:border-amber-500 bg-white"
          />
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
          />
          <button
            type="submit"
            disabled={salvando || totalForm <= 0}
            className={`${editandoGrupo ? 'bg-blue-700 hover:bg-blue-800' : 'bg-emerald-700 hover:bg-emerald-800'} disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition-colors`}
          >
            {salvando ? 'Salvando…' : editandoGrupo ? 'Salvar alteração' : 'Registrar'}
          </button>
        </div>
        {erro && <p className="text-xs text-red-700 font-semibold">{erro}</p>}
      </form>

      {/* ---------- Histórico ---------- */}
      {carregando ? (
        <p className="px-5 py-4 text-xs text-amber-800/60">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="px-5 py-4 text-xs text-amber-800/70">Nenhum pagamento registrado ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-amber-50/50 text-amber-950 font-serif text-xs">
              <tr>
                <th className="py-2 px-4">Data</th>
                <th className="py-2 px-4">Valor</th>
                <th className="py-2 px-4">Forma</th>
                <th className="py-2 px-4">Descrição</th>
                <th className="py-2 px-4 print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {lista.map((p) => (
                <tr key={p.grupo_id} className={editandoGrupo === p.grupo_id ? 'bg-blue-50/60' : 'hover:bg-amber-50/30'}>
                  <td className="py-2 px-4 text-xs text-amber-800 tabular-nums">{dataBR(p.data)}</td>
                  <td className="py-2 px-4 font-semibold text-emerald-800 tabular-nums">{reais(p.total)}</td>
                  <td className="py-2 px-4 text-xs text-amber-900">{resumoFormas(p)}</td>
                  <td className="py-2 px-4 text-xs text-amber-900/80">{p.descricao || '—'}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap print:hidden">
                    <button
                      onClick={() => editar(p)}
                      title="Editar pagamento"
                      className="text-xs bg-amber-100 text-amber-900 hover:bg-amber-200 px-2 py-1 rounded-md mr-1"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => remover(p)}
                      title="Excluir pagamento"
                      className="text-xs bg-red-700 hover:bg-red-800 text-white px-2 py-1 rounded-md"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
