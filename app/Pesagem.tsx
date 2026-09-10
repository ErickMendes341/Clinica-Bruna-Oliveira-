'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Registro {
  id: string;
  peso: number;
  data: string;
  observacao?: string;
}

/* Cor da linha validada contra o fundo creme da ficha. */
const COR_LINHA = '#92400e';

function dataCurta(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function kg(n: number) {
  return `${n.toFixed(1).replace('.', ',')} kg`;
}

function delta(n: number) {
  const s = n > 0 ? '+' : '−';
  return `${s}${Math.abs(n).toFixed(1).replace('.', ',')} kg`;
}

export default function Pesagem({
  pacienteId,
  altura,
  metaPeso,
  onMudou,
}: {
  pacienteId: string;
  altura?: number | null;
  metaPeso?: number | null;
  onMudou?: () => void;
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const { data: linhas } = await supabase
      .from('pesagens')
      .select('id,peso,data,observacao')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: true })
      .order('created_at', { ascending: true });
    setRegistros(((linhas as Registro[]) || []).map((r) => ({ ...r, peso: Number(r.peso) })));
    setCarregando(false);
  }, [pacienteId]);

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [carregar]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(valor.replace(',', '.'));
    if (isNaN(num) || num <= 20 || num > 400) {
      setErro('Peso fora do esperado. Digite em kg, ex: 78,4');
      return;
    }
    setErro('');
    setSalvando(true);

    const { data: sessao } = await supabase.auth.getUser();
    const { error } = await supabase.from('pesagens').insert([
      { paciente_id: pacienteId, peso: num, data, registrado_por: sessao.user?.id ?? null },
    ]);

    if (!error) {
      // Mantém pacientes.peso como o peso mais recente, para as telas antigas.
      await supabase.from('pacientes').update({ peso: num }).eq('id', pacienteId);
      setValor('');
      setData(hojeISO());
      await carregar();
      onMudou?.();
    } else {
      setErro(error.message);
    }
    setSalvando(false);
  }

  async function remover(id: string) {
    await supabase.from('pesagens').delete().eq('id', id);
    carregar();
    onMudou?.();
  }

  const atual = registros.length ? registros[registros.length - 1] : null;
  const anterior = registros.length > 1 ? registros[registros.length - 2] : null;
  const primeiro = registros.length ? registros[0] : null;

  const varUltima = atual && anterior ? atual.peso - anterior.peso : null;
  const varTotal = atual && primeiro && registros.length > 1 ? atual.peso - primeiro.peso : null;
  const imc = atual && altura && altura > 0 ? atual.peso / (altura * altura) : null;
  const faltaMeta = atual && metaPeso ? atual.peso - metaPeso : null;

  return (
    <div className="bg-white border border-amber-200/70 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-amber-100 flex items-center justify-between">
        <h3 className="font-serif font-bold text-amber-950 text-sm">⚖️ Evolução de peso</h3>
        {registros.length > 0 && (
          <span className="text-[11px] text-amber-800/60">
            {registros.length} {registros.length === 1 ? 'pesagem' : 'pesagens'}
          </span>
        )}
      </div>

      {/* ---------- Registro rápido ---------- */}
      <form onSubmit={registrar} className="px-5 py-4 bg-amber-50/40 border-b border-amber-100">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Peso de hoje — ex: 78,4"
              className="w-full px-3 py-2.5 border border-amber-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="px-3 py-2.5 border border-amber-200 rounded-lg text-sm bg-white outline-none"
          />
          <button
            type="submit"
            disabled={salvando || !valor}
            className="bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors shadow-sm whitespace-nowrap"
          >
            {salvando ? 'Salvando…' : 'Registrar'}
          </button>
        </div>
        {erro && <p className="text-xs text-red-700 font-semibold mt-2">{erro}</p>}
      </form>

      {carregando ? (
        <p className="px-5 py-8 text-xs text-amber-800/60 text-center">Carregando…</p>
      ) : registros.length === 0 ? (
        <p className="px-5 py-8 text-xs text-amber-800/60 text-center leading-relaxed">
          Nenhuma pesagem registrada ainda.
          <br />
          Registre a primeira acima — a partir da segunda, o comparativo aparece aqui.
        </p>
      ) : (
        <>
          {/* ---------- Números ---------- */}
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-amber-100">
            <Numero rotulo="Peso atual" valor={kg(atual!.peso)} sub={dataCurta(atual!.data)} forte />
            <Numero
              rotulo="Desde a última"
              valor={varUltima === null ? '—' : delta(varUltima)}
              sub={anterior ? `era ${kg(anterior.peso)}` : 'primeira pesagem'}
              tom={varUltima === null ? undefined : varUltima < 0 ? 'bom' : varUltima > 0 ? 'atencao' : undefined}
            />
            <Numero
              rotulo="Desde o início"
              valor={varTotal === null ? '—' : delta(varTotal)}
              sub={primeiro ? `era ${kg(primeiro.peso)}` : ''}
              tom={varTotal === null ? undefined : varTotal < 0 ? 'bom' : varTotal > 0 ? 'atencao' : undefined}
            />
            <Numero
              rotulo={metaPeso ? 'Falta para a meta' : 'IMC'}
              valor={
                metaPeso
                  ? faltaMeta !== null && faltaMeta > 0
                    ? kg(faltaMeta)
                    : 'meta atingida'
                  : imc
                    ? imc.toFixed(1).replace('.', ',')
                    : '—'
              }
              sub={metaPeso ? `meta ${kg(metaPeso)}` : altura ? `altura ${altura} m` : 'sem altura cadastrada'}
            />
          </div>

          {/* ---------- Gráfico ---------- */}
          {registros.length >= 2 && <Grafico registros={registros} meta={metaPeso ?? undefined} />}

          {/* ---------- Histórico ---------- */}
          <details className="border-t border-amber-100">
            <summary className="px-5 py-3 text-xs font-semibold text-amber-800 cursor-pointer hover:bg-amber-50/50">
              Ver todas as pesagens
            </summary>
            <div className="divide-y divide-amber-100 border-t border-amber-100">
              {[...registros].reverse().map((r) => (
                <div key={r.id} className="px-5 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-amber-950 tabular-nums font-medium">{kg(r.peso)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-amber-800/70">{dataCurta(r.data)}</span>
                    <button
                      onClick={() => remover(r.id)}
                      title="Remover esta pesagem"
                      className="text-xs text-amber-700/60 hover:text-red-700 px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  sub,
  forte,
  tom,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  forte?: boolean;
  tom?: 'bom' | 'atencao';
}) {
  const cor = tom === 'bom' ? 'text-emerald-700' : tom === 'atencao' ? 'text-amber-700' : 'text-amber-950';
  return (
    <div className="px-4 py-3.5">
      <p className="text-[10px] uppercase tracking-wider font-bold text-amber-800/60">{rotulo}</p>
      <p className={`font-serif font-bold tabular-nums ${forte ? 'text-2xl' : 'text-lg'} ${cor} mt-0.5`}>{valor}</p>
      {sub && <p className="text-[11px] text-amber-800/60 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gráfico de linha — série única, sem legenda (o título já nomeia)    */
/* ------------------------------------------------------------------ */

function Grafico({ registros, meta }: { registros: Registro[]; meta?: number }) {
  const [ativo, setAtivo] = useState<number | null>(null);

  const W = 600;
  const H = 200;
  const padL = 46;
  const padR = 46;
  const padT = 26;
  const padB = 30;

  const pesos = registros.map((r) => r.peso);
  const candidatos = meta ? [...pesos, meta] : pesos;
  let min = Math.min(...candidatos);
  let max = Math.max(...candidatos);
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  const folga = (max - min) * 0.15;
  min -= folga;
  max += folga;

  const x = (i: number) =>
    registros.length === 1 ? W / 2 : padL + (i * (W - padL - padR)) / (registros.length - 1);
  const y = (v: number) => padT + ((max - v) / (max - min)) * (H - padT - padB);

  const linha = registros.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(r.peso).toFixed(1)}`).join(' ');

  const ultimo = registros.length - 1;
  const rotulados = new Set([0, ultimo]);

  return (
    <div className="px-3 pt-4 pb-2 relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolução do peso ao longo do tempo">
        {/* grade recessiva */}
        {[0, 0.5, 1].map((t) => {
          const gy = padT + t * (H - padT - padB);
          return <line key={t} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#f3e3cf" strokeWidth={1} />;
        })}

        {/* meta como referência tracejada */}
        {meta && meta > min && meta < max && (
          <>
            <line
              x1={padL}
              y1={y(meta)}
              x2={W - padR}
              y2={y(meta)}
              stroke="#0ca30c"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.7}
            />
            <text x={W - padR + 4} y={y(meta) + 3.5} fontSize={10} fill="#0ca30c" fontWeight={700}>
              meta
            </text>
          </>
        )}

        {/* linha da série */}
        <path d={linha} fill="none" stroke={COR_LINHA} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* pontos */}
        {registros.map((r, i) => (
          <circle
            key={r.id}
            cx={x(i)}
            cy={y(r.peso)}
            r={ativo === i ? 6 : 4}
            fill={COR_LINHA}
            stroke="#ffffff"
            strokeWidth={2}
          />
        ))}

        {/* rótulos diretos: só primeiro e último */}
        {registros.map((r, i) =>
          rotulados.has(i) ? (
            <text
              key={`t${r.id}`}
              x={x(i)}
              y={y(r.peso) - 12}
              fontSize={11}
              fontWeight={700}
              fill="#78350f"
              textAnchor={i === 0 ? 'start' : 'end'}
            >
              {r.peso.toFixed(1).replace('.', ',')}
            </text>
          ) : null
        )}

        {/* datas nas pontas */}
        <text x={padL} y={H - 8} fontSize={10} fill="#a1876b" textAnchor="start">
          {dataCurta(registros[0].data)}
        </text>
        <text x={W - padR} y={H - 8} fontSize={10} fill="#a1876b" textAnchor="end">
          {dataCurta(registros[ultimo].data)}
        </text>

        {/* camada de hover */}
        {registros.map((r, i) => (
          <rect
            key={`h${r.id}`}
            x={x(i) - (W - padL - padR) / (2 * Math.max(registros.length - 1, 1))}
            y={0}
            width={(W - padL - padR) / Math.max(registros.length - 1, 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setAtivo(i)}
            onMouseLeave={() => setAtivo(null)}
          />
        ))}

        {/* crosshair */}
        {ativo !== null && (
          <line x1={x(ativo)} y1={padT} x2={x(ativo)} y2={H - padB} stroke="#c9a882" strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>

      {ativo !== null && (
        <div
          className="absolute -translate-x-1/2 bg-amber-950 text-amber-50 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: `${(x(ativo) / W) * 100}%`, top: 4 }}
        >
          {kg(registros[ativo].peso)} · {dataCurta(registros[ativo].data)}
        </div>
      )}
    </div>
  );
}
