import { CATEGORIAS, type Categoria } from "./types.js";

export type GastoExtraido = {
  valor: number;
  categoria: Categoria;
  descricao: string | null;
  /** false quando nenhuma palavra-chave bateu e caiu em "outros". */
  categoriaIdentificada: boolean;
};

/**
 * Palavras-chave por categoria. A busca é feita na mensagem normalizada
 * (minúsculas, sem acento) e respeita limites de palavra, então "gas" não
 * casa com "gasolina" e "bar" não casa com "barato".
 *
 * Quando duas categorias batem, vence a palavra-chave mais longa (mais
 * específica) e, no empate, a categoria que aparece primeiro nesta lista.
 * É o caso de "bar", que existe em alimentacao e lazer: fica em alimentacao.
 */
const PALAVRAS_CHAVE: ReadonlyArray<readonly [Categoria, readonly string[]]> = [
  [
    "alimentacao",
    [
      "mcdonalds",
      "burger",
      "ifood",
      "restaurante",
      "lanche",
      "comida",
      "rappi",
      "bar",
      "padaria",
    ],
  ],
  [
    "mercado",
    [
      "mercado",
      "supermercado",
      "hortifruti",
      "atacadao",
      "carrefour",
      "pao de acucar",
    ],
  ],
  [
    "transporte",
    [
      "uber",
      "99",
      "gasolina",
      "combustivel",
      "estacionamento",
      "onibus",
      "metro",
    ],
  ],
  ["moradia", ["aluguel", "condominio", "luz", "agua", "internet", "gas"]],
  ["lazer", ["cinema", "netflix", "spotify", "show", "viagem", "bar", "balada"]],
  [
    "saude",
    ["farmacia", "remedio", "consulta", "exame", "plano de saude"],
  ],
];

/** Conectores e unidades que sobram no começo da descrição. */
const RUIDO_INICIAL =
  /^(?:reais?|real|conto|contos|pila|mangos?|d[eo]s?|d[ao]s?|n[oa]s?|em|com|pra|para|no|na)\b[\s,.-]*/i;

/** minúsculas, sem acento, sem pontuação sobrando. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converte o número como escrito em pt-BR para float.
 * "30" -> 30 | "30,50" -> 30.5 | "30.50" -> 30.5 | "1.500" -> 1500
 * Ponto seguido de exatamente 3 dígitos é separador de milhar; caso
 * contrário, é decimal. Vírgula é sempre decimal.
 */
function paraNumero(bruto: string): number {
  let texto = bruto;

  const temVirgula = texto.includes(",");
  if (temVirgula) {
    // Com vírgula presente, todo ponto é separador de milhar.
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else {
    // Só pontos: cada grupo de exatamente 3 dígitos é milhar.
    texto = texto.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  }

  return Number(texto);
}

/** Tira conectores/unidades das pontas e espaços duplicados. */
function limpar(trecho: string): string {
  return trecho
    .trim()
    .replace(RUIDO_INICIAL, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
}

/** Primeiro número da mensagem, com suporte a "1k" / "2 mil". */
function extrairValor(
  texto: string,
): { valor: number; inicio: number; fim: number } | null {
  const regex = /(\d+(?:[.,]\d+)*)\s*(k|mil)?\b/gi;

  for (const m of texto.matchAll(regex)) {
    const base = paraNumero(m[1]);
    if (!Number.isFinite(base)) continue;

    const multiplicador = m[2] ? 1000 : 1;
    const valor = Math.round(base * multiplicador * 100) / 100;
    if (valor <= 0) continue;

    return {
      valor,
      inicio: m.index,
      fim: m.index + m[0].length,
    };
  }

  return null;
}

/** Categoria pela palavra-chave mais específica encontrada no texto. */
function extrairCategoria(normalizado: string): Categoria | null {
  let melhor: { categoria: Categoria; tamanho: number } | null = null;

  for (const [categoria, palavras] of PALAVRAS_CHAVE) {
    for (const palavra of palavras) {
      const regex = new RegExp(`(?<![\\p{L}\\d])${escaparRegex(palavra)}(?![\\p{L}\\d])`, "u");
      if (!regex.test(normalizado)) continue;
      if (!melhor || palavra.length > melhor.tamanho) {
        melhor = { categoria, tamanho: palavra.length };
      }
    }
  }

  return melhor?.categoria ?? null;
}

/**
 * Interpreta uma mensagem livre ("gastei 30 no mcdonalds") sem IA.
 * Retorna null quando não há valor na mensagem.
 */
export function extrairGasto(mensagem: string): GastoExtraido | null {
  const texto = mensagem.trim();
  if (!texto) return null;

  const encontrado = extrairValor(texto);
  if (!encontrado) return null;

  // A categoria é procurada no texto SEM o número, para que o valor "99"
  // em "gastei 99 de comida" não seja confundido com o app 99.
  const semValor = texto.slice(0, encontrado.inicio) + " " + texto.slice(encontrado.fim);
  const categoria = extrairCategoria(normalizar(semValor));

  // Descrição: o que vem depois do valor ("gastei 30 no mcdonalds" -> "mcdonalds").
  // Quando o valor está no fim ("uber 22,50"), cai para a mensagem sem o número
  // -> "uber"; e se nem isso sobrar, para a mensagem original.
  const depois = limpar(texto.slice(encontrado.fim));
  const descricao = depois || limpar(semValor) || texto.trim();

  return {
    valor: encontrado.valor,
    categoria: categoria ?? "outros",
    descricao: descricao || null,
    categoriaIdentificada: categoria !== null,
  };
}

/** Exportado só para o teste de sanidade. */
export const _internals = { normalizar, paraNumero, extrairValor, CATEGORIAS };

// ============================================================
// Renda
// ============================================================

/**
 * Verbos/substantivos de recebimento aceitos no INÍCIO da mensagem.
 * Só o começo conta: "recebi 2000" é renda, mas "gastei 50 no bar que
 * recebi de presente" continua sendo gasto.
 */
const ABERTURAS_DE_RENDA = [
  "recebi",
  "recebemos",
  "recebeu",
  "caiu",
  "cairam",
  "entrou",
  "entraram",
  "pagamento",
] as const;

const REGEX_RENDA = new RegExp(
  String.raw`^(?:${ABERTURAS_DE_RENDA.join("|")})\b`,
  "u",
);

/** "investi 100", "investimos 200" -> tabela investimentos. */
const ABERTURAS_DE_INVESTIMENTO = ["investi", "investimos"] as const;

const REGEX_INVESTIMENTO = new RegExp(
  String.raw`^(?:${ABERTURAS_DE_INVESTIMENTO.join("|")})\b`,
  "u",
);

export type TipoLancamento = "renda" | "investimento" | "gasto";

/**
 * Ordem de checagem: renda > investimento > gasto.
 * O gasto é o fallback — qualquer coisa que não abra com um verbo
 * de recebimento ou de investimento cai nele.
 */
export function detectarTipo(mensagem: string): TipoLancamento {
  const texto = normalizar(mensagem.trim());
  if (REGEX_RENDA.test(texto)) return "renda";
  if (REGEX_INVESTIMENTO.test(texto)) return "investimento";
  return "gasto";
}

export type RendaExtraida = {
  valor: number;
};

/**
 * Renda usa o mesmo parser de número do gasto ("2k", "2.000", "2000,00").
 * A pessoa vem da tag de quem mandou e a data é a de hoje, então não há
 * mais nada para extrair do texto.
 */
export function extrairRenda(mensagem: string): RendaExtraida | null {
  const encontrado = extrairValor(mensagem.trim());
  return encontrado ? { valor: encontrado.valor } : null;
}

/** Investimento só precisa do valor: a pessoa vem do Telegram ID. */
export function extrairInvestimento(mensagem: string): RendaExtraida | null {
  const encontrado = extrairValor(mensagem.trim());
  return encontrado ? { valor: encontrado.valor } : null;
}
