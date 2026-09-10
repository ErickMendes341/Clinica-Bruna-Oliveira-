'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

interface PainelPaciente {
  id: string;
  nome: string;
  telefone?: string;
  dias_sem_vir: number;
  ultimo_consumo?: string;
  proximo_agendamento?: string;
  peso_atual?: number;
}

interface Agendamento {
  id: string;
  paciente_id: string;
  data: string;
  hora?: string;
  tipo: string;
  status: string;
  observacao?: string;
  pacientes?: { nome: string; telefone?: string } | null;
}

interface Config {
  hora_inicio: string;
  hora_fim: string;
  duracao_min: number;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function somaDias(iso: string, dias: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dataCurta(iso?: string) {
  if (!iso) return '-';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function diaDaSemana(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
}

function porExtenso(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0];
}

function paraMin(hhmm: string) {
  const [h, m] = hhmm.slice(0, 5).split(':');
  return Number(h) * 60 + Number(m);
}

function paraHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function zap(telefone: string | undefined, msg: string) {
  if (!telefone) return null;
  const num = telefone.replace(/\D/g, '');
  const comDDI = num.startsWith('55') ? num : `55${num}`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`;
}

const TIPOS = [
  { id: 'retorno', label: 'Retorno' },
  { id: 'consulta', label: 'Consulta' },
  { id: 'procedimento', label: 'Procedimento' },
  { id: 'aplicacao', label: 'Aplicação' },
];

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */

export default function Agenda({ onAbrirPaciente }: { onAbrirPaciente?: (id: string) => void }) {
  const [painel, setPainel] = useState<PainelPaciente[]>([]);
  const [agenda, setAgenda] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [limiteSumido, setLimiteSumido] = useState(30);
  const [mostrarTodosRetornos, setMostrarTodosRetornos] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [preset, setPreset] = useState<{ data?: string; hora?: string }>({});

  // Visão de um dia específico
  const [dia, setDia] = useState(hojeISO());
  const [agendaDia, setAgendaDia] = useState<Agendamento[]>([]);
  const [config, setConfig] = useState<Config>({ hora_inicio: '07:00', hora_fim: '19:00', duracao_min: 30 });
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [diaAberto, setDiaAberto] = useState(false);

  const carregar = useCallback(async () => {
    const hoje = hojeISO();

    const [{ data: pac }, { data: ag }, { data: cfg }] = await Promise.all([
      supabase
        .from('painel_pacientes')
        .select('id,nome,telefone,dias_sem_vir,ultimo_consumo,proximo_agendamento,peso_atual')
        .is('arquivado_em', null)
        .order('dias_sem_vir', { ascending: false }),
      supabase
        .from('agendamentos')
        .select('*, pacientes(nome, telefone)')
        .gte('data', hoje)
        .lte('data', somaDias(hoje, 30))
        .in('status', ['agendado', 'confirmado'])
        .order('data', { ascending: true }),
      supabase.from('config_agenda').select('hora_inicio,hora_fim,duracao_min').eq('id', 1).limit(1),
    ]);

    setPainel((pac as PainelPaciente[]) || []);
    setAgenda((ag as Agendamento[]) || []);
    if (cfg && cfg[0]) setConfig(cfg[0] as Config);
    setCarregando(false);
  }, []);

  const carregarDia = useCallback(async (d: string) => {
    const { data } = await supabase
      .from('agendamentos')
      .select('*, pacientes(nome, telefone)')
      .eq('data', d)
      .in('status', ['agendado', 'confirmado'])
      .order('hora', { ascending: true });
    setAgendaDia((data as Agendamento[]) || []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarDia(dia);
  }, [dia, carregarDia]);

  async function recarregarTudo() {
    await carregar();
    await carregarDia(dia);
  }

  async function mudarStatus(id: string, status: string) {
    await supabase.from('agendamentos').update({ status }).eq('id', id);
    recarregarTudo();
  }

  function abrirNovoCom(data: string, hora?: string) {
    setPreset({ data, hora });
    setNovoAberto(true);
    // leva a pessoa até o formulário
    setTimeout(() => {
      const el = document.getElementById('form-agendar');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  const hoje = hojeISO();
  const deHoje = agenda.filter((a) => a.data === hoje);
  const proximos = agenda.filter((a) => a.data > hoje && a.data <= somaDias(hoje, 7));

  const semRetorno = painel.filter((p) => !p.proximo_agendamento);
  const sumidos = semRetorno.filter((p) => p.dias_sem_vir >= limiteSumido);
  const retornosAMarcar = semRetorno.filter((p) => p.dias_sem_vir < limiteSumido);
  const retornosVisiveis = mostrarTodosRetornos ? retornosAMarcar : retornosAMarcar.slice(0, 12);

  if (carregando) {
    return <p className="text-sm text-amber-900/60 py-10 text-center">Carregando a agenda…</p>;
  }

  return (
    <div className="space-y-6">
      {/* ---------------- Resumo ---------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile numero={deHoje.length} rotulo="agendados hoje" destaque />
        <Tile numero={proximos.length} rotulo="nos próximos 7 dias" />
        <Tile numero={retornosAMarcar.length} rotulo="sem retorno marcado" />
        <Tile numero={sumidos.length} rotulo={`sem vir há ${limiteSumido}+ dias`} alerta={sumidos.length > 0} />
      </div>

      {/* ---------------- Grade do dia ---------------- */}
      <DiaDaAgenda
        dia={dia}
        setDia={setDia}
        agendaDia={agendaDia}
        config={config}
        setConfig={setConfig}
        editandoConfig={editandoConfig}
        setEditandoConfig={setEditandoConfig}
        aberto={diaAberto}
        setAberto={setDiaAberto}
        onEscolherHorario={abrirNovoCom}
        onAbrirPaciente={onAbrirPaciente}
      />

      {/* ---------------- Novo agendamento ---------------- */}
      <div id="form-agendar" className="bg-white border border-amber-200/70 rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setNovoAberto((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-amber-50/50 transition-colors"
        >
          <span className="font-serif font-bold text-amber-950">📅 Agendar retorno</span>
          <span className="text-amber-700 text-sm">{novoAberto ? 'Fechar' : 'Abrir'}</span>
        </button>
        {novoAberto && (
          <FormNovoAgendamento
            pacientes={painel}
            dataInicial={preset.data}
            horaInicial={preset.hora}
            onPronto={() => {
              setNovoAberto(false);
              setPreset({});
              recarregarTudo();
            }}
          />
        )}
      </div>

      {/* ---------------- Hoje ---------------- */}
      <Secao titulo="🔔 Hoje" contagem={deHoje.length} vazio="Nenhum paciente agendado para hoje.">
        {deHoje.map((a) => (
          <LinhaAgendamento key={a.id} ag={a} onStatus={mudarStatus} onAbrir={onAbrirPaciente} />
        ))}
      </Secao>

      {/* ---------------- Próximos 7 dias ---------------- */}
      <Secao titulo="📆 Próximos 7 dias" contagem={proximos.length} vazio="Nada agendado para esta semana.">
        {proximos.map((a) => (
          <LinhaAgendamento key={a.id} ag={a} onStatus={mudarStatus} onAbrir={onAbrirPaciente} mostrarDia />
        ))}
      </Secao>

      {/* ---------------- Sumidos ---------------- */}
      <Secao
        titulo="⚠️ Sumiram"
        contagem={sumidos.length}
        vazio={`Ninguém passou de ${limiteSumido} dias sem aparecer.`}
        acessorio={
          <select
            value={limiteSumido}
            onChange={(e) => setLimiteSumido(Number(e.target.value))}
            className="text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white outline-none text-amber-900"
          >
            {[15, 21, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                sem vir há {d}+ dias
              </option>
            ))}
          </select>
        }
      >
        {sumidos.map((p) => (
          <LinhaPaciente key={p.id} p={p} onAbrir={onAbrirPaciente} tom="alerta" />
        ))}
      </Secao>

      {/* ---------------- Retornos a marcar ---------------- */}
      <Secao
        titulo="📋 Sem retorno marcado"
        contagem={retornosAMarcar.length}
        vazio="Todo mundo com retorno agendado."
      >
        {retornosVisiveis.map((p) => (
          <LinhaPaciente key={p.id} p={p} onAbrir={onAbrirPaciente} />
        ))}
        {retornosAMarcar.length > retornosVisiveis.length && (
          <button
            onClick={() => setMostrarTodosRetornos(true)}
            className="w-full py-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 transition-colors"
          >
            Ver os outros {retornosAMarcar.length - retornosVisiveis.length}
          </button>
        )}
      </Secao>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grade de horários de um dia                                         */
/* ------------------------------------------------------------------ */

function DiaDaAgenda({
  dia,
  setDia,
  agendaDia,
  config,
  setConfig,
  editandoConfig,
  setEditandoConfig,
  aberto,
  setAberto,
  onEscolherHorario,
  onAbrirPaciente,
}: {
  dia: string;
  setDia: (d: string) => void;
  agendaDia: Agendamento[];
  config: Config;
  setConfig: (c: Config) => void;
  editandoConfig: boolean;
  setEditandoConfig: (v: boolean) => void;
  aberto: boolean;
  setAberto: (v: boolean) => void;
  onEscolherHorario: (data: string, hora?: string) => void;
  onAbrirPaciente?: (id: string) => void;
}) {
  const inicio = paraMin(config.hora_inicio);
  const fim = paraMin(config.hora_fim);
  const passo = config.duracao_min;

  const slots: number[] = [];
  if (passo > 0 && fim > inicio) {
    for (let t = inicio; t + passo <= fim; t += passo) slots.push(t);
  }

  // Vários pacientes podem ocupar o mesmo horário — protocolos diferentes
  // acontecem em paralelo. Por isso cada faixa guarda uma lista, não um só.
  const porSlot = new Map<number, Agendamento[]>();
  const semHorario: Agendamento[] = [];
  for (const a of agendaDia) {
    if (!a.hora) {
      semHorario.push(a);
      continue;
    }
    const m = paraMin(a.hora);
    const slot = slots.find((s) => m >= s && m < s + passo);
    if (slot === undefined) {
      semHorario.push(a);
      continue;
    }
    const lista = porSlot.get(slot);
    if (lista) lista.push(a);
    else porSlot.set(slot, [a]);
  }

  const vazios = slots.filter((s) => !porSlot.has(s)).length;
  const ehHoje = dia === hojeISO();

  return (
    <div className="bg-white border border-amber-200/70 rounded-2xl shadow-sm overflow-hidden">
      {/* Cabeçalho: clicar abre e fecha a grade */}
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full px-6 py-4 flex items-center justify-between gap-3 hover:bg-amber-50/50 transition-colors text-left"
      >
        <div className="min-w-0">
          <span className="font-serif font-bold text-amber-950">🗓️ Agenda do dia</span>
          <p className="text-xs text-amber-800/70 mt-0.5 capitalize truncate">
            {porExtenso(dia)}
            <span className="normal-case">
              {' '}
              • {agendaDia.length} agendamento{agendaDia.length === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        <span className="text-amber-700 text-sm flex-shrink-0">{aberto ? 'Fechar' : 'Abrir'}</span>
      </button>

      {aberto && (
        <>
          <div className="px-6 pb-4 border-b border-amber-100">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setDia(somaDias(dia, -1))}
                className="px-3 py-2 border border-amber-200 rounded-lg text-sm text-amber-900 hover:bg-amber-50 transition-colors"
                aria-label="Dia anterior"
              >
                ◀
              </button>
              <input
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className="px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
              />
              <button
                onClick={() => setDia(somaDias(dia, 1))}
                className="px-3 py-2 border border-amber-200 rounded-lg text-sm text-amber-900 hover:bg-amber-50 transition-colors"
                aria-label="Próximo dia"
              >
                ▶
              </button>
              {!ehHoje && (
                <button
                  onClick={() => setDia(hojeISO())}
                  className="px-3 py-2 text-xs font-semibold text-amber-800 hover:underline"
                >
                  voltar para hoje
                </button>
              )}
              <button
                onClick={() => setEditandoConfig(!editandoConfig)}
                className="ml-auto text-[11px] font-semibold text-amber-700 hover:text-amber-900"
              >
                ⚙️ {config.hora_inicio.slice(0, 5)}–{config.hora_fim.slice(0, 5)} · {config.duracao_min} min
              </button>
            </div>

            {editandoConfig && (
              <EditorConfig config={config} setConfig={setConfig} onFechar={() => setEditandoConfig(false)} />
            )}

            <p className="text-xs text-amber-800/70 mt-3">
              {agendaDia.length} agendamento{agendaDia.length === 1 ? '' : 's'} · {vazios} horário
              {vazios === 1 ? '' : 's'} sem ninguém
            </p>
          </div>

          {slots.length === 0 ? (
            <p className="px-6 py-6 text-xs text-amber-800/60 text-center">
              Horário de funcionamento inválido. Ajuste em ⚙️ acima.
            </p>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {slots.map((s) => {
                const lista = porSlot.get(s);

                if (!lista || lista.length === 0) {
                  return (
                    <button
                      key={s}
                      onClick={() => onEscolherHorario(dia, paraHHMM(s))}
                      className="text-left px-3 py-2.5 rounded-xl border border-dashed border-amber-300 text-amber-900 hover:bg-amber-50 hover:border-amber-500 transition-colors"
                    >
                      <p className="text-[11px] font-bold tabular-nums text-amber-800">{paraHHMM(s)}</p>
                      <p className="text-xs text-amber-800/60">livre</p>
                    </button>
                  );
                }

                return (
                  <div key={s} className="px-3 py-2.5 rounded-xl bg-amber-900 text-amber-50 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold tabular-nums text-amber-200">{paraHHMM(s)}</p>
                      <button
                        onClick={() => onEscolherHorario(dia, paraHHMM(s))}
                        title="Agendar mais um paciente neste horário"
                        className="text-amber-200 hover:text-white text-sm font-bold leading-none px-1.5 rounded hover:bg-amber-800 transition-colors"
                      >
                        +
                      </button>
                    </div>

                    {lista.map((ag) => (
                      <button
                        key={ag.id}
                        onClick={() => onAbrirPaciente?.(ag.paciente_id)}
                        className="text-left -mx-1 px-1 py-0.5 rounded hover:bg-amber-800 transition-colors"
                      >
                        <p className="text-xs font-semibold truncate">
                          {ag.pacientes?.nome ? primeiroNome(ag.pacientes.nome) : 'Paciente'}
                        </p>
                        <p className="text-[10px] text-amber-200/80 capitalize truncate">
                          {ag.tipo}
                          {ag.observacao ? ` · ${ag.observacao}` : ''}
                        </p>
                      </button>
                    ))}

                    {lista.length > 1 && (
                      <p className="text-[10px] text-amber-300/70 border-t border-amber-800 pt-1">
                        {lista.length} em paralelo
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {semHorario.length > 0 && (
            <div className="px-6 py-4 border-t border-amber-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800/60 mb-2">
                Sem horário definido
              </p>
              <div className="flex flex-wrap gap-2">
                {semHorario.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onAbrirPaciente?.(a.paciente_id)}
                    className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {a.pacientes?.nome ? primeiroNome(a.pacientes.nome) : 'Paciente'} · {a.tipo}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EditorConfig({
  config,
  setConfig,
  onFechar,
}: {
  config: Config;
  setConfig: (c: Config) => void;
  onFechar: () => void;
}) {
  const [inicio, setInicio] = useState(config.hora_inicio.slice(0, 5));
  const [fim, setFim] = useState(config.hora_fim.slice(0, 5));
  const [dur, setDur] = useState(String(config.duracao_min));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const novo = { hora_inicio: inicio, hora_fim: fim, duracao_min: Number(dur) || 30 };
    await supabase.from('config_agenda').update(novo).eq('id', 1);
    setConfig(novo as Config);
    setSalvando(false);
    onFechar();
  }

  return (
    <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
      <p className="text-[11px] text-amber-800/70 mb-2">
        Vale para a clínica toda — a equipe vê a mesma grade.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-amber-900 mb-1">Abre</label>
          <input
            type="time"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="px-2 py-1.5 border border-amber-200 rounded-lg text-sm outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-amber-900 mb-1">Fecha</label>
          <input
            type="time"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="px-2 py-1.5 border border-amber-200 rounded-lg text-sm outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-amber-900 mb-1">Cada consulta</label>
          <select
            value={dur}
            onChange={(e) => setDur(e.target.value)}
            className="px-2 py-1.5 border border-amber-200 rounded-lg text-sm bg-white outline-none"
          >
            {[15, 20, 30, 40, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={salvar}
          disabled={salvando}
          className="bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button onClick={onFechar} className="text-xs text-amber-700 hover:underline px-2 py-2">
          cancelar
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

function Tile({
  numero,
  rotulo,
  destaque,
  alerta,
}: {
  numero: number;
  rotulo: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-2xl border ${
        destaque
          ? 'bg-amber-900 border-amber-900 text-amber-50'
          : alerta
            ? 'bg-white border-red-200'
            : 'bg-white border-amber-200/70'
      }`}
    >
      <p
        className={`text-3xl font-serif font-bold tabular-nums ${
          destaque ? 'text-amber-50' : alerta ? 'text-red-700' : 'text-amber-950'
        }`}
      >
        {numero}
      </p>
      <p className={`text-[11px] font-semibold mt-0.5 ${destaque ? 'text-amber-200' : 'text-amber-800/70'}`}>
        {rotulo}
      </p>
    </div>
  );
}

function Secao({
  titulo,
  contagem,
  vazio,
  acessorio,
  children,
}: {
  titulo: string;
  contagem: number;
  vazio: string;
  acessorio?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-amber-200/70 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-amber-100 flex items-center justify-between gap-3">
        <h3 className="font-serif font-bold text-amber-950">
          {titulo} {contagem > 0 && <span className="text-amber-700/70 font-sans text-sm">({contagem})</span>}
        </h3>
        {acessorio}
      </div>
      {contagem === 0 ? (
        <p className="px-6 py-6 text-xs text-amber-800/60 text-center">{vazio}</p>
      ) : (
        <div className="divide-y divide-amber-100">{children}</div>
      )}
    </div>
  );
}

function LinhaAgendamento({
  ag,
  onStatus,
  onAbrir,
  mostrarDia,
}: {
  ag: Agendamento;
  onStatus: (id: string, status: string) => void;
  onAbrir?: (id: string) => void;
  mostrarDia?: boolean;
}) {
  const nome = ag.pacientes?.nome || 'Paciente';
  const tel = ag.pacientes?.telefone;
  const link = zap(
    tel,
    `Olá ${primeiroNome(nome)}, aqui é da clínica Dra. Bruna Oliveira. Passando para confirmar seu ${ag.tipo} do dia ${dataCurta(ag.data)}. Podemos confirmar?`
  );

  return (
    <div className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-amber-50/40 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onAbrir?.(ag.paciente_id)}
            className="font-semibold text-amber-950 text-sm hover:underline text-left"
          >
            {nome}
          </button>
          {ag.status === 'confirmado' && (
            <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
              confirmado
            </span>
          )}
        </div>
        <p className="text-xs text-amber-800/70 mt-0.5">
          {mostrarDia && <span className="capitalize">{diaDaSemana(ag.data)}, </span>}
          {dataCurta(ag.data)}
          {ag.hora ? ` às ${ag.hora.slice(0, 5)}` : ''} • {ag.tipo}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
          >
            💬 Confirmar
          </a>
        )}
        <button
          onClick={() => onStatus(ag.id, 'compareceu')}
          className="text-[11px] bg-amber-800 hover:bg-amber-900 text-white font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
        >
          Compareceu
        </button>
        <button
          onClick={() => onStatus(ag.id, 'faltou')}
          className="text-[11px] border border-amber-200 text-amber-900 hover:bg-amber-100 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
        >
          Faltou
        </button>
      </div>
    </div>
  );
}

function LinhaPaciente({
  p,
  onAbrir,
  tom,
}: {
  p: PainelPaciente;
  onAbrir?: (id: string) => void;
  tom?: 'alerta';
}) {
  const link = zap(
    p.telefone,
    `Olá ${primeiroNome(p.nome)}, aqui é da clínica Dra. Bruna Oliveira. Sentimos sua falta! Vamos agendar seu retorno?`
  );

  return (
    <div className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-amber-50/40 transition-colors">
      <div className="min-w-0">
        <button
          onClick={() => onAbrir?.(p.id)}
          className="font-semibold text-amber-950 text-sm hover:underline text-left truncate block max-w-full"
        >
          {p.nome.trim()}
        </button>
        <p className={`text-xs mt-0.5 ${tom === 'alerta' ? 'text-red-700 font-semibold' : 'text-amber-800/70'}`}>
          {p.dias_sem_vir === 0 ? 'veio hoje' : `há ${p.dias_sem_vir} dias sem vir`}
          {p.peso_atual ? ` • ${Number(p.peso_atual).toFixed(1).replace('.', ',')} kg` : ''}
        </p>
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          💬 Chamar
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formulário de novo agendamento                                      */
/* ------------------------------------------------------------------ */

function FormNovoAgendamento({
  pacientes,
  dataInicial,
  horaInicial,
  onPronto,
}: {
  pacientes: PainelPaciente[];
  dataInicial?: string;
  horaInicial?: string;
  onPronto: () => void;
}) {
  const [pacienteId, setPacienteId] = useState('');
  const [busca, setBusca] = useState('');
  const [data, setData] = useState(dataInicial || somaDias(hojeISO(), 30));
  const [hora, setHora] = useState(horaInicial || '');
  const [tipo, setTipo] = useState('retorno');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Quando a pessoa clica num horário livre da grade, o formulário já vem pronto.
  useEffect(() => {
    if (dataInicial) setData(dataInicial);
    if (horaInicial) setHora(horaInicial);
  }, [dataInicial, horaInicial]);

  const filtrados = busca.trim()
    ? pacientes.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : [];
  const escolhido = pacientes.find((p) => p.id === pacienteId);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!pacienteId) return setErro('Escolha o paciente.');
    setErro('');
    setSalvando(true);

    const { data: sessao } = await supabase.auth.getUser();
    const { error } = await supabase.from('agendamentos').insert([
      {
        paciente_id: pacienteId,
        data,
        hora: hora || null,
        tipo,
        observacao: obs || null,
        criado_por: sessao.user?.id ?? null,
      },
    ]);

    setSalvando(false);
    if (error) return setErro(error.message);

    setPacienteId('');
    setBusca('');
    setObs('');
    setHora('');
    onPronto();
  }

  return (
    <form onSubmit={salvar} className="px-6 pb-6 pt-2 space-y-3 border-t border-amber-100">
      {horaInicial && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Horário escolhido na grade: <strong>{dataCurta(data)} às {hora}</strong>
        </p>
      )}

      <div>
        <label className="block text-xs font-semibold text-amber-900 mb-1">Paciente</label>
        {escolhido ? (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="text-sm font-semibold text-amber-950">{escolhido.nome.trim()}</span>
            <button
              type="button"
              onClick={() => {
                setPacienteId('');
                setBusca('');
              }}
              className="text-xs text-amber-700 hover:underline"
            >
              trocar
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="🔍 Digite o nome do paciente…"
              className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            {filtrados.length > 0 && (
              <div className="mt-1 border border-amber-200 rounded-lg divide-y divide-amber-100 overflow-hidden">
                {filtrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPacienteId(p.id)}
                    className="w-full text-left px-3 py-2 text-sm text-amber-950 hover:bg-amber-50 transition-colors"
                  >
                    {p.nome.trim()}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-semibold text-amber-900 mb-1">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-amber-900 mb-1">Hora (opcional)</label>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-amber-900 mb-1">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
          >
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-amber-900 mb-1">Observação (opcional)</label>
        <input
          type="text"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex: trazer exames"
          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
        />
      </div>

      {erro && <p className="text-xs text-red-700 font-semibold">{erro}</p>}

      <button
        type="submit"
        disabled={salvando}
        className="w-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition-colors shadow"
      >
        {salvando ? 'Agendando…' : 'Agendar'}
      </button>
    </form>
  );
}
