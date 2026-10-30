'use client';

import { supabase } from './supabase';
import { diminuirImagem } from './imagem';

const BALDE = 'fotos-pacientes';

/** Caminho no balde: uma pasta por paciente, nome que não repete. */
function caminhoNovo(pacienteId: string, nomeArquivo: string) {
  const ext = nomeArquivo.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)?.[0] ?? '.jpg';
  return `${pacienteId}/${crypto.randomUUID()}${ext}`;
}

/**
 * Sobe as fotos tiradas durante o cadastro de um paciente novo.
 *
 * Elas foram escolhidas antes de o paciente existir, então esperaram na
 * memória até agora. Se uma falhar, a outra continua: o cadastro já está
 * salvo e não vale a pena desfazer tudo por causa de uma foto.
 *
 * @returns null quando tudo subiu, ou o que deu errado em texto.
 */
export async function enviarFotoDoPaciente(
  pacienteId: string,
  perfil: File | null,
  antes: File | null
): Promise<string | null> {
  const problemas: string[] = [];

  if (perfil) {
    try {
      const menor = await diminuirImagem(perfil);
      const caminho = caminhoNovo(pacienteId, menor.name);
      const { error } = await supabase.storage
        .from(BALDE)
        .upload(caminho, menor, { contentType: menor.type });
      if (error) throw new Error(error.message);

      const { error: erroPac } = await supabase
        .from('pacientes')
        .update({ foto_perfil: caminho })
        .eq('id', pacienteId);
      // A ficha não aceitou: o arquivo não pode ficar perdido no balde.
      if (erroPac) {
        await supabase.storage.from(BALDE).remove([caminho]);
        throw new Error(erroPac.message);
      }
    } catch (e) {
      problemas.push('perfil (' + (e instanceof Error ? e.message : 'erro') + ')');
    }
  }

  if (antes) {
    try {
      const menor = await diminuirImagem(antes);
      const caminho = caminhoNovo(pacienteId, menor.name);
      const { error } = await supabase.storage
        .from(BALDE)
        .upload(caminho, menor, { contentType: menor.type });
      if (error) throw new Error(error.message);

      const { data: sessao } = await supabase.auth.getUser();
      const { error: erroLinha } = await supabase.from('fotos_paciente').insert([
        {
          paciente_id: pacienteId,
          caminho,
          descricao: 'Primeira foto, no cadastro',
          momento: 'antes',
          criado_por: sessao.user?.id ?? null,
        },
      ]);
      if (erroLinha) {
        await supabase.storage.from(BALDE).remove([caminho]);
        throw new Error(erroLinha.message);
      }
    } catch (e) {
      problemas.push('antes (' + (e instanceof Error ? e.message : 'erro') + ')');
    }
  }

  return problemas.length > 0 ? problemas.join(' e ') : null;
}
