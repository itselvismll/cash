import "dotenv/config";

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor || !valor.trim()) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. Copie .env.example para .env e preencha.`,
    );
  }
  return valor.trim();
}

/**
 * Os IDs do Telegram são opcionais no boot: sem eles o bot sobe mesmo assim e
 * responde /meuid, que é como você descobre o número para preencher no .env.
 * Enquanto estiverem vazios, ninguém consegue lançar gasto.
 */
function opcional(nome: string): string | null {
  const valor = process.env[nome]?.trim();
  return valor ? valor : null;
}

export const env = {
  TELEGRAM_BOT_TOKEN: obrigatoria("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_ID_ELVIS: opcional("TELEGRAM_ID_ELVIS"),
  TELEGRAM_ID_GABI: opcional("TELEGRAM_ID_GABI"),
  SUPABASE_URL: obrigatoria("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: obrigatoria("SUPABASE_SERVICE_ROLE_KEY"),
};
