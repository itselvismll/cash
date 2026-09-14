import { Bot, type Context } from "grammy";
import { env } from "./env.js";
import {
  detectarTipo,
  extrairGasto,
  extrairInvestimento,
  extrairRenda,
} from "./extract.js";
import {
  apagarPorIdCurto,
  idCurto,
  inserirInvestimento,
  inserirRenda,
  inserirTransacao,
  listarUltimos,
  buscarMeta,
  type TipoRegistro,
} from "./db.js";
import {
  LABEL_CATEGORIA,
  LABEL_TAG,
  META_PADRAO,
  dataDeHoje,
  formatBRL,
  formatData,
  type Categoria,
  type Tag,
} from "./types.js";
import { PESSOAS, identificar } from "./pessoas.js";
import {
  TIMEOUT_MS,
  descartar,
  guardar,
  lerCallback,
  novoToken,
  resgatar,
  tecladoDeCategorias,
} from "./pendentes.js";
import { agendarResumoSemanal } from "./resumo.js";

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

type Contexto = Context;

const PEDIR_VALOR: Record<TipoRegistro, string> = {
  gasto: 'Não consegui identificar o valor. Tenta algo como "gastei 30 no mercado".',
  renda: 'Não consegui identificar o valor. Tenta algo como "recebi 2000".',
  investimento:
    'Não consegui identificar o valor. Tenta algo como "investi 100".',
};

/** Sufixo que ensina a desfazer, colado em toda confirmação. */
function comoApagar(id: string): string {
  return `\n\nid ${idCurto(id)} — pra apagar, mande /apagar ${idCurto(id)}`;
}

function primeiroDiaISO(agora = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-01`;
}

// ============================================================
// Comandos
// ============================================================

bot.command("start", async (ctx) => {
  const tag = identificar(ctx.from?.id);
  if (!tag) {
    await ctx.reply(
      `Seu ID do Telegram é ${ctx.from?.id}. Cadastre-o em TELEGRAM_ID_ELVIS ou TELEGRAM_ID_GABI para usar o bot.`,
    );
    return;
  }
  await ctx.reply(
    `Oi, ${LABEL_TAG[tag]}! 👋\n\n` +
      "Manda do jeito que vier na cabeça:\n\n" +
      '• Gasto: "gastei 30 no mcdonalds"\n' +
      '• Renda: "recebi 2000"\n' +
      '• Investimento: "investi 100"\n\n' +
      "Outros comandos:\n" +
      "/ultimos — seus 5 últimos lançamentos\n" +
      "/apagar <id> — apaga um lançamento",
  );
});

bot.command("meuid", async (ctx) => {
  await ctx.reply(`Seu ID do Telegram: ${ctx.from?.id}`);
});

bot.command("ultimos", async (ctx) => {
  const tag = identificar(ctx.from?.id);
  if (!tag) {
    await ctx.reply(`Não te reconheci. Seu ID do Telegram é ${ctx.from?.id}.`);
    return;
  }

  let lancamentos;
  try {
    lancamentos = await listarUltimos(tag, 5);
  } catch (erro) {
    console.error("Falha ao listar lançamentos:", erro);
    await ctx.reply("⚠️ Não consegui buscar seus lançamentos agora.");
    return;
  }

  if (lancamentos.length === 0) {
    await ctx.reply("Você ainda não tem lançamentos.");
    return;
  }

  const emoji: Record<TipoRegistro, string> = {
    gasto: "🔻",
    renda: "💰",
    investimento: "📈",
  };

  const linhas = lancamentos.map((l) => {
    const quando = new Date(l.created_at).toLocaleDateString("pt-BR");
    const detalhe = l.detalhe ? ` · ${l.detalhe}` : "";
    return `${emoji[l.tipo]} \`${idCurto(l.id)}\` ${formatBRL(l.valor)} · ${l.tipo}${detalhe} · ${quando}`;
  });

  await ctx.reply(
    `*Seus últimos lançamentos*\n\n${linhas.join("\n")}\n\nPra apagar: /apagar <id>`,
    { parse_mode: "Markdown" },
  );
});

bot.command("apagar", async (ctx) => {
  const tag = identificar(ctx.from?.id);
  if (!tag) {
    await ctx.reply(`Não te reconheci. Seu ID do Telegram é ${ctx.from?.id}.`);
    return;
  }

  const sufixo = ctx.match?.trim();
  if (!sufixo) {
    await ctx.reply(
      "Manda o id junto: /apagar a1b2\n\nUse /ultimos para ver os ids.",
    );
    return;
  }

  let apagado;
  try {
    apagado = await apagarPorIdCurto(tag, sufixo);
  } catch (erro) {
    console.error("Falha ao apagar lançamento:", erro);
    await ctx.reply("⚠️ Não consegui apagar agora. Tenta de novo.");
    return;
  }

  if (!apagado) {
    await ctx.reply(
      `Não achei nenhum lançamento seu com o id \`${sufixo}\`. Use /ultimos para conferir — só dá pra apagar os seus.`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  const detalhe = apagado.detalhe ? ` (${apagado.detalhe})` : "";
  await ctx.reply(
    `🗑 Apagado: ${apagado.tipo} de ${formatBRL(apagado.valor)}${detalhe}.`,
  );
});

// ============================================================
// Mensagens livres
// ============================================================

bot.on("message:text", async (ctx) => {
  const texto = ctx.message.text.trim();
  if (texto.startsWith("/")) return;

  const tag = identificar(ctx.from?.id);
  if (!tag) {
    await ctx.reply(
      `Não te reconheci. Seu ID do Telegram é ${ctx.from?.id} — cadastre-o nas variáveis de ambiente do bot.`,
    );
    return;
  }

  switch (detectarTipo(texto)) {
    case "renda":
      return lancarRenda(ctx, tag, texto);
    case "investimento":
      return lancarInvestimento(ctx, tag, texto);
    default:
      return lancarGasto(ctx, tag, texto);
  }
});

/** "recebi 2000", "caiu o adiantamento 1000" -> tabela renda. */
async function lancarRenda(ctx: Contexto, tag: Tag, texto: string) {
  const renda = extrairRenda(texto);
  if (!renda) {
    await ctx.reply(PEDIR_VALOR.renda);
    return;
  }

  const agora = new Date();

  let id: string;
  try {
    id = await inserirRenda({
      pessoa: tag,
      valor: renda.valor,
      data_recebimento: dataDeHoje(agora),
    });
  } catch (erro) {
    console.error("Falha ao gravar renda no Supabase:", erro);
    await ctx.reply("⚠️ Entendi a renda, mas não consegui salvar. Tenta de novo.");
    return;
  }

  await ctx.reply(
    `💰 Renda registrada: ${formatBRL(renda.valor)} - ${LABEL_TAG[tag]} (${formatData(agora)})` +
      comoApagar(id),
  );
}

/** "investi 100" -> tabela investimentos. */
async function lancarInvestimento(ctx: Contexto, tag: Tag, texto: string) {
  const investimento = extrairInvestimento(texto);
  if (!investimento) {
    await ctx.reply(PEDIR_VALOR.investimento);
    return;
  }

  let id: string;
  try {
    id = await inserirInvestimento({ valor: investimento.valor, tag });
  } catch (erro) {
    console.error("Falha ao gravar investimento no Supabase:", erro);
    await ctx.reply(
      "⚠️ Entendi o investimento, mas não consegui salvar. Tenta de novo.",
    );
    return;
  }

  // A meta é sobre o quanto foi investido no mês, então vale lembrar dela aqui.
  let meta = META_PADRAO;
  try {
    meta = await buscarMeta(primeiroDiaISO(), META_PADRAO);
  } catch {
    // Meta é enfeite na confirmação: se falhar, usa o padrão e segue.
  }

  await ctx.reply(
    `📈 Investido: ${formatBRL(investimento.valor)} - ${LABEL_TAG[tag]} (rumo à meta de ${formatBRL(meta)})` +
      comoApagar(id),
  );
}

/** "gastei 30 no mcdonalds" -> tabela transacoes. */
async function lancarGasto(ctx: Contexto, tag: Tag, texto: string) {
  const gasto = extrairGasto(texto);
  if (!gasto) {
    await ctx.reply(PEDIR_VALOR.gasto);
    return;
  }

  // Categoria desconhecida: pergunta em vez de enterrar em "outros".
  if (!gasto.categoriaIdentificada) {
    const token = novoToken();
    const timer = setTimeout(() => {
      const pendente = descartar(token);
      if (!pendente) return;
      // Ninguém respondeu: grava como "outros" para não perder o lançamento.
      void gravarGasto(ctx, {
        valor: pendente.valor,
        categoria: "outros",
        tag: pendente.tag,
        descricao: pendente.descricao,
      }).catch((erro) =>
        console.error("Falha ao gravar gasto no timeout:", erro),
      );
    }, TIMEOUT_MS);

    guardar(token, {
      valor: gasto.valor,
      descricao: gasto.descricao,
      tag,
      timer,
    });

    await ctx.reply(
      `${formatBRL(gasto.valor)} — em qual categoria?\n\nSe você não responder, em 10 minutos eu lanço como Outros.`,
      { reply_markup: tecladoDeCategorias(token) },
    );
    return;
  }

  await gravarGasto(ctx, {
    valor: gasto.valor,
    categoria: gasto.categoria,
    tag,
    descricao: gasto.descricao,
  });
}

async function gravarGasto(
  ctx: Contexto,
  entrada: {
    valor: number;
    categoria: Categoria;
    tag: Tag;
    descricao: string | null;
  },
): Promise<void> {
  let id: string;
  try {
    id = await inserirTransacao(entrada);
  } catch (erro) {
    console.error("Falha ao gravar gasto no Supabase:", erro);
    await ctx.reply("⚠️ Entendi o gasto, mas não consegui salvar. Tenta de novo.");
    return;
  }

  const detalhe = entrada.descricao ? ` (${entrada.descricao})` : "";
  await ctx.reply(
    `✅ ${formatBRL(entrada.valor)} em ${entrada.categoria}${detalhe} - ${LABEL_TAG[entrada.tag]}` +
      comoApagar(id),
  );
}

// ============================================================
// Botões de categoria
// ============================================================

bot.on("callback_query:data", async (ctx) => {
  const dados = lerCallback(ctx.callbackQuery.data);
  if (!dados) {
    await ctx.answerCallbackQuery();
    return;
  }

  const pendente = resgatar(dados.token);
  if (!pendente) {
    await ctx.answerCallbackQuery({
      text: "Essa escolha já expirou — o gasto foi lançado como Outros.",
    });
    return;
  }

  // Só quem lançou pode classificar.
  const tag = identificar(ctx.from?.id);
  if (tag !== pendente.tag) {
    await ctx.answerCallbackQuery({ text: "Esse lançamento não é seu." });
    guardar(dados.token, pendente);
    return;
  }

  await ctx.answerCallbackQuery({ text: LABEL_CATEGORIA[dados.categoria] });
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });

  await gravarGasto(ctx, {
    valor: pendente.valor,
    categoria: dados.categoria,
    tag: pendente.tag,
    descricao: pendente.descricao,
  });
});

bot.catch((erro) => {
  console.error("Erro não tratado no bot:", erro);
});

agendarResumoSemanal(bot);

await bot.start({
  onStart: (info) => {
    console.log(`Bot @${info.username} no ar.`);

    const cadastradas = [...PESSOAS.values()].map((t) => LABEL_TAG[t]);
    if (cadastradas.length === 0) {
      console.warn(
        "Nenhum TELEGRAM_ID cadastrado: mande /meuid para o bot e preencha TELEGRAM_ID_ELVIS / TELEGRAM_ID_GABI no .env.",
      );
    } else {
      console.log(`Pessoas cadastradas: ${cadastradas.join(", ")}.`);
      if (cadastradas.length < 2) {
        console.warn(
          "Falta cadastrar a outra pessoa — ela recebe o próprio ID ao mandar qualquer mensagem.",
        );
      }
    }
  },
});
