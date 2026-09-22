/* Validações usadas no cadastro de paciente e no formulário público. */

/** Tira acento e espaço repetido: serve para comparar nomes. */
export function normalizarNome(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "  João   da Silva " -> "João da Silva" */
export function limparNome(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

export function soDigitos(s: string) {
  return (s || '').replace(/\D/g, '');
}

/** CPF válido de verdade (confere os dois dígitos verificadores). */
export function cpfValido(valor: string) {
  const c = soDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const peso of [10, 11]) {
    let soma = 0;
    for (let i = 0; i < peso - 1; i++) soma += Number(c[i]) * (peso - i);
    const d = (soma * 10) % 11 % 10;
    if (d !== Number(c[peso - 1])) return false;
  }
  return true;
}

export function formatarCPF(valor: string) {
  const c = soDigitos(valor).slice(0, 11);
  return c
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** Telefone brasileiro: DDD + 8 ou 9 dígitos. */
export function telefoneValido(valor: string) {
  const d = soDigitos(valor);
  return d.length === 10 || d.length === 11;
}

export function formatarTelefoneBR(valor: string) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Pacientes com nome parecido — para avisar antes de criar duplicado. */
export function nomesParecidos<T extends { id: string; nome: string }>(
  nome: string,
  lista: T[],
  ignorarId?: string
) {
  const alvo = normalizarNome(nome).split(' ').filter(Boolean);
  if (alvo.length === 0) return [];
  return lista.filter((p) => {
    if (p.id === ignorarId) return false;
    const w = normalizarNome(p.nome).split(' ').filter(Boolean);
    if (w.length === 0) return false;
    if (w.join(' ') === alvo.join(' ')) return true;
    // mesmo primeiro nome e mesmo último sobrenome
    return w[0] === alvo[0] && alvo.length > 1 && w.includes(alvo[alvo.length - 1]);
  });
}
