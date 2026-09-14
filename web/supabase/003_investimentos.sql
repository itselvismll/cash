-- ============================================================
-- Migration 003 — investimentos + views de análise
-- Rode no SQL Editor do Supabase, DEPOIS da 002. É idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- investimentos
-- Terceiro tipo de lançamento, separado de gasto e renda.
-- É uma AÇÃO REAL de guardar dinheiro — diferente do saldo do
-- mês (renda - gasto), que é só um indicativo do que sobrou.
-- ------------------------------------------------------------
create table if not exists public.investimentos (
  id          uuid primary key default gen_random_uuid(),
  valor       numeric(12,2) not null check (valor > 0),
  tag         text not null check (tag in ('elvis','gabi')),
  created_at  timestamptz not null default now()
);

create index if not exists investimentos_created_at_idx
  on public.investimentos (created_at desc);

alter table public.investimentos enable row level security;

drop policy if exists "acesso_publico_investimentos" on public.investimentos;
create policy "acesso_publico_investimentos" on public.investimentos
  for all to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- investimentos_mensais
-- Um registro por mês. O "total guardado" soma TODOS os meses,
-- inclusive o corrente: investir é um ato concluído, não uma
-- estimativa que precisa esperar o mês fechar.
-- ------------------------------------------------------------
create or replace view public.investimentos_mensais
with (security_invoker = true) as
select
  date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as mes,
  sum(valor) as total
from public.investimentos
group by 1
order by 1;

grant select on public.investimentos_mensais to anon, authenticated;

-- ------------------------------------------------------------
-- gastos_por_dia
-- Base da comparação mês a mês. Ter o dia (e não só o mês)
-- permite comparar o mês corrente com os anteriores ATÉ O DIA
-- EQUIVALENTE — senão seria mês pela metade contra mês inteiro.
-- ------------------------------------------------------------
create or replace view public.gastos_por_dia
with (security_invoker = true) as
select
  (created_at at time zone 'America/Sao_Paulo')::date as dia,
  sum(valor) as total
from public.transacoes
group by 1
order by 1;

grant select on public.gastos_por_dia to anon, authenticated;

-- ------------------------------------------------------------
-- gastos_categoria_mensais
-- Média histórica por categoria, para o alerta de "ritmo acima
-- do normal". Poucas linhas (7 categorias x meses).
-- ------------------------------------------------------------
create or replace view public.gastos_categoria_mensais
with (security_invoker = true) as
select
  date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as mes,
  categoria,
  sum(valor) as total
from public.transacoes
group by 1, 2
order by 1, 2;

grant select on public.gastos_categoria_mensais to anon, authenticated;

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['investimentos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
