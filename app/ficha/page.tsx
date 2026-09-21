'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * Formulário que o paciente preenche no celular, sem login.
 *
 * Chega aqui por um link único mandado pela ficha (?t=TOKEN) ou pelo link
 * geral (sem token). O envio vai para a caixa de entrada do app; a equipe
 * confere e aceita. Esta página não lê nada do banco além do primeiro
 * nome do convite, para a saudação.
 */

const BEBIDAS = [
  'Água',
  'Água com gás',
  'Café puro',
  'Café com adoçante',
  'Capuccino',
  'Capuccino com Whey',
  'Sem preferência',
];

const campo =
  'w-full px-4 py-3 text-base bg-white border border-amber-200 rounded-xl outline-none focus:border-amber-500 transition-colors';
const rotulo = 'block text-sm font-semibold text-amber-900 mb-1.5';

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export default function PaginaFicha() {
  return (
    <Suspense fallback={<Moldura><p className="text-sm text-amber-900/60">Carregando…</p></Moldura>}>
      <Formulario />
    </Suspense>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-amber-950 font-sans">
      <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 rounded-full border-2 border-amber-400/60 p-0.5 bg-amber-50 shadow-md overflow-hidden mb-3">
            <img src="/logo.jpeg" alt="Dra. Bruna Oliveira" className="w-full h-full object-cover rounded-full" />
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight">Dra. Bruna Oliveira</h1>
          <p className="text-amber-800 text-[11px] font-semibold tracking-wider uppercase mt-1">
            Medicina do Esporte · Passos/MG
          </p>
        </div>
        <div className="bg-white border border-amber-200/80 rounded-2xl shadow-sm p-5 sm:p-7">{children}</div>
        <p className="text-center text-[11px] text-amber-900/50 mt-5 leading-relaxed">
          Rua Juca Stockler, 2029 · Passos/MG · (35) 99987-1770
        </p>
      </div>
    </div>
  );
}

function Formulario() {
  const params = useSearchParams();
  const token = params.get('t') || '';

  // Estado do convite: só sabemos o primeiro nome; nada da ficha vem para cá.
  const [convite, setConvite] = useState<'verificando' | 'ok' | 'invalido' | 'usado' | 'expirado' | 'geral'>(
    token ? 'verificando' : 'geral'
  );
  const [primeiroNome, setPrimeiroNome] = useState('');

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [endereco, setEndereco] = useState('');
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [prefContato, setPrefContato] = useState('');
  const [prefBebida, setPrefBebida] = useState('');
  const [prefMusica, setPrefMusica] = useState('');
  const [prefComida, setPrefComida] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [consentimento, setConsentimento] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    if (!token) return;
    supabase.rpc('dados_convite', { p_token: token }).then(({ data }) => {
      const r = (data ?? {}) as { ok?: boolean; motivo?: string; primeiro_nome?: string };
      if (r.ok) {
        setConvite('ok');
        setPrimeiroNome(r.primeiro_nome ?? '');
      } else {
        setConvite(r.motivo === 'usado' ? 'usado' : r.motivo === 'expirado' ? 'expirado' : 'invalido');
      }
    });
  }, [token]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nome.trim().length < 3) return setErro('Escreva seu nome completo.');
    if (telefone.replace(/\D/g, '').length < 10) return setErro('Informe um telefone com DDD.');
    if (!consentimento) return setErro('Para enviar, marque que concorda com o uso dos dados.');

    setEnviando(true);
    const { data, error } = await supabase.rpc('enviar_ficha', {
      p_token: token || null,
      p_dados: {
        nome: nome.trim(),
        telefone: telefone.trim(),
        cpf: cpf.trim(),
        data_nascimento: nascimento,
        endereco: endereco.trim(),
        peso: peso.trim(),
        altura: altura.trim(),
        pref_contato: prefContato,
        pref_bebida: prefBebida,
        pref_musica: prefMusica.trim(),
        pref_comida: prefComida.trim(),
        observacoes: observacoes.trim(),
        consentimento: 'true',
      },
    });
    setEnviando(false);

    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (error || !r.ok) {
      const motivo = r.motivo;
      setErro(
        motivo === 'convite'
          ? 'Este link já foi usado ou venceu. Peça um novo para a clínica.'
          : motivo === 'limite'
            ? 'Muitos envios agora. Tente de novo em alguns minutos.'
            : 'Não foi possível enviar. Verifique a internet e tente de novo.'
      );
      return;
    }
    setEnviado(true);
    window.scrollTo({ top: 0 });
  }

  if (convite === 'verificando') {
    return (
      <Moldura>
        <p className="text-sm text-amber-900/60">Abrindo sua ficha…</p>
      </Moldura>
    );
  }

  if (convite === 'invalido' || convite === 'usado' || convite === 'expirado') {
    return (
      <Moldura>
        <h2 className="text-lg font-serif font-bold mb-2">
          {convite === 'usado' ? 'Esta ficha já foi enviada' : 'Este link não está mais válido'}
        </h2>
        <p className="text-sm text-amber-900/80 leading-relaxed">
          {convite === 'usado'
            ? 'Recebemos suas informações, obrigado! Se precisar corrigir algo, fale com a clínica.'
            : 'O link vence em 7 dias. Peça um novo pelo WhatsApp da clínica: (35) 99987-1770.'}
        </p>
      </Moldura>
    );
  }

  if (enviado) {
    return (
      <Moldura>
        <div className="text-center py-4">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-lg font-serif font-bold mb-2">Ficha enviada!</h2>
          <p className="text-sm text-amber-900/80 leading-relaxed">
            Obrigado{primeiroNome ? `, ${primeiroNome}` : ''}. A equipe da clínica vai conferir suas informações
            antes da consulta. Até lá!
          </p>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <h2 className="text-lg font-serif font-bold mb-1">
        {primeiroNome ? `Olá, ${primeiroNome}!` : 'Ficha do paciente'}
      </h2>
      <p className="text-sm text-amber-900/70 mb-6 leading-relaxed">
        Preencha com calma — leva uns 3 minutos e adianta o seu atendimento. Só nome e telefone são obrigatórios.
      </p>

      <form onSubmit={enviar} className="space-y-5">
        <div>
          <label htmlFor="nome" className={rotulo}>Nome completo *</label>
          <input id="nome" type="text" required autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="telefone" className={rotulo}>Telefone / WhatsApp *</label>
            <input id="telefone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="(35) 99999-9999" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} className={campo} />
          </div>
          <div>
            <label htmlFor="cpf" className={rotulo}>CPF</label>
            <input id="cpf" type="text" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(mascaraCPF(e.target.value))} className={campo} />
          </div>
        </div>

        <div>
          <label htmlFor="nascimento" className={rotulo}>Data de nascimento</label>
          <input id="nascimento" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={campo} />
        </div>

        <div>
          <label htmlFor="endereco" className={rotulo}>Endereço</label>
          <input id="endereco" type="text" autoComplete="street-address" placeholder="Rua, número, bairro, cidade" value={endereco} onChange={(e) => setEndereco(e.target.value)} className={campo} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="peso" className={rotulo}>Peso (kg)</label>
            <input id="peso" type="text" inputMode="decimal" placeholder="Ex: 78,5" value={peso} onChange={(e) => setPeso(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="altura" className={rotulo}>Altura (m)</label>
            <input id="altura" type="text" inputMode="decimal" placeholder="Ex: 1,75" value={altura} onChange={(e) => setAltura(e.target.value)} className={campo} />
          </div>
        </div>

        <div>
          <label htmlFor="observacoes" className={rotulo}>Objetivos, histórico e observações</label>
          <textarea id="observacoes" rows={4} placeholder="Objetivos esportivos, lesões anteriores, doenças, remédios ou suplementos em uso, alergias…" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={campo} />
        </div>

        <fieldset className="border border-amber-200/80 rounded-xl p-4 space-y-4">
          <legend className="px-2 text-xs font-bold text-amber-800 uppercase tracking-wider">Para deixar seu atendimento do seu jeito</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contato" className={rotulo}>Prefere que a clínica entre em contato por</label>
              <select id="contato" value={prefContato} onChange={(e) => setPrefContato(e.target.value)} className={campo}>
                <option value="">Tanto faz</option>
                <option value="ligar">📞 Ligação</option>
                <option value="mensagem">💬 Mensagem</option>
              </select>
            </div>
            <div>
              <label htmlFor="bebida" className={rotulo}>Gosta de tomar o quê?</label>
              <select id="bebida" value={prefBebida} onChange={(e) => setPrefBebida(e.target.value)} className={campo}>
                <option value="">Escolher…</option>
                {BEBIDAS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="musica" className={rotulo}>Música que gosta de ouvir</label>
            <input id="musica" type="text" placeholder="Ex: MPB, bossa nova, silêncio" value={prefMusica} onChange={(e) => setPrefMusica(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="comida" className={rotulo}>Comida / restrições alimentares</label>
            <input id="comida" type="text" placeholder="Ex: castanhas, não come glúten, alergia a frutos do mar" value={prefComida} onChange={(e) => setPrefComida(e.target.value)} className={campo} />
          </div>
        </fieldset>

        <label className="flex items-start gap-3 text-sm text-amber-900/80 leading-relaxed cursor-pointer">
          <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-1 w-5 h-5 accent-amber-800 flex-shrink-0" />
          <span>
            Concordo que a Clínica Dra. Bruna Oliveira guarde estas informações no meu prontuário e as use
            somente para o meu atendimento, conforme a Lei Geral de Proteção de Dados. Posso pedir correção ou
            exclusão a qualquer momento pelo WhatsApp da clínica.
          </span>
        </label>

        {erro && (
          <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2.5 rounded-lg">
            <p className="text-sm text-red-800 font-semibold">{erro}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-base font-semibold px-4 py-3.5 rounded-xl shadow transition-all"
        >
          {enviando ? 'Enviando…' : 'Enviar ficha'}
        </button>
      </form>
    </Moldura>
  );
}
