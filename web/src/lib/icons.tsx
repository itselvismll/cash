import {
  Banknote,
  Car,
  CreditCard,
  GraduationCap,
  HeartPulse,
  House,
  Package,
  PartyPopper,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Categoria, FormaPagamento } from "./types";

/** Um ícone por categoria — mesma família, mesma espessura de traço. */
export const ICONE_CATEGORIA: Record<Categoria, LucideIcon> = {
  alimentacao: UtensilsCrossed,
  moradia: House,
  transporte: Car,
  lazer: PartyPopper,
  mercado: ShoppingCart,
  saude: HeartPulse,
  educacao: GraduationCap,
  compras: ShoppingBag,
  contas: Receipt,
  outros: Package,
};

/**
 * Um ícone por forma de pagamento. Crédito fica com o cartão e débito
 * com a cédula: os dois são plástico na vida real, mas dois cartões
 * idênticos na lista não distinguiriam nada — o que pesa no orçamento é
 * justamente a diferença entre sair agora e sair na fatura.
 */
export const ICONE_FORMA_PAGAMENTO: Record<FormaPagamento, LucideIcon> = {
  debito: Banknote,
  credito: CreditCard,
  pix: Zap,
};
