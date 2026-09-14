-- ============================================================
-- Migration 002 — patrimônio acumulado
-- Rode no SQL Editor do Supabase. É idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- patrimonio
-- Guarda o que já estava acumulado ANTES do app existir. O resto
-- do total é calculado a partir dos meses já fechados.
-- ------------------------------------------------------------
create table if not exists public.patrimonio (
  id             uuid primary key default gen_random_uuid(),
  valor_base     numeric(12,2) not null default 0,
  atualizado_em  timestamptz not null default now()
);

alter table public.patrimonio enable row level security;

drop policy if exists "acesso_publico_patrimonio" on public.patrimonio;
create policy "acesso_publico_patrimonio" on public.patrimonio
  for all to anon, authenticated using (true) with check (true);

-- Linha inicial (só na primeira execução).
insert into public.patrimonio (valor_base)
select 6470.74
where not exists (select 1 from public.patrimonio);

-- ------------------------------------------------------------
-- saldos_mensais
-- Um registro por mês com renda, gasto e saldo. A agregação fica
-- no Postgres para o app não precisar baixar o histórico inteiro
-- (o PostgREST devolve no máximo 1000 linhas por requisição).
--
-- O fuso é fixado em America/Sao_Paulo para o corte de mês bater
-- com o que o app calcula no browser — created_at é timestamptz e
-- o date_trunc usaria UTC por padrão, jogando gastos da noite do
-- dia 31 para o mês seguinte.
-- ------------------------------------------------------------
create or replace view public.saldos_mensais
with (security_invoker = true) as
with movimentos as (
  select
    date_trunc('month', data_recebimento)::date as mes,
    valor                                       as renda,
    0::numeric                                  as gasto
  from public.renda
  union all
  select
    date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date,
    0::numeric,
    valor
  from public.transacoes
)
select
  mes,
  sum(renda)              as renda,
  sum(gasto)              as gasto,
  sum(renda) - sum(gasto) as saldo
from movimentos
group by mes
order by mes;

grant select on public.saldos_mensais to anon, authenticated;

-- Realtime para o card reagir a mudanças no valor base.
do $$
declare
  t text;
begin
  foreach t in array array['patrimonio'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
