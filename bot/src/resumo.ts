import cron from "node-cron";
import type { Bot } from "grammy";
import { buscarMeta, montarResumoSemanal } from "./db.js";
import { PESSOAS } from "./pessoas.js";
import {
  LABEL_CATEGORIA,
  META_PADRAO,
  formatBRL,
  type Categoria,
} from "./types.js";

const FUSO = "America/Sao_Paulo";

/** Domingo às 20h, no horário de Brasília. */
const AGENDA = "0 20 * * 0";

function inicioDaSemana(agora: Date): Date {
  const d = new Date(agora);
  d.setDate(d.getDate() - 7);
  return d;
}

function inicioDoMes(agora: Date): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

function primeiroDiaISO(agora: Date): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-01`;
}

export async function montarMensagem(agora = new Date()): Promise<string> {
  const resumo = await montarResumoSemanal(
    inicioDaSemana(agora),
    inicioDoMes(agora),
  );
  const meta = await buscarMeta(primeiroDiaISO(agora), META_PADRAO);
  const falta = Math.max(0, meta - resumo.investidoNoMes);

  const linhas = [
    "📊 *Resumo da semana*",
    "",
    `Gasto nos últimos 7 dias: ${formatBRL(resumo.totalGasto)}`,
  ];

  if (resumo.topCategoria) {
    const rotulo =
      LABEL_CATEGORIA[resumo.topCategoria.categoria as Categoria] ??
      resumo.topCategoria.categoria;
    linhas.push(
      `Categoria que mais pesou: ${rotulo} (${formatBRL(resumo.topCategoria.total)})`,
    );
  } else {
    linhas.push("Nenhum gasto registrado na semana. 👏");
  }

  linhas.push("");
  linhas.push(
    `Investido no mês: ${formatBRL(resumo.investidoNoMes)} de ${formatBRL(meta)}`,
  );
  linhas.push(
    falta > 0
      ? `Faltam ${formatBRL(falta)} para a meta do mês.`
      : "Meta do mês batida! 🎉",
  );

  return linhas.join("\n");
}

/**
 * Dispara o resumo para cada pessoa cadastrada. Quem não tem TELEGRAM_ID
 * no .env simplesmente não está no mapa, então é pulado sem erro.
 */
export async function enviarResumo(bot: Bot): Promise<void> {
  if (PESSOAS.size === 0) {
    console.warn("Resumo semanal: ninguém cadastrado, nada a enviar.");
    return;
  }

  let mensagem: string;
  try {
    mensagem = await montarMensagem();
  } catch (erro) {
    console.error("Resumo semanal: falha ao montar a mensagem.", erro);
    return;
  }

  // Um envio com problema (usuário bloqueou o bot, rede caiu) não pode
  // impedir o envio para a outra pessoa.
  for (const [chatId] of PESSOAS) {
    try {
      await bot.api.sendMessage(chatId, mensagem, { parse_mode: "Markdown" });
    } catch (erro) {
      console.error(`Resumo semanal: falha ao enviar para ${chatId}.`, erro);
    }
  }
}

export function agendarResumoSemanal(bot: Bot): void {
  cron.schedule(AGENDA, () => void enviarResumo(bot), { timezone: FUSO });
  console.log(`Resumo semanal agendado: domingos às 20h (${FUSO}).`);
}
