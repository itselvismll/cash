import { env } from "./env.js";
import type { Tag } from "./types.js";

/**
 * Telegram user ID -> tag da pessoa.
 *
 * IDs vazios no .env simplesmente não entram no mapa: o bot sobe com quantas
 * pessoas estiverem cadastradas (zero, uma ou duas). Quem não está aqui é
 * avisado e nada é gravado.
 */
export const PESSOAS = new Map<string, Tag>(
  (
    [
      [env.TELEGRAM_ID_ELVIS, "elvis"],
      [env.TELEGRAM_ID_GABI, "gabi"],
    ] as const
  ).filter((par): par is [string, Tag] => par[0] !== null),
);

/** Devolve a tag de quem mandou a mensagem, ou null se não for reconhecido. */
export function identificar(userId: number | undefined): Tag | null {
  if (userId === undefined) return null;
  return PESSOAS.get(String(userId)) ?? null;
}
