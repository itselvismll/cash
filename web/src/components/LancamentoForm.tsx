"use client";

import { useState } from "react";
import {
  Check,
  CircleAlert,
  PiggyBank,
  Send,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CATEGORIAS,
  COR_CATEGORIA,
  FORMAS_PAGAMENTO,
  LABEL_CATEGORIA,
  LABEL_FORMA_PAGAMENTO,
  LABEL_TAG,
  TAGS,
  type Categoria,
  type FormaPagamento,
  type Tag,
} from "@/lib/types";
import { ICONE_CATEGORIA } from "@/lib/icons";
import {
  competenciaDaParcela,
  dividirEmParcelas,
  formatBRL,
  toISODate,
} from "@/lib/format";

/** Aceita "30", "30,50" e "30.50". */
function parseValor(bruto: string): number | null {
  const limpo = bruto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Os três tipos de lançamento, cada um na sua tabela. */
const TIPOS = ["gasto", "renda", "investimento"] as const;
type TipoLancamento = (typeof TIPOS)[number];

const LABEL_TIPO: Record<TipoLancamento, string> = {
  gasto: "Gasto",
  renda: "Renda",
  investimento: "Investimento",
};

const ICONE_TIPO: Record<TipoLancamento, LucideIcon> = {
  gasto: TrendingDown,
  renda: TrendingUp,
  investimento: PiggyBank,
};

/** Quem é o dono do valor, em cada tipo. */
const LABEL_PESSOA: Record<TipoLancamento, string> = {
  gasto: "Quem gastou",
  renda: "Quem recebeu",
  investimento: "Quem guardou",
};

/**
 * Uma linha de `transacoes` pronta para inserir. O tipo é explícito para
 * que a linha à vista (grupo/parcelas nulos) e a linha de parcela tenham
 * exatamente a mesma forma — senão o insert recebe uma união de shapes.
 */
type LinhaGasto = {
  valor: number;
  categoria: Categoria;
  tag: Tag;
  origem: "manual";
  forma_pagamento: FormaPagamento;
  descricao: string | null;
  data_competencia: string;
  compra_grupo_id: string | null;
  parcela_atual: number | null;
  parcela_total: number | null;
};

/** Uma cor por forma de pagamento, no mesmo padrão dos chips de tag. */
const COR_FORMA: Record<FormaPagamento, string> = {
  debito: "var(--color-cat-saude)",
  credito: "var(--color-cat-transporte)",
  pix: "var(--color-cat-mercado)",
};

/** Teto de parcelas. Acima disso é erro de digitação, não compra. */
const MAX_PARCELAS = 60;

function parseParcelas(bruto: string): number {
  const n = Math.floor(Number(bruto));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PARCELAS);
}

export default function LancamentoForm() {
  const [tipo, setTipo] = useState<TipoLancamento>("gasto");
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("alimentacao");
  const [tag, setTag] = useState<Tag>("elvis");
  const [descricao, setDescricao] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("pix");
  const [parcelas, setParcelas] = useState("1");
  const [dataRecebimento, setDataRecebimento] = useState(() =>
    toISODate(new Date()),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const numParcelas = parseParcelas(parcelas);
  /** Parcelar só existe no crédito: débito e pix saem à vista. */
  const parcelado = formaPagamento === "credito" && numParcelas > 1;

  /** Prévia do parcelamento, quando já há valor e mais de uma parcela. */
  const previa = (() => {
    if (!parcelado) return null;
    const total = parseValor(valor);
    if (total === null) return null;
    return { parcela: dividirEmParcelas(total, numParcelas)[0], total };
  })();

  function trocarTipo(novo: TipoLancamento) {
    setTipo(novo);
    setErro(null);
    setSucesso(null);
  }

  /**
   * As linhas que o gasto vai gravar. Uma compra parcelada gera N linhas
   * de uma vez, todas com o mesmo compra_grupo_id e cada uma competindo
   * ao seu mês — é isso que faz a parcela 3 só pesar no orçamento de daqui
   * a dois meses. À vista, é uma linha só.
   */
  function linhasDoGasto(valorNum: number): LinhaGasto[] {
    const hoje = new Date();
    const comum = {
      categoria,
      tag,
      origem: "manual" as const,
      forma_pagamento: formaPagamento,
    };

    if (!parcelado) {
      return [
        {
          ...comum,
          valor: valorNum,
          descricao: descricao.trim() || null,
          data_competencia: toISODate(hoje),
          compra_grupo_id: null,
          parcela_atual: null,
          parcela_total: null,
        },
      ];
    }

    const grupo = crypto.randomUUID();
    const base = descricao.trim() || LABEL_CATEGORIA[categoria];
    return dividirEmParcelas(valorNum, numParcelas).map((valor, i) => ({
      ...comum,
      valor,
      descricao: `${base} (parcela ${i + 1}/${numParcelas})`,
      data_competencia: competenciaDaParcela(hoje, i),
      compra_grupo_id: grupo,
      parcela_atual: i + 1,
      parcela_total: numParcelas,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    const valorNum = parseValor(valor);
    if (valorNum === null) {
      setErro("Informe um valor válido maior que zero.");
      return;
    }
    if (tipo === "renda" && !dataRecebimento) {
      setErro("Informe a data do recebimento.");
      return;
    }

    setSalvando(true);
    const { error } =
      tipo === "gasto"
        ? await supabase.from("transacoes").insert(linhasDoGasto(valorNum))
        : tipo === "renda"
          ? await supabase.from("renda").insert({
              pessoa: tag,
              valor: valorNum,
              data_recebimento: dataRecebimento,
            })
          : await supabase.from("investimentos").insert({
              valor: valorNum,
              tag,
            });
    setSalvando(false);

    if (error) {
      setErro(error.message);
      return;
    }

    setSucesso(
      tipo === "gasto"
        ? parcelado
          ? `${formatBRL(valorNum)} em ${LABEL_CATEGORIA[categoria]}, ${numParcelas}x de ${formatBRL(dividirEmParcelas(valorNum, numParcelas)[0])} no crédito — ${LABEL_TAG[tag]}`
          : `${formatBRL(valorNum)} em ${LABEL_CATEGORIA[categoria]} no ${LABEL_FORMA_PAGAMENTO[formaPagamento]} — ${LABEL_TAG[tag]}`
        : tipo === "renda"
          ? `${formatBRL(valorNum)} de renda — ${LABEL_TAG[tag]}`
          : `${formatBRL(valorNum)} guardados — ${LABEL_TAG[tag]}`,
    );
    setValor("");
    setDescricao("");
    setParcelas("1");
  }

  /**
   * Cor que conduz o formulário. No gasto ela vem da categoria escolhida
   * (o dado mais específico da tela); nos outros dois é o accent do tema.
   */
  const corAtual =
    tipo === "gasto" ? COR_CATEGORIA[categoria] : "var(--color-accent)";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7">
      {/* Tipo — decide em qual tabela o lançamento cai. */}
      <fieldset>
        <legend className="sr-only">Tipo de lançamento</legend>
        <div
          role="tablist"
          aria-label="Tipo de lançamento"
          className="flex gap-1 rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-1"
        >
          {TIPOS.map((t) => {
            const Icone = ICONE_TIPO[t];
            const ativo = tipo === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => trocarTipo(t)}
                className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors"
                style={{
                  background: ativo
                    ? "color-mix(in oklab, var(--color-accent) 18%, transparent)"
                    : "transparent",
                  color: ativo
                    ? "var(--color-accent-claro)"
                    : "var(--color-tinta-media)",
                }}
              >
                <Icone size={16} strokeWidth={2.2} aria-hidden />
                {LABEL_TIPO[t]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Valor — o elemento dominante da tela. */}
      <div
        className="rounded-3xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-6 shadow-[0_18px_50px_-30px_rgba(124,92,255,0.7)]"
        style={{ borderColor: `color-mix(in oklab, ${corAtual} 28%, transparent)` }}
      >
        <label
          htmlFor="valor"
          className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-tinta-fraca)]"
        >
          Valor
        </label>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-medium text-[var(--color-tinta-fraca)]">
            R$
          </span>
          <input
            id="valor"
            inputMode="decimal"
            autoFocus
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="num w-full bg-transparent text-[56px] font-bold leading-none outline-none placeholder:text-[var(--color-tinta-fraca)]/40"
          />
        </div>
      </div>

      {/* Categoria — só o gasto tem. */}
      {tipo === "gasto" && (
        <fieldset>
          <legend className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-tinta-fraca)]">
            Categoria
          </legend>
          <div className="grid grid-cols-2 gap-2.5">
            {CATEGORIAS.map((c) => {
              const Icone = ICONE_CATEGORIA[c];
              const ativa = categoria === c;
              const cor = COR_CATEGORIA[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoria(c)}
                  aria-pressed={ativa}
                  className="flex min-h-[56px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium transition-colors"
                  style={{
                    borderColor: ativa
                      ? cor
                      : "var(--color-borda)",
                    background: ativa
                      ? `color-mix(in oklab, ${cor} 14%, transparent)`
                      : "var(--color-superficie)",
                    color: ativa ? cor : "var(--color-tinta-media)",
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: `color-mix(in oklab, ${cor} ${ativa ? 24 : 12}%, transparent)`,
                      color: cor,
                    }}
                  >
                    <Icone size={18} strokeWidth={2} aria-hidden />
                  </span>
                  {LABEL_CATEGORIA[c]}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Forma de pagamento — só o gasto tem. */}
      {tipo === "gasto" && (
        <fieldset>
          <legend className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-tinta-fraca)]">
            Forma de pagamento
          </legend>
          <div className="flex gap-2.5">
            {FORMAS_PAGAMENTO.map((f) => {
              const ativa = formaPagamento === f;
              const cor = COR_FORMA[f];
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormaPagamento(f)}
                  aria-pressed={ativa}
                  className="min-h-[56px] flex-1 rounded-2xl border text-base font-semibold transition-colors"
                  style={{
                    borderColor: ativa ? cor : "var(--color-borda)",
                    background: ativa
                      ? `color-mix(in oklab, ${cor} 16%, transparent)`
                      : "var(--color-superficie)",
                    color: ativa ? cor : "var(--color-tinta-media)",
                  }}
                >
                  {LABEL_FORMA_PAGAMENTO[f]}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Parcelas — só faz sentido no crédito. */}
      {tipo === "gasto" && formaPagamento === "credito" && (
        <div>
          <label
            htmlFor="parcelas"
            className="mb-3 block text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-tinta-fraca)]"
          >
            Parcelas
          </label>
          <input
            id="parcelas"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PARCELAS}
            step={1}
            value={parcelas}
            onChange={(e) => setParcelas(e.target.value)}
            className="num min-h-[52px] w-full rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] px-4 text-base outline-none transition-colors focus:border-[var(--color-accent)]"
          />
          {previa && (
            <p
              aria-live="polite"
              className="num mt-2 text-sm text-[var(--color-accent-claro)]"
            >
              {numParcelas}x de {formatBRL(previa.parcela)} ={" "}
              {formatBRL(previa.total)} total
            </p>
          )}
        </div>
      )}

      {/* Pessoa — os três tipos têm, muda só o rótulo. */}
      <fieldset>
        <legend className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-tinta-fraca)]">
          {LABEL_PESSOA[tipo]}
        </legend>
        <div className="flex gap-2.5">
          {TAGS.map((t) => {
            const ativa = tag === t;
            const cor =
              t === "elvis" ? "var(--color-accent)" : "var(--color-cat-lazer)";
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                aria-pressed={ativa}
                className="min-h-[56px] flex-1 rounded-2xl border text-base font-semibold transition-colors"
                style={{
                  borderColor: ativa ? cor : "var(--color-borda)",
                  background: ativa
                    ? `color-mix(in oklab, ${cor} 16%, transparent)`
                    : "var(--color-superficie)",
                  color: ativa ? cor : "var(--color-tinta-media)",
                }}
              >
                {LABEL_TAG[t]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Data do recebimento — o dashboard só conta renda já recebida. */}
      {tipo === "renda" && (
        <div>
          <label
            htmlFor="data-recebimento"
            className="mb-3 block text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-tinta-fraca)]"
          >
            Data do recebimento
          </label>
          <input
            id="data-recebimento"
            type="date"
            value={dataRecebimento}
            onChange={(e) => setDataRecebimento(e.target.value)}
            className="num min-h-[52px] w-full rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] px-4 text-base outline-none transition-colors [color-scheme:dark] focus:border-[var(--color-accent)]"
          />
        </div>
      )}

      {/* Descrição — só o gasto tem. */}
      {tipo === "gasto" && (
        <div>
          <label
            htmlFor="descricao"
            className="mb-3 block text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-tinta-fraca)]"
          >
            Descrição{" "}
            <span className="normal-case tracking-normal text-[var(--color-tinta-fraca)]/70">
              (opcional)
            </span>
          </label>
          <input
            id="descricao"
            placeholder="ex: mcdonalds"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="min-h-[52px] w-full rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] px-4 text-base outline-none transition-colors placeholder:text-[var(--color-tinta-fraca)]/60 focus:border-[var(--color-accent)]"
          />
        </div>
      )}

      {erro && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-[var(--color-negativo)]/10 px-4 py-3 text-sm text-[var(--color-negativo)]"
        >
          <CircleAlert size={16} aria-hidden />
          {erro}
        </p>
      )}
      {sucesso && (
        <p
          aria-live="polite"
          className="flex items-center gap-2 rounded-2xl bg-[var(--color-positivo)]/10 px-4 py-3 text-sm text-[var(--color-positivo)]"
        >
          <Check size={16} aria-hidden />
          Lançado: {sucesso}
        </p>
      )}

      <button
        type="submit"
        disabled={salvando}
        className="flex min-h-[58px] items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] text-lg font-semibold text-white shadow-[0_16px_40px_-16px_rgba(124,92,255,0.9)] transition-opacity active:opacity-90 disabled:opacity-50"
      >
        <Send size={18} strokeWidth={2.2} aria-hidden />
        {salvando
          ? "Salvando..."
          : `Lançar ${LABEL_TIPO[tipo].toLowerCase()}`}
      </button>
    </form>
  );
}
