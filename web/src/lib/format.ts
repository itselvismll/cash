const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(valor: number): string {
  return brl.format(valor);
}

export function formatDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Primeiro dia do mês atual, no fuso local, como YYYY-MM-DD. */
export function inicioDoMes(hoje = new Date()): string {
  return toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
}

/** Primeiro dia do mês seguinte, no fuso local, como YYYY-MM-DD. */
export function inicioDoProximoMes(hoje = new Date()): string {
  return toISODate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1));
}

export function toISODate(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function nomeDoMes(hoje = new Date()): string {
  return hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * Instante UTC da meia-noite local do primeiro dia do mês.
 * `created_at` é timestamptz: mandar "2026-09-01T00:00:00" sem fuso faz o
 * Postgres interpretar como UTC e jogar os gastos da noite do dia 31 para o
 * mês errado. O toISOString() converte a meia-noite LOCAL para o instante
 * correto, alinhando o app com a view `saldos_mensais`.
 */
export function inicioDoMesInstante(hoje = new Date()): string {
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
}

export function inicioDoProximoMesInstante(hoje = new Date()): string {
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString();
}

/** Primeiro dia do mês, N meses atrás, como YYYY-MM-DD. */
export function mesesAtras(n: number, hoje = new Date()): string {
  return toISODate(new Date(hoje.getFullYear(), hoje.getMonth() - n, 1));
}

/** "set/26" — rótulo curto para eixo de gráfico. */
export function rotuloMesCurto(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  const d = new Date(ano, mes - 1, 1);
  return d
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    .replace(".", "");
}

/** Quantos dias tem o mês da data. */
export function diasNoMes(hoje = new Date()): number {
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
}

/** Chave YYYY-MM-01 do mês a que a data pertence. */
export function chaveDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Dia do mês (1-31) de uma data YYYY-MM-DD. */
export function diaDoMes(iso: string): number {
  return Number(iso.slice(8, 10));
}
