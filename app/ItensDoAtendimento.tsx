'use client';

import { useState } from 'react';

export interface ProdutoOpcao {
  id: string;
  nome: string;
  categoria: string | null;
}

export interface ItemAtendimento {
  produto_id: string | null;
  nome_produto: string;
  quantidade: number;
  /** Quanto vai ser usado: "1ml", "1,25mg", "10 gotas". */
  dose?: string | null;
  /** Recado do uso, para quem for aplicar. */
  observacao?: string | null;
}

const ROTULO_CATEGORIA: Record<string, string> = {
  medicacao: 'Medicação',
  descartaveis: 'Descartáveis',
  insumos: 'Insumos',
};

/** Vira "2 × B12" ou "1 × B12 (1ml)" — do jeito que se lê em voz alta. */
export function descreverItem(i: {
  nome_produto: string;
  quantidade: number;
  dose?: string | null;
}) {
  const qtd = Number(i.quantidade);
  const numero = Number.isInteger(qtd) ? String(qtd) : String(qtd).replace('.', ',');
  const dose = i.dose?.trim();
  return `${numero} × ${i.nome_produto.trim()}${dose ? ` (${dose})` : ''}`;
}

/**
 * Lista do que separar para um atendimento: B12, agulha, soro, álcool.
 *
 * É planejamento, não baixa de estoque — a saída continua sendo feita na
 * ficha do paciente, quando o item é aplicado de verdade.
 */
export default function ItensDoAtendimento({
  itens,
  onMudou,
  produtos,
  abertoInicialmente = false,
}: {
  itens: ItemAtendimento[];
  onMudou: (itens: ItemAtendimento[]) => void;
  produtos: ProdutoOpcao[];
  abertoInicialmente?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicialmente || itens.length > 0);
  const [escolha, setEscolha] = useState('');
  const [outroNome, setOutroNome] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  const categorias = Array.from(
    new Set(produtos.map((p) => p.categoria ?? 'outros'))
  ).sort();

  function adicionar() {
    const qtd = Number(quantidade.replace(',', '.'));
    if (!Number.isFinite(qtd) || qtd <= 0) return;

    if (escolha === 'outro') {
      const nome = outroNome.trim();
      if (!nome) return;
      onMudou([...itens, { produto_id: null, nome_produto: nome, quantidade: qtd, dose: '', observacao: '' }]);
    } else {
      const p = produtos.find((x) => x.id === escolha);
      if (!p) return;
      onMudou([...itens, { produto_id: p.id, nome_produto: p.nome.trim(), quantidade: qtd, dose: '', observacao: '' }]);
    }

    setEscolha('');
    setOutroNome('');
    setQuantidade('1');
  }

  function remover(indice: number) {
    onMudou(itens.filter((_, i) => i !== indice));
  }

  function alterar(indice: number, campo: 'dose' | 'observacao', valor: string) {
    onMudou(itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  }

  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-amber-50/60 transition-colors"
      >
        <span className="text-xs font-semibold text-amber-900">
          💊 O que separar para o atendimento
          {itens.length > 0 && (
            <span className="ml-1.5 text-amber-700 font-bold">({itens.length})</span>
          )}
        </span>
        <span className="text-amber-700 text-xs flex-shrink-0">{aberto ? '▾' : '▸'}</span>
      </button>

      {itens.length > 0 && !aberto && (
        <p className="px-3 pb-2.5 -mt-1 text-[11px] text-amber-800/80 truncate">
          {itens.map(descreverItem).join(' · ')}
        </p>
      )}

      {aberto && (
        <div className="px-3 pb-3 space-y-2 border-t border-amber-100 pt-2.5">
          {itens.length === 0 ? (
            <p className="text-[11px] text-amber-800/60">
              Nada na lista ainda. Escolha abaixo o que vai ser usado.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {itens.map((item, i) => (
                <li
                  key={`${item.nome_produto}-${i}`}
                  className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-950 font-semibold min-w-0 truncate">
                      {Number.isInteger(Number(item.quantidade))
                        ? Number(item.quantidade)
                        : String(item.quantidade).replace('.', ',')}{' '}
                      × {item.nome_produto.trim()}
                      {!item.produto_id && (
                        <span className="ml-1 text-[10px] font-normal text-amber-700/70">
                          (fora do estoque)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => remover(i)}
                      title="Tirar da lista"
                      className="text-[11px] text-red-700 hover:text-red-900 font-bold px-1.5 flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={item.dose ?? ''}
                      onChange={(e) => alterar(i, 'dose', e.target.value)}
                      maxLength={60}
                      placeholder="Dose (ex: 1ml)"
                      title="Quanto vai ser usado"
                      className="w-24 flex-shrink-0 px-2 py-1.5 border border-amber-200 rounded-md text-[11px] bg-white outline-none focus:border-amber-500"
                    />
                    <input
                      type="text"
                      value={item.observacao ?? ''}
                      onChange={(e) => alterar(i, 'observacao', e.target.value)}
                      maxLength={300}
                      placeholder="Observação do uso (opcional)"
                      className="flex-1 min-w-0 px-2 py-1.5 border border-amber-200 rounded-md text-[11px] bg-white outline-none focus:border-amber-500"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-1.5">
            <select
              value={escolha}
              onChange={(e) => setEscolha(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 border border-amber-200 rounded-lg text-xs bg-white outline-none focus:border-amber-500"
            >
              <option value="">Escolher item…</option>
              {categorias.map((c) => (
                <optgroup key={c} label={ROTULO_CATEGORIA[c] ?? c}>
                  {produtos
                    .filter((p) => (p.categoria ?? 'outros') === c)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome.trim()}
                      </option>
                    ))}
                </optgroup>
              ))}
              <option value="outro">✏️ Outro item…</option>
            </select>

            <input
              type="text"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              title="Quantidade"
              className="w-14 flex-shrink-0 px-2 py-2 border border-amber-200 rounded-lg text-xs text-center outline-none focus:border-amber-500"
            />

            <button
              type="button"
              onClick={adicionar}
              disabled={!escolha || (escolha === 'outro' && !outroNome.trim())}
              className="flex-shrink-0 bg-amber-800 hover:bg-amber-900 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              + Add
            </button>
          </div>

          {escolha === 'outro' && (
            <input
              type="text"
              value={outroNome}
              onChange={(e) => setOutroNome(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="Escreva o item que não está no estoque"
              className="w-full px-2.5 py-2 border border-amber-300 rounded-lg text-xs outline-none focus:border-amber-500"
            />
          )}

          <p className="text-[10px] text-amber-800/60 leading-relaxed">
            Esta lista é o que deixar separado. Ela <strong>não</strong> dá baixa no estoque —
            a baixa continua sendo feita na ficha, quando o item é aplicado.
          </p>
        </div>
      )}
    </div>
  );
}
