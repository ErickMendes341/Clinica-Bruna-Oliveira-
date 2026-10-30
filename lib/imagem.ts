'use client';

/**
 * Diminui a foto antes de enviar.
 *
 * Foto de celular chega com 3 a 5 MB e 4000 pixels de largura. Na tela da
 * clínica ninguém vê mais que uns 1200, e o plano do servidor dá 1 GB no
 * total — mandar o arquivo original gastaria o espaço de umas 300 fotos
 * em vez de 3000. Aqui a imagem vira JPEG de no máximo 1600 pixels.
 *
 * Se o navegador não der conta (formato estranho, imagem corrompida),
 * devolve o arquivo original: melhor enviar grande do que não enviar.
 */

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;

export async function diminuirImagem(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const maior = Math.max(bitmap.width, bitmap.height);
    const escala = maior > LADO_MAXIMO ? LADO_MAXIMO / maior : 1;

    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    const ctx = tela.getContext('2d');
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((ok) =>
      tela.toBlob(ok, 'image/jpeg', QUALIDADE)
    );
    if (!blob) return arquivo;

    // Se por acaso ficou maior que o original, fica com o original.
    if (blob.size >= arquivo.size) return arquivo;

    return new File([blob], trocarParaJpg(arquivo.name), { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}

function trocarParaJpg(nome: string) {
  return nome.replace(/\.[^.]+$/, '') + '.jpg';
}

/** "2,4 MB", "310 KB" — para a tela dizer quanto ocupou. */
export function tamanhoLegivel(bytes: number) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}
