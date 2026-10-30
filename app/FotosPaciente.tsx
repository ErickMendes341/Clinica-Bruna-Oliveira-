'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { diminuirImagem } from '@/lib/imagem';

const BALDE = 'fotos-pacientes';
/** Link assinado vale 1 hora; renovamos ao recarregar a lista. */
const VALIDADE_LINK = 3600;

export interface Foto {
  id: string;
  caminho: string;
  descricao: string | null;
  data: string;
  momento: 'antes' | 'depois';
}

/** Data do banco vira dia daqui. Nunca usar toISOString nisso. */
const dia = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Fotos de evolução do paciente, separadas em antes e depois.
 *
 * As fotos ficam num balde privado: a tela pede um link assinado que vale
 * uma hora. Não existe endereço público — quem não está logado na equipe
 * não abre a imagem nem com o link na mão.
 */
export default function FotosPaciente({
  pacienteId,
  pacienteNome,
  fotoPerfil,
  onPerfilMudou,
}: {
  pacienteId: string;
  pacienteNome: string;
  fotoPerfil?: string | null;
  onPerfilMudou: (caminho: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ampliada, setAmpliada] = useState<Foto | null>(null);

  // Campos do envio
  const [momento, setMomento] = useState<'antes' | 'depois'>('antes');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hojeISO());
  const entradaArquivo = useRef<HTMLInputElement>(null);
  const entradaPerfil = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data: linhas } = await supabase
      .from('fotos_paciente')
      .select('id,caminho,descricao,data,momento')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false });

    const lista = (linhas as Foto[] | null) ?? [];
    setFotos(lista);

    const caminhos = [...lista.map((f) => f.caminho), ...(fotoPerfil ? [fotoPerfil] : [])];
    if (caminhos.length > 0) {
      const { data: assinados } = await supabase.storage
        .from(BALDE)
        .createSignedUrls(caminhos, VALIDADE_LINK);
      const mapa: Record<string, string> = {};
      for (const a of assinados ?? []) {
        if (a.path && a.signedUrl) mapa[a.path] = a.signedUrl;
      }
      setLinks(mapa);
    } else {
      setLinks({});
    }
    setCarregando(false);
  }, [pacienteId, fotoPerfil]);

  useEffect(() => {
    if (aberto || fotoPerfil) carregar();
  }, [aberto, fotoPerfil, carregar]);

  /** Nome do arquivo no balde: pasta por paciente, nome sem repetir. */
  function caminhoNovo(nomeArquivo: string) {
    const ext = nomeArquivo.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)?.[0] ?? '.jpg';
    return `${pacienteId}/${crypto.randomUUID()}${ext}`;
  }

  async function enviar(arquivo: File) {
    setErro('');
    setEnviando(true);
    try {
      const menor = await diminuirImagem(arquivo);
      const caminho = caminhoNovo(menor.name);

      const { error: erroUp } = await supabase.storage
        .from(BALDE)
        .upload(caminho, menor, { contentType: menor.type, upsert: false });
      if (erroUp) throw new Error(erroUp.message);

      const { data: sessao } = await supabase.auth.getUser();
      const { error: erroLinha } = await supabase.from('fotos_paciente').insert([
        {
          paciente_id: pacienteId,
          caminho,
          descricao: descricao.trim() || null,
          data,
          momento,
          criado_por: sessao.user?.id ?? null,
        },
      ]);
      // Se a ficha não gravou, o arquivo não pode ficar perdido no balde.
      if (erroLinha) {
        await supabase.storage.from(BALDE).remove([caminho]);
        throw new Error(erroLinha.message);
      }

      setDescricao('');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.');
    } finally {
      setEnviando(false);
      if (entradaArquivo.current) entradaArquivo.current.value = '';
    }
  }

  async function enviarPerfil(arquivo: File) {
    setErro('');
    setEnviando(true);
    try {
      const menor = await diminuirImagem(arquivo);
      const caminho = caminhoNovo(menor.name);

      const { error: erroUp } = await supabase.storage
        .from(BALDE)
        .upload(caminho, menor, { contentType: menor.type, upsert: false });
      if (erroUp) throw new Error(erroUp.message);

      const anterior = fotoPerfil;
      const { error: erroPac } = await supabase
        .from('pacientes')
        .update({ foto_perfil: caminho })
        .eq('id', pacienteId);
      if (erroPac) {
        await supabase.storage.from(BALDE).remove([caminho]);
        throw new Error(erroPac.message);
      }

      // Trocou de foto: a antiga não serve mais e ocupa espaço.
      if (anterior) await supabase.storage.from(BALDE).remove([anterior]);
      onPerfilMudou(caminho);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto de perfil.');
    } finally {
      setEnviando(false);
      if (entradaPerfil.current) entradaPerfil.current.value = '';
    }
  }

  async function apagar(f: Foto) {
    const texto = f.descricao?.trim() ? `"${f.descricao.trim()}"` : `de ${dia(f.data)}`;
    if (!confirm(`Apagar a foto ${texto}?\n\nIsso não pode ser desfeito.`)) return;

    const { error } = await supabase.from('fotos_paciente').delete().eq('id', f.id);
    if (error) {
      setErro(`Não foi possível apagar: ${error.message}`);
      return;
    }
    await supabase.storage.from(BALDE).remove([f.caminho]);
    setAmpliada(null);
    await carregar();
  }

  async function apagarPerfil() {
    if (!fotoPerfil) return;
    if (!confirm('Tirar a foto de perfil deste paciente?')) return;
    const { error } = await supabase
      .from('pacientes')
      .update({ foto_perfil: null })
      .eq('id', pacienteId);
    if (error) {
      setErro(`Não foi possível tirar: ${error.message}`);
      return;
    }
    await supabase.storage.from(BALDE).remove([fotoPerfil]);
    onPerfilMudou(null);
  }

  const antes = fotos.filter((f) => f.momento === 'antes');
  const depois = fotos.filter((f) => f.momento === 'depois');

  const grade = (lista: Foto[], titulo: string, vazio: string) => (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-amber-900 mb-1.5">
        {titulo} {lista.length > 0 && <span className="font-normal text-amber-800/70">({lista.length})</span>}
      </p>
      {lista.length === 0 ? (
        <p className="text-[11px] text-amber-800/50 py-3">{vazio}</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {lista.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAmpliada(f)}
              className="relative block rounded-lg overflow-hidden border border-amber-200 bg-amber-50 text-left group"
            >
              {links[f.caminho] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={links[f.caminho]}
                  alt={f.descricao ?? `Foto de ${dia(f.data)}`}
                  className="w-full h-28 object-cover"
                />
              ) : (
                <div className="w-full h-28 flex items-center justify-center text-[10px] text-amber-800/50">
                  carregando…
                </div>
              )}
              <div className="px-1.5 py-1 bg-white">
                <p className="text-[10px] font-semibold text-amber-950 tabular-nums">{dia(f.data)}</p>
                {f.descricao && (
                  <p className="text-[10px] text-amber-800/80 truncate">{f.descricao}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Foto de perfil: fica fora da aba, sempre à vista na ficha. */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-full border-2 border-amber-300 overflow-hidden bg-amber-100 flex-shrink-0 flex items-center justify-center">
          {fotoPerfil && links[fotoPerfil] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={links[fotoPerfil]} alt={pacienteNome} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-amber-700/50">👤</span>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap print:hidden">
          <input
            ref={entradaPerfil}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviarPerfil(f);
            }}
          />
          <button
            type="button"
            onClick={() => entradaPerfil.current?.click()}
            disabled={enviando}
            className="text-[11px] border border-amber-300 text-amber-900 hover:bg-amber-50 disabled:opacity-50 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
          >
            {fotoPerfil ? 'Trocar foto' : '📷 Foto de perfil'}
          </button>
          {fotoPerfil && (
            <button
              type="button"
              onClick={apagarPerfil}
              className="text-[11px] border border-amber-200 text-red-700 hover:bg-red-50 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Tirar
            </button>
          )}
        </div>
      </div>

      {/* Antes e depois */}
      <div className="bg-white border border-amber-200/70 rounded-xl overflow-hidden print:hidden">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-amber-50/50 transition-colors text-left"
        >
          <h3 className="font-serif font-bold text-amber-950 text-base">
            📸 Fotos de evolução
            {fotos.length > 0 && (
              <span className="ml-2 text-amber-700/70 font-sans text-sm">({fotos.length})</span>
            )}
          </h3>
          <span className="text-amber-700 text-sm flex-shrink-0">{aberto ? 'Fechar' : 'Abrir'}</span>
        </button>

        {aberto && (
          <div className="border-t border-amber-100 px-5 py-4 space-y-4">
            {/* Enviar */}
            <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMomento('antes')}
                  className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                    momento === 'antes'
                      ? 'bg-amber-800 text-white border-amber-800'
                      : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  Antes
                </button>
                <button
                  type="button"
                  onClick={() => setMomento('depois')}
                  className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                    momento === 'depois'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  Depois
                </button>
              </div>

              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={300}
                placeholder="Descrição (ex: frente, perfil direito, início do tratamento)"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:border-amber-500"
              />

              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white outline-none"
                />
                <input
                  ref={entradaArquivo}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) enviar(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => entradaArquivo.current?.click()}
                  disabled={enviando}
                  className="flex-shrink-0 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  {enviando ? 'Enviando…' : '📷 Escolher foto'}
                </button>
              </div>

              <p className="text-[10px] text-amber-800/60 leading-relaxed">
                A foto é diminuída antes de enviar, para ocupar menos espaço. Fica guardada em
                área privada — só quem tem login da clínica consegue abrir.
              </p>
            </div>

            {erro && (
              <div className="bg-red-50 border-l-4 border-red-500 px-3 py-2 rounded-lg">
                <p className="text-xs text-red-800 font-semibold">{erro}</p>
              </div>
            )}

            {carregando ? (
              <p className="text-xs text-amber-800/60 py-4 text-center">Carregando fotos…</p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4">
                {grade(antes, 'Antes', 'Nenhuma foto de antes.')}
                {grade(depois, 'Depois', 'Nenhuma foto de depois.')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Foto ampliada */}
      {ampliada && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setAmpliada(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {links[ampliada.caminho] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={links[ampliada.caminho]}
                alt={ampliada.descricao ?? 'Foto do paciente'}
                className="w-full max-h-[70vh] object-contain bg-black"
              />
            )}
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-950">
                  {ampliada.momento === 'antes' ? 'Antes' : 'Depois'} · {dia(ampliada.data)}
                </p>
                {ampliada.descricao && (
                  <p className="text-xs text-amber-800/80">{ampliada.descricao}</p>
                )}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => apagar(ampliada)}
                  className="text-xs border border-red-200 text-red-700 hover:bg-red-50 font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  🗑️ Apagar
                </button>
                <button
                  type="button"
                  onClick={() => setAmpliada(null)}
                  className="text-xs border border-amber-200 text-amber-900 hover:bg-amber-50 font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
