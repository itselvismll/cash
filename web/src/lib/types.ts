export const CATEGORIAS = [
  "alimentacao",
  "moradia",
  "transporte",
  "lazer",
  "mercado",
  "saude",
  "outros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export const TAGS = ["elvis", "gabi"] as const;
export type Tag = (typeof TAGS)[number];

export type Origem = "manual" | "telegram";

export type Transacao = {
  id: string;
  valor: number;
  categoria: Categoria;
  tag: Tag;
  descricao: string | null;
  origem: Origem;
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
