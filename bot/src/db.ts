import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import {
  LABEL_CATEGORIA,
  MAX_PARCELAS,
  competenciaDaParcela,
  dataDeHoje,
  dividirEmParcelas,
  type Categoria,
  type FormaPagamento,
  type Tag,
} from "./types.js";

// service_role key: o bot roda no servidor e ignora RLS.
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export type TipoRegistro = "gasto" | "renda" | "investimento";

/** Últimos 4 caracteres do uuid — o que o usuário digita no /apagar. */
export function idCurto(id: string): string {
  return id.slice(-4);
}

export type EntradaGasto = {
  valor: number;
  categoria: Categoria;
  tag: Tag;
  descricao: string | null;
  formaPagamento: FormaPagamento;
  /** 1 = à vista. */
  parcelas: number;
};

export type GastoGravado = {
  /** id da 1ª linha — é o que vai no "/apagar xxxx" da confirmação. */
  id: string;
  /** Valor de cada parcela; 1 item quando à vista. */
  valores: number[];
};

/**
 * Grava o gasto. Parcelado, são N linhas de uma vez: mesmo
 * compra_grupo_id e cada uma competindo ao seu mês, exatamente como o
 * formulário web faz — é o que faz a parcela 3 só pesar no orçamento
 * de daqui a dois meses.
 */
export async function inserirGasto(
  entrada: EntradaGasto,
): Promise<GastoGravado> {
  const hoje = new Date();
  const parcelas = Math.min(Math.max(entrada.parcelas, 1), MAX_PARCELAS);
  const comum = {
    categoria: entrada.categoria,
    tag: entrada.tag,
    origem: "telegram" as const,
    forma_pagamento: entrada.formaPagamento,
  };

  if (parcelas === 1) {
    const { data, error } = await supabase
      .from("transacoes")
      .insert({
        ...comum,
        valor: entrada.valor,
        descricao: entrada.descricao,
        data_competencia: dataDeHoje(hoje),
        compra_grupo_id: null,
        parcela_atual: null,
        parcela_total: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id as string, valores: [entrada.valor] };
  }

  const grupo = randomUUID();
  const valores = dividirEmParcelas(entrada.valor, parcelas);
  const base = entrada.descricao ?? LABEL_CATEGORIA[entrada.categoria];
  const { data, error } = await supabase
    .from("transacoes")
    .insert(
      valores.map((valor, i) => ({
        ...comum,
        valor,
        descricao: `${base} (parcela ${i + 1}/${parcelas})`,
        data_competencia: competenciaDaParcela(hoje, i),
        compra_grupo_id: grupo,
        parcela_atual: i + 1,
        parcela_total: parcelas,
      })),
    )
    .select("id");
  if (error) throw new Error(error.message);

  const primeiro = data?.[0]?.id as string | undefined;
  if (!primeiro) throw new Error("Insert das parcelas não devolveu id.");
  return { id: primeiro, valores };
}

export async function inserirRenda(entrada: {
  pessoa: Tag;
  valor: number;
  /** YYYY-MM-DD */
  data_recebimento: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("renda")
    .insert(entrada)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function inserirInvestimento(entrada: {
  valor: number;
  tag: Tag;
}): Promise<string> {
  const { data, error } = await supabase
    .from("investimentos")
    .insert(entrada)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

// ============================================================
// Consulta e remoção
// ============================================================

export type Lancamento = {
  id: string;
  tipo: TipoRegistro;
  /** Numa compra parcelada é o valor DA PARCELA, não o total. */
  valor: number;
  created_at: string;
  detalhe: string | null;
  /** Preenchidos só em gasto parcelado. */
  compraGrupoId?: string | null;
  parcelas?: number | null;
};

/** Tira o "(parcela 2/5)" que o insert grava na descrição. */
function semSufixoDeParcela(texto: string): string {
  return texto.replace(/\s*\(parcela \d+\/\d+\)\s*$/u, "").trim();
}

/**
 * Quantas linhas recentes de cada tabela olhamos ao resolver um id curto.
 * 4 caracteres dão 65 mil combinações; dentro de uma janela dessas o risco
 * de colisão é desprezível, e evita ter que fazer LIKE em coluna uuid.
 */
const JANELA_BUSCA = 100;

/** Últimos lançamentos da pessoa, de qualquer tipo, mais novo primeiro. */
export async function listarUltimos(
  tag: Tag,
  limite = 5,
): Promise<Lancamento[]> {
  const [gastos, rendas, investimentos] = await Promise.all([
    supabase
      .from("transacoes")
      .select(
        "id, valor, created_at, categoria, descricao, compra_grupo_id, parcela_total",
      )
      .eq("tag", tag)
      .order("created_at", { ascending: false })
      .limit(JANELA_BUSCA),
    supabase
      .from("renda")
      .select("id, valor, created_at")
      .eq("pessoa", tag)
      .order("created_at", { ascending: false })
      .limit(JANELA_BUSCA),
    supabase
      .from("investimentos")
      .select("id, valor, created_at")
      .eq("tag", tag)
      .order("created_at", { ascending: false })
      .limit(JANELA_BUSCA),
  ]);

  const falha =
    gastos.error?.message ??
    rendas.error?.message ??
    investimentos.error?.message;
  if (falha) throw new Error(falha);

  /**
   * Uma compra parcelada entra como UM lançamento, não como N: 5 parcelas
   * ocupariam os 5 slots do /ultimos. O valor exibido é o da parcela (que
   * é o que o extrato do cartão mostra), nunca uma soma — somar aqui
   * daria número errado se o grupo não couber inteiro na janela de busca.
   */
  const gruposVistos = new Set<string>();
  const linhasDeGasto: Lancamento[] = [];
  for (const g of gastos.data ?? []) {
    const grupo = (g.compra_grupo_id as string | null) ?? null;
    if (grupo) {
      if (gruposVistos.has(grupo)) continue;
      gruposVistos.add(grupo);
    }
    const descricao = (g.descricao as string | null) ?? (g.categoria as string);
    linhasDeGasto.push({
      id: g.id as string,
      tipo: "gasto",
      valor: Number(g.valor),
      created_at: g.created_at as string,
      detalhe: grupo ? semSufixoDeParcela(descricao) : descricao,
      compraGrupoId: grupo,
      parcelas: (g.parcela_total as number | null) ?? null,
    });
  }

  const todos: Lancamento[] = [
    ...linhasDeGasto,
    ...(rendas.data ?? []).map((r) => ({
      id: r.id as string,
      tipo: "renda" as const,
      valor: Number(r.valor),
      created_at: r.created_at as string,
      detalhe: null,
    })),
    ...(investimentos.data ?? []).map((i) => ({
      id: i.id as string,
      tipo: "investimento" as const,
      valor: Number(i.valor),
      created_at: i.created_at as string,
      detalhe: null,
    })),
  ];

  return todos
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limite);
}

const TABELA: Record<TipoRegistro, string> = {
  gasto: "transacoes",
  renda: "renda",
  investimento: "investimentos",
};

/**
 * Apaga pelo id curto. A busca já é restrita aos lançamentos DA PESSOA,
 * então não há como apagar o do outro: simplesmente não é encontrado.
 */
export async function apagarPorIdCurto(
  tag: Tag,
  sufixo: string,
): Promise<Lancamento | null> {
  const candidatos = await listarUltimos(tag, Number.MAX_SAFE_INTEGER);
  const alvo = candidatos.find(
    (l) => idCurto(l.id).toLowerCase() === sufixo.toLowerCase(),
  );
  if (!alvo) return null;

  // Compra parcelada sai inteira. Apagar só a parcela apontada deixaria as
  // outras órfãs no orçamento dos meses seguintes, sem jeito de achá-las.
  const { error } = alvo.compraGrupoId
    ? await supabase
        .from("transacoes")
        .delete()
        .eq("compra_grupo_id", alvo.compraGrupoId)
    : await supabase.from(TABELA[alvo.tipo]).delete().eq("id", alvo.id);
  if (error) throw new Error(error.message);

  return alvo;
}

// ============================================================
// Agregados para o resumo semanal
// ============================================================

export type ResumoSemanal = {
  totalGasto: number;
  topCategoria: { categoria: string; total: number } | null;
  investidoNoMes: number;
};

export async function montarResumoSemanal(
  desde: Date,
  inicioDoMes: Date,
): Promise<ResumoSemanal> {
  const [gastos, investimentos] = await Promise.all([
    supabase
      .from("transacoes")
      .select("valor, categoria")
      .gte("created_at", desde.toISOString()),
    supabase
      .from("investimentos")
      .select("valor")
      .gte("created_at", inicioDoMes.toISOString()),
  ]);

  const falha = gastos.error?.message ?? investimentos.error?.message;
  if (falha) throw new Error(falha);

  const porCategoria = new Map<string, number>();
  let totalGasto = 0;
  for (const g of gastos.data ?? []) {
    const valor = Number(g.valor);
    totalGasto += valor;
    const categoria = g.categoria as string;
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + valor);
  }

  const top = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    totalGasto,
    topCategoria: top ? { categoria: top[0], total: top[1] } : null,
    investidoNoMes: (investimentos.data ?? []).reduce(
      (acc, i) => acc + Number(i.valor),
      0,
    ),
  };
}

/** Meta do mês corrente; cai no padrão quando não há linha cadastrada. */
export async function buscarMeta(
  inicioDoMes: string,
  padrao: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("metas")
    .select("valor_meta")
    .eq("mes_referencia", inicioDoMes)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.valor_meta ?? padrao);
}
