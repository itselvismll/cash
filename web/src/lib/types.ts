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

export const TAGS = ["elvis", "gabi"] as const;
export type Tag = (typeof TAGS)[number];

export type Origem = "manual" | "telegram";

export const FORMAS_PAGAMENTO = ["debito", "credito", "pix"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const LABEL_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
};

export type Transacao = {
  id: string;
  valor: number;
  categoria: Categoria;
  tag: Tag;
  descricao: string | null;
  origem: Origem;
  forma_pagamento: FormaPagamento;
  /**
   * O mês em que este valor pesa no orçamento — é por ela que o dashboard
   * filtra e agrupa. Numa compra parcelada divergem de `created_at`: as
   * parcelas nascem todas hoje, mas cada uma compete a um mês diferente.
   */
  data_competencia: string;
  /** Liga as parcelas da mesma compra. Null em gasto à vista. */
  compra_grupo_id: string | null;
  parcela_atual: number | null;
  parcela_total: number | null;
  created_at: string;
};

export type Renda = {
  id: string;
  pessoa: Tag;
  valor: number;
  data_recebimento: string;
  created_at: string;
};

export type Meta = {
  id: string;
  mes_referencia: string;
  valor_meta: number;
};

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

export const LABEL_TAG: Record<Tag, string> = {
  elvis: "Elvis",
  gabi: "Gabi",
};

export type Patrimonio = {
  id: string;
  valor_base: number;
  atualizado_em: string;
};

/** Uma linha da view `saldos_mensais`. */
export type SaldoMensal = {
  mes: string;
  renda: number;
  gasto: number;
  saldo: number;
};

/** Cor de identidade de cada categoria (chips, barras, ícones). */
export const COR_CATEGORIA: Record<Categoria, string> = {
  alimentacao: "var(--color-cat-alimentacao)",
  moradia: "var(--color-cat-moradia)",
  transporte: "var(--color-cat-transporte)",
  lazer: "var(--color-cat-lazer)",
  mercado: "var(--color-cat-mercado)",
  saude: "var(--color-cat-saude)",
  educacao: "var(--color-cat-educacao)",
  compras: "var(--color-cat-compras)",
  contas: "var(--color-cat-contas)",
  outros: "var(--color-cat-outros)",
};

export type Investimento = {
  id: string;
  valor: number;
  tag: Tag;
  created_at: string;
};

/** Uma linha da view `investimentos_mensais`. */
export type InvestimentoMensal = {
  mes: string;
  total: number;
};

/** Uma linha da view `gastos_por_dia`. */
export type GastoDiario = {
  dia: string;
  total: number;
};

/** Uma linha da view `gastos_categoria_mensais`. */
export type GastoCategoriaMensal = {
  mes: string;
  categoria: Categoria;
  total: number;
};
