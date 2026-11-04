'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SENHA_FRACA, SENHA_MINIMA, limparNome, problemaNaSenha } from '@/lib/validacao';

const CAMPO =
  'w-full px-4 py-2.5 text-sm bg-amber-50/50 border border-amber-200 rounded-xl outline-none focus:border-amber-500 focus:bg-white transition-all';
const ROTULO = 'block text-xs font-semibold text-amber-900 mb-1.5';

/** O que dizer para cada recusa do sistema. */
export function textoDoErroDeCadastro(codigo?: string) {
  switch (codigo) {
    case 'user_already_exists':
    case 'email_exists':
      return 'Este e-mail já tem cadastro. Volte e entre com sua senha.';
    case 'weak_password':
      return SENHA_FRACA;
    case 'email_address_invalid':
      return 'Este e-mail não foi aceito. Confira se está certo.';
    case 'email_address_not_authorized':
    case 'signup_disabled':
      return 'O cadastro pelo app não está disponível agora. Fale com a administração da clínica.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.';
    default:
      return 'Não foi possível criar o cadastro. Tente de novo em instantes.';
  }
}

/**
 * A pessoa cria a própria conta, com e-mail e senha dela.
 *
 * Criar a conta não abre nada: ela vira um pedido e fica esperando a
 * Dra. Bruna autorizar. O nome é gravado com a chave `nome` porque é dali
 * que o banco tira o nome do pedido e sabe que a senha já é da pessoa.
 */
export default function CriarAcesso({ onVoltar }: { onVoltar: () => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    const nomeLimpo = limparNome(nome);
    const emailLimpo = email.trim().toLowerCase();
    if (nomeLimpo.length < 2) return setErro('Escreva seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) {
      return setErro('Confira o e-mail: ele precisa ser completo, como nome@gmail.com.');
    }
    const problema = problemaNaSenha(senha);
    if (problema) return setErro(problema);
    if (senha !== repetida) return setErro('As duas senhas não são iguais.');

    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: emailLimpo,
      password: senha,
      options: { data: { nome: nomeLimpo } },
    });
    setEnviando(false);

    if (error) return setErro(textoDoErroDeCadastro(error.code));
    // Com a confirmação por e-mail ligada, e-mail repetido não dá erro: vem
    // uma conta sem nenhuma forma de entrar.
    if (data.user?.identities?.length === 0) {
      return setErro(textoDoErroDeCadastro('user_already_exists'));
    }
    // Com sessão, o AuthGate já assume e mostra a espera pela autorização.
    if (!data.session) setEnviado(true);
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-amber-950 font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-amber-200/80 rounded-2xl shadow-sm p-7">
        {enviado ? (
          <div className="text-center">
            <p className="text-3xl mb-3">⏳</p>
            <h1 className="text-lg font-serif font-bold text-amber-950 mb-2">Pedido enviado</h1>
            <p className="text-sm text-amber-900/80 leading-relaxed mb-5">
              Depois que a Dra. Bruna autorizar, entre com seu e-mail e a senha que você criou.
            </p>
            <button
              type="button"
              onClick={onVoltar}
              className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-amber-200 text-amber-900 hover:bg-amber-50 transition-colors"
            >
              Voltar para o login
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-serif font-bold text-amber-950">Criar cadastro</h1>
            <p className="text-xs text-amber-900/70 leading-relaxed mt-1 mb-5">
              Para quem trabalha na clínica. Seu pedido vai para a Dra. Bruna, e o acesso abre
              quando ela autorizar.
            </p>

            <form onSubmit={criar} className="space-y-4">
              <div>
                <label htmlFor="cadastro-nome" className={ROTULO}>
                  Seu nome
                </label>
                <input
                  id="cadastro-nome"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={60}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={CAMPO}
                />
              </div>

              <div>
                <label htmlFor="cadastro-email" className={ROTULO}>
                  Seu e-mail
                </label>
                <input
                  id="cadastro-email"
                  type="email"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={CAMPO}
                />
              </div>

              <div>
                <label htmlFor="cadastro-senha" className={ROTULO}>
                  Crie uma senha
                </label>
                <input
                  id="cadastro-senha"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={CAMPO}
                />
                <p className="text-[11px] text-amber-900/60 mt-1">
                  Pelo menos {SENHA_MINIMA} caracteres, com letras e números.
                </p>
              </div>

              <div>
                <label htmlFor="cadastro-repetida" className={ROTULO}>
                  Repita a senha
                </label>
                <input
                  id="cadastro-repetida"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={repetida}
                  onChange={(e) => setRepetida(e.target.value)}
                  className={CAMPO}
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
                {enviando ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </form>

            <button
              type="button"
              onClick={onVoltar}
              className="w-full mt-4 py-1 text-xs font-semibold text-amber-800 hover:text-amber-950 underline underline-offset-2 transition-colors"
            >
              Já tenho acesso: voltar para o login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
