'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Ag {
  id: string;
  data: string;
  hora?: string | null;
  tipo: string;
  status: string;
  observacao?: string | null;
  profissional?: string | null;
}

interface Config {
  hora_inicio: string;
  hora_fim: string;
  passo_min: number;
}

const TIPOS = [
  { id: 'consulta_nova', label: 'Consulta nova', profissional: 'Bruna', cor: '#1d4ed8', fundo: '#7dd3fc' },
  { id: 'retorno', label: 'Retorno', profissional: 'Bruna', cor: '#1d4ed8', fundo: '#7dd3fc' },
  { id: 'implante', label: 'Implante', profissional: 'Bruna', cor: '#1d4ed8', fundo: '#7dd3fc' },
  { id: 'bioestimulador', label: 'Aplicação bioestimulador', profissional: 'Bruna', cor: '#1d4ed8', fundo: '#7dd3fc' },
  { id: 'medicacao', label: 'Medicação', profissional: 'Nicole', cor: '#c2410c', fundo: '#fb923c' },
  { id: 'intradermo', label: 'Intradermoterapia capilar', profissional: 'Nicole', cor: '#c2410c', fundo: '#fb923c' },
  { id: 'estetica', label: 'Estética', profissional: 'Ludimila', cor: '#15803d', fundo: '#4ade80' },
  { id: 'bodyshape', label: 'BodyShape', profissional: '', cor: '#a21caf', fundo: '#e879f9' },
  { id: 'outros', label: 'Outros', profissional: '', cor: '#78716c', fundo: '#d6d3d1' },
];

const PROFISSIONAIS = ['Bruna', 'Nicole', 'Ludimila'];

/* "Outros" mostra o que foi digitado na hora de marcar, não a palavra "Outros". */
function rotuloDe(ag: { tipo: string; observacao?: string | null }) {
  if (ag.tipo === 'outros' && ag.observacao?.trim()) return ag.observacao.trim();
  return infoTipo(ag.tipo).label;
}

function infoTipo(id: string) {
  return TIPOS.find((t) => t.id === id) ?? TIPOS[TIPOS.length - 1];
}

/* ------------------------------------------------------------------ */
/* Datas e horas                                                       */
/* ------------------------------------------------------------------ */

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function porExtenso(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function primeiroNome(nome?: string) {
  return (nome || '').trim().split(/\s+/)[0] || '';
}

function paraMin(hhmm: string) {
  const [h, m] = hhmm.slice(0, 5).split(':');
  return Number(h) * 60 + Number(m);
}

/* Só oferece horário dentro do funcionamento da clínica. */
function SeletorHora({
  hora,
  setHora,
  config,
}: {
  hora: string;
  setHora: (v: string) => void;
  config: Config;
}) {
  const primeira = Math.floor(paraMin(config.hora_inicio) / 60);
  const ultima = Math.ceil(paraMin(config.hora_fim) / 60);
  const passo = config.passo_min > 0 ? config.passo_min : 5;

  const horas: number[] = [];
  for (let h = primeira; h < ultima; h++) horas.push(h);
  const minutos: number[] = [];
  for (let m = 0; m < 60; m += passo) minutos.push(m);

  const hh = hora ? hora.slice(0, 2) : '';
  const mm = hora ? hora.slice(3, 5) : '';

  return (
    <div className="flex gap-1.5">
      <select
        value={hh}
        onChange={(e) => setHora(e.target.value ? `${e.target.value}:${mm || '00'}` : '')}
        className="flex-1 px-2 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
      >
        <option value="">Sem hora</option>
        {horas.map((h) => (
          <option key={h} value={String(h).padStart(2, '0')}>
            {String(h).padStart(2, '0')}h
          </option>
        ))}
      </select>
      <select
        value={mm}
        disabled={!hh}
        onChange={(e) => setHora(`${hh}:${e.target.value}`)}
        className="flex-1 px-2 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none disabled:opacity-40"
      >
        {minutos.map((m) => (
          <option key={m} value={String(m).padStart(2, '0')}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Próximas consultas do paciente                                      */
/* ------------------------------------------------------------------ */

export default function AgendarRetorno({
  pacienteId,
  pacienteNome,
  telefone,
  onMudou,
}: {
  pacienteId: string;
  pacienteNome?: string;
  telefone?: string;
  onMudou?: () => void;
}) {
  const [lista, setLista] = useState<Ag[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<Config>({ hora_inicio: '07:00', hora_fim: '19:00', passo_min: 5 });

  const [formAberto, setFormAberto] = useState(false);
  const [remarcandoId, setRemarcandoId] = useState<string | null>(null);

  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState('');
  const [tipo, setTipo] = useState('retorno');
  const [profissional, setProfissional] = useState('Bruna');
  const [descricaoOutros, setDescricaoOutros] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const [{ data: linhas }, { data: cfg }] = await Promise.all([
      supabase
        .from('agendamentos')
        .select('id,data,hora,tipo,status,observacao,profissional')
        .eq('paciente_id', pacienteId)
        .in('status', ['agendado', 'confirmado'])
        .gte('data', hojeISO())
        .order('data', { ascending: true })
        .order('hora', { ascending: true }),
      supabase.from('config_agenda').select('hora_inicio,hora_fim,passo_min').eq('id', 1).limit(1),
    ]);
    setLista((linhas as Ag[]) || []);
    if (cfg && cfg[0]) setConfig(cfg[0] as Config);
    setCarregando(false);
  }, [pacienteId]);

  useEffect(() => {
    setCarregando(true);
    setFormAberto(false);
    setRemarcandoId(null);
    carregar();
  }, [carregar]);

  // O procedimento já diz quem atende; dá para trocar se alguém cobrir.
  function escolherTipo(novoTipo: string) {
    setTipo(novoTipo);
    setProfissional(infoTipo(novoTipo).profissional);
  }

  function limpar() {
    setData(hojeISO());
    setHora('');
    setTipo('retorno');
    setProfissional('Bruna');
    setDescricaoOutros('');
    setErro('');
  }

  // "Outros" precisa dizer o que é; o texto vai para observacao e vira o
  // nome do atendimento na agenda.
  function validarOutros() {
    if (tipo === 'outros' && !descricaoOutros.trim()) {
      setErro('Escreva qual é o procedimento ou lembrete.');
      return false;
    }
    return true;
  }

  // ACRESCENTA uma consulta. Não cancela nada: o mesmo paciente pode ter
  // medicação semana que vem e retorno no mês seguinte ao mesmo tempo.
  async function agendar() {
    setErro('');
    if (!validarOutros()) return;
    setSalvando(true);
    const { data: sessao } = await supabase.auth.getUser();

    const { error } = await supabase.from('agendamentos').insert([
      {
        paciente_id: pacienteId,
        data,
        hora: hora || null,
        tipo,
        profissional: profissional || null,
        observacao: tipo === 'outros' ? descricaoOutros.trim() : null,
        criado_por: sessao.user?.id ?? null,
      },
    ]);

    setSalvando(false);
    if (error) {
      setErro(`Não foi possível agendar: ${error.message}`);
      return;
    }

    limpar();
    setFormAberto(false);
    await carregar();
    onMudou?.();
  }

  async function remarcar(ag: Ag) {
    setErro('');
    if (!validarOutros()) return;
    setSalvando(true);
    const { error } = await supabase
      .from('agendamentos')
      .update({
        data,
        hora: hora || null,
        tipo,
        profissional: profissional || null,
        // Se virou "Outros", guarda a descrição; se deixou de ser, preserva a observação antiga.
        observacao: tipo === 'outros' ? descricaoOutros.trim() : ag.tipo === 'outros' ? null : ag.observacao ?? null,
      })
      .eq('id', ag.id);

    setSalvando(false);
    if (error) {
      setErro(`Não foi possível remarcar: ${error.message}`);
      return;
    }
    setRemarcandoId(null);
    limpar();
    await carregar();
    onMudou?.();
  }

  async function cancelar(ag: Ag) {
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', ag.id);
    if (error) return setErro(`Não foi possível cancelar: ${error.message}`);
    await carregar();
    onMudou?.();
  }

  function abrirRemarcacao(ag: Ag) {
    setRemarcandoId(ag.id);
    setFormAberto(false);
    setData(ag.data);
    setHora(ag.hora ? ag.hora.slice(0, 5) : '');
    setTipo(ag.tipo);
    setProfissional(ag.profissional || infoTipo(ag.tipo).profissional);
    setDescricaoOutros(ag.tipo === 'outros' ? ag.observacao ?? '' : '');
    setErro('');
  }

  function linkZap(ag: Ag) {
    if (!telefone) return null;
    const num = telefone.replace(/\D/g, '');
    const comDDI = num.startsWith('55') ? num : `55${num}`;
    const msg = `Olá ${primeiroNome(pacienteNome)}, aqui é da clínica Dra. Bruna Oliveira. Seu atendimento (${rotuloDe(ag)}) está marcado para ${porExtenso(ag.data)}${ag.hora ? ` às ${ag.hora.slice(0, 5)}` : ''}. Até lá!`;
    return `https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`;
  }

  /* ---------------- Campos compartilhados por agendar e remarcar ---------------- */
  const camposDeAgendamento = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[
          { rotulo: 'hoje', dias: 0 },
          { rotulo: '+7', dias: 7 },
          { rotulo: '+15', dias: 15 },
          { rotulo: '+30', dias: 30 },
          { rotulo: '+60', dias: 60 },
          { rotulo: '+90', dias: 90 },
        ].map((a) => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => setData(emDias(a.dias))}
            className="text-[11px] border border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold px-2.5 py-1 rounded-lg transition-colors"
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <input
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
      />
      <p className="text-xs text-amber-800/70 capitalize">
        {porExtenso(data)}
        {data === hojeISO() && <span className="normal-case font-semibold"> · hoje</span>}
      </p>

      <SeletorHora hora={hora} setHora={setHora} config={config} />

      <select
        value={tipo}
        onChange={(e) => escolherTipo(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none font-semibold"
        style={{ borderColor: infoTipo(tipo).cor, color: infoTipo(tipo).cor }}
      >
        {TIPOS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>

      {tipo === 'outros' && (
        <input
          type="text"
          value={descricaoOutros}
          onChange={(e) => setDescricaoOutros(e.target.value)}
          placeholder="Qual procedimento ou lembrete? *"
          autoFocus
          className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm outline-none focus:border-amber-500"
        />
      )}

      <select
        value={profissional}
        onChange={(e) => setProfissional(e.target.value)}
        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
      >
        <option value="">Quem atende</option>
        {PROFISSIONAIS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      {erro && (
        <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2 rounded-lg">
          <p className="text-xs text-red-800 font-semibold">{erro}</p>
        </div>
      )}
    </div>
  );

  if (carregando) {
    return (
      <div className="bg-white border border-amber-200/70 rounded-xl px-5 py-4">
        <p className="text-xs text-amber-800/60">Carregando agendamentos…</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-amber-200/70 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-amber-100 flex items-center justify-between gap-2">
        <h3 className="font-serif font-bold text-amber-950 text-sm">
          📅 Próximas consultas{' '}
          {lista.length > 0 && <span className="text-amber-700/70 font-sans text-xs">({lista.length})</span>}
        </h3>
      </div>

      {lista.length === 0 ? (
        <p className="px-5 py-4 text-xs text-amber-800/70">Nenhuma consulta marcada para este paciente.</p>
      ) : (
        <div className="divide-y divide-amber-100">
          {lista.map((ag) => {
            const info = infoTipo(ag.tipo);
            const zap = linkZap(ag);

            return (
              <div
                key={ag.id}
                className="border-l-4"
                style={{ borderLeftColor: info.cor, backgroundColor: info.fundo, color: '#1c1917' }}
              >
                <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-serif font-bold capitalize">
                      {porExtenso(ag.data)}
                      {ag.hora ? (
                        <span className="font-sans tabular-nums opacity-80"> · {ag.hora.slice(0, 5)}</span>
                      ) : (
                        <span className="font-sans opacity-60"> · sem hora</span>
                      )}
                    </p>
                    <p className="text-xs mt-0.5">
                      <span className="font-bold">{rotuloDe(ag)}</span>
                      {ag.profissional && <span className="opacity-80"> · {ag.profissional}</span>}
                      {ag.status === 'confirmado' && (
                        <span className="text-emerald-700 font-semibold"> · confirmado</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                    {zap && (
                      <a
                        href={zap}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        💬 Avisar
                      </a>
                    )}
                    <button
                      onClick={() => (remarcandoId === ag.id ? setRemarcandoId(null) : abrirRemarcacao(ag))}
                      className="text-[11px] bg-white/80 hover:bg-white text-amber-900 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Remarcar
                    </button>
                    <button
                      onClick={() => cancelar(ag)}
                      className="text-[11px] bg-white/80 hover:bg-white text-amber-900 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>

                {remarcandoId === ag.id && (
                  <div className="px-4 pb-4 pt-1 bg-white/80">
                    {camposDeAgendamento}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          setRemarcandoId(null);
                          limpar();
                        }}
                        className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg border border-amber-200 text-amber-900 hover:bg-amber-50 transition-colors"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={() => remarcar(ag)}
                        disabled={salvando}
                        className="flex-1 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                      >
                        {salvando ? 'Salvando…' : 'Salvar mudança'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sempre disponível: acrescenta mais uma consulta, sem mexer nas outras */}
      <div className="border-t border-amber-100">
        <button
          onClick={() => {
            setFormAberto(!formAberto);
            setRemarcandoId(null);
            if (!formAberto) limpar();
          }}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-amber-50/60 transition-colors"
        >
          <span className="text-sm font-semibold text-amber-900">➕ Agendar consulta</span>
          <span className="text-amber-700 text-xs">{formAberto ? 'Fechar' : 'Abrir'}</span>
        </button>

        {formAberto && (
          <div className="px-5 pb-5">
            {camposDeAgendamento}
            <button
              onClick={agendar}
              disabled={salvando}
              className="w-full mt-2 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow"
            >
              {salvando ? 'Salvando…' : 'Agendar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
