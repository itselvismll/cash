import {
  CATEGORIAS,
  MAX_PARCELAS,
  type Categoria,
  type FormaPagamento,
} from "./types.js";

export type GastoExtraido = {
  valor: number;
  categoria: Categoria;
  descricao: string | null;
  /** false quando nenhuma palavra-chave bateu e caiu em "outros". */
  categoriaIdentificada: boolean;
  formaPagamento: FormaPagamento;
  /** 1 = à vista. Só passa de 1 no crédito. */
  parcelas: number;
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
  ["moradia", ["aluguel", "condominio"]],
  ["lazer", ["cinema", "netflix", "spotify", "show", "viagem", "bar", "balada"]],
  [
    "saude",
    ["farmacia", "remedio", "consulta", "exame", "plano de saude"],
  ],
  [
    "educacao",
    ["curso", "faculdade", "escola", "livro", "mensalidade", "material escolar"],
  ],
  [
    "compras",
    [
      "roupa",
      "roupas",
      "shopping",
      "loja",
      "amazon",
      "shein",
      "sapato",
      "tenis",
    ],
  ],
  // As contas de consumo saíram de moradia: moradia é o teto (aluguel,
  // condomínio), contas é o que vence todo mês.
  [
    "contas",
    [
      "luz",
      "agua",
      "internet",
      "gas",
      "celular",
      "telefone",
      "conta de",
    ],
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

// ============================================================
// Forma de pagamento e parcelas
// ============================================================

/**
 * Quem não falar de pagamento continua caindo em pix — é o default da
 * coluna e o comportamento de antes desta feature.
 */
const REGEX_CREDITO = /(?<![\p{L}\d])(?:credito|cartao|parcelad[oa])(?![\p{L}\d])/u;
const REGEX_DEBITO = /(?<![\p{L}\d])debito(?![\p{L}\d])/u;
const REGEX_PIX = /(?<![\p{L}\d])pix(?![\p{L}\d])/u;

/** "5x", "5 x", "em 3 vezes", "12 parcelas". */
const REGEX_PARCELAS =
  /(?<![\p{L}\d])(\d{1,2})\s*(?:x|vezes|parcelas?)(?![\p{L}\d])/u;

/**
 * Os tokens de pagamento saem do texto ANTES de procurar valor,
 * categoria e descrição. Sem isso "gastei 150 no mercado em 5x no
 * credito" viraria a descrição "mercado em 5x no credito", e um
 * "3x 300 na loja" leria o 3 do "3x" como valor.
 *
 * As variantes com e sem acento entram juntas porque este corte é feito
 * no texto original — normalizar aqui apagaria o acento da descrição.
 */
const REGEX_TOKENS_PAGAMENTO = new RegExp(
  String.raw`(?:(?<![\p{L}\d])(?:n[oa]|em|de|d[oa])\s+)?(?<![\p{L}\d])(?:cr[eé]dito|cart[aã]o(?:\s+de\s+cr[eé]dito)?|d[eé]bito|pix|parcelad[oa]|\d{1,2}\s*(?:x|vezes|parcelas?))(?![\p{L}\d])`,
  "giu",
);

function extrairFormaPagamento(normalizado: string): FormaPagamento {
  if (REGEX_CREDITO.test(normalizado)) return "credito";
  if (REGEX_DEBITO.test(normalizado)) return "debito";
  if (REGEX_PIX.test(normalizado)) return "pix";
  return "pix";
}

function extrairParcelas(normalizado: string): number {
  const m = REGEX_PARCELAS.exec(normalizado);
  if (!m) return 1;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PARCELAS);
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

  // Pagamento é lido da mensagem inteira, e só então os tokens somem do
  // texto — o resto do parser trabalha sobre o que sobrou.
  const normalizado = normalizar(texto);
  const formaPagamento = extrairFormaPagamento(normalizado);
  const parcelasLidas = extrairParcelas(normalizado);

  const limpo = texto
    .replace(REGEX_TOKENS_PAGAMENTO, " ")
    .replace(/\s+/g, " ")
    .trim();

  const encontrado = extrairValor(limpo);
  if (!encontrado) return null;

  // A categoria é procurada no texto SEM o número, para que o valor "99"
  // em "gastei 99 de comida" não seja confundido com o app 99.
  const semValor = limpo.slice(0, encontrado.inicio) + " " + limpo.slice(encontrado.fim);
  const categoria = extrairCategoria(normalizar(semValor));

  // Descrição: o que vem depois do valor ("gastei 30 no mcdonalds" -> "mcdonalds").
  // Quando o valor está no fim ("uber 22,50"), cai para a mensagem sem o número
  // -> "uber"; e se nem isso sobrar, para a mensagem original.
  const depois = limpar(limpo.slice(encontrado.fim));
  const descricao = depois || limpar(semValor) || limpo || texto;

  // Parcelar só existe no crédito. Quem escreve "300 3x" sem dizer a
  // forma está falando de cartão — ninguém parcela um pix.
  const parcelado = parcelasLidas > 1;
  return {
    valor: encontrado.valor,
    categoria: categoria ?? "outros",
    descricao: descricao || null,
    categoriaIdentificada: categoria !== null,
    formaPagamento: parcelado ? "credito" : formaPagamento,
    parcelas: formaPagamento === "credito" || parcelado ? parcelasLidas : 1,
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
  "receberam",
  "recebido",
  "recebida",
  "recebendo",
  "receber",
  "caiu",
  "cairam",
  "entrou",
  "entraram",
  "pagamento",
  "salario",
  "adiantamento",
] as const;

const REGEX_RENDA = new RegExp(
  String.raw`^(?:${ABERTURAS_DE_RENDA.join("|")})\b`,
  "u",
);

/**
 * "investi 100", "guardei 200" -> tabela investimentos.
 *
 * Cada verbo entra com suas conjugações, e não só a 1ª pessoa. O `\b` no
 * fim da regex faz "investi" NÃO casar com "investido" — antes essa lista
 * tinha só "investi" e "investimos", e "investido 150" caía calado em
 * gasto/outros. Foi o que corrompeu um lançamento real no dia 14/09.
 *
 * "guardar", "aplicar" e "poupar" entram porque são as palavras que a
 * própria interface usa ("Total guardado", "Quem guardou").
 */
const ABERTURAS_DE_INVESTIMENTO = [
  "investi",
  "investiu",
  "investimos",
  "investiram",
  "investido",
  "investida",
  "investindo",
  "investir",
  "investimento",
  "investimentos",
  "guardei",
  "guardou",
  "guardamos",
  "guardaram",
  "guardado",
  "guardada",
  "guardando",
  "guardar",
  "apliquei",
  "aplicou",
  "aplicamos",
  "aplicaram",
  "aplicado",
  "aplicada",
  "aplicando",
  "aplicar",
  "poupei",
  "poupou",
  "poupamos",
  "pouparam",
  "poupado",
  "poupada",
  "poupando",
  "poupar",
] as const;

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
