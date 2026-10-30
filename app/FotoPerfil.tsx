'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { diminuirImagem } from '@/lib/imagem';
import EscolherFoto from './EscolherFoto';

const BALDE = 'fotos-pacientes';
const VALIDADE_LINK = 3600;

/**
 * Foto de perfil do paciente, no alto da ficha ao lado do nome.
 *
 * Fica separada das fotos de evolução porque é outra coisa: uma só por
 * paciente, sempre à vista, para a equipe reconhecer quem chegou.
 *
 * O arquivo está em área privada; aqui pedimos um link assinado que vale
 * uma hora.
 */
export default function FotoPerfil({
  pacienteId,
  pacienteNome,
  caminho,
  onMudou,
}: {
  pacienteId: string;
  pacienteNome: string;
  caminho?: string | null;
  onMudou: (novo: string | null) => void;
}) {
  const [link, setLink] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);

  const carregarLink = useCallback(async () => {
    if (!caminho) return setLink('');
    const { data } = await supabase.storage.from(BALDE).createSignedUrl(caminho, VALIDADE_LINK);
    setLink(data?.signedUrl ?? '');
  }, [caminho]);

  useEffect(() => {
    carregarLink();
  }, [carregarLink]);

  async function enviar(arquivo: File) {
    setErro('');
    setEnviando(true);
    try {
      const menor = await diminuirImagem(arquivo);
      const ext = menor.name.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)?.[0] ?? '.jpg';
      const novo = `${pacienteId}/${crypto.randomUUID()}${ext}`;

      const { error } = await supabase.storage
        .from(BALDE)
        .upload(novo, menor, { contentType: menor.type });
      if (error) throw new Error(error.message);

      const anterior = caminho;
      const { error: erroPac } = await supabase
        .from('pacientes')
        .update({ foto_perfil: novo })
        .eq('id', pacienteId);
      if (erroPac) {
        await supabase.storage.from(BALDE).remove([novo]);
        throw new Error(erroPac.message);
      }

      // A antiga não serve mais e ocupa espaço.
      if (anterior) await supabase.storage.from(BALDE).remove([anterior]);
      setMenuAberto(false);
      onMudou(novo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.');
    } finally {
      setEnviando(false);
    }
  }

  async function tirar() {
    if (!caminho) return;
    if (!confirm('Tirar a foto de perfil deste paciente?')) return;
    const { error } = await supabase
      .from('pacientes')
      .update({ foto_perfil: null })
      .eq('id', pacienteId);
    if (error) return setErro(error.message);
    await supabase.storage.from(BALDE).remove([caminho]);
    setMenuAberto(false);
    onMudou(null);
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setMenuAberto((a) => !a)}
        title={caminho ? 'Trocar ou tirar a foto' : 'Pôr foto de perfil'}
        className="block w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-amber-300 overflow-hidden bg-amber-100 flex items-center justify-center hover:border-amber-500 transition-colors print:border-amber-200"
      >
        {link ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link} alt={pacienteNome} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl sm:text-3xl text-amber-700/40">👤</span>
        )}
      </button>

      {menuAberto && (
        <div className="absolute z-30 top-full left-0 mt-1 bg-white border border-amber-200 rounded-xl shadow-lg p-2 space-y-1.5 print:hidden">
          <EscolherFoto
            onEscolher={enviar}
            desabilitado={enviando}
            compacto
            rotuloCamera={enviando ? 'Enviando…' : '📷 Tirar'}
            rotuloGaleria="🖼️"
          />
          {caminho && (
            <button
              type="button"
              onClick={tirar}
              className="w-full text-[11px] border border-amber-200 text-red-700 hover:bg-red-50 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Tirar foto
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuAberto(false)}
            className="w-full text-[11px] text-amber-800/70 hover:text-amber-900 px-2.5 py-1"
          >
            fechar
          </button>
          {erro && <p className="text-[10px] text-red-700 max-w-[10rem]">{erro}</p>}
        </div>
      )}
    </div>
  );
}
