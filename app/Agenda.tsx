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
  pref_contato?: string | null;
}

interface Agendamento {
  id: string;
  paciente_id: string;
  data: string;
  hora?: string;
  tipo: string;
  status: string;
  observacao?: string;
  profissional?: string | null;
  pacientes?: {
    nome: string;
    telefone?: string;
    pref_contato?: string | null;
    pref_musica?: string | null;
    pref_bebida?: string | null;
    pref_comida?: string | null;
  } | null;
}

// As preferências viram etiquetas curtas, na ordem em que a equipe precisa
// delas: como falar, o que servir, o que tocar, o que oferecer para comer.
function etiquetasDePreferencia(p?: {
  pref_contato?: string | null;
  pref_musica?: string | null;
  pref_bebida?: string | null;
  pref_comida?: string | null;
} | null) {
  if (!p) return [];
  const t: string[] = [];
  if (p.pref_contato) t.push(p.pref_contato === 'ligar' ? '📞 ligação' : '💬 mensagem');
  if (p.pref_bebida) t.push(`🥤 ${p.pref_bebida}`);
  if (p.pref_musica) t.push(`🎵 ${p.pref_musica}`);
  if (p.pref_comida) t.push(`🍽️ ${p.pref_comida}`);
  return t;
}

interface Config {
  hora_inicio: string;
  hora_fim: string;
  // De quantos em quantos minutos o seletor oferece horário (9:15, 9:20…).
  passo_min: number;
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

function zap(telefone: string | undefined, msg: string) {
  if (!telefone) return null;
  const num = telefone.replace(/\D/g, '');
  const comDDI = num.startsWith('55') ? num : `55${num}`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`;
}

/* Cada procedimento carrega quem atende e a cor na agenda.
   As cores foram escolhidas para se separarem também no daltonismo, e
   nunca aparecem sozinhas: o nome do procedimento e da profissional vêm
   escritos do lado. */
const TIPOS = [
  { id: 'consulta_nova', label: 'Consulta nova', profissional: 'Bruna', cor: '#1d4ed8' },
  { id: 'retorno', label: 'Retorno', profissional: 'Bruna', cor: '#1d4ed8' },
  { id: 'implante', label: 'Implante', profissional: 'Bruna', cor: '#1d4ed8' },
  { id: 'bioestimulador', label: 'Aplicação bioestimulador', profissional: 'Bruna', cor: '#1d4ed8' },
  { id: 'medicacao', label: 'Medicação', profissional: 'Nicole', cor: '#c2410c' },
  { id: 'intradermo', label: 'Intradermoterapia capilar', profissional: 'Nicole', cor: '#c2410c' },
  { id: 'estetica', label: 'Estética', profissional: 'Ludimila', cor: '#15803d' },
  { id: 'bodyshape', label: 'BodyShape', profissional: '', cor: '#a21caf' },
  { id: 'outros', label: 'Outros', profissional: '', cor: '#78716c' },
];

const PROFISSIONAIS = ['Bruna', 'Nicole', 'Ludimila'];

const LEGENDA = [
  { nome: 'Bruna', cor: '#1d4ed8' },
  { nome: 'Nicole', cor: '#c2410c' },
  { nome: 'Ludimila', cor: '#15803d' },
  { nome: 'BodyShape', cor: '#a21caf' },
];

function infoTipo(id: string) {
  return TIPOS.find((t) => t.id === id) ?? TIPOS[TIPOS.length - 1];
}

function rotuloTipo(id: string) {
  return infoTipo(id).label;
}

/* ------------------------------------------------------------------ */
/* Seletor de horário — só dentro do funcionamento da clínica          */
/* ------------------------------------------------------------------ */

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
  const [config, setConfig] = useState<Config>({ hora_inicio: '07:00', hora_fim: '19:00', passo_min: 5 });
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [diaAberto, setDiaAberto] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [agSelecionado, setAgSelecionado] = useState<Agendamento | null>(null);

  const carregar = useCallback(async () => {
    const hoje = hojeISO();

    const [{ data: pac }, { data: ag }, { data: cfg }] = await Promise.all([
      supabase
        .from('painel_pacientes')
        .select('id,nome,telefone,dias_sem_vir,ultimo_consumo,proximo_agendamento,peso_atual,pref_contato')
        .is('arquivado_em', null)
        .order('dias_sem_vir', { ascending: false }),
      supabase
        .from('agendamentos')
        .select('*, pacientes(nome, telefone, pref_contato, pref_musica, pref_bebida, pref_comida)')
        .gte('data', hoje)
        .lte('data', somaDias(hoje, 30))
        .in('status', ['agendado', 'confirmado'])
        .order('data', { ascending: true }),
      supabase.from('config_agenda').select('hora_inicio,hora_fim,passo_min').eq('id', 1).limit(1),
    ]);

    setPainel((pac as PainelPaciente[]) || []);
    setAgenda((ag as Agendamento[]) || []);
    if (cfg && cfg[0]) setConfig(cfg[0] as Config);
    setUltimaAtualizacao(new Date());
    setCarregando(false);
  }, []);

  const carregarDia = useCallback(async (d: string) => {
    const { data } = await supabase
      .from('agendamentos')
      .select('*, pacientes(nome, telefone, pref_contato, pref_musica, pref_bebida, pref_comida)')
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

  // Atualização automática: quando você volta para a tela (troca de aba do
  // navegador, desbloqueia o celular) e a cada minuto enquanto ela fica aberta.
  // Com a aba escondida não busca nada, para não gastar bateria à toa.
  useEffect(() => {
    let ultima = Date.now();

    const atualizar = () => {
      ultima = Date.now();
      carregar();
      carregarDia(dia);
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
  }, [carregar, carregarDia, dia]);

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

      {ultimaAtualizacao && (
        <p className="text-[11px] text-amber-800/50 -mt-3 px-1">
          Atualiza sozinho · última vez às{' '}
          {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

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
        onSelecionarAgendamento={setAgSelecionado}
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
            config={config}
            dataInicial={preset.data || dia}
            horaInicial={preset.hora}
            onPronto={(dataSalva: string) => {
              setNovoAberto(false);
              setPreset({});
              // Leva a grade para o dia em que o agendamento caiu, para
              // ninguém ficar procurando ele num dia que não é o dele.
              setDia(dataSalva);
              setDiaAberto(true);
              carregar();
              carregarDia(dataSalva);
            }}
          />
        )}
      </div>

      {/* ---------------- Hoje ---------------- */}
      <Secao
        titulo="🔔 Hoje"
        contagem={deHoje.length}
        vazio="Nenhum paciente agendado para hoje."
        colapsavel
        abertoInicial={false}
        resumo={resumoDeNomes(nomesDeAgendamentos(deHoje))}
      >
        {deHoje.map((a) => (
          <LinhaAgendamento
            key={a.id}
            ag={a}
            onStatus={mudarStatus}
            onAbrir={onAbrirPaciente}
            onEditar={setAgSelecionado}
          />
        ))}
      </Secao>

      {/* ---------------- Próximos 7 dias ---------------- */}
      <Secao
        titulo="📆 Próximos 7 dias"
        contagem={proximos.length}
        vazio="Nada agendado para esta semana."
        colapsavel
        abertoInicial={false}
        resumo={resumoDeNomes(nomesDeAgendamentos(proximos))}
      >
        {proximos.map((a) => (
          <LinhaAgendamento
            key={a.id}
            ag={a}
            onStatus={mudarStatus}
            onAbrir={onAbrirPaciente}
            onEditar={setAgSelecionado}
            mostrarDia
          />
        ))}
      </Secao>

      {/* ---------------- Sumidos ---------------- */}
      <Secao
        titulo="⚠️ Sumiram"
        contagem={sumidos.length}
        vazio={`Ninguém passou de ${limiteSumido} dias sem aparecer.`}
        colapsavel
        abertoInicial={false}
        resumo={resumoDeNomes(nomesDePacientes(sumidos))}
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
        colapsavel
        abertoInicial={false}
        resumo={resumoDeNomes(nomesDePacientes(retornosVisiveis))}
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

      {agSelecionado && (
        <DetalheAgendamento
          ag={agSelecionado}
          config={config}
          onFechar={() => setAgSelecionado(null)}
          onAbrirPaciente={onAbrirPaciente}
          onMudou={() => {
            setAgSelecionado(null);
            recarregarTudo();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe de um agendamento — remarcar, desmarcar ou excluir          */
/* ------------------------------------------------------------------ */

function DetalheAgendamento({
  ag,
  config,
  onFechar,
  onAbrirPaciente,
  onMudou,
}: {
  ag: Agendamento;
  config: Config;
  onFechar: () => void;
  onAbrirPaciente?: (id: string) => void;
  onMudou: () => void;
}) {
  const [novaData, setNovaData] = useState(ag.data);
  const [novaHora, setNovaHora] = useState(ag.hora ? ag.hora.slice(0, 5) : '');
  const [remarcando, setRemarcando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const nome = ag.pacientes?.nome?.trim() || 'Paciente';

  async function remarcar() {
    setSalvando(true);
    setErro('');
    const { error } = await supabase
      .from('agendamentos')
      .update({ data: novaData, hora: novaHora || null })
      .eq('id', ag.id);
    setSalvando(false);
    if (error) return setErro(error.message);
    onMudou();
  }

  async function desmarcar() {
    setSalvando(true);
    setErro('');
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', ag.id);
    setSalvando(false);
    if (error) return setErro(error.message);
    onMudou();
  }

  async function excluir() {
    setSalvando(true);
    setErro('');
    const { error } = await supabase.from('agendamentos').delete().eq('id', ag.id);
    setSalvando(false);
    if (error) return setErro(error.message);
    onMudou();
  }

  return (
    <div
      className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white border border-amber-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-amber-100">
          <h2 className="text-lg font-serif font-bold text-amber-950">{nome}</h2>
          <p className="text-xs text-amber-800/70 mt-0.5 capitalize">
            {porExtenso(ag.data)}
            {ag.hora ? ` às ${ag.hora.slice(0, 5)}` : ' · sem horário'}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: infoTipo(ag.tipo).cor }}
            />
            <span className="text-xs font-semibold" style={{ color: infoTipo(ag.tipo).cor }}>
              {rotuloTipo(ag.tipo)}
            </span>
            {ag.profissional && (
              <span className="text-xs text-amber-800/70">· com {ag.profissional}</span>
            )}
          </div>
          {ag.observacao && (
            <p className="text-xs text-amber-900 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {ag.observacao}
            </p>
          )}

          {etiquetasDePreferencia(ag.pacientes).length > 0 && (
            <div className="mt-3 p-3 bg-white border border-amber-300 rounded-lg">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800/70 mb-1.5">
                ✨ Deixar pronto para o atendimento
              </p>
              <div className="flex flex-wrap gap-1.5">
                {etiquetasDePreferencia(ag.pacientes).map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-amber-100 text-amber-900 font-semibold px-2.5 py-1 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 space-y-2">
          {onAbrirPaciente && (
            <button
              onClick={() => {
                onFechar();
                onAbrirPaciente(ag.paciente_id);
              }}
              className="w-full text-left px-4 py-3 rounded-xl border border-amber-200 text-sm font-semibold text-amber-900 hover:bg-amber-50 transition-colors"
            >
              👤 Abrir a ficha do paciente
            </button>
          )}

          {/* Reagendou: move o mesmo agendamento de data/hora */}
          {remarcando ? (
            <div className="p-3 border border-amber-300 rounded-xl bg-amber-50/60 space-y-2">
              <p className="text-xs font-semibold text-amber-900">Nova data e hora</p>
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
              />
              <SeletorHora hora={novaHora} setHora={setNovaHora} config={config} />
              <div className="flex gap-2">
                <button
                  onClick={() => setRemarcando(false)}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg border border-amber-200 text-amber-900 hover:bg-amber-50 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={remarcar}
                  disabled={salvando}
                  className="flex-1 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {salvando ? 'Salvando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRemarcando(true)}
              className="w-full text-left px-4 py-3 rounded-xl border border-amber-200 text-sm font-semibold text-amber-900 hover:bg-amber-50 transition-colors"
            >
              🔄 Reagendou — mudar a data ou o horário
            </button>
          )}

          {/* Desmarcou: fica registrado que houve um cancelamento */}
          <button
            onClick={desmarcar}
            disabled={salvando}
            className="w-full text-left px-4 py-3 rounded-xl border border-amber-200 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50 transition-colors"
          >
            🚫 Desmarcou — sai da agenda, fica no histórico
          </button>

          {/* Digitação errada: some de vez */}
          {confirmandoExclusao ? (
            <div className="p-3 border border-red-300 bg-red-50 rounded-xl space-y-2">
              <p className="text-xs text-red-800 font-semibold">
                Excluir de vez? Some sem deixar registro — use só quando o agendamento foi criado por engano.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmandoExclusao(false)}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg border border-red-200 text-red-800 hover:bg-red-100 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={excluir}
                  disabled={salvando}
                  className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {salvando ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmandoExclusao(true)}
              className="w-full text-left px-4 py-3 rounded-xl border border-red-200 text-sm font-semibold text-red-800 hover:bg-red-50 transition-colors"
            >
              🗑️ Foi engano — excluir de vez
            </button>
          )}

          {erro && <p className="text-xs text-red-700 font-semibold">{erro}</p>}
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
  onSelecionarAgendamento,
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
  onSelecionarAgendamento: (ag: Agendamento) => void;
}) {
  // A clínica trabalha por hora cheia: dentro das 9h podem estar a consulta
  // nova das 9:15 e a medicação das 9:20. Por isso cada cartão é uma HORA,
  // e os pacientes aparecem dentro da hora no minuto exato.
  const primeira = Math.floor(paraMin(config.hora_inicio) / 60);
  const ultima = Math.ceil(paraMin(config.hora_fim) / 60);

  const horas: number[] = [];
  for (let h = primeira; h < ultima; h++) horas.push(h);

  const porHora = new Map<number, Agendamento[]>();
  const semHorario: Agendamento[] = [];
  for (const a of agendaDia) {
    if (!a.hora) {
      semHorario.push(a);
      continue;
    }
    const h = Math.floor(paraMin(a.hora) / 60);
    if (h < primeira || h >= ultima) {
      semHorario.push(a);
      continue;
    }
    const lista = porHora.get(h);
    if (lista) lista.push(a);
    else porHora.set(h, [a]);
  }
  // Dentro da hora, em ordem de chegada.
  porHora.forEach((lista) => lista.sort((x, y) => (x.hora || '').localeCompare(y.hora || '')));

  const horasVazias = horas.filter((h) => !porHora.has(h)).length;
  const ehHoje = dia === hojeISO();

  return (
    <div className="bg-white border border-amber-200/70 rounded-2xl shadow-sm overflow-hidden">
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
                ⚙️ {config.hora_inicio.slice(0, 5)}–{config.hora_fim.slice(0, 5)}
              </button>
            </div>

            {editandoConfig && (
              <EditorConfig config={config} setConfig={setConfig} onFechar={() => setEditandoConfig(false)} />
            )}

            <p className="text-xs text-amber-800/70 mt-3">
              {agendaDia.length} agendamento{agendaDia.length === 1 ? '' : 's'} · {horasVazias} hora
              {horasVazias === 1 ? '' : 's'} sem ninguém
            </p>
          </div>

          <div className="px-4 pt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {LEGENDA.map((l) => (
              <span key={l.nome} className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: l.cor }}
                />
                {l.nome}
              </span>
            ))}
          </div>

          {horas.length === 0 ? (
            <p className="px-6 py-6 text-xs text-amber-800/60 text-center">
              Horário de funcionamento inválido. Ajuste em ⚙️ acima.
            </p>
          ) : (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {horas.map((h) => {
                const lista = porHora.get(h);
                const rotulo = `${String(h).padStart(2, '0')}:00`;

                if (!lista || lista.length === 0) {
                  return (
                    <button
                      key={h}
                      onClick={() => onEscolherHorario(dia, rotulo)}
                      className="text-left px-3 py-2.5 rounded-xl border border-dashed border-amber-300 text-amber-900 hover:bg-amber-50 hover:border-amber-500 transition-colors"
                    >
                      <p className="text-[11px] font-bold tabular-nums text-amber-800">
                        {String(h).padStart(2, '0')}h
                      </p>
                      <p className="text-xs text-amber-800/60">livre</p>
                    </button>
                  );
                }

                const info = (a: Agendamento) => infoTipo(a.tipo);

                return (
                  <div key={h} className="rounded-xl border border-amber-200 bg-white overflow-hidden">
                    <div className="px-3 py-1.5 bg-amber-100/70 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold tabular-nums text-amber-900">
                        {String(h).padStart(2, '0')}h
                        <span className="font-normal text-amber-800/60"> · {lista.length}</span>
                      </p>
                      <button
                        onClick={() => onEscolherHorario(dia, rotulo)}
                        title="Encaixar mais um paciente nesta hora"
                        className="text-amber-800 hover:text-amber-950 text-sm font-bold leading-none px-1.5 rounded hover:bg-amber-200 transition-colors"
                      >
                        +
                      </button>
                    </div>

                    <div className="divide-y divide-amber-100">
                      {lista.map((ag) => (
                        <button
                          key={ag.id}
                          onClick={() => onSelecionarAgendamento(ag)}
                          title="Ver, remarcar, desmarcar ou excluir"
                          className="w-full text-left px-3 py-2 border-l-4 hover:bg-amber-50 transition-colors"
                          style={{ borderLeftColor: info(ag).cor }}
                        >
                          <p className="text-xs font-semibold text-amber-950 truncate">
                            <span className="tabular-nums text-amber-800/70">{ag.hora?.slice(0, 5)}</span>{' '}
                            {ag.pacientes?.nome ? primeiroNome(ag.pacientes.nome) : 'Paciente'}
                          </p>
                          <p className="text-[10px] font-semibold truncate" style={{ color: info(ag).cor }}>
                            {info(ag).label}
                            {ag.profissional ? ` · ${ag.profissional}` : ''}
                          </p>
                          {ag.observacao && (
                            <p className="text-[10px] text-amber-800/60 truncate">{ag.observacao}</p>
                          )}

                          {/* O que deixar pronto antes do paciente chegar */}
                          {etiquetasDePreferencia(ag.pacientes).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {etiquetasDePreferencia(ag.pacientes).map((t) => (
                                <span
                                  key={t}
                                  className="text-[9px] bg-amber-100 text-amber-900 font-semibold px-1.5 py-0.5 rounded-full max-w-full truncate"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
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
                    onClick={() => onSelecionarAgendamento(a)}
                    className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {a.pacientes?.nome ? primeiroNome(a.pacientes.nome) : 'Paciente'} · {rotuloTipo(a.tipo)}
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
  const [passo, setPasso] = useState(String(config.passo_min));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const novo = { hora_inicio: inicio, hora_fim: fim, passo_min: Number(passo) || 5 };
    await supabase.from('config_agenda').update(novo).eq('id', 1);
    setConfig(novo as Config);
    setSalvando(false);
    onFechar();
  }

  return (
    <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
      <p className="text-[11px] text-amber-800/70 mb-2">
        Vale para a clínica toda — a equipe vê a mesma agenda.
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
          <label className="block text-[10px] font-semibold text-amber-900 mb-1">Horários de</label>
          <select
            value={passo}
            onChange={(e) => setPasso(e.target.value)}
            className="px-2 py-1.5 border border-amber-200 rounded-lg text-sm bg-white outline-none"
          >
            {[5, 10, 15, 20, 30].map((d) => (
              <option key={d} value={d}>
                {d} em {d} min
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
  colapsavel,
  abertoInicial = true,
  resumo,
  children,
}: {
  titulo: string;
  contagem: number;
  vazio: string;
  acessorio?: React.ReactNode;
  colapsavel?: boolean;
  abertoInicial?: boolean;
  resumo?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(colapsavel ? abertoInicial : true);

  const cabecalho = (
    <>
      <h3 className="font-serif font-bold text-amber-950">
        {titulo} {contagem > 0 && <span className="text-amber-700/70 font-sans text-sm">({contagem})</span>}
      </h3>
      {colapsavel && !aberto && resumo && (
        <p className="text-xs text-amber-800/70 mt-0.5 truncate">{resumo}</p>
      )}
    </>
  );

  return (
    <div className="bg-white border border-amber-200/70 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between gap-3 border-b border-amber-100">
        {colapsavel ? (
          <button onClick={() => setAberto(!aberto)} className="flex-1 min-w-0 text-left">
            {cabecalho}
          </button>
        ) : (
          <div className="flex-1 min-w-0">{cabecalho}</div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {acessorio}
          {colapsavel && (
            <button
              onClick={() => setAberto(!aberto)}
              className="text-amber-700 text-sm hover:text-amber-900 transition-colors"
            >
              {aberto ? 'Fechar' : 'Abrir'}
            </button>
          )}
        </div>
      </div>

      {aberto &&
        (contagem === 0 ? (
          <p className="px-6 py-6 text-xs text-amber-800/60 text-center">{vazio}</p>
        ) : (
          <div className="divide-y divide-amber-100">{children}</div>
        ))}
    </div>
  );
}

// "Renata, Marcelo, Camila +2" — para saber quem está na lista sem abrir.
function resumoDeNomes(nomes: string[]) {
  if (nomes.length === 0) return '';
  const mostra = nomes.slice(0, 4).join(', ');
  return nomes.length > 4 ? `${mostra} +${nomes.length - 4}` : mostra;
}

function nomesDeAgendamentos(lista: Agendamento[]) {
  return lista.map((a) => (a.pacientes?.nome ? primeiroNome(a.pacientes.nome) : 'Paciente'));
}

function nomesDePacientes(lista: PainelPaciente[]) {
  return lista.map((p) => primeiroNome(p.nome));
}

function LinhaAgendamento({
  ag,
  onStatus,
  onAbrir,
  onEditar,
  mostrarDia,
}: {
  ag: Agendamento;
  onStatus: (id: string, status: string) => void;
  onAbrir?: (id: string) => void;
  onEditar?: (ag: Agendamento) => void;
  mostrarDia?: boolean;
}) {
  const nome = ag.pacientes?.nome || 'Paciente';
  const tel = ag.pacientes?.telefone;
  const link = zap(
    tel,
    `Olá ${primeiroNome(nome)}, aqui é da clínica Dra. Bruna Oliveira. Passando para confirmar seu atendimento (${rotuloTipo(ag.tipo)}) do dia ${dataCurta(ag.data)}. Podemos confirmar?`
  );

  return (
    <div
      className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-amber-50/40 transition-colors border-l-4"
      style={{ borderLeftColor: infoTipo(ag.tipo).cor }}
    >
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
          {ag.hora ? ` às ${ag.hora.slice(0, 5)}` : ''} •{' '}
          <span className="font-semibold" style={{ color: infoTipo(ag.tipo).cor }}>
            {rotuloTipo(ag.tipo)}
          </span>
          {ag.profissional ? ` · ${ag.profissional}` : ''}
        </p>

        {/* O que deixar pronto antes do paciente chegar */}
        {etiquetasDePreferencia(ag.pacientes).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {etiquetasDePreferencia(ag.pacientes).map((t) => (
              <span
                key={t}
                className="text-[10px] bg-amber-100 text-amber-900 font-semibold px-2 py-0.5 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>
        )}
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
        {onEditar && (
          <button
            onClick={() => onEditar(ag)}
            title="Remarcar, desmarcar ou excluir"
            className="text-[11px] border border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold px-2 py-1.5 rounded-lg transition-colors"
          >
            ⋯
          </button>
        )}
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
          {p.pref_contato === 'ligar' ? ' • 📞 prefere ligação' : ''}
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
  config,
  dataInicial,
  horaInicial,
  onPronto,
}: {
  pacientes: PainelPaciente[];
  config: Config;
  dataInicial?: string;
  horaInicial?: string;
  onPronto: (dataSalva: string) => void;
}) {
  const [pacienteId, setPacienteId] = useState('');
  const [busca, setBusca] = useState('');
  // Antes isto vinha com hoje + 30 dias, e agendamento ia parar no mês
  // seguinte sem ninguém reparar. Agora nasce no dia que está na tela.
  const [data, setData] = useState(dataInicial || hojeISO());
  const [hora, setHora] = useState(horaInicial || '');
  const [tipo, setTipo] = useState('retorno');
  const [profissional, setProfissional] = useState('Bruna');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Escolher o procedimento já diz quem atende; dá para trocar se alguém cobrir.
  function escolherTipo(novoTipo: string) {
    setTipo(novoTipo);
    setProfissional(infoTipo(novoTipo).profissional);
  }

  // Paciente que ainda não existe: cadastra e agenda de uma vez só.
  const [modoNovo, setModoNovo] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');

  // Quando a pessoa clica num horário livre da grade, o formulário já vem pronto.
  useEffect(() => {
    if (dataInicial) setData(dataInicial);
    if (horaInicial) setHora(horaInicial);
  }, [dataInicial, horaInicial]);

  const filtrados = busca.trim()
    ? pacientes.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : [];
  const escolhido = pacientes.find((p) => p.id === pacienteId);
  const semResultado = busca.trim().length >= 2 && filtrados.length === 0;

  function abrirCadastro(nomeSugerido: string) {
    setModoNovo(true);
    setNovoNome(nomeSugerido);
    setPacienteId('');
    setErro('');
    if (tipo === 'retorno') setTipo('consulta');
  }

  function limparTudo() {
    setPacienteId('');
    setBusca('');
    setObs('');
    setHora('');
    setModoNovo(false);
    setNovoNome('');
    setNovoTelefone('');
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    if (modoNovo && !novoNome.trim()) {
      setErro('Informe o nome do paciente.');
      return;
    }
    if (!modoNovo && !pacienteId) {
      setErro('Escolha o paciente ou cadastre um novo.');
      return;
    }

    setSalvando(true);
    const { data: sessao } = await supabase.auth.getUser();
    let idParaAgendar = pacienteId;

    // Cadastro mínimo: nome e telefone. O resto da ficha se completa na consulta.
    if (modoNovo) {
      const { data: criado, error: erroPaciente } = await supabase
        .from('pacientes')
        .insert([{ nome: novoNome.trim(), telefone: novoTelefone.trim() || null }])
        .select('id')
        .single();

      if (erroPaciente || !criado) {
        setSalvando(false);
        setErro(`Não foi possível cadastrar o paciente: ${erroPaciente?.message ?? 'erro desconhecido'}`);
        return;
      }
      idParaAgendar = (criado as { id: string }).id;
    }

    const { error } = await supabase.from('agendamentos').insert([
      {
        paciente_id: idParaAgendar,
        data,
        hora: hora || null,
        tipo,
        profissional: profissional || null,
        observacao: obs || null,
        criado_por: sessao.user?.id ?? null,
      },
    ]);

    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }

    limparTudo();
    onPronto(data);
  }

  return (
    <form onSubmit={salvar} className="px-6 pb-6 pt-2 space-y-3 border-t border-amber-100">
      {horaInicial && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Horário escolhido na grade: <strong>{dataCurta(data)} às {hora}</strong>
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-amber-900">Paciente</label>
          {!modoNovo && !escolhido && (
            <button
              type="button"
              onClick={() => abrirCadastro(busca.trim())}
              className="text-xs font-semibold text-amber-700 hover:underline"
            >
              ➕ paciente novo
            </button>
          )}
        </div>

        {modoNovo ? (
          <div className="space-y-2 bg-amber-50/60 border border-amber-200 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800/70">
                Cadastrando paciente novo
              </span>
              <button
                type="button"
                onClick={() => {
                  setModoNovo(false);
                  setNovoNome('');
                  setNovoTelefone('');
                }}
                className="text-xs text-amber-700 hover:underline"
              >
                voltar para a busca
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-900 mb-1">Nome completo *</label>
              <input
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: Mariana Costa"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-900 mb-1">Telefone</label>
              <input
                type="text"
                inputMode="tel"
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                placeholder="(35) 90000-0000"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <p className="text-[10px] text-amber-800/60 mt-1">
                Sem telefone não dá para mandar a confirmação pelo WhatsApp.
              </p>
            </div>

            <p className="text-[11px] text-amber-800/70 leading-relaxed">
              CPF, nascimento, endereço e o resto da ficha você completa na consulta, na aba Pacientes.
            </p>
          </div>
        ) : escolhido ? (
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
            {semResultado && (
              <button
                type="button"
                onClick={() => abrirCadastro(busca.trim())}
                className="mt-2 w-full text-left px-3 py-2.5 border border-dashed border-amber-400 rounded-lg text-sm text-amber-900 hover:bg-amber-50 transition-colors"
              >
                ➕ Ninguém com esse nome. <strong>Cadastrar “{busca.trim()}” como paciente novo</strong>
              </button>
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
        <div className="col-span-2 sm:col-span-3 -mt-1">
          {/* A data por extenso: 15/10 e 15/09 são fáceis de confundir num
              campo pequeno, e o agendamento acaba no mês errado. */}
          <p className="text-xs text-amber-800/70 capitalize">
            {porExtenso(data)}
            {data === hojeISO() && <span className="normal-case font-semibold"> · hoje</span>}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {[
              { rotulo: 'hoje', dias: 0 },
              { rotulo: '+15 dias', dias: 15 },
              { rotulo: '+30 dias', dias: 30 },
              { rotulo: '+60 dias', dias: 60 },
              { rotulo: '+90 dias', dias: 90 },
            ].map((atalho) => (
              <button
                key={atalho.rotulo}
                type="button"
                onClick={() => setData(somaDias(hojeISO(), atalho.dias))}
                className="text-[11px] border border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold px-2.5 py-1 rounded-lg transition-colors"
              >
                {atalho.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-amber-900 mb-1">Horário</label>
          <SeletorHora hora={hora} setHora={setHora} config={config} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-amber-900 mb-1">Procedimento</label>
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
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-amber-900 mb-1">Quem atende</label>
          <select
            value={profissional}
            onChange={(e) => setProfissional(e.target.value)}
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
          >
            <option value="">Não definido</option>
            {PROFISSIONAIS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-amber-900 mb-1">
          Observação (opcional) — aparece na grade do dia
        </label>
        <input
          type="text"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex: primeira consulta, trazer exames"
          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
        />
      </div>

      {erro && <p className="text-xs text-red-700 font-semibold">{erro}</p>}

      <button
        type="submit"
        disabled={salvando}
        className="w-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition-colors shadow"
      >
        {salvando ? 'Salvando…' : modoNovo ? 'Cadastrar e agendar' : 'Agendar'}
      </button>
    </form>
  );
}
