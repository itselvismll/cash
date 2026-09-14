import LancamentoForm from "@/components/LancamentoForm";

export default function Home() {
  return (
    <main>
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-accent-claro)]">
          Novo gasto
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Lançamento rápido
        </h1>
      </header>
      <LancamentoForm />
    </main>
  );
}
