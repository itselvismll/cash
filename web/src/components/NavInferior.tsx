"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Plus } from "lucide-react";

const ITENS = [
  { href: "/", rotulo: "Lançar", Icone: Plus },
  { href: "/dashboard", rotulo: "Dashboard", Icone: LayoutDashboard },
] as const;

export default function NavInferior() {
  const caminho = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-borda)] bg-[var(--color-superficie)]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-lg">
        {ITENS.map(({ href, rotulo, Icone }) => {
          const ativo = caminho === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? "page" : undefined}
              className="group relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors"
            >
              {ativo && (
                <span className="absolute inset-x-[28%] top-0 h-0.5 rounded-full bg-[var(--color-accent)]" />
              )}
              <Icone
                size={20}
                strokeWidth={2}
                className={
                  ativo
                    ? "text-[var(--color-accent-claro)]"
                    : "text-[var(--color-tinta-fraca)]"
                }
                aria-hidden
              />
              <span
                className={`text-[11px] font-medium ${
                  ativo
                    ? "text-[var(--color-tinta)]"
                    : "text-[var(--color-tinta-fraca)]"
                }`}
              >
                {rotulo}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
