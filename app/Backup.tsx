'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { montarZip, paraCSV, baixarArquivo, type ArquivoZip } from '@/lib/zip';

/**
 * Cópia de segurança de tudo que está no banco.
 *
 * Baixa um .zip com uma planilha por assunto (abre no Excel) e um
 * arquivo tecnico.json, que serve para restaurar os dados se
 * precisar. O app lembra quando foi a última vez e avisa quando
 * passa do prazo.
 */

const DIAS_PARA_LEMBRAR = 7;

/* Cada linha do zip: nome do arquivo e de onde vêm os dados. */
const TABELAS: { arquivo: string; tabela: string; ordem: string }[] = [
  { arquivo: 'pacientes', tabela: 'pacientes', ordem: 'nome' },
  { arquivo: 'agendamentos', tabela: 'agendamentos', ordem: 'data' },
  { arquivo: 'pagamentos', tabela: 'pagamentos', ordem: 'data' },
  { arquivo: 'pesagens', tabela: 'pesagens', ordem: 'data' },
  { arquivo: 'itens-aplicados', tabela: 'consumos_paciente', ordem: 'created_at' },
  { arquivo: 'estoque', tabela: 'produtos', ordem: 'nome' },
  { arquivo: 'historico-estoque', tabela: 'historico_movimentacoes', ordem: 'created_at' },
  { arquivo: 'fichas-recebidas', tabela: 'cadastros_recebidos', ordem: 'created_at' },
  { arquivo: 'config-agenda', tabela: 'config_agenda', ordem: 'id' },
];

function dataHoraArquivo(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
}

function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function Backup({ compacto }: { compacto?: boolean }) {
  const [ultima, setUltima] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [resultado, setResultado] = useState('');

  const carregarUltima = useCallback(async () => {
    const { data } = await supabase
      .from('exportacoes')
      .select('criado_em')
      .order('criado_em', { ascending: false })
      .limit(1);
    setUltima(data && data[0] ? (data[0] as { criado_em: string }).criado_em : null);
    setCarregado(true);
  }, []);

  useEffect(() => {
    carregarUltima();
  }, [carregarUltima]);

  async function exportar() {
    setBaixando(true);
    setResultado('');
    try {
      const agora = new Date();
      const arquivos: ArquivoZip[] = [];
      const tecnico: Record<string, unknown[]> = {};
      const contagem: Record<string, number> = {};

      for (const t of TABELAS) {
        const { data, error } = await supabase.from(t.tabela).select('*').order(t.ordem);
        if (error) throw new Error(`${t.tabela}: ${error.message}`);
        const linhas = (data ?? []) as Record<string, unknown>[];
        contagem[t.tabela] = linhas.length;
        tecnico[t.tabela] = linhas;
        if (linhas.length > 0) arquivos.push({ nome: `${t.arquivo}.csv`, conteudo: paraCSV(linhas) });
      }

      arquivos.push({
        nome: 'tecnico.json',
        conteudo: JSON.stringify({ gerado_em: agora.toISOString(), dados: tecnico }, null, 1),
      });

      const resumo = TABELAS.map((t) => `${t.arquivo}: ${contagem[t.tabela]} registro(s)`).join('\n');
      arquivos.push({
        nome: 'LEIA-ME.txt',
        conteudo:
          `Cópia de segurança — Clínica Dra. Bruna Oliveira\r\n` +
          `Gerada em ${agora.toLocaleString('pt-BR')}\r\n\r\n` +
          `O que tem aqui:\r\n${resumo.split('\n').join('\r\n')}\r\n\r\n` +
          `Os arquivos .csv abrem no Excel (dois cliques).\r\n` +
          `O tecnico.json serve para recolocar os dados no sistema, se precisar.\r\n\r\n` +
          `Guarde este arquivo fora do computador da clínica — em um pen drive,\r\n` +
          `no Google Drive ou no e-mail. Uma cópia por semana é o recomendado.\r\n`,
      });

      baixarArquivo(montarZip(arquivos, agora), `backup-clinica_${dataHoraArquivo(agora)}.zip`);

      const { data: sessao } = await supabase.auth.getUser();
      await supabase.from('exportacoes').insert([{ feito_por: sessao.user?.id ?? null, linhas: contagem }]);
      await carregarUltima();

      const total = Object.values(contagem).reduce((s, n) => s + n, 0);
      setResultado(`✅ Cópia baixada: ${total} registros. Guarde o arquivo fora daqui.`);
    } catch (e) {
      setResultado(`❌ Não foi possível exportar: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    } finally {
      setBaixando(false);
    }
  }

  const dias = ultima ? diasDesde(ultima) : null;
  const atrasado = carregado && (ultima === null || (dias !== null && dias >= DIAS_PARA_LEMBRAR));

  // No topo do app só aparece quando está na hora de fazer a cópia.
  if (compacto && !atrasado) return null;

  if (compacto) {
    return (
      <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm print:hidden">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">💾</span>
          <div>
            <h4 className="font-serif font-bold text-red-950 text-sm">
              {ultima === null ? 'Nenhuma cópia de segurança ainda' : `Última cópia de segurança há ${dias} dias`}
            </h4>
            <p className="text-xs text-red-900">
              Baixe uma cópia e guarde fora da clínica — se algo for apagado por engano, é assim que se recupera.
            </p>
          </div>
        </div>
        <button
          onClick={exportar}
          disabled={baixando}
          className="flex-shrink-0 text-xs bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-xl shadow transition-all"
        >
          {baixando ? 'Preparando…' : '💾 Baixar cópia agora'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-200/60 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-serif font-bold text-amber-950 text-base">💾 Cópia de segurança</h3>
          <p className="text-xs text-amber-900/70 mt-0.5">
            Baixa tudo — pacientes, agenda, pagamentos, pesagens e estoque — num arquivo só.
          </p>
        </div>
        <button
          onClick={exportar}
          disabled={baixando}
          className={`flex-shrink-0 text-sm font-semibold px-4 py-2.5 rounded-xl shadow transition-all text-white ${
            atrasado ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-800 hover:bg-amber-900'
          } disabled:opacity-60`}
        >
          {baixando ? 'Preparando…' : '💾 Exportar tudo'}
        </button>
      </div>

      <p className={`text-xs ${atrasado ? 'text-red-800 font-semibold' : 'text-amber-900/70'}`}>
        {!carregado
          ? 'Verificando…'
          : ultima === null
            ? '⚠️ Nenhuma cópia foi feita ainda.'
            : dias === 0
              ? '✅ Última cópia: hoje.'
              : `${atrasado ? '⚠️' : '✅'} Última cópia: há ${dias} dia${dias === 1 ? '' : 's'} (${new Date(ultima).toLocaleDateString('pt-BR')}).`}
        {carregado && ` Recomendado: uma vez por semana.`}
      </p>

      {resultado && (
        <p className={`text-xs font-semibold ${resultado.startsWith('✅') ? 'text-emerald-800' : 'text-red-700'}`}>
          {resultado}
        </p>
      )}

      <p className="text-[11px] text-amber-900/60 leading-relaxed">
        O arquivo .zip traz planilhas que abrem no Excel e uma cópia técnica para restaurar os dados.
        Guarde fora do computador da clínica: pen drive, Google Drive ou e-mail.
      </p>
    </div>
  );
}
