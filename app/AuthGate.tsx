'use client';

import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { PESSOAS, juntarPessoas } from '@/lib/equipe';
import { PapelContexto, ROTULO_PAPEL, type Papel } from '@/lib/permissoes';
import { SENHA_FRACA, SENHA_MINIMA, problemaNaSenha } from '@/lib/validacao';
import CriarAcesso from './CriarAcesso';
import PedidosDeAcesso from './PedidosDeAcesso';

/**
 * O Supabase identifica cada acesso por e-mail. Para a equipe digitar só
 * "clinicabrunaoliveira", completamos o domínio aqui quando não vier "@".
 */
const DOMINIO_PADRAO = '@clinicabrunaoliveira.com.br';

/* Os computadores ficam na recepção, à vista de quem passa: depois de
   um tempo parado, o app se tranca sozinho. Avisa 1 minuto antes, para
   ninguém perder o que está fazendo. */
const MINUTOS_ATE_SAIR = 30;
const SEGUNDOS_DE_AVISO = 60;

function paraEmail(usuario: string) {
  // "Recepção", "recepcao" e "Recepcao" são o mesmo login: tiramos acento,
  // maiúscula e espaço para ninguém tropeçar na hora de entrar.
  const limpo = usuario
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
  return limpo.includes('@') ? limpo : limpo + DOMINIO_PADRAO;
}

/** Quem entrou e o que pode fazer. */
type Equipe = {
  /** De qual login são estes dados. Vazio até o banco responder. */
  de: string;
  papel: Papel | null;
  nome: string;
  assinatura: string;
  pessoas: readonly string[];
  trocouSenha: boolean;
  /** O banco não respondeu: não dá para dizer que a pessoa não tem acesso. */
  falhou: boolean;
};

const NINGUEM: Equipe = {
  de: '',
  papel: null,
  nome: '',
  assinatura: '',
  pessoas: PESSOAS,
  trocouSenha: true,
  falhou: false,
};

/**
 * Portão de acesso da clínica.
 *
 * Enquanto ninguém estiver logado, o app inteiro não é renderizado — e,
 * mais importante, o banco não entrega dado nenhum (as policies de RLS
 * exigem usuário autenticado). A tela de login é só a porta; quem tranca
 * de verdade é o RLS no Supabase.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Enquanto não sabemos quem entrou, nada aparece.
  const [equipe, setEquipe] = useState<Equipe>(NINGUEM);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCarregando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao);
      setCarregando(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Depende do id, e não da sessão: toda vez que o app volta para a frente
  // o Supabase entrega uma sessão nova da mesma pessoa. Dependendo da sessão,
  // cada volta desmontava a tela inteira e recarregava tudo do zero.
  const usuarioId = session?.user.id ?? '';

  useEffect(() => {
    if (!usuarioId) {
      setEquipe(NINGUEM);
      return;
    }
    let valendo = true;
    Promise.all([
      supabase
        .from('equipe_autorizada')
        .select('nome,papel,senha_trocada_em,posto')
        .eq('user_id', usuarioId)
        .maybeSingle(),
      supabase.rpc('nomes_da_equipe'),
    ])
      .then(([{ data, error }, { data: nomes }]) => {
        if (!valendo) return;
        const r = data as {
          nome: string;
          papel: Papel;
          senha_trocada_em: string | null;
          posto: boolean;
        } | null;
        setEquipe({
          de: usuarioId,
          papel: r?.papel ?? null,
          nome: r?.nome ?? '',
          // Login de posto é usado por várias pessoas: o app não sabe quem
          // está ali, então não assina no nome de ninguém.
          assinatura: r && !r.posto ? r.nome : '',
          pessoas: juntarPessoas((nomes as string[] | null) ?? []),
          trocouSenha: r?.senha_trocada_em !== null && r?.senha_trocada_em !== undefined,
          falhou: !!error,
        });
      })
      // Sem isto, qualquer falha aqui deixava o "Carregando…" para sempre.
      .catch(() => {
        if (valendo) setEquipe({ ...NINGUEM, de: usuarioId, falhou: true });
      });
    return () => {
      valendo = false;
    };
  }, [usuarioId]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <p className="text-amber-900/60 text-sm font-semibold tracking-wide">Carregando…</p>
      </div>
    );
  }

  if (!session) return <TelaLogin />;

  if (equipe.de !== usuarioId) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <p className="text-amber-900/60 text-sm font-semibold tracking-wide">Carregando…</p>
      </div>
    );
  }

  // Entrou, mas ninguém liberou esse usuário: o banco também não devolve
  // nada, então avisamos em vez de mostrar uma tela vazia.
  if (!equipe.papel) return <AguardandoAutorizacao falhou={equipe.falhou} />;

  // Senha ainda é a provisória entregue pela administração: ninguém entra
  // no prontuário sem antes criar uma senha só sua.
  if (!equipe.trocouSenha) {
    return (
      <PrimeiroAcesso
        nome={equipe.nome}
        onPronto={() => setEquipe((e) => ({ ...e, trocouSenha: true }))}
      />
    );
  }

  return (
    <PapelContexto.Provider value={equipe}>
      <BarraUsuario email={session.user.email ?? ''} nome={equipe.nome} papel={equipe.papel} />
      <TrancaPorInatividade />
      <PedidosDeAcesso />
      {children}
    </PapelContexto.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Conta criada, esperando a Dra. Bruna                                */
/* ------------------------------------------------------------------ */

function AguardandoAutorizacao({ falhou }: { falhou: boolean }) {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4">
      <div className="bg-white border border-amber-200 rounded-2xl shadow-sm p-7 max-w-sm text-center">
        <p className="text-3xl mb-3">{falhou ? '⚠️' : '⏳'}</p>
        <h2 className="text-lg font-serif font-bold text-amber-950 mb-2">
          {falhou ? 'Não foi possível conferir seu acesso' : 'Aguardando autorização'}
        </h2>
        <p className="text-sm text-amber-900/80 leading-relaxed mb-5">
          {falhou
            ? 'Confira a internet e tente de novo.'
            : 'Seu pedido está com a Dra. Bruna. Depois que ela autorizar, toque no botão abaixo. Se demorar, fale com ela.'}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white transition-colors"
          >
            Verificar de novo
          </button>
          <button
            onClick={() => supabase.auth.signOut({ scope: 'local' })}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-amber-200 text-amber-900 hover:bg-amber-50 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tranca automática                                                   */
/* ------------------------------------------------------------------ */

function TrancaPorInatividade() {
  const [faltam, setFaltam] = useState<number | null>(null);

  useEffect(() => {
    let ultimoUso = Date.now();
    let avisando = false;
    // O relógio bate a cada segundo; sem isto ele mandava "sair" de novo
    // a cada batida até a tela sumir (dava para ver nos registros).
    let trancou = false;

    const registrarUso = () => {
      ultimoUso = Date.now();
      if (avisando) {
        avisando = false;
        setFaltam(null);
      }
    };

    // 'change' e 'input' entram porque quem preenche um agendamento usa
    // quase só listas suspensas e seletor de data. No celular isso não
    // dispara toque nem tecla, e a pessoa parecia parada enquanto
    // trabalhava — a tranca caía no meio do preenchimento.
    const eventos: (keyof DocumentEventMap)[] = [
      'mousedown', 'keydown', 'touchstart', 'scroll', 'change', 'input', 'pointerdown',
    ];
    eventos.forEach((e) => document.addEventListener(e, registrarUso, { passive: true }));

    const relogio = setInterval(() => {
      if (trancou) return;
      const parado = (Date.now() - ultimoUso) / 1000;
      const limite = MINUTOS_ATE_SAIR * 60;
      if (parado >= limite) {
        trancou = true;
        // 'local' tranca só este aparelho. Sem isso, o Supabase encerra a
        // sessão do usuário em TODOS os aparelhos — e um tablet esquecido
        // ligado derrubava quem estava no meio de um agendamento.
        supabase.auth.signOut({ scope: 'local' });
        return;
      }
      if (parado >= limite - SEGUNDOS_DE_AVISO) {
        avisando = true;
        setFaltam(Math.ceil(limite - parado));
      }
    }, 1000);

    return () => {
      clearInterval(relogio);
      eventos.forEach((e) => document.removeEventListener(e, registrarUso));
    };
  }, []);

  if (faltam === null) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] bg-amber-900 text-amber-50 px-4 py-3 shadow-lg print:hidden">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <p className="text-sm font-semibold">
          🔒 Sem uso há um tempo — o app vai se trancar em {faltam} segundo{faltam === 1 ? '' : 's'}.
        </p>
        <button
          onClick={() => setFaltam(null)}
          className="flex-shrink-0 text-xs font-bold bg-amber-50 text-amber-900 px-4 py-2 rounded-lg hover:bg-white transition-colors"
        >
          Continuar trabalhando
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tela de login                                                       */
/* ------------------------------------------------------------------ */

function TelaLogin() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [criandoCadastro, setCriandoCadastro] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: paraEmail(usuario),
      password: senha,
    });

    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'Usuário ou senha incorretos.'
          : error.message === 'Email not confirmed'
            ? 'Este acesso ainda não foi confirmado. Fale com a administração da clínica.'
            : 'Não foi possível entrar. Tente de novo em instantes.'
      );
      setEnviando(false);
      return;
    }
    // Sucesso: o onAuthStateChange do AuthGate assume daqui.
  }

  if (criandoCadastro) return <CriarAcesso onVoltar={() => setCriandoCadastro(false)} />;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-amber-950 font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-amber-200/80 rounded-2xl shadow-sm p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-0"></div>

          <div className="relative z-10">
            <div className="flex flex-col items-center text-center mb-7">
              <div className="w-20 h-20 rounded-full border-2 border-amber-400/60 p-0.5 bg-amber-50 shadow-md overflow-hidden mb-4">
                <img
                  src="/logo.jpeg"
                  alt="Dra. Bruna Oliveira"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <h1 className="text-2xl font-serif font-bold text-amber-950 tracking-tight">
                Dra. Bruna Oliveira
              </h1>
              <p className="text-amber-800 text-[11px] font-semibold tracking-wider uppercase mt-1">
                Acesso restrito à equipe
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="usuario"
                  className="block text-xs font-semibold text-amber-900 mb-1.5"
                >
                  Usuário ou e-mail
                </label>
                <input
                  id="usuario"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-amber-50/50 border border-amber-200 rounded-xl outline-none focus:border-amber-500 focus:bg-white transition-all"
                  placeholder="seu usuário ou e-mail"
                />
              </div>

              <div>
                <label
                  htmlFor="senha"
                  className="block text-xs font-semibold text-amber-900 mb-1.5"
                >
                  Senha
                </label>
                <input
                  id="senha"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-amber-50/50 border border-amber-200 rounded-xl outline-none focus:border-amber-500 focus:bg-white transition-all"
                  placeholder="••••••••"
                />
              </div>

              {erro && (
                <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2.5 rounded-lg">
                  <p className="text-xs text-red-800 font-semibold">{erro}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="w-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-3 rounded-xl shadow transition-all"
              >
                {enviando ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setCriandoCadastro(true)}
              className="w-full mt-4 py-1 text-xs font-semibold text-amber-800 hover:text-amber-950 underline underline-offset-2 transition-colors"
            >
              Ainda não tem acesso? Criar cadastro
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-amber-900/50 mt-5 leading-relaxed">
          Os dados de pacientes desta clínica são protegidos.
          <br />
          O acesso é individual e não deve ser compartilhado.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de quem está logado                                           */
/* ------------------------------------------------------------------ */

function BarraUsuario({ email, nome, papel }: { email: string; nome?: string; papel?: Papel }) {
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  return (
    <>
      <div className="bg-amber-900 text-amber-50 px-4 md:px-8 py-2 flex items-center justify-between gap-3 print:hidden">
        <span className="text-[11px] font-semibold tracking-wide truncate">
          🔒 {nome?.trim() || email.split('@')[0]}
          {papel && <span className="font-normal text-amber-200/80"> · {ROTULO_PAPEL[papel]}</span>}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setTrocandoSenha(true)}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-800/60 hover:bg-amber-800 transition-all"
          >
            Alterar senha
          </button>
          <button
            onClick={() => supabase.auth.signOut({ scope: 'local' })}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-800/60 hover:bg-amber-800 transition-all"
          >
            Sair
          </button>
        </div>
      </div>

      {trocandoSenha && <ModalTrocarSenha onFechar={() => setTrocandoSenha(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Modal de troca de senha                                             */
/* ------------------------------------------------------------------ */

function ModalTrocarSenha({ onFechar }: { onFechar: () => void }) {
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function handleTrocar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    const problema = problemaNaSenha(nova);
    if (problema) {
      setErro(problema);
      return;
    }
    if (nova !== confirma) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (!error) await supabase.rpc('marcar_senha_trocada');
    setEnviando(false);

    if (error) {
      setErro(
        error.code === 'weak_password'
          ? SENHA_FRACA
          : 'Não foi possível alterar a senha. Tente de novo.'
      );
      return;
    }

    setOk(true);
    setTimeout(onFechar, 1800);
  }

  return (
    <div className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-amber-200 rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-serif font-bold text-amber-950 mb-1">Alterar senha</h2>
        <p className="text-xs text-amber-900/70 mb-5">
          Use uma senha que você não usa em outro lugar.
        </p>

        {ok ? (
          <div className="bg-emerald-50 border-l-4 border-emerald-600 px-3 py-3 rounded-lg">
            <p className="text-xs text-emerald-900 font-semibold">
              ✅ Senha alterada com sucesso.
            </p>
          </div>
        ) : (
          <form onSubmit={handleTrocar} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-amber-900 mb-1.5">
                Nova senha
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-amber-50/50 border border-amber-200 rounded-xl outline-none focus:border-amber-500 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-amber-900 mb-1.5">
                Repita a nova senha
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-amber-50/50 border border-amber-200 rounded-xl outline-none focus:border-amber-500 focus:bg-white transition-all"
              />
            </div>

            {erro && (
              <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2.5 rounded-lg">
                <p className="text-xs text-red-800 font-semibold">{erro}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onFechar}
                className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border border-amber-200 text-amber-900 hover:bg-amber-50 transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="flex-1 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow transition-all"
              >
                {enviando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primeiro acesso: criar a senha própria                              */
/* ------------------------------------------------------------------ */

function PrimeiroAcesso({ nome, onPronto }: { nome: string; onPronto: () => void }) {
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    const problema = problemaNaSenha(nova);
    if (problema) return setErro(problema);
    if (nova !== confirma) return setErro('As duas senhas não são iguais.');

    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      setEnviando(false);
      return setErro(
        error.code === 'weak_password'
          ? SENHA_FRACA
          : error.message.includes('different from the old')
            ? 'Escolha uma senha diferente da provisória.'
            : 'Não foi possível criar a senha. Tente de novo.'
      );
    }
    const { error: erroMarca } = await supabase.rpc('marcar_senha_trocada');
    setEnviando(false);
    if (erroMarca) return setErro('A senha mudou, mas houve um erro ao concluir. Entre de novo.');
    onPronto();
  }

  const primeiroNome = nome.trim().split(' ')[0];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-amber-950 font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-amber-200/80 rounded-2xl shadow-sm p-7">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-full border-2 border-amber-400/60 p-0.5 bg-amber-50 shadow-md overflow-hidden mb-3">
              <img src="/logo.jpeg" alt="Dra. Bruna Oliveira" className="w-full h-full object-cover rounded-full" />
            </div>
            <h1 className="text-xl font-serif font-bold text-amber-950">
              {primeiroNome ? `Bem-vinda, ${primeiroNome}!` : 'Bem-vinda!'}
            </h1>
            <p className="text-sm text-amber-900/80 leading-relaxed mt-2">
              Esta é a sua primeira entrada. Crie uma senha só sua para continuar — a provisória
              deixa de valer.
            </p>
          </div>

          <form onSubmit={criar} className="space-y-4">
            <div>
              <label htmlFor="nova" className="block text-xs font-semibold text-amber-900 mb-1.5">
                Nova senha
              </label>
              <input
                id="nova"
                type="password"
                required
                autoFocus
                autoComplete="new-password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-amber-50/50 border border-amber-200 rounded-xl outline-none focus:border-amber-500 focus:bg-white transition-all"
              />
              <p className="text-[11px] text-amber-900/60 mt-1">
                Pelo menos {SENHA_MINIMA} caracteres, com letras e números.
              </p>
            </div>

            <div>
              <label htmlFor="confirma" className="block text-xs font-semibold text-amber-900 mb-1.5">
                Repita a nova senha
              </label>
              <input
                id="confirma"
                type="password"
                required
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-amber-50/50 border border-amber-200 rounded-xl outline-none focus:border-amber-500 focus:bg-white transition-all"
              />
            </div>

            {erro && (
              <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2.5 rounded-lg">
                <p className="text-xs text-red-800 font-semibold">{erro}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow transition-all"
            >
              {enviando ? 'Criando…' : 'Criar minha senha e entrar'}
            </button>
          </form>
        </div>

        <div className="text-center mt-5 space-y-2">
          <p className="text-[11px] text-amber-900/50 leading-relaxed">
            Guarde bem: ninguém mais tem acesso a esta senha, nem a administração.
          </p>
          <button
            onClick={() => supabase.auth.signOut({ scope: 'local' })}
            className="text-[11px] font-semibold text-amber-800 hover:underline"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
