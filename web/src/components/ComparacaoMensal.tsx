"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatBRL, rotuloMesCurto } from "@/lib/format";

export type BarraMes = {
  mes: string;
  total: number;
  /** true no mês corrente, que ainda está em andamento. */
  emAndamento: boolean;
};

export type ComparacaoJusta = {
  /** Gasto do mês corrente até hoje. */
  atual: number;
  /** Média dos meses fechados, até o mesmo dia do mês. */
  media: number;
  /** Variação percentual em relação à média. */
  variacao: number;
  diaDeCorte: number;
  mesesComparados: number;
};

export default function ComparacaoMensal({
  barras,
  comparacao,
}: {
  barras: BarraMes[];
  comparacao: ComparacaoJusta | null;
}) {
  const dados = barras.map((b) => ({
    ...b,
    rotulo: rotuloMesCurto(b.mes),
  }));

  return (
    <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-superficie)] p-4">
      {comparacao && <Indicador comparacao={comparacao} />}

      <div className="mt-4 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dados}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="rotulo"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-tinta-fraca)", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                background: "var(--color-elevado)",
                border: "1px solid var(--color-borda-forte)",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-tinta-media)" }}
              formatter={(valor) => [formatBRL(Number(valor ?? 0)), "Gasto"]}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={38}>
              {dados.map((d) => (
                <Cell
                  key={d.mes}
                  fill={
                    d.emAndamento
                      ? "var(--color-accent)"
                      : "var(--color-borda-forte)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-[var(--color-tinta-fraca)]">
        Barra roxa = mês em andamento (ainda vai crescer até o fim do mês).
      </p>
    </div>
  );
}

function Indicador({ comparacao }: { comparacao: ComparacaoJusta }) {
  const { atual, media, variacao, diaDeCorte, mesesComparados } = comparacao;

  const neutro = Math.abs(variacao) < 5;
  const cor = neutro
    ? "var(--color-tinta-media)"
    : variacao > 0
      ? "var(--color-negativo)"
      : "var(--color-positivo)";
  const Seta = neutro ? Minus : variacao > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in oklab, ${cor} 16%, transparent)`,
            color: cor,
          }}
        >
          <Seta size={17} strokeWidth={2.4} aria-hidden />
        </span>
        <p className="num text-lg font-bold" style={{ color: cor }}>
          {variacao > 0 && "+"}
          {variacao.toFixed(0)}%
        </p>
        <p className="text-sm text-[var(--color-tinta-media)]">
          {neutro
            ? "no ritmo de sempre"
            : variacao > 0
              ? "acima do normal"
              : "abaixo do normal"}
        </p>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--color-tinta-fraca)]">
        Até o dia {diaDeCorte} você gastou{" "}
        <strong className="font-medium text-[var(--color-tinta-media)]">
          {formatBRL(atual)}
        </strong>
        . Nos {mesesComparados} {mesesComparados === 1 ? "mês" : "meses"}{" "}
        anteriores, até o mesmo dia, a média era{" "}
        <strong className="font-medium text-[var(--color-tinta-media)]">
          {formatBRL(media)}
        </strong>
        .
      </p>
    </div>
  );
}
