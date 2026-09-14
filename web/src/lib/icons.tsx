import {
  Car,
  GraduationCap,
  HeartPulse,
  House,
  Package,
  PartyPopper,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { Categoria } from "./types";

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
