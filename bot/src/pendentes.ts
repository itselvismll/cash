import { InlineKeyboard } from "grammy";
import {
  CATEGORIAS,
  LABEL_CATEGORIA,
  type Categoria,
  type FormaPagamento,
  type Tag,
} from "./types.js";

/**
 * Gasto cuja categoria o parser não reconheceu e que está esperando o
 * usuário escolher no teclado inline.
 */
export type GastoPendente = {
  valor: number;
  descricao: string | null;
  tag: Tag;
  /** Forma e parcelas já vieram da mensagem: só a categoria falta. */
  formaPagamento: FormaPagamento;
  parcelas: number;
  /** Timer que grava como "outros" se ninguém responder. */
  timer: NodeJS.Timeout;
};

/** Quanto tempo a pergunta fica de pé antes de cair no padrão. */
export const TIMEOUT_MS = 10 * 60 * 1000;

const pendentes = new Map<string, GastoPendente>();

let contador = 0;

/** Token curto que viaja no callback_data (limite de 64 bytes do Telegram). */
export function novoToken(): string {
  contador = (contador + 1) % 1_000_000;
  return `${Date.now().toString(36)}${contador.toString(36)}`;
}

export function guardar(token: string, pendente: GastoPendente): void {
  pendentes.set(token, pendente);
}

export function resgatar(token: string): GastoPendente | null {
  const p = pendentes.get(token);
  if (!p) return null;
  clearTimeout(p.timer);
  pendentes.delete(token);
  return p;
}

/** Usado pelo timer: remove sem cancelar o próprio timeout. */
export function descartar(token: string): GastoPendente | null {
  const p = pendentes.get(token);
  if (!p) return null;
  pendentes.delete(token);
  return p;
}

export function tecladoDeCategorias(token: string): InlineKeyboard {
  const teclado = new InlineKeyboard();
  CATEGORIAS.forEach((c, i) => {
    teclado.text(LABEL_CATEGORIA[c], `cat:${c}:${token}`);
    // Duas por linha — 10 categorias, 5 linhas.
    if (i % 2 === 1) teclado.row();
  });
  return teclado;
}

export function lerCallback(
  dado: string,
): { categoria: Categoria; token: string } | null {
  const partes = dado.split(":");
  if (partes.length !== 3 || partes[0] !== "cat") return null;

  const categoria = partes[1] as Categoria;
  if (!CATEGORIAS.includes(categoria)) return null;

  return { categoria, token: partes[2] };
}
