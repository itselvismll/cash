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

/**
 * Divide um total em N parcelas, em centavos, e a ÚLTIMA absorve a
 * diferença do arredondamento. Trabalhar em centavos inteiros evita o
 * 0.1 + 0.2 do float: a soma das parcelas é exatamente o total.
 *
 * 150 em 5x -> [30, 30, 30, 30, 30]
 * 100 em 3x -> [33.33, 33.33, 33.34]
 */
export function dividirEmParcelas(total: number, parcelas: number): number[] {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / parcelas);
  const valores = Array<number>(parcelas).fill(base);
  valores[parcelas - 1] = centavos - base * (parcelas - 1);
  return valores.map((c) => c / 100);
}

/**
 * Competência da parcela: mesma data, N meses à frente.
 *
 * O dia é limitado ao último dia do mês alvo, senão uma compra em 31/01
 * parcelada viraria 31/02 — que o JS rola para 03/03 e jogaria a parcela
 * no mês errado. O dashboard só agrupa por mês, então o dia é cosmético;
 * o que não pode é vazar para o mês seguinte.
 */
export function competenciaDaParcela(base: Date, mesesAFrente: number): string {
  const alvo = new Date(base.getFullYear(), base.getMonth() + mesesAFrente, 1);
  const ultimoDia = new Date(
    alvo.getFullYear(),
    alvo.getMonth() + 1,
    0,
  ).getDate();
  alvo.setDate(Math.min(base.getDate(), ultimoDia));
  return toISODate(alvo);
}
