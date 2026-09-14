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

export type Tag = "elvis" | "gabi";

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
  outros: "Outros",
};
