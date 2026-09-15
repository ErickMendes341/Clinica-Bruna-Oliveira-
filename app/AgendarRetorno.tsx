'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Ag {
  id: string;
  data: string;
  hora?: string;
  tipo: string;
  status: string;
  observacao?: string;
  profissional?: string | null;
}

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

function infoTipo(id: string) {
  return TIPOS.find((t) => t.id === id) ?? TIPOS[TIPOS.length - 1];
}

function rotuloTipo(id: string) {
  return infoTipo(id).label;
}

interface Config {
  hora_inicio: string;
  hora_fim: string;
  passo_min: number;
}

function paraMin(hhmm: string) {
  const [h, m] = hhmm.slice(0, 5).split(':');
  return Number(h) * 60 + Number(m);
}

/* Só oferece horário dentro do funcionamento da clínica — digitar um
   horário fora dela era justamente o que fazia o agendamento se perder. */
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
  const [atual, setAtual] = useState<Ag | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [abrindoForm, setAbrindoForm] = useState(false);
  const [data, setData] = useState(emDias(30));
  const [hora, setHora] = useState('');
  const [tipo, setTipo] = useState('retorno');
  const [profissional, setProfissional] = useState('Bruna');
  const [salvando, setSalvando] = useState(false);

  // O procedimento já diz quem atende; dá para trocar se alguém cobrir.
  function escolherTipo(novoTipo: string) {
    setTipo(novoTipo);
    setProfissional(infoTipo(novoTipo).profissional);
  }
  const [config, setConfig] = useState<Config>({ hora_inicio: '07:00', hora_fim: '19:00', passo_min: 5 });

  const carregar = useCallback(async () => {
    const [{ data: linhas }, { data: cfg }] = await Promise.all([
      supabase
        .from('agendamentos')
        .select('id,data,hora,tipo,status,observacao,profissional')
        .eq('paciente_id', pacienteId)
        .in('status', ['agendado', 'confirmado'])
        .gte('data', hojeISO())
        .order('data', { ascending: true })
        .limit(1),
      supabase.from('config_agenda').select('hora_inicio,hora_fim,passo_min').eq('id', 1).limit(1),
    ]);
    setAtual(linhas && linhas[0] ? (linhas[0] as Ag) : null);
    if (cfg && cfg[0]) setConfig(cfg[0] as Config);
    setCarregando(false);
  }, [pacienteId]);

  useEffect(() => {
    setCarregando(true);
    setAbrindoForm(false);
    carregar();
  }, [carregar]);

  async function agendar(dataEscolhida: string) {
    setSalvando(true);
    const { data: sessao } = await supabase.auth.getUser();

    // Se já existe um marcado, este vira remarcação: o antigo é cancelado.
    if (atual) {
      await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', atual.id);
    }

    await supabase.from('agendamentos').insert([
      {
        paciente_id: pacienteId,
        data: dataEscolhida,
        hora: hora || null,
        tipo,
        profissional: profissional || null,
        criado_por: sessao.user?.id ?? null,
      },
    ]);

    setSalvando(false);
    setAbrindoForm(false);
    setHora('');
    await carregar();
    onMudou?.();
  }

  async function cancelar() {
    if (!atual) return;
    await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', atual.id);
    await carregar();
    onMudou?.();
  }

  const zap =
    telefone && atual
      ? `https://wa.me/${(telefone.replace(/\D/g, '').startsWith('55') ? '' : '55') + telefone.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Olá ${primeiroNome(pacienteNome)}, aqui é da clínica Dra. Bruna Oliveira. Seu atendimento (${rotuloTipo(atual.tipo)}) está marcado para ${porExtenso(atual.data)}${atual.hora ? ` às ${atual.hora.slice(0, 5)}` : ''}. Até lá!`
        )}`
      : null;

  if (carregando) {
    return (
      <div className="bg-white border border-amber-200/70 rounded-xl px-5 py-4">
        <p className="text-xs text-amber-800/60">Carregando agendamento…</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-amber-200/70 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-amber-100">
        <h3 className="font-serif font-bold text-amber-950 text-sm">📅 Próxima consulta</h3>
      </div>

      {atual && !abrindoForm ? (
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-lg font-serif font-bold text-amber-950 capitalize">{porExtenso(atual.data)}</p>
            <p className="text-xs mt-0.5">
              <span className="font-semibold" style={{ color: infoTipo(atual.tipo).cor }}>
                {rotuloTipo(atual.tipo)}
              </span>
              <span className="text-amber-800/70">
                {atual.profissional ? ` · ${atual.profissional}` : ''}
                {atual.hora ? ` · ${atual.hora.slice(0, 5)}` : ''}
                {atual.status === 'confirmado' ? ' · confirmado' : ''}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
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
              onClick={() => {
                setData(atual.data);
                escolherTipo(atual.tipo);
                if (atual.profissional) setProfissional(atual.profissional);
                setAbrindoForm(true);
              }}
              className="text-[11px] bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Remarcar
            </button>
            <button
              onClick={cancelar}
              className="text-[11px] border border-amber-200 text-amber-800 hover:bg-amber-50 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          {!atual && (
            <p className="text-xs text-amber-800/70">
              Sem retorno marcado. Escolha um prazo ou defina a data.
            </p>
          )}

          {/* Atalhos de prazo — o caso comum em um clique */}
          <div className="flex flex-wrap gap-2">
            {[15, 30, 45, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                disabled={salvando}
                onClick={() => agendar(emDias(d))}
                className="text-xs bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white font-semibold px-3 py-2 rounded-lg transition-colors shadow-sm"
              >
                {d} dias
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="flex-1 px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none"
            />
            <div className="flex-1">
              <SeletorHora hora={hora} setHora={setHora} config={config} />
            </div>
            <select
              value={tipo}
              onChange={(e) => escolherTipo(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm bg-white outline-none font-semibold"
              style={{ borderColor: infoTipo(tipo).cor, color: infoTipo(tipo).cor }}
            >
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={profissional}
              onChange={(e) => setProfissional(e.target.value)}
              className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
            >
              <option value="">Quem atende</option>
              {PROFISSIONAIS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={salvando}
              onClick={() => agendar(data)}
              className="bg-amber-900 hover:bg-amber-950 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors shadow-sm whitespace-nowrap"
            >
              {salvando ? 'Salvando…' : atual ? 'Remarcar' : 'Agendar'}
            </button>
          </div>

          {atual && (
            <button
              type="button"
              onClick={() => setAbrindoForm(false)}
              className="text-xs text-amber-700 hover:underline"
            >
              voltar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
