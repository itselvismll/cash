/** "outros" fica sempre no fim: é o fallback, não uma categoria de verdade. */
export const CATEGORIAS = [
  "alimentacao",
  "moradia",
  "transporte",
  "lazer",
  "mercado",
  "saude",
  "educacao",
  "compras",
  "contas",
  "outros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export type Tag = "elvis" | "gabi";

export const FORMAS_PAGAMENTO = ["debito", "credito", "pix"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const LABEL_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  debito: "débito",
  credito: "crédito",
  pix: "pix",
};

/** Teto de parcelas. Acima disso é erro de digitação, não compra. */
export const MAX_PARCELAS = 60;

export const LABEL_TAG: Record<Tag, string> = {
  elvis: "Elvis",
  gabi: "Gabi",
};

export function formatBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

/** Data de hoje no fuso local, como YYYY-MM-DD (formato da coluna date). */
export function dataDeHoje(agora = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/** DD/MM/AAAA para exibir na confirmação. */
export function formatData(agora = new Date()): string {
  return agora.toLocaleDateString("pt-BR");
}

export const META_PADRAO = 850;

export const LABEL_CATEGORIA: Record<Categoria, string> = {
  alimentacao: "Alimentação",
  moradia: "Moradia",
  transporte: "Transporte",
  lazer: "Lazer",
  mercado: "Mercado",
  saude: "Saúde",
  educacao: "Educação",
  compras: "Compras",
  contas: "Contas",
  outros: "Outros",
};

/**
 * Divide um total em N parcelas, em centavos, e a ÚLTIMA absorve a
 * diferença do arredondamento — a soma das parcelas é exatamente o total.
 * Mesma regra do web (web/src/lib/format.ts), para os dois lados gerarem
 * as mesmas linhas.
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
 * Competência da parcela: mesma data, N meses à frente. O dia é limitado
 * ao último dia do mês alvo, senão uma compra em 31/01 parcelada viraria
 * 31/02 — que o JS rola para março e jogaria a parcela no mês errado.
 */
export function competenciaDaParcela(base: Date, mesesAFrente: number): string {
  const alvo = new Date(base.getFullYear(), base.getMonth() + mesesAFrente, 1);
  const ultimoDia = new Date(
    alvo.getFullYear(),
    alvo.getMonth() + 1,
    0,
  ).getDate();
  alvo.setDate(Math.min(base.getDate(), ultimoDia));
  return dataDeHoje(alvo);
}
