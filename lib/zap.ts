import { supabase } from '@/lib/supabase';

/* Link do WhatsApp com a mensagem pronta. Aceita telefone com ou sem DDI. */
export function linkWhatsApp(telefone: string, mensagem: string) {
  const num = telefone.replace(/\D/g, '');
  const comDDI = num.startsWith('55') && num.length >= 12 ? num : `55${num}`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(mensagem)}`;
}

/* Deixa como "(35) 99999-9999". Devolve null se não tiver 10 ou 11 dígitos. */
export function formatarTelefone(v: string) {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/* Paciente sem telefone: pede o número, grava na ficha e devolve formatado. */
export async function pedirESalvarTelefone(pacienteId: string, nome: string) {
  const digitado = prompt(`${nome.trim().split(' ')[0]} não tem telefone cadastrado.\nDigite o WhatsApp com DDD (ex: 35 99999-9999):`);
  if (digitado === null) return null;
  const tel = formatarTelefone(digitado);
  if (!tel) {
    alert('Número inválido. Precisa ter DDD + 8 ou 9 dígitos.');
    return null;
  }
  const { error } = await supabase.from('pacientes').update({ telefone: tel }).eq('id', pacienteId);
  if (error) {
    alert(`Não foi possível salvar o telefone: ${error.message}`);
    return null;
  }
  return tel;
}

/* Abre o WhatsApp; se faltar telefone, pede e salva antes. Devolve o telefone usado. */
export async function avisarNoWhatsApp(opts: {
  pacienteId: string;
  nome: string;
  telefone?: string | null;
  mensagem: string;
}) {
  let tel = opts.telefone?.trim() || '';
  if (!tel) {
    const novo = await pedirESalvarTelefone(opts.pacienteId, opts.nome);
    if (!novo) return null;
    tel = novo;
  }
  window.open(linkWhatsApp(tel, opts.mensagem), '_blank', 'noreferrer');
  return tel;
}
