'use client';

import { useRef } from 'react';

/**
 * Dois jeitos de pôr uma foto: tirar na hora ou buscar na galeria.
 *
 * O botão "Tirar foto" abre a câmera do próprio celular, com tudo que ela
 * tem — zoom, flash, foco, HDR. É de propósito: uma câmera feita dentro
 * do app ficaria pior que a nativa e perderia esses recursos.
 *
 * No computador, que não tem câmera traseira, o "capture" é ignorado pelo
 * navegador e o botão abre o seletor de arquivos normalmente.
 */
export default function EscolherFoto({
  onEscolher,
  desabilitado,
  rotuloCamera = '📷 Tirar foto',
  rotuloGaleria = '🖼️ Galeria',
  compacto,
}: {
  onEscolher: (arquivo: File) => void;
  desabilitado?: boolean;
  rotuloCamera?: string;
  rotuloGaleria?: string;
  compacto?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  function pegar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onEscolher(f);
    // Zera para a mesma foto poder ser escolhida de novo.
    e.target.value = '';
  }

  const classe = compacto
    ? 'text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors'
    : 'text-xs font-semibold px-3 py-2 rounded-lg transition-colors';

  return (
    <div className="flex gap-1.5 flex-wrap">
      {/* capture abre a câmera direto, sem o menu "Câmera ou Galeria". */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pegar}
      />
      <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={pegar} />

      <button
        type="button"
        onClick={() => camera.current?.click()}
        disabled={desabilitado}
        className={`${classe} bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white shadow-sm`}
      >
        {rotuloCamera}
      </button>
      <button
        type="button"
        onClick={() => galeria.current?.click()}
        disabled={desabilitado}
        className={`${classe} border border-amber-300 text-amber-900 hover:bg-amber-50 disabled:opacity-50`}
      >
        {rotuloGaleria}
      </button>
    </div>
  );
}
