'use client';

import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * O Supabase identifica cada acesso por e-mail. Para a equipe digitar só
 * "clinicabrunaoliveira", completamos o domínio aqui quando não vier "@".
 */
const DOMINIO_PADRAO = '@clinicabrunaoliveira.com.br';

function paraEmail(usuario: string) {
  const limpo = usuario.trim().toLowerCase();
  return limpo.includes('@') ? limpo : limpo + DOMINIO_PADRAO;
}

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

  if (carregando) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <p className="text-amber-900/60 text-sm font-semibold tracking-wide">Carregando…</p>
      </div>
    );
  }

  if (!session) return <TelaLogin />;

  return (
    <>
      <BarraUsuario email={session.user.email ?? ''} />
      {children}
    </>
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
                  Usuário
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
                  placeholder="clinicabrunaoliveira"
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

function BarraUsuario({ email }: { email: string }) {
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  return (
    <>
      <div className="bg-amber-900 text-amber-50 px-4 md:px-8 py-2 flex items-center justify-between gap-3 print:hidden">
        <span className="text-[11px] font-semibold tracking-wide truncate">
          🔒 {email.split('@')[0]}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setTrocandoSenha(true)}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-800/60 hover:bg-amber-800 transition-all"
          >
            Alterar senha
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
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

    if (nova.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (nova !== confirma) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    setEnviando(false);

    if (error) {
      setErro('Não foi possível alterar a senha. Tente de novo.');
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
