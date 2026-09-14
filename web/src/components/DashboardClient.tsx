"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChartColumnBig,
  CircleAlert,
  CreditCard,
  PiggyBank,
  Receipt,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  COR_CATEGORIA,
  LABEL_CATEGORIA,
  LABEL_FORMA_PAGAMENTO,
  LABEL_TAG,
  META_PADRAO,
  type Categoria,
  type FormaPagamento,
  type GastoCategoriaMensal,
  type GastoDiario,
  type Investimento,
  type InvestimentoMensal,
  type Renda,
  type Tag,
  type Transacao,
} from "@/lib/types";
import { ICONE_CATEGORIA, ICONE_FORMA_PAGAMENTO } from "@/lib/icons";
import {
  chaveDoMes,
  diaDoMes,
  diasNoMes,
  formatBRL,
  formatDataHora,
  inicioDoMes,
  inicioDoProximoMes,
  mesesAtras,
  nomeDoMes,
  toISODate,
} from "@/lib/format";
import ComparacaoMensal, {
  type BarraMes,
  type ComparacaoJusta,
} from "./ComparacaoMensal";

/** Acima disso, a categoria ganha o aviso de ritmo acelerado. */
const LIMITE_ALERTA = 1.3;

/** Quantos meses fechados entram no gráfico e na média. */
const JANELA_MESES = 6;

/** Quantos meses fechados formam a média por categoria. */
const JANELA_CATEGORIA = 3;

/** Quantas linhas o card "Últimos lançamentos" mostra. */
const LIMITE_LANCAMENTOS = 20;

/**
 * Linha da lista de lançamentos: as três tabelas achatadas numa forma só.
 * A lista é por recência (created_at), sem recorte de mês — diferente dos
 * KPIs acima, que são todos do mês corrente.
 */
type LancamentoRecente = {
  /** Prefixado pelo tipo: os uuids vêm de tabelas diferentes. */
  id: string;
  tipo: "gasto" | "renda" | "investimento";
  valor: number;
  created_at: string;
  titulo: string;
  tag: Tag;
  /** Só gasto. */
  categoria?: Categoria;
  origem?: string;
  /** Só gasto: débito, crédito ou pix. */
  formaPagamento?: FormaPagamento;
  /** Só gasto parcelado: rende o badge "2/5". */
  parcelaAtual?: number | null;
  parcelaTotal?: number | null;
  /** Compra parcelada agrupada: "5x de R$ 30,00 (total R$ 150,00)". */
  subtitulo?: string | null;
  /** Só renda: pode ser futura, e aí ainda não entrou no saldo. */
  dataRecebimento?: string;
};

/**
 * Uma compra parcelada vista como um todo, montada a partir das suas
 * linhas em `transacoes`. É o que alimenta tanto a linha única em
 * "Últimos lançamentos" quanto o card "Parcelas em andamento".
 */
type CompraParcelada = {
  grupoId: string;
  categoria: Categoria;
  tag: Tag;
  formaPagamento: FormaPagamento;
  titulo: string;
  /** Valor de uma parcela (a 1ª conhecida; a última pode ter centavos a mais). */
  valorParcela: number;
  /** Soma das parcelas conhecidas. */
  total: number;
  parcelaTotal: number;
  /** Em que parcela a compra está: a do mês corrente, ou a próxima. */
  parcelaAtual: number;
  /** Parcelas com competência no mês corrente ou à frente. */
  restantes: number;
  /** Quanto essas parcelas restantes somam. */
  falta: number;
  /** Quando a compra foi lançada — a menor created_at do grupo. */
  createdAt: string;
  origem: string;
};

/** Tira o "(parcela 2/5)" que o insert grava na descrição. */
function semSufixoDeParcela(texto: string): string {
  return texto.replace(/\s*\(parcela \d+\/\d+\)\s*$/u, "").trim();
}

/**
 * Agrupa as linhas de parcela por compra.
 *
 * `mesAtual` (YYYY-MM-01) define o que ainda falta pagar: uma parcela do
 * mês corrente conta como restante, porque o mês não fechou.
 */
function agruparParcelas(
  linhas: Transacao[],
  mesAtual: string,
): CompraParcelada[] {
  const porGrupo = new Map<string, Transacao[]>();
  for (const linha of linhas) {
    if (!linha.compra_grupo_id) continue;
    const atual = porGrupo.get(linha.compra_grupo_id);
    if (atual) atual.push(linha);
    else porGrupo.set(linha.compra_grupo_id, [linha]);
  }

  const compras: CompraParcelada[] = [];
  for (const [grupoId, doGrupo] of porGrupo) {
    const ordenadas = [...doGrupo].sort((a, b) =>
      (a.parcela_atual ?? 0) - (b.parcela_atual ?? 0),
    );
    const primeira = ordenadas[0];
    const restantes = ordenadas.filter(
      (l) => chaveDoMes(l.data_competencia) >= mesAtual,
    );

    compras.push({
      grupoId,
      categoria: primeira.categoria,
      tag: primeira.tag,
      formaPagamento: primeira.forma_pagamento,
      titulo: primeira.descricao
        ? semSufixoDeParcela(primeira.descricao)
        : LABEL_CATEGORIA[primeira.categoria],
      valorParcela: Number(primeira.valor),
      total: ordenadas.reduce((acc, l) => acc + Number(l.valor), 0),
      parcelaTotal: primeira.parcela_total ?? ordenadas.length,
      parcelaAtual:
        restantes[0]?.parcela_atual ??
        primeira.parcela_total ??
        ordenadas.length,
      restantes: restantes.length,
      falta: restantes.reduce((acc, l) => acc + Number(l.valor), 0),
      createdAt: ordenadas.reduce(
        (menor, l) => (l.created_at < menor ? l.created_at : menor),
        primeira.created_at,
      ),
      origem: primeira.origem,
    });
  }

  return compras;
}

const LABEL_TIPO: Record<LancamentoRecente["tipo"], string> = {
  gasto: "Gasto",
  renda: "Renda",
  investimento: "Investimento",
};

const COR_TIPO: Record<LancamentoRecente["tipo"], string> = {
  gasto: "var(--color-negativo)",
  renda: "var(--color-positivo)",
  investimento: "var(--color-accent-claro)",
};

const ICONE_TIPO: Record<LancamentoRecente["tipo"], typeof TrendingUp> = {
  gasto: TrendingDown,
  renda: TrendingUp,
  investimento: PiggyBank,
};

export default function DashboardClient() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [rendas, setRendas] = useState<Renda[]>([]);
  const [meta, setMeta] = useState<number>(META_PADRAO);
  const [valorBase, setValorBase] = useState<number | null>(null);
  const [investimentosMensais, setInvestimentosMensais] = useState<
    InvestimentoMensal[]
  >([]);
  const [gastosDiarios, setGastosDiarios] = useState<GastoDiario[]>([]);
  const [gastosCategoria, setGastosCategoria] = useState<
    GastoCategoriaMensal[]
  >([]);
  const [lancamentos, setLancamentos] = useState<LancamentoRecente[]>([]);
  const [parcelas, setParcelas] = useState<Transacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    const agora = new Date();
    const primeiroDia = inicioDoMes(agora);
    const proximoMes = inicioDoProximoMes(agora);
    const hoje = toISODate(agora);

    const [
      resTransacoes,
      resRenda,
      resMeta,
      resPatrimonio,
      resInvestimentos,
      resDiarios,
      resCategoria,
      resUltimosGastos,
      resUltimasRendas,
      resUltimosInvestimentos,
      resParcelas,
    ] = await Promise.all([
      // O recorte do mês é por data_competencia, NÃO por created_at: a
      // parcela 3 de 5 nasceu junto com as outras, mas só pesa no
      // orçamento do mês dela. Vale para o KPI de gasto, para as
      // categorias e para o gráfico (que lê as views, já ajustadas).
      supabase
        .from("transacoes")
        .select("*")
        .gte("data_competencia", primeiroDia)
        .lt("data_competencia", proximoMes)
        .order("created_at", { ascending: false }),
      // Renda JA RECEBIDA no mes: data_recebimento entre o dia 1 e hoje.
      supabase
        .from("renda")
        .select("*")
        .gte("data_recebimento", primeiroDia)
        .lte("data_recebimento", hoje)
        .order("data_recebimento", { ascending: true }),
      supabase
        .from("metas")
        .select("valor_meta")
        .eq("mes_referencia", primeiroDia)
        .maybeSingle(),
      supabase
        .from("patrimonio")
        .select("valor_base")
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Todos os meses: o total guardado soma o histórico inteiro de
      // investimentos, inclusive o mês corrente.
      supabase.from("investimentos_mensais").select("mes, total"),
      // Gasto por dia: permite comparar o mês corrente com os anteriores
      // ATÉ O MESMO DIA, em vez de meio mês contra mês inteiro.
      supabase
        .from("gastos_por_dia")
        .select("dia, total")
        .gte("dia", mesesAtras(JANELA_MESES, agora)),
      supabase
        .from("gastos_categoria_mensais")
        .select("mes, categoria, total")
        .gte("mes", mesesAtras(JANELA_CATEGORIA, agora))
        .lt("mes", primeiroDia),
      // Últimos lançamentos: as três tabelas, por recência e SEM recorte de
      // mês. Pegar LIMITE de cada uma e cortar depois da junção garante as
      // N mais recentes do conjunto, independente de como se distribuem.
      supabase
        .from("transacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMITE_LANCAMENTOS),
      supabase
        .from("renda")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMITE_LANCAMENTOS),
      supabase
        .from("investimentos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMITE_LANCAMENTOS),
      // TODAS as linhas das compras parceladas da janela — não só as do
      // mês. Sem o grupo inteiro não há como somar o total da compra nem
      // saber quanto ainda falta pagar. O corte por competência mantém a
      // consulta pequena: uma compra recente tem todas as parcelas daqui
      // para frente, então nenhuma delas fica de fora.
      supabase
        .from("transacoes")
        .select("*")
        .not("compra_grupo_id", "is", null)
        .gte("data_competencia", mesesAtras(JANELA_MESES, agora))
        .order("data_competencia", { ascending: true }),
    ]);

    const falha =
      resTransacoes.error?.message ??
      resRenda.error?.message ??
      resMeta.error?.message ??
      resPatrimonio.error?.message ??
      resInvestimentos.error?.message ??
      resDiarios.error?.message ??
      resCategoria.error?.message ??
      resUltimosGastos.error?.message ??
      resUltimasRendas.error?.message ??
      resUltimosInvestimentos.error?.message ??
      resParcelas.error?.message;
    if (falha) setErro(falha);

    setTransacoes((resTransacoes.data as Transacao[]) ?? []);
    setRendas((resRenda.data as Renda[]) ?? []);
    setMeta(Number(resMeta.data?.valor_meta ?? META_PADRAO));
    setValorBase(
      resPatrimonio.data ? Number(resPatrimonio.data.valor_base) : null,
    );
    setInvestimentosMensais(
      (resInvestimentos.data as InvestimentoMensal[]) ?? [],
    );
    setGastosDiarios((resDiarios.data as GastoDiario[]) ?? []);
    setGastosCategoria((resCategoria.data as GastoCategoriaMensal[]) ?? []);

    const linhasParceladas = (resParcelas.data as Transacao[]) ?? [];
    setParcelas(linhasParceladas);

    // Uma compra parcelada vira UMA linha da lista, com o total e a data do
    // lançamento original — cinco parcelas ocupariam cinco slots e
    // esconderiam tudo o mais que foi lançado no dia.
    const comprasPorGrupo = new Map(
      agruparParcelas(linhasParceladas, primeiroDia).map((c) => [c.grupoId, c]),
    );
    const gastosAgrupados: LancamentoRecente[] = [];
    const gruposJaListados = new Set<string>();
    for (const t of ((resUltimosGastos.data as Transacao[]) ?? [])) {
      const compra = t.compra_grupo_id
        ? comprasPorGrupo.get(t.compra_grupo_id)
        : undefined;

      if (compra) {
        if (gruposJaListados.has(compra.grupoId)) continue;
        gruposJaListados.add(compra.grupoId);
        gastosAgrupados.push({
          id: `compra-${compra.grupoId}`,
          tipo: "gasto",
          valor: compra.total,
          created_at: compra.createdAt,
          titulo: compra.titulo,
          subtitulo: `${compra.parcelaTotal}x de ${formatBRL(compra.valorParcela)} (total ${formatBRL(compra.total)})`,
          tag: compra.tag,
          categoria: compra.categoria,
          origem: compra.origem,
          formaPagamento: compra.formaPagamento,
        });
        continue;
      }

      gastosAgrupados.push({
        id: `gasto-${t.id}`,
        tipo: "gasto",
        valor: Number(t.valor),
        created_at: t.created_at,
        titulo: t.descricao || LABEL_CATEGORIA[t.categoria],
        tag: t.tag,
        categoria: t.categoria,
        origem: t.origem,
        formaPagamento: t.forma_pagamento,
        parcelaAtual: t.parcela_atual,
        parcelaTotal: t.parcela_total,
      });
    }

    setLancamentos(
      [
        ...gastosAgrupados,
        ...(((resUltimasRendas.data as Renda[]) ?? []).map((r) => ({
          id: `renda-${r.id}`,
          tipo: "renda" as const,
          valor: Number(r.valor),
          created_at: r.created_at,
          titulo: "Renda",
          tag: r.pessoa,
          dataRecebimento: r.data_recebimento,
        })) satisfies LancamentoRecente[]),
        ...(((resUltimosInvestimentos.data as Investimento[]) ?? []).map(
          (i) => ({
            id: `investimento-${i.id}`,
            tipo: "investimento" as const,
            valor: Number(i.valor),
            created_at: i.created_at,
            titulo: "Guardado",
            tag: i.tag,
          }),
        ) satisfies LancamentoRecente[]),
      ]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, LIMITE_LANCAMENTOS),
    );

    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();

    // Realtime: qualquer insert/update/delete (inclusive vindo do bot do
    // Telegram) recarrega os numeros automaticamente.
    const canal = supabase
      .channel("dashboard-gastos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transacoes" },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "renda" },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "investimentos" },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patrimonio" },
        () => carregar(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  const agora = new Date();
  const mesAtual = inicioDoMes(agora);
  const diaDeCorte = agora.getDate();
  const hoje = toISODate(agora);

  const rendaRecebida = useMemo(
    () => rendas.reduce((acc, r) => acc + Number(r.valor), 0),
    [rendas],
  );
  const totalGasto = useMemo(
    () => transacoes.reduce((acc, t) => acc + Number(t.valor), 0),
    [transacoes],
  );
  const saldo = rendaRecebida - totalGasto;

  // A meta agora mede a AÇÃO de investir, não o saldo que sobrou.
  const investidoNoMes = useMemo(
    () =>
      Number(investimentosMensais.find((m) => m.mes === mesAtual)?.total ?? 0),
    [investimentosMensais, mesAtual],
  );
  const totalInvestido = useMemo(
    () => investimentosMensais.reduce((acc, m) => acc + Number(m.total), 0),
    [investimentosMensais],
  );
  const totalGuardado = (valorBase ?? 0) + totalInvestido;
  const progressoMeta =
    meta > 0 ? Math.max(0, Math.min(1, investidoNoMes / meta)) : 0;

  /**
   * Compras parceladas que ainda pesam: têm ao menos uma parcela no mês
   * corrente ou à frente. As que já quitaram saem da lista sozinhas.
   * Ordena por quantas faltam — o que está acabando aparece primeiro.
   */
  const comprasAtivas = useMemo(
    () =>
      agruparParcelas(parcelas, mesAtual)
        .filter((c) => c.restantes > 0)
        .sort((a, b) => a.restantes - b.restantes || b.falta - a.falta),
    [parcelas, mesAtual],
  );

  const totalAPagar = useMemo(
    () => comprasAtivas.reduce((acc, c) => acc + c.falta, 0),
    [comprasAtivas],
  );

  const porCategoria = useMemo(() => {
    const mapa = new Map<Categoria, number>();
    for (const t of transacoes) {
      mapa.set(t.categoria, (mapa.get(t.categoria) ?? 0) + Number(t.valor));
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [transacoes]);

  /** Total por mês, para as barras do gráfico. */
  const barras = useMemo<BarraMes[]>(() => {
    const mapa = new Map<string, number>();
    for (const g of gastosDiarios) {
      const mes = chaveDoMes(g.dia);
      mapa.set(mes, (mapa.get(mes) ?? 0) + Number(g.total));
    }
    mapa.set(mesAtual, totalGasto);

    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-(JANELA_MESES + 1))
      .map(([mes, total]) => ({
        mes,
        total,
        emAndamento: mes === mesAtual,
      }));
  }, [gastosDiarios, mesAtual, totalGasto]);

  /** Mesmo recorte de dias nos meses anteriores: comparação justa. */
  const comparacao = useMemo<ComparacaoJusta | null>(() => {
    const porMes = new Map<string, number>();
    for (const g of gastosDiarios) {
      const mes = chaveDoMes(g.dia);
      if (mes === mesAtual) continue;
      if (diaDoMes(g.dia) > diaDeCorte) continue;
      porMes.set(mes, (porMes.get(mes) ?? 0) + Number(g.total));
    }

    const valores = [...porMes.values()];
    if (valores.length === 0) return null;

    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    if (media <= 0) return null;

    return {
      atual: totalGasto,
      media,
      variacao: (totalGasto / media - 1) * 100,
      diaDeCorte,
      mesesComparados: valores.length,
    };
  }, [gastosDiarios, mesAtual, diaDeCorte, totalGasto]);

  /**
   * Categoria "estourando": o gasto do mês passou de 130% do que a média
   * dos meses fechados projeta para este ponto do mês.
   */
  const alertas = useMemo(() => {
    const soma = new Map<Categoria, number>();
    const meses = new Map<Categoria, Set<string>>();
    for (const linha of gastosCategoria) {
      soma.set(
        linha.categoria,
        (soma.get(linha.categoria) ?? 0) + Number(linha.total),
      );
      const conjunto = meses.get(linha.categoria) ?? new Set<string>();
      conjunto.add(linha.mes);
      meses.set(linha.categoria, conjunto);
    }

    const fracaoDoMes = diaDeCorte / diasNoMes(agora);
    const resultado = new Map<Categoria, { projecao: number }>();

    for (const [categoria, gastoAtual] of porCategoria) {
      const qtdMeses = meses.get(categoria)?.size ?? 0;
      if (qtdMeses === 0) continue; // sem histórico, não há o que comparar

      const projecao = (soma.get(categoria)! / qtdMeses) * fracaoDoMes;
      if (projecao > 0 && gastoAtual > projecao * LIMITE_ALERTA) {
        resultado.set(categoria, { projecao });
      }
    }

    return resultado;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gastosCategoria, porCategoria, diaDeCorte]);

  if (carregando) return <Esqueleto />;

  const corSaldo =
    saldo >= 0 ? "var(--color-positivo)" : "var(--color-negativo)";
  const maiorCategoria = porCategoria[0]?.[1] ?? 0;

  return (
    <main className="flex flex-col gap-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-accent-claro)]">
          {nomeDoMes()}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1>
      </header>

      {erro && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-[var(--color-negativo)]/10 px-4 py-3 text-sm text-[var(--color-negativo)]"
        >
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          {erro}
        </p>
      )}

      {/* HERO — saldo do mês: indicativo do que sobrou. */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-6 shadow-[0_24px_60px_-40px_rgba(124,92,255,0.9)]">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl"
          style={{ background: corSaldo }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-[var(--color-tinta-media)]">
            <Wallet size={16} strokeWidth={2} aria-hidden />
            <h2 className="text-xs font-medium uppercase tracking-[0.16em]">
              Saldo do mês
            </h2>
          </div>
          <p
            className="num mt-3 text-[64px] font-bold leading-none"
            style={{ color: corSaldo }}
          >
            {formatBRL(saldo)}
          </p>
          <p className="mt-3 text-sm text-[var(--color-tinta-fraca)]">
            Renda − gasto.{" "}
            <span className="text-[var(--color-tinta-media)]">
              É só um indicativo do que sobrou
            </span>{" "}
            — não é dinheiro guardado.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <CardMenor
          Icone={TrendingUp}
          titulo="Renda recebida"
          valor={rendaRecebida}
          cor="var(--color-positivo)"
        />
        <CardMenor
          Icone={TrendingDown}
          titulo="Gasto no mês"
          valor={totalGasto}
          cor="var(--color-negativo)"
        />
      </section>

      {/* Meta — agora mede investimento, que é ação real. */}
      <section className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[var(--color-tinta-media)]">
            <Target size={16} strokeWidth={2} aria-hidden />
            <h2 className="text-xs font-medium uppercase tracking-[0.16em]">
              Meta de investimento
            </h2>
          </div>
          <span className="num text-sm text-[var(--color-tinta-media)]">
            <strong className="font-semibold text-[var(--color-tinta)]">
              {formatBRL(investidoNoMes)}
            </strong>{" "}
            / {formatBRL(meta)}
          </span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-elevado)]"
          role="progressbar"
          aria-label="Progresso da meta de investimento do mês"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressoMeta * 100)}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${progressoMeta * 100}%`,
              background:
                progressoMeta >= 1
                  ? "var(--color-positivo)"
                  : "linear-gradient(90deg, var(--color-accent), var(--color-accent-claro))",
            }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--color-tinta-fraca)]">
          {progressoMeta >= 1
            ? "Meta batida neste mês."
            : `Faltam ${formatBRL(Math.max(0, meta - investidoNoMes))} de investimento para fechar a meta.`}
        </p>
      </section>

      {/* Total guardado — base + histórico de investimentos. */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-accent)]/30 p-6 shadow-[0_24px_70px_-40px_rgba(124,92,255,1)]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(145deg, color-mix(in oklab, var(--color-accent) 20%, transparent), color-mix(in oklab, var(--color-cat-saude) 10%, transparent) 55%, transparent 85%), var(--color-superficie)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-[var(--color-accent-claro)]">
            <PiggyBank size={16} strokeWidth={2} aria-hidden />
            <h2 className="text-xs font-medium uppercase tracking-[0.16em]">
              Total guardado
            </h2>
          </div>
          <p className="num mt-3 text-[52px] font-bold leading-none text-[var(--color-tinta)]">
            {formatBRL(totalGuardado)}
          </p>

          <dl className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--color-tinta-media)]">Valor base</dt>
              <dd className="num text-[var(--color-tinta)]">
                {formatBRL(valorBase ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-tinta-media)]">
                Investimentos
                <span className="text-[var(--color-tinta-fraca)]">
                  {" "}
                  (histórico)
                </span>
              </dt>
              <dd className="num shrink-0 text-[var(--color-tinta)]">
                {totalInvestido > 0 && "+ "}
                {formatBRL(totalInvestido)}
              </dd>
            </div>
          </dl>

          {totalInvestido === 0 && (
            <p className="mt-4 text-xs text-[var(--color-tinta-fraca)]">
              Nenhum investimento registrado ainda: o total é só o valor base.
              Use a aba Lançar ou mande &quot;investi 100&quot; no Telegram.
            </p>
          )}

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-tinta-fraca)]">
              Os três números, sem confusão
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-[var(--color-tinta-fraca)]">
              <li>
                <strong className="font-semibold text-[var(--color-tinta-media)]">
                  Saldo do mês
                </strong>{" "}
                = renda − gasto. Indicativo do que sobrou.
              </li>
              <li>
                <strong className="font-semibold text-[var(--color-tinta-media)]">
                  Investimentos
                </strong>{" "}
                = o que foi de fato guardado. Ação real, e é o que a meta mede.
              </li>
              <li>
                <strong className="font-semibold text-[var(--color-tinta-media)]">
                  Total guardado
                </strong>{" "}
                = valor base + todos os investimentos.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Comparação mês a mês */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-[var(--color-tinta-media)]">
          <ChartColumnBig size={16} strokeWidth={2} aria-hidden />
          <h2 className="text-xs font-medium uppercase tracking-[0.16em]">
            Gasto mês a mês
          </h2>
        </div>
        {barras.length <= 1 ? (
          <Vazio texto="Ainda não há meses anteriores para comparar." />
        ) : (
          <ComparacaoMensal barras={barras} comparacao={comparacao} />
        )}
      </section>

      {/* Categorias */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-[var(--color-tinta-media)]">
          <ChartColumnBig size={16} strokeWidth={2} aria-hidden />
          <h2 className="text-xs font-medium uppercase tracking-[0.16em]">
            Gastos por categoria
          </h2>
        </div>

        {porCategoria.length === 0 ? (
          <Vazio texto="Nenhum gasto neste mês ainda." />
        ) : (
          <ul className="flex flex-col gap-3 rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-4">
            {porCategoria.map(([categoria, total]) => {
              const Icone = ICONE_CATEGORIA[categoria];
              const cor = COR_CATEGORIA[categoria];
              const proporcao = maiorCategoria > 0 ? total / maiorCategoria : 0;
              const fatia = totalGasto > 0 ? (total / totalGasto) * 100 : 0;
              const alerta = alertas.get(categoria);
              return (
                <li key={categoria}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Icone
                      size={15}
                      strokeWidth={2}
                      style={{ color: cor }}
                      aria-hidden
                    />
                    <span className="text-sm font-medium">
                      {LABEL_CATEGORIA[categoria]}
                    </span>
                    <span className="num ml-auto text-sm font-semibold">
                      {formatBRL(total)}
                    </span>
                    <span className="num w-11 text-right text-xs text-[var(--color-tinta-fraca)]">
                      {fatia.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-elevado)]">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.max(proporcao * 100, 4)}%`,
                        background: cor,
                      }}
                    />
                  </div>
                  {alerta && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--color-cat-transporte)]">
                      <TriangleAlert size={12} strokeWidth={2.4} aria-hidden />
                      Ritmo acima do normal — o usual até aqui seria{" "}
                      {formatBRL(alerta.projecao)}.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Parcelas em andamento — o que já está comprado e ainda vai pesar. */}
      {comprasAtivas.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[var(--color-tinta-media)]">
              <CreditCard size={16} strokeWidth={2} aria-hidden />
              <h2 className="text-xs font-medium uppercase tracking-[0.16em]">
                Parcelas em andamento
              </h2>
            </div>
            <span className="num text-sm text-[var(--color-tinta-media)]">
              falta{" "}
              <strong className="font-semibold text-[var(--color-tinta)]">
                {formatBRL(totalAPagar)}
              </strong>
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {comprasAtivas.map((c) => {
              const Icone = ICONE_CATEGORIA[c.categoria];
              const cor = COR_CATEGORIA[c.categoria];
              const pagas = c.parcelaTotal - c.restantes;
              const progresso =
                c.parcelaTotal > 0 ? pagas / c.parcelaTotal : 0;
              return (
                <li
                  key={c.grupoId}
                  className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                      style={{
                        background: `color-mix(in oklab, ${cor} 16%, transparent)`,
                        color: cor,
                      }}
                    >
                      <Icone size={19} strokeWidth={2} aria-hidden />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.titulo}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Chip texto={LABEL_CATEGORIA[c.categoria]} cor={cor} />
                        <BadgeForma forma={c.formaPagamento} />
                        <Chip
                          texto={LABEL_TAG[c.tag]}
                          cor={
                            c.tag === "elvis"
                              ? "var(--color-accent-claro)"
                              : "var(--color-cat-lazer)"
                          }
                        />
                        <Chip
                          texto={`${c.parcelaAtual}/${c.parcelaTotal}`}
                          cor="var(--color-cat-transporte)"
                        />
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="num text-base font-semibold">
                        {formatBRL(c.valorParcela)}
                      </p>
                      <p className="num text-[11px] text-[var(--color-tinta-fraca)]">
                        /mês
                      </p>
                    </div>
                  </div>

                  <div
                    className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-elevado)]"
                    role="progressbar"
                    aria-label={`Parcelas pagas de ${c.titulo}`}
                    aria-valuemin={0}
                    aria-valuemax={c.parcelaTotal}
                    aria-valuenow={pagas}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${progresso * 100}%`, background: cor }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--color-tinta-fraca)]">
                    Faltam {c.restantes}{" "}
                    {c.restantes === 1 ? "parcela" : "parcelas"} —{" "}
                    <span className="num text-[var(--color-tinta-media)]">
                      {formatBRL(c.falta)}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Lançamentos */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-[var(--color-tinta-media)]">
          <Receipt size={16} strokeWidth={2} aria-hidden />
          <h2 className="text-xs font-medium uppercase tracking-[0.16em]">
            Últimos lançamentos
          </h2>
        </div>

        {lancamentos.length === 0 ? (
          <Vazio texto="Nada lançado ainda. Use a aba Lançar ou mande no Telegram." />
        ) : (
          <ul className="flex flex-col gap-2">
            {lancamentos.map((l) => {
              // No gasto o ícone é o da categoria, que diz mais que "gasto".
              // Nos outros dois, o ícone do tipo.
              const Icone =
                l.tipo === "gasto" && l.categoria
                  ? ICONE_CATEGORIA[l.categoria]
                  : ICONE_TIPO[l.tipo];
              const corTipo = COR_TIPO[l.tipo];
              const cor =
                l.tipo === "gasto" && l.categoria
                  ? COR_CATEGORIA[l.categoria]
                  : corTipo;
              const aReceber =
                l.dataRecebimento !== undefined && l.dataRecebimento > hoje;
              return (
                <li
                  key={l.id}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-3"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      background: `color-mix(in oklab, ${cor} 16%, transparent)`,
                      color: cor,
                    }}
                  >
                    <Icone size={19} strokeWidth={2} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.titulo}</p>
                    {l.subtitulo && (
                      <p className="num mt-0.5 truncate text-xs text-[var(--color-tinta-media)]">
                        {l.subtitulo}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Chip texto={LABEL_TIPO[l.tipo]} cor={corTipo} />
                      {l.formaPagamento && (
                        <BadgeForma forma={l.formaPagamento} />
                      )}
                      <Chip
                        texto={LABEL_TAG[l.tag]}
                        cor={
                          l.tag === "elvis"
                            ? "var(--color-accent-claro)"
                            : "var(--color-cat-lazer)"
                        }
                      />
                      {l.parcelaAtual != null && l.parcelaTotal != null && (
                        <Chip
                          texto={`${l.parcelaAtual}/${l.parcelaTotal}`}
                          cor="var(--color-cat-transporte)"
                        />
                      )}
                      {l.origem && (
                        <Chip
                          texto={l.origem}
                          cor="var(--color-tinta-fraca)"
                          discreto
                        />
                      )}
                      {aReceber && (
                        <Chip
                          texto="a receber"
                          cor="var(--color-cat-transporte)"
                          discreto
                        />
                      )}
                      <span className="text-[11px] text-[var(--color-tinta-fraca)]">
                        {formatDataHora(l.created_at)}
                      </span>
                    </div>
                  </div>

                  <span
                    className="num shrink-0 text-base font-semibold"
                    style={{
                      color:
                        l.tipo === "gasto" ? "var(--color-tinta)" : corTipo,
                    }}
                  >
                    {l.tipo === "gasto" ? "−" : "+"}
                    {formatBRL(l.valor)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function CardMenor({
  Icone,
  titulo,
  valor,
  cor,
}: {
  Icone: typeof TrendingUp;
  titulo: string;
  valor: number;
  cor: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-4">
      <div className="flex items-center gap-1.5 text-[var(--color-tinta-fraca)]">
        <Icone size={14} strokeWidth={2} style={{ color: cor }} aria-hidden />
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em]">
          {titulo}
        </h2>
      </div>
      <p className="num mt-2 text-2xl font-bold">{formatBRL(valor)}</p>
    </div>
  );
}

function Chip({
  texto,
  cor,
  discreto = false,
}: {
  texto: string;
  cor: string;
  discreto?: boolean;
}) {
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize"
      style={{
        color: cor,
        background: discreto
          ? "var(--color-elevado)"
          : `color-mix(in oklab, ${cor} 16%, transparent)`,
      }}
    >
      {texto}
    </span>
  );
}

/**
 * Forma de pagamento: ícone + rótulo, em cinza sobre o fundo elevado.
 * É de propósito acromático — a cor da linha já carrega a categoria, e
 * mais um chip colorido faria o olho ter de decidir qual dos dois está
 * dizendo alguma coisa.
 */
function BadgeForma({ forma }: { forma: FormaPagamento }) {
  const Icone = ICONE_FORMA_PAGAMENTO[forma];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-[var(--color-elevado)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-tinta-media)]"
      title={LABEL_FORMA_PAGAMENTO[forma]}
    >
      <Icone size={11} strokeWidth={2.25} aria-hidden />
      {LABEL_FORMA_PAGAMENTO[forma]}
    </span>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-[var(--color-borda-forte)] px-4 py-8 text-center text-sm text-[var(--color-tinta-fraca)]">
      {texto}
    </p>
  );
}

/** Skeleton com a mesma silhueta do conteúdo, para não haver salto de layout. */
function Esqueleto() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden>
      <div className="h-9 w-40 rounded-lg bg-[var(--color-superficie)]" />
      <div className="h-44 rounded-3xl bg-[var(--color-superficie)]" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-2xl bg-[var(--color-superficie)]" />
        <div className="h-24 rounded-2xl bg-[var(--color-superficie)]" />
      </div>
      <div className="h-24 rounded-2xl bg-[var(--color-superficie)]" />
      <div className="h-64 rounded-3xl bg-[var(--color-superficie)]" />
      <div className="h-56 rounded-2xl bg-[var(--color-superficie)]" />
    </div>
  );
}
